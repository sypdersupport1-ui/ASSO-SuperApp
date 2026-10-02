/**
 * Canonical Platform Error Codes matching docs/05-API/ERROR-MODEL.md
 */
export type ErrorCode =
  | "INVALID_PAYLOAD"
  | "VALIDATION_FAILED"
  | "INVALID_STATE_TRANSITION"
  | "AUTHENTICATION_REQUIRED"
  | "MFA_CHALLENGE_REQUIRED"
  | "MODULE_NOT_ENTITLED"
  | "PERMISSION_DENIED"
  | "POLICY_VIOLATION"
  | "RESOURCE_NOT_FOUND"
  | "CONCURRENT_MODIFICATION"
  | "IDEMPOTENCY_CONFLICT"
  | "BUSINESS_RULE_VIOLATION"
  | "RATE_LIMIT_EXCEEDED"
  | "INTERNAL_SERVER_ERROR";

export interface ValidationErrorDetail {
  field: string;
  issue: string;
  received?: unknown;
}

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: ValidationErrorDetail[] | Record<string, unknown>;

  constructor(code: ErrorCode, message: string, statusCode: number, details?: ValidationErrorDetail[] | Record<string, unknown>) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message = "The request payload failed validation checks.", details?: ValidationErrorDetail[]) {
    super("VALIDATION_FAILED", message, 400, details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message = "Missing, expired, or malformed authentication token.") {
    super("AUTHENTICATION_REQUIRED", message, 401);
  }
}

export class MfaChallengeError extends AppError {
  constructor(message = "TOTP MFA verification required to complete login.") {
    super("MFA_CHALLENGE_REQUIRED", message, 401);
  }
}

export class ModuleNotEntitledError extends AppError {
  constructor(moduleCode: string, message?: string) {
    super(
      "MODULE_NOT_ENTITLED",
      message || `Tenant is not entitled to use module '${moduleCode}'.`,
      403,
      { moduleCode }
    );
  }
}

export class PermissionDeniedError extends AppError {
  constructor(permission: string, message?: string) {
    super(
      "PERMISSION_DENIED",
      message || `Staff role lacks required permission: '${permission}'.`,
      403,
      { permission }
    );
  }
}

export class PolicyViolationError extends AppError {
  constructor(message: string, policyDetails?: Record<string, unknown>) {
    super("POLICY_VIOLATION", message, 403, policyDetails);
  }
}

export class NotFoundError extends AppError {
  constructor(resource = "Resource", message?: string) {
    super("RESOURCE_NOT_FOUND", message || `${resource} was not found within current tenant scope.`, 404);
  }
}

export class IdempotencyConflictError extends AppError {
  constructor(message = "Reused idempotency key with conflicting request parameters or in-flight mutation.") {
    super("IDEMPOTENCY_CONFLICT", message, 409);
  }
}

export class InvalidStateTransitionError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("INVALID_STATE_TRANSITION", message, 422, details);
  }
}

export class BusinessRuleError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("BUSINESS_RULE_VIOLATION", message, 422, details);
  }
}

export class RateLimitError extends AppError {
  public readonly retryAfterSeconds: number;

  constructor(
    message = "Request threshold breached. Please retry after some time.",
    details?: { retryAfterSeconds?: number; limit?: number; remaining?: number; category?: string } | Record<string, unknown>
  ) {
    super("RATE_LIMIT_EXCEEDED", message, 429, details);
    this.retryAfterSeconds = (details as any)?.retryAfterSeconds ?? 60;
  }
}

export class InternalServerError extends AppError {
  constructor(message = "An unexpected server error occurred.") {
    super("INTERNAL_SERVER_ERROR", message, 500);
  }
}
