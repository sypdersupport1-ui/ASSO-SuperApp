/**
 * ASSO Observability — OpenTelemetry SDK Initialisation
 * Scale Foundation S5
 *
 * Vendor-neutral OTLP trace and metrics export.
 * Configured entirely through environment variables — no vendor is hard-coded.
 *
 * Supported env vars:
 *   OTEL_EXPORTER_OTLP_ENDPOINT  — OTLP HTTP endpoint (e.g. https://otel.example.com)
 *   OTEL_EXPORTER_OTLP_HEADERS   — comma-separated "Key=Value" auth headers
 *   OTEL_SERVICE_NAME             — service name reported to vendor (default: asso-platform)
 *   OTEL_TRACE_SAMPLING_RATE      — 0.0–1.0, default 0.1 in production, 1.0 in dev/test
 *   OTEL_SDK_DISABLED             — "true" to fully disable (unit tests)
 *
 * Design principles:
 *   1. SDK is initialised ONCE per process before any imports touch it.
 *   2. Telemetry failures NEVER block or fail business operations.
 *   3. Bounded async export queue — no unbounded in-memory accumulation.
 *   4. Edge-compatible thin correlation layer (no OTel SDK) is in correlation.ts.
 */

import { NodeSDK } from "@opentelemetry/sdk-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION, SEMRESATTRS_DEPLOYMENT_ENVIRONMENT } from "@opentelemetry/semantic-conventions";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { SimpleSpanProcessor, BatchSpanProcessor, ConsoleSpanExporter } from "@opentelemetry/sdk-trace-node";
import { PeriodicExportingMetricReader, ConsoleMetricExporter } from "@opentelemetry/sdk-metrics";
import { trace, metrics, diag, DiagConsoleLogger, DiagLogLevel } from "@opentelemetry/api";

let sdk: NodeSDK | null = null;
let sdkInitialised = false;

function parseSamplingRate(): number {
  const raw = process.env.OTEL_TRACE_SAMPLING_RATE;
  if (raw !== undefined) {
    const n = parseFloat(raw);
    if (!isNaN(n) && n >= 0 && n <= 1) return n;
  }
  const appEnv = process.env.APP_ENV || process.env.NODE_ENV || "development";
  return (appEnv === "production" || appEnv === "staging") ? 0.1 : 1.0;
}

function parseOtlpHeaders(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  const headers: Record<string, string> = {};
  for (const pair of raw.split(",")) {
    const idx = pair.indexOf("=");
    if (idx > 0) {
      const key = pair.slice(0, idx).trim();
      const val = pair.slice(idx + 1).trim();
      if (key && val) headers[key] = val;
    }
  }
  return headers;
}

/**
 * Initialises the OpenTelemetry SDK.
 * Must be called ONCE, before application modules are imported, in long-running
 * processes (Next.js instrumentation hook or worker entrypoint).
 *
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export function initTelemetry(serviceNameOverride?: string): void {
  if (sdkInitialised) return;
  sdkInitialised = true;

  if (process.env.OTEL_SDK_DISABLED === "true") {
    return;
  }

  const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  const otlpHeaders = parseOtlpHeaders(process.env.OTEL_EXPORTER_OTLP_HEADERS);

  const serviceName = serviceNameOverride
    || process.env.OTEL_SERVICE_NAME
    || "asso-platform";

  const appEnv = process.env.APP_ENV || process.env.NODE_ENV || "development";

  // Enable OTel internal diagnostics only in debug mode
  if (process.env.OTEL_LOG_LEVEL === "debug") {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
  }

  // ─── Trace exporter ─────────────────────────────────────────────────────
  const spanProcessors = [];

  if (otlpEndpoint) {
    spanProcessors.push(
      new BatchSpanProcessor(
        new OTLPTraceExporter({
          url: `${otlpEndpoint}/v1/traces`,
          headers: otlpHeaders,
          timeoutMillis: 5000,
        }),
        {
          maxExportBatchSize: 512,
          scheduledDelayMillis: 5000,
          exportTimeoutMillis: 30000,
          maxQueueSize: 2048, // bounded — prevents unbounded memory growth
        }
      )
    );
  } else if (process.env.OTEL_CONSOLE_EXPORT === "true") {
    spanProcessors.push(new SimpleSpanProcessor(new ConsoleSpanExporter()));
  }

  // ─── Metrics exporter ──────────────────────────────────────────────────
  const metricReaders = [];

  if (otlpEndpoint) {
    metricReaders.push(
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({
          url: `${otlpEndpoint}/v1/metrics`,
          headers: otlpHeaders,
          timeoutMillis: 5000,
        }),
        exportIntervalMillis: parseInt(process.env.OTEL_METRIC_EXPORT_INTERVAL_MS || "30000", 10),
      })
    );
  } else if (process.env.OTEL_CONSOLE_EXPORT === "true") {
    metricReaders.push(
      new PeriodicExportingMetricReader({
        exporter: new ConsoleMetricExporter(),
        exportIntervalMillis: 60000,
      })
    );
  }

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [SEMRESATTRS_SERVICE_NAME]: serviceName,
      [SEMRESATTRS_SERVICE_VERSION]: process.env.npm_package_version || "0.1.0",
      [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: appEnv,
      "runtime.name": "nodejs",
      "runtime.version": process.version,
    }),
    spanProcessors: spanProcessors.length > 0 ? spanProcessors : undefined,
    metricReader: metricReaders.length > 0 ? metricReaders[0] : undefined,
  });

  try {
    sdk.start();
  } catch (err) {
    // Telemetry failure MUST NOT break application startup
    console.warn("[ASSO Observability] OTel SDK failed to start:", err);
    sdk = null;
  }
}

/**
 * Gracefully shuts down the OTel SDK.
 * Should be called during process shutdown (SIGTERM/SIGINT) to flush spans/metrics.
 * Timeout is 5 seconds to avoid hanging.
 */
export async function shutdownTelemetry(): Promise<void> {
  if (!sdk) return;
  try {
    await Promise.race([
      sdk.shutdown(),
      new Promise<void>((resolve) => setTimeout(resolve, 5000)),
    ]);
  } catch {
    // Ignore shutdown errors — process is exiting
  }
}

/**
 * Returns the global OTel tracer for the given instrumentation scope.
 * Safe to call even when OTel is disabled — returns a noop tracer.
 */
export function getTracer(name: string, version = "1.0.0") {
  return trace.getTracer(name, version);
}

/**
 * Returns the global OTel meter for the given instrumentation scope.
 * Safe to call even when OTel is disabled — returns a noop meter.
 */
export function getMeter(name: string, version = "1.0.0") {
  return metrics.getMeter(name, version);
}
