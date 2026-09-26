import { NextRequest } from "next/server";
import { z } from "zod";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { generatePresignedUploadUrl } from "@/lib/storage/adapter";
import { ValidationError } from "@/lib/api/errors";

const uploadRequestSchema = z.object({
  filename: z.string().min(1, "filename is required"),
  mimeType: z.string().min(1, "mimeType is required"),
  sizeBytes: z.number().int().positive("sizeBytes must be positive"),
  scope: z.enum(["invoices", "expenses", "catalog", "chat", "avatars"]).default("catalog"),
});

export async function POST(req: NextRequest) {
  try {
    const ctx = extractRequestContext(req, { requireAuth: true });
    if (!ctx.tenantId) {
      throw new ValidationError("Missing tenant context in session.");
    }

    const body = await req.json();
    const parsed = uploadRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid file upload parameters",
        parsed.error.issues.map((i) => ({
          field: i.path.join("."),
          issue: i.message,
        }))
      );
    }

    const result = generatePresignedUploadUrl({
      tenantId: ctx.tenantId,
      filename: parsed.data.filename,
      mimeType: parsed.data.mimeType,
      sizeBytes: parsed.data.sizeBytes,
      scope: parsed.data.scope,
    });

    return apiSuccess(result, ctx.requestId, 201);
  } catch (err) {
    return apiError(err);
  }
}
