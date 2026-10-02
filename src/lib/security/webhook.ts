import crypto from "crypto";
import { NextRequest } from "next/server";
import { assertRateLimit } from "@/lib/rate-limit";
import { checkOrAcquireIdempotencyKey, saveIdempotentResponse } from "@/lib/api/idempotency";
import { ValidationError, AuthenticationError, IdempotencyConflictError } from "@/lib/api/errors";

export interface WebhookProtectionOptions {
  provider: string;
  secret: string;
  signatureHeader?: string;
  timestampHeader?: string;
  maxSkewSeconds?: number;
  tenantId?: string; // Optional if platform-level webhook
  eventId?: string;
}

export interface WebhookVerificationResult {
  valid: boolean;
  rawBody: string;
  payload: Record<string, unknown>;
  eventId: string;
}

/**
 * Multi-layer webhook abuse protection:
 * Layer 1: Distributed Rate Limiting (WEBHOOK category, fail-closed)
 * Layer 2: Timestamp freshness verification (clock skew replay defense)
 * Layer 3: Cryptographic HMAC signature verification
 * Layer 4: Durable Idempotency replay protection
 */
export async function protectAndVerifyWebhook(
  req: NextRequest,
  options: WebhookProtectionOptions
): Promise<WebhookVerificationResult> {
  const provider = options.provider.toLowerCase();
  const maxSkewSeconds = options.maxSkewSeconds || 300; // 5 minutes default

  // Layer 1: Distributed Rate Limiting (before parsing/hashing large payloads)
  await assertRateLimit(req, {
    category: "WEBHOOK",
    operation: provider,
  });

  const rawBody = await req.text();

  // Layer 2: Timestamp Verification
  const tsHeaderName = options.timestampHeader || "x-webhook-timestamp";
  const tsHeader = req.headers.get(tsHeaderName);
  if (tsHeader) {
    const timestampMs = parseInt(tsHeader, 10) * (tsHeader.length === 10 ? 1000 : 1);
    const ageSeconds = Math.abs(Date.now() - timestampMs) / 1000;
    if (ageSeconds > maxSkewSeconds) {
      throw new ValidationError(`Webhook timestamp outside acceptable tolerance (${maxSkewSeconds}s).`);
    }
  }

  // Layer 3: Cryptographic Signature Verification
  const sigHeaderName = options.signatureHeader || "x-webhook-signature";
  const signature = req.headers.get(sigHeaderName);
  if (!signature) {
    throw new AuthenticationError(`Missing webhook signature header: ${sigHeaderName}`);
  }

  const expectedSignature = crypto
    .createHmac("sha256", options.secret)
    .update(rawBody)
    .digest("hex");

  // Constant-time comparison against timing attacks
  const sigBuffer = Buffer.from(signature, "hex");
  const expBuffer = Buffer.from(expectedSignature, "hex");

  if (sigBuffer.length !== expBuffer.length || !crypto.timingSafeEqual(sigBuffer, expBuffer)) {
    throw new AuthenticationError("Invalid webhook signature.");
  }

  // Parse JSON payload safely
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(rawBody);
  } catch {
    throw new ValidationError("Malformed JSON in webhook body.");
  }

  // Layer 4: Idempotency Replay Protection
  const eventId =
    options.eventId ||
    req.headers.get("x-webhook-event-id") ||
    (payload.id as string) ||
    (payload.eventId as string) ||
    crypto.createHash("sha256").update(rawBody).digest("hex").slice(0, 32);

  const requestHash = crypto.createHash("sha256").update(`${provider}:${rawBody}`).digest("hex");
  const tenantId = options.tenantId || null;

  const { acquired, cachedResponse } = await checkOrAcquireIdempotencyKey(
    tenantId,
    `wh_${provider}_${eventId}`,
    requestHash,
    48, // 48h retention
    `WEBHOOK_${provider.toUpperCase()}`
  );

  if (!acquired && cachedResponse) {
    throw new IdempotencyConflictError(`Duplicate webhook delivery for event ${eventId}.`);
  }

  return {
    valid: true,
    rawBody,
    payload,
    eventId,
  };
}

/**
 * Mark webhook processing completed in durable idempotency store
 */
export async function completeWebhookProcessing(
  provider: string,
  eventId: string,
  statusCode = 200,
  responseBody = { received: true },
  tenantId?: string | null
): Promise<void> {
  await saveIdempotentResponse(
    tenantId || null,
    `wh_${provider.toLowerCase()}_${eventId}`,
    statusCode,
    responseBody,
    `WEBHOOK_${provider.toUpperCase()}`
  );
}
