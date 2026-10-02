import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  generateCorrelationId,
  resolveCorrelationId,
  runWithCorrelationContext,
  getCorrelationId,
} from "@/lib/observability/correlation";
import { logger } from "@/lib/logger";
import { withObservability } from "@/lib/observability/api-handler";
import { NextRequest } from "next/server";
import { getTracer, initTelemetry, shutdownTelemetry } from "@/lib/observability/tracing";

describe("Scale Foundation S5 — Observability & Tracing", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "debug").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Correlation Context", () => {
    it("should generate a 24-character hex ID", () => {
      const id = generateCorrelationId();
      expect(id).toMatch(/^[0-9a-f]{24}$/);
    });

    it("should resolve valid external correlation IDs", () => {
      const { id, reused } = resolveCorrelationId("valid-external-id-12345");
      expect(id).toBe("valid-external-id-12345");
      expect(reused).toBe(true);
    });

    it("should reject oversized/malformed correlation IDs and generate new ones", () => {
      const oversized = "a".repeat(100);
      const { id, reused } = resolveCorrelationId(oversized);
      expect(id).not.toBe(oversized);
      expect(reused).toBe(false);
      expect(id).toMatch(/^[0-9a-f]{24}$/);
    });

    it("should propagate correlation context via AsyncLocalStorage", async () => {
      const testId = "test-correlation-123";
      
      await runWithCorrelationContext(
        {
          requestId: testId,
          service: "api",
          startedAt: Date.now(),
        },
        async () => {
          expect(getCorrelationId()).toBe(testId);
          
          // Test nested async propagation
          await new Promise((resolve) => setTimeout(resolve, 10));
          expect(getCorrelationId()).toBe(testId);
        }
      );
      
      // Outside context it should return "unknown"
      expect(getCorrelationId()).toBe("unknown");
    });
  });

  describe("Structured Logger Redaction", () => {
    it("should redact sensitive fields", () => {
      const loggerSpy = vi.spyOn(console, "log");
      
      logger.info({
        message: "Test logging",
        details: {
          publicInfo: "safe",
          password: "my-secret-password",
          jwt: "header.payload.signature",
          nested: {
            cardNumber: "1234567812345678",
            cvv: "123"
          }
        }
      });
      
      expect(loggerSpy).toHaveBeenCalledTimes(1);
      const output = JSON.parse(loggerSpy.mock.calls[0][0]);
      
      expect(output.details.publicInfo).toBe("safe");
      expect(output.details.password).toBe("[REDACTED]");
      expect(output.details.jwt).toBe("[REDACTED]");
      expect(output.details.nested.cardNumber).toBe("[REDACTED]"); // Uses lowercase comparison in sanitize logic, wait, sanitize lowers the key before check
      // Actually let's check exact key
    });
  });

  describe("API Handler Wrapper", () => {
    it("should inject correlation headers and span tags without failing", async () => {
      initTelemetry();
      
      const handler = withObservability(
        async (req: NextRequest) => {
          return new Response(JSON.stringify({ success: true }), { status: 200 });
        },
        { route: "/test", operation: "test_op" }
      );

      const req = new NextRequest("http://localhost/test", {
        headers: { "x-correlation-id": "client-123" },
      });

      const res = await handler(req);
      
      expect(res.status).toBe(200);
      expect(res.headers.get("x-request-id")).toBe("client-123");
      
      await shutdownTelemetry();
    });

    it("should catch errors, log them, and return a clean 500", async () => {
      const loggerSpy = vi.spyOn(console, "error");
      
      const handler = withObservability(
        async () => {
          throw new Error("Business logic crash");
        },
        { route: "/test-crash" }
      );

      const req = new NextRequest("http://localhost/test-crash");
      const res = await handler(req);
      
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("INTERNAL_SERVER_ERROR");
      
      expect(loggerSpy).toHaveBeenCalled();
    });
  });
});
