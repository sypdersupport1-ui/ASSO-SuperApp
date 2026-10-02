import { DomainOutboxEvent } from "@/db/schema/communication";

export type OutboxStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "RETRY_WAITING"
  | "FAILED"
  | "DEAD_LETTER";

export interface OutboxEvent extends DomainOutboxEvent {
  claimedBy: string | null;
  claimExpiresAt: Date | null;
  lastAttemptedAt: Date | null;
}

export interface WorkerConfig {
  workerId: string;
  pollIntervalMs: number;
  batchSize: number;
  concurrency: number;
  leaseSeconds: number;
  maxAttempts: number;
  baseBackoffSeconds: number;
  maxBackoffSeconds: number;
  shutdownTimeoutMs: number;
}

export interface ProcessEventResult {
  success: boolean;
  retryable?: boolean;
  error?: string;
  providerRef?: string;
}

export interface OutboxEventHandler {
  supports(event: OutboxEvent): boolean;
  handle(event: OutboxEvent): Promise<ProcessEventResult>;
}

export interface BatchProcessingStats {
  claimed: number;
  succeeded: number;
  retried: number;
  deadLettered: number;
  durationMs: number;
  errors?: Array<{ outboxId: string; error: string }>;
}
