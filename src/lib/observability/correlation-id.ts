/**
 * ASSO Observability — Edge-Compatible Correlation ID Utilities
 * Scale Foundation S5 / HUI-3
 *
 * Provides cryptographic random correlation IDs and validation using
 * Web Crypto API (crypto.getRandomValues), strictly avoiding Node.js-only
 * modules (like async_hooks) so that Next.js Edge Middleware can run without error.
 */

const VALID_ID_PATTERN = /^[a-zA-Z0-9_\-]{8,64}$/;

/**
 * Generates a fresh 24-character lowercase hex correlation ID.
 * Uses Web Crypto API for entropy in both Edge and Node runtimes.
 */
export function generateCorrelationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return Math.random().toString(36).substring(2, 14) + Math.random().toString(36).substring(2, 14);
}

/**
 * Validates a caller-supplied correlation ID.
 * - Must be 8–64 printable alphanumeric/dash/underscore characters.
 * - Oversized or malformed IDs are replaced with a fresh ID.
 * - NEVER trusts the ID for authorization.
 *
 * @returns { id, reused } — reused=true when caller's ID was accepted.
 */
export function resolveCorrelationId(
  incomingId: string | null | undefined
): { id: string; reused: boolean } {
  if (!incomingId) {
    return { id: generateCorrelationId(), reused: false };
  }

  const trimmed = incomingId.trim();
  if (VALID_ID_PATTERN.test(trimmed)) {
    return { id: trimmed, reused: true };
  }

  // Malformed or oversized — replace silently (security: prevent log injection)
  return { id: generateCorrelationId(), reused: false };
}
