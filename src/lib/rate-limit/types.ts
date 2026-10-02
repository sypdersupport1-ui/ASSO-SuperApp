export type RateLimitCategory =
  | "AUTH"
  | "CUSTOMER_PUBLIC"
  | "FINANCIAL_MUTATION"
  | "ADMIN"
  | "WEBHOOK"
  | "GENERAL";

export interface RateLimitPolicy {
  category: RateLimitCategory;
  maxRequests: number;
  windowSeconds: number;
  failClosed?: boolean;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
  retryAfterSeconds: number;
  category: RateLimitCategory;
  key: string;
}

export interface RateLimiter {
  check(key: string, policy: RateLimitPolicy): Promise<RateLimitResult>;
  reset?(key: string): Promise<void>;
  cleanupExpired?(limit?: number): Promise<number>;
}
