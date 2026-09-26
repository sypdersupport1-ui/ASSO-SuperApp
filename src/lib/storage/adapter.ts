import crypto from "crypto";
import { AppError } from "../api/errors";
import { env } from "@/config/env";

export interface PresignedUploadRequest {
  tenantId: string;
  scope: "invoices" | "expenses" | "catalog" | "chat" | "avatars";
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

export interface PresignedUploadResponse {
  fileId: string;
  storageKey: string;
  uploadUrl: string;
  expiresInSeconds: number;
  headers: Record<string, string>;
}

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "text/csv",
]);

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export function generatePresignedUploadUrl(request: PresignedUploadRequest): PresignedUploadResponse {
  if (!ALLOWED_MIME_TYPES.has(request.mimeType)) {
    throw new AppError("INVALID_PAYLOAD", `Unsupported MIME type: '${request.mimeType}'. Allowed: images, PDF, CSV.`, 400);
  }

  if (request.sizeBytes > MAX_FILE_SIZE_BYTES) {
    throw new AppError("INVALID_PAYLOAD", `File exceeds max allowed size of 10MB.`, 400);
  }

  const fileId = crypto.randomUUID();
  const sanitizedName = request.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storageKey = `tenants/${request.tenantId}/${request.scope}/${fileId}_${sanitizedName}`;

  // Generate secure token/signature for upload
  const expiresAt = Math.floor(Date.now() / 1000) + 900; // 15 min
  const signature = crypto
    .createHmac("sha256", env.JWT_SECRET)
    .update(`${storageKey}:${request.mimeType}:${expiresAt}`)
    .digest("hex");

  const uploadUrl = `${env.APP_URL}/api/v1/storage/upload?key=${encodeURIComponent(storageKey)}&expires=${expiresAt}&sig=${signature}`;

  return {
    fileId,
    storageKey,
    uploadUrl,
    expiresInSeconds: 900,
    headers: {
      "Content-Type": request.mimeType,
    },
  };
}

export function generatePresignedDownloadUrl(storageKey: string, tenantId: string): string {
  // Ensure tenant cannot request files from another tenant path (strict prefix check)
  const expectedPrefix = `tenants/${tenantId}/`;
  if (!storageKey.startsWith(expectedPrefix)) {
    throw new AppError("RESOURCE_NOT_FOUND", "File not found within tenant scope.", 404);
  }

  const expiresAt = Math.floor(Date.now() / 1000) + 3600; // 1 hour
  const signature = crypto
    .createHmac("sha256", env.JWT_SECRET)
    .update(`${storageKey}:${expiresAt}`)
    .digest("hex");

  return `${env.APP_URL}/api/v1/storage/download?key=${encodeURIComponent(storageKey)}&expires=${expiresAt}&sig=${signature}`;
}
