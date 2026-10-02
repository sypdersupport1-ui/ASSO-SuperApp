/**
 * ASSO Observability — API Handler Wrapper
 * Scale Foundation S5
 *
 * Wraps Next.js App Router route handlers with:
 *   1. Correlation ID generation/propagation (AsyncLocalStorage)
 *   2. Structured request/response logging
 *   3. OpenTelemetry API span creation
 *   4. HTTP metrics recording
 *   5. Standardised error handling
 *
 * Usage:
 *   export const GET = withObservability(
 *     async (req, ctx) => { ... },
 *     { route: "/api/v1/restaurant/orders", service: "api" }
 *   );
 *
 * Security:
 *   - Correlation IDs are NEVER used for authorization.
 *   - X-Request-Id header is set in the response for client correlation.
 *   - Sensitive headers (Authorization, platform tokens) are NEVER logged.
 */

import { NextRequest, NextResponse } from "next/server";
import { SpanStatusCode } from "@opentelemetry/api";
import { resolveCorrelationId, runWithCorrelationContext } from "./correlation";
import { getTracer } from "./tracing";
import { recordHttpRequest } from "./metrics";
import { logger } from "@/lib/logger";

export interface ObservabilityOptions {
  /** HTTP route pattern for logs and metrics (e.g. "/api/v1/restaurant/orders") */
  route: string;
  service?: "api" | "worker";
  /** Business operation label for spans (e.g. "create_order"). Defaults to method+route. */
  operation?: string;
}

type RouteHandler = (req: NextRequest, context?: unknown) => Promise<NextResponse | Response>;

/**
 * Wraps a Next.js route handler with full S5 observability instrumentation.
 * Always resolves — never throws (errors are caught and return 500 gracefully).
 */
export function withObservability(handler: RouteHandler, options: ObservabilityOptions): RouteHandler {
  return async function observedHandler(req: NextRequest, context?: unknown): Promise<NextResponse | Response> {
    const startedAt = Date.now();
    const method = req.method || "GET";

    // ─── Correlation ID ─────────────────────────────────────────────────
    const { id: requestId, reused } = resolveCorrelationId(
      req.headers.get("x-request-id") || req.headers.get("x-correlation-id")
    );

    const correlationCtx = {
      requestId,
      correlationId: reused ? requestId : undefined,
      route: options.route,
      method,
      service: (options.service || "api") as "api" | "worker",
      startedAt,
    };

    // ─── OTel Span ──────────────────────────────────────────────────────
    const tracer = getTracer("asso.api");
    const spanName = options.operation || `${method} ${options.route}`;

    return await runWithCorrelationContext(correlationCtx, async () => {
      return await tracer.startActiveSpan(spanName, async (span) => {
        span.setAttributes({
          "http.method": method,
          "http.route": options.route,
          "http.request_id": requestId,
          "service.name": options.service || "api",
        });

        try {
          const response = await handler(req, context);
          const statusCode = (response as NextResponse).status ?? 200;

          span.setAttributes({ "http.status_code": statusCode });
          if (statusCode >= 400) {
            span.setStatus({ code: SpanStatusCode.ERROR });
          }

          const durationMs = Date.now() - startedAt;

          // ─── Structured Log ───────────────────────────────────────────
          const logPayload = {
            message: `${method} ${options.route} ${statusCode} (${durationMs}ms)`,
            requestId,
            route: options.route,
            method,
            statusCode,
            durationMs,
            operation: options.operation,
          };

          if (statusCode >= 500) {
            logger.error(logPayload);
          } else if (statusCode >= 400) {
            logger.warn(logPayload);
          } else {
            logger.info(logPayload);
          }

          // ─── Metrics ─────────────────────────────────────────────────
          recordHttpRequest({
            method,
            route: options.route,
            statusCode,
            durationMs,
            service: options.service || "api",
          });

          // ─── Propagate Request ID to client ───────────────────────────
          const mutableResponse = response as NextResponse;
          if (!mutableResponse.headers.has("X-Request-Id")) {
            mutableResponse.headers.set("X-Request-Id", requestId);
          }

          span.end();
          return response;
        } catch (err: unknown) {
          const durationMs = Date.now() - startedAt;

          logger.error({
            message: `Unhandled error in ${method} ${options.route}`,
            requestId,
            route: options.route,
            method,
            durationMs,
            error: err,
            error_type: err instanceof Error ? err.constructor.name : "UnknownError",
          });

          recordHttpRequest({
            method,
            route: options.route,
            statusCode: 500,
            durationMs,
            service: options.service || "api",
          });

          span.setStatus({ code: SpanStatusCode.ERROR });
          span.end();

          return NextResponse.json(
            {
              success: false,
              error: {
                code: "INTERNAL_SERVER_ERROR",
                message: "An unexpected server error occurred.",
              },
              meta: {
                requestId,
                timestamp: new Date().toISOString(),
              },
            },
            {
              status: 500,
              headers: { "X-Request-Id": requestId },
            }
          );
        }
      });
    });
  };
}
