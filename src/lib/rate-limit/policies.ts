import { RateLimitCategory, RateLimitPolicy } from "./types";

/**
 * Endpoint Categories & Default Conservative Policies
 * 
 * Configurable via environment variables if desired.
 * Fail-closed policy:
 * - Critical abuse-sensitive endpoints (AUTH, FINANCIAL_MUTATION, WEBHOOK) fail-closed
 *   if the rate-limit provider becomes unavailable, shielding PostgreSQL and domain engines.
 * - Read-heavy or low-risk endpoints (CUSTOMER_PUBLIC, ADMIN, GENERAL) can fail-open with warnings.
 */
export const DEFAULT_POLICIES: Record<RateLimitCategory, RateLimitPolicy> = {
  AUTH: {
    category: "AUTH",
    maxRequests: parseInt(process.env.RATE_LIMIT_AUTH_MAX || "10", 10),
    windowSeconds: parseInt(process.env.RATE_LIMIT_AUTH_WINDOW || "60", 10),
    failClosed: true,
  },
  CUSTOMER_PUBLIC: {
    category: "CUSTOMER_PUBLIC",
    maxRequests: parseInt(process.env.RATE_LIMIT_CUSTOMER_MAX || "60", 10),
    windowSeconds: parseInt(process.env.RATE_LIMIT_CUSTOMER_WINDOW || "10", 10),
    failClosed: false,
  },
  FINANCIAL_MUTATION: {
    category: "FINANCIAL_MUTATION",
    maxRequests: parseInt(process.env.RATE_LIMIT_FINANCIAL_MAX || "30", 10),
    windowSeconds: parseInt(process.env.RATE_LIMIT_FINANCIAL_WINDOW || "10", 10),
    failClosed: true,
  },
  ADMIN: {
    category: "ADMIN",
    maxRequests: parseInt(process.env.RATE_LIMIT_ADMIN_MAX || "120", 10),
    windowSeconds: parseInt(process.env.RATE_LIMIT_ADMIN_WINDOW || "60", 10),
    failClosed: false,
  },
  WEBHOOK: {
    category: "WEBHOOK",
    maxRequests: parseInt(process.env.RATE_LIMIT_WEBHOOK_MAX || "120", 10),
    windowSeconds: parseInt(process.env.RATE_LIMIT_WEBHOOK_WINDOW || "60", 10),
    failClosed: true,
  },
  GENERAL: {
    category: "GENERAL",
    maxRequests: parseInt(process.env.RATE_LIMIT_GENERAL_MAX || "60", 10),
    windowSeconds: parseInt(process.env.RATE_LIMIT_GENERAL_WINDOW || "60", 10),
    failClosed: false,
  },
};

/**
 * Coarse Edge / Global IP Ceilings
 * Evaluated at Edge / network ingress before granular route logic.
 * Protects against token rotation, URL rotation, and endpoint scraping.
 */
export const DEFAULT_IP_CEILINGS: Record<RateLimitCategory, RateLimitPolicy> = {
  AUTH: {
    category: "AUTH",
    maxRequests: parseInt(process.env.RATE_LIMIT_AUTH_IP_MAX || "20", 10),
    windowSeconds: parseInt(process.env.RATE_LIMIT_AUTH_IP_WINDOW || "60", 10),
    failClosed: true,
  },
  CUSTOMER_PUBLIC: {
    category: "CUSTOMER_PUBLIC",
    maxRequests: parseInt(process.env.RATE_LIMIT_CUSTOMER_IP_MAX || "100", 10),
    windowSeconds: parseInt(process.env.RATE_LIMIT_CUSTOMER_IP_WINDOW || "10", 10),
    failClosed: false,
  },
  FINANCIAL_MUTATION: {
    category: "FINANCIAL_MUTATION",
    maxRequests: parseInt(process.env.RATE_LIMIT_FINANCIAL_IP_MAX || "40", 10),
    windowSeconds: parseInt(process.env.RATE_LIMIT_FINANCIAL_IP_WINDOW || "10", 10),
    failClosed: true,
  },
  ADMIN: {
    category: "ADMIN",
    maxRequests: parseInt(process.env.RATE_LIMIT_ADMIN_IP_MAX || "200", 10),
    windowSeconds: parseInt(process.env.RATE_LIMIT_ADMIN_IP_WINDOW || "60", 10),
    failClosed: false,
  },
  WEBHOOK: {
    category: "WEBHOOK",
    maxRequests: parseInt(process.env.RATE_LIMIT_WEBHOOK_IP_MAX || "200", 10),
    windowSeconds: parseInt(process.env.RATE_LIMIT_WEBHOOK_IP_WINDOW || "60", 10),
    failClosed: true,
  },
  GENERAL: {
    category: "GENERAL",
    maxRequests: parseInt(process.env.RATE_LIMIT_GENERAL_IP_MAX || "120", 10),
    windowSeconds: parseInt(process.env.RATE_LIMIT_GENERAL_IP_WINDOW || "60", 10),
    failClosed: false,
  },
};

export function getRateLimitPolicy(
  category: RateLimitCategory,
  overrides?: Partial<RateLimitPolicy>
): RateLimitPolicy {
  const base = DEFAULT_POLICIES[category] || DEFAULT_POLICIES.GENERAL;
  return {
    ...base,
    ...overrides,
  };
}

export function getIpCeilingPolicy(
  category: RateLimitCategory,
  overrides?: Partial<RateLimitPolicy>
): RateLimitPolicy {
  const base = DEFAULT_IP_CEILINGS[category] || DEFAULT_IP_CEILINGS.GENERAL;
  return {
    ...base,
    ...overrides,
  };
}
