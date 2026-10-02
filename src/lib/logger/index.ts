/**
 * ASSO Structured Logger
 * Scale Foundation S5
 *
 * Standardised JSON logging across API processes and the standalone outbox worker.
 *
 * Security invariants:
 *   - Secrets, auth tokens, JWT payloads, platform context tokens are NEVER logged.
 *   - Full customer phone/email are NEVER logged by default (use the redact helper).
 *   - Stack traces are only included in server logs (never returned to clients).
 *   - REDACTED_KEYS list covers all known sensitive field names.
 *
 * Field schema (all optional except timestamp, level, message):
 *   timestamp        ISO 8601
 *   level            DEBUG | INFO | WARN | ERROR
 *   service          api | worker | migration | test
 *   environment      local | development | test | preview | staging | production
 *   request_id       correlation / request ID
 *   correlation_id   caller-supplied external trace ID (if validated)
 *   tenant_id        operational tenant context
 *   outlet_id        outlet scope
 *   actor_id         hashed/opaque actor reference (never raw JWT sub in security logs)
 *   route            HTTP route pattern
 *   method           HTTP method
 *   operation        business operation label
 *   status_code      HTTP response code
 *   duration_ms      elapsed wall-clock milliseconds
 *   event_id         domain event / outbox event ID
 *   event_type       domain event type
 *   worker_id        worker instance ID
 *   attempt          retry attempt count
 *   error_type       error class name
 *   error_code       platform error code
 *   module           internal subsystem label
 *   details          additional sanitised context
 *   error            sanitised error object (stack in non-production only)
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export type ServiceType = "api" | "worker" | "migration" | "test";

export interface LogPayload {
  // ─── Core ────────────────────────────────────────────────────────────────
  message: string;
  level?: LogLevel; // used when calling log() directly

  // ─── Request / Correlation ───────────────────────────────────────────────
  requestId?: string;
  correlationId?: string;

  // ─── Tenant / Operational Context ────────────────────────────────────────
  tenantId?: string;
  outletId?: string;
  actorId?: string;

  // ─── HTTP ────────────────────────────────────────────────────────────────
  route?: string;
  method?: string;
  statusCode?: number;
  durationMs?: number;
  operation?: string;

  // ─── Domain Events / Outbox / Worker ─────────────────────────────────────
  eventId?: string;
  eventType?: string;
  workerId?: string;
  attempt?: number;

  // ─── Error ───────────────────────────────────────────────────────────────
  error_type?: string;
  error_code?: string;
  error?: Error | unknown;

  // ─── Generic ─────────────────────────────────────────────────────────────
  module?: string;
  userId?: string; // legacy compat — mapped to actor_id internally
  details?: Record<string, unknown>;
}

// ─── Redaction ────────────────────────────────────────────────────────────────

const REDACTED_KEYS = new Set([
  "password",
  "passwd",
  "token",
  "jwt",
  "secret",
  "authorization",
  "apikey",
  "api_key",
  "access_token",
  "refresh_token",
  "cardnumber",
  "card_number",
  "cvv",
  "pan",
  "aadhaar",
  "platform_context_token",
  "platform_token",
  "x-platform-token",
  "x-supabase-key",
  "service_role_key",
  "private_key",
  "signing_key",
  "webhook_secret",
  "stripe_secret",
  "razorpay_secret",
]);

/**
 * Deep-clones and redacts known-sensitive keys from arbitrary objects.
 * Safe for use on `details`, error payloads, and request metadata.
 * Does NOT recurse into arrays beyond one level to avoid DoS on large arrays.
 */
export function sanitize(data: unknown, depth = 0): unknown {
  if (data === null || data === undefined) return data;
  if (typeof data !== "object") return data;
  if (depth > 6) return "[DEEP_OBJECT]";

  if (Array.isArray(data)) {
    return data.slice(0, 50).map((item) => sanitize(item, depth + 1));
  }

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (REDACTED_KEYS.has(key.toLowerCase())) {
      out[key] = "[REDACTED]";
    } else if (typeof value === "object") {
      out[key] = sanitize(value, depth + 1);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Masks a phone number, showing only last 2 digits.
 * Used for operational logging where presence is relevant but content is not.
 *   +91 98765 43210 → ****10
 */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "[no_phone]";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "****";
  return `****${digits.slice(-2)}`;
}

/**
 * Masks an email address for operational logging.
 *   guest@example.com → g***@example.com
 */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return "[no_email]";
  const [local, domain] = email.split("@");
  if (!domain) return `${local.slice(0, 1)}***`;
  return `${local.slice(0, 1)}***@${domain}`;
}

// ─── Logger Implementation ─────────────────────────────────────────────────────

const SERVICE_NAME: ServiceType = (process.env.LOGGER_SERVICE as ServiceType) || "api";

const APP_ENV =
  process.env.APP_ENV ||
  process.env.ASSO_ENV ||
  process.env.NODE_ENV ||
  "local";

class Logger {
  private shouldLog(level: LogLevel): boolean {
    const minLevel = (process.env.LOG_LEVEL || "").toLowerCase() as LogLevel;

    // In test environments suppress debug noise unless explicitly enabled
    if (level === "debug") {
      return (
        process.env.NODE_ENV !== "test" ||
        process.env.DEBUG === "true" ||
        process.env.LOG_LEVEL === "debug"
      );
    }
    if (minLevel === "warn") return level === "warn" || level === "error";
    if (minLevel === "error") return level === "error";
    return true;
  }

  private formatLog(level: LogLevel, payload: LogPayload): string {
    const entry: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      service: SERVICE_NAME,
      environment: APP_ENV,
      message: payload.message,
    };

    // ─── Request / Correlation ─────────────────────────────────────────
    if (payload.requestId) entry.request_id = payload.requestId;
    if (payload.correlationId) entry.correlation_id = payload.correlationId;

    // ─── Tenant / Actor ───────────────────────────────────────────────
    if (payload.tenantId) entry.tenant_id = payload.tenantId;
    if (payload.outletId) entry.outlet_id = payload.outletId;
    // actorId or legacy userId — never the raw JWT sub in error/security logs
    const actor = payload.actorId || payload.userId;
    if (actor) entry.actor_id = actor;

    // ─── HTTP ─────────────────────────────────────────────────────────
    if (payload.route) entry.route = payload.route;
    if (payload.method) entry.method = payload.method;
    if (payload.statusCode !== undefined) entry.status_code = payload.statusCode;
    if (payload.durationMs !== undefined) entry.duration_ms = payload.durationMs;
    if (payload.operation) entry.operation = payload.operation;

    // ─── Events / Worker ─────────────────────────────────────────────
    if (payload.eventId) entry.event_id = payload.eventId;
    if (payload.eventType) entry.event_type = payload.eventType;
    if (payload.workerId) entry.worker_id = payload.workerId;
    if (payload.attempt !== undefined) entry.attempt = payload.attempt;

    // ─── Error ───────────────────────────────────────────────────────
    if (payload.error_type) entry.error_type = payload.error_type;
    if (payload.error_code) entry.error_code = payload.error_code;
    if (payload.module) entry.module = payload.module;

    // ─── Sanitised Details ────────────────────────────────────────────
    if (payload.details) {
      entry.details = sanitize(payload.details);
    }

    // ─── Error Object ────────────────────────────────────────────────
    if (payload.error !== undefined) {
      if (payload.error instanceof Error) {
        entry.error = {
          name: payload.error.name,
          message: payload.error.message,
          // Stack traces only in server-side logs, NEVER in client responses
          stack:
            process.env.NODE_ENV !== "production" &&
            process.env.APP_ENV !== "production"
              ? payload.error.stack
              : undefined,
        };
      } else if (typeof payload.error === "string") {
        entry.error = { message: payload.error };
      }
    }

    return JSON.stringify(entry);
  }

  debug(payload: LogPayload): void {
    if (!this.shouldLog("debug")) return;
    console.debug(this.formatLog("debug", payload));
  }

  info(payload: LogPayload): void {
    if (!this.shouldLog("info")) return;
    console.log(this.formatLog("info", payload));
  }

  warn(payload: LogPayload): void {
    if (!this.shouldLog("warn")) return;
    console.warn(this.formatLog("warn", payload));
  }

  error(payload: LogPayload): void {
    if (!this.shouldLog("error")) return;
    console.error(this.formatLog("error", payload));
  }

  /**
   * Emits a structured security audit event at WARN level.
   * Fields: requestId, tenantId, operation, outcome, reason.
   * MUST NOT contain: credentials, tokens, raw phone, raw payment data.
   */
  security(event: {
    event: string;
    requestId?: string;
    tenantId?: string;
    outcome: "success" | "failure" | "blocked";
    reason?: string;
    details?: Record<string, unknown>;
  }): void {
    this.warn({
      message: `[SECURITY] ${event.event}`,
      requestId: event.requestId,
      tenantId: event.tenantId,
      module: "SECURITY_AUDIT",
      details: {
        security_event: event.event,
        outcome: event.outcome,
        reason: event.reason,
        ...(event.details ? (sanitize(event.details) as Record<string, unknown>) : {}),
      },
    });
  }
}

export const logger = new Logger();
