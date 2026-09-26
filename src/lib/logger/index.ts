export type LogLevel = "debug" | "info" | "warn" | "error";

interface LogPayload {
  message: string;
  requestId?: string;
  tenantId?: string;
  userId?: string;
  module?: string;
  details?: Record<string, unknown>;
  error?: Error | unknown;
}

const REDACTED_KEYS = new Set([
  "password",
  "token",
  "jwt",
  "secret",
  "authorization",
  "apikey",
  "api_key",
  "cardnumber",
  "cvv",
  "pan",
  "aadhaar",
]);

function sanitize(data: unknown): unknown {
  if (data === null || data === undefined) return data;
  if (typeof data !== "object") return data;

  if (Array.isArray(data)) {
    return data.map(sanitize);
  }

  const sanitizedObj: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (REDACTED_KEYS.has(key.toLowerCase())) {
      sanitizedObj[key] = "[REDACTED]";
    } else if (typeof value === "object") {
      sanitizedObj[key] = sanitize(value);
    } else {
      sanitizedObj[key] = value;
    }
  }
  return sanitizedObj;
}

class Logger {
  private formatLog(level: LogLevel, payload: LogPayload): string {
    const entry = {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      message: payload.message,
      requestId: payload.requestId,
      tenantId: payload.tenantId,
      userId: payload.userId,
      module: payload.module,
      details: payload.details ? sanitize(payload.details) : undefined,
      error:
        payload.error instanceof Error
          ? {
              name: payload.error.name,
              message: payload.error.message,
              stack: process.env.NODE_ENV !== "production" ? payload.error.stack : undefined,
            }
          : payload.error,
    };
    return JSON.stringify(entry);
  }

  debug(payload: LogPayload): void {
    if (process.env.NODE_ENV === "development" || process.env.DEBUG === "true") {
      console.debug(this.formatLog("debug", payload));
    }
  }

  info(payload: LogPayload): void {
    console.log(this.formatLog("info", payload));
  }

  warn(payload: LogPayload): void {
    console.warn(this.formatLog("warn", payload));
  }

  error(payload: LogPayload): void {
    console.error(this.formatLog("error", payload));
  }
}

export const logger = new Logger();
