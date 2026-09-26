import { describe, it, expect } from "vitest";
import { generatePresignedUploadUrl, generatePresignedDownloadUrl } from "@/lib/storage/adapter";
import { AppError } from "@/lib/api/errors";

describe("File Storage Security & IDOR Verification", () => {
  const tenantA = "11111111-1111-1111-1111-111111111111";
  const tenantB = "22222222-2222-2222-2222-222222222222";

  it("1. Generates secure signed upload URL for allowed MIME and size", () => {
    const res = generatePresignedUploadUrl({
      tenantId: tenantA,
      scope: "invoices",
      filename: "invoice_902.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024 * 500, // 500KB
    });

    expect(res.uploadUrl).toBeDefined();
    expect(res.storageKey).toContain(`tenants/${tenantA}/invoices/`);
    expect(res.storageKey).toContain("invoice_902.pdf");
  });

  it("2. Rejects disallowed file MIME types", () => {
    expect(() =>
      generatePresignedUploadUrl({
        tenantId: tenantA,
        scope: "invoices",
        filename: "malicious.exe",
        mimeType: "application/x-msdownload",
        sizeBytes: 1024,
      })
    ).toThrow(AppError);
  });

  it("3. Rejects files exceeding 10MB limit", () => {
    expect(() =>
      generatePresignedUploadUrl({
        tenantId: tenantA,
        scope: "invoices",
        filename: "huge.pdf",
        mimeType: "application/pdf",
        sizeBytes: 15 * 1024 * 1024,
      })
    ).toThrow(AppError);
  });

  it("4. Prevents cross-tenant IDOR file access", () => {
    // File belongs to Tenant A
    const tenantAKey = `tenants/${tenantA}/invoices/inv_123.pdf`;

    // Tenant A can generate download URL
    const urlA = generatePresignedDownloadUrl(tenantAKey, tenantA);
    expect(urlA).toBeDefined();

    // Tenant B attempting to access Tenant A's storageKey throws 404 (RESOURCE_NOT_FOUND)
    expect(() => generatePresignedDownloadUrl(tenantAKey, tenantB)).toThrow(
      "File not found within tenant scope."
    );
  });
});
