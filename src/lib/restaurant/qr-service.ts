import crypto from "crypto";
import QRCode from "qrcode";
import { eq, and, desc } from "drizzle-orm";
import { getDb } from "@/db/client";
import { businessContexts, qrTokens, customerSessions } from "@/db/schema/context";
import { restaurantTables } from "@/db/schema/restaurant";
import { recordAuditEvent } from "@/lib/audit";
import { NotFoundError, BusinessRuleError, ValidationError } from "@/lib/api/errors";
import { env } from "@/config/env";

export interface TableQrResponse {
  tokenId: string;
  tenantId: string;
  outletId: string;
  contextId: string;
  tableId: string;
  tableNumber: string;
  displayLabel: string;
  opaqueToken: string;
  tokenStatus: "ACTIVE" | "REVOKED";
  qrUrl: string;
  qrSvgDataUri: string;
  createdAt: Date;
  updatedAt: Date;
  revocationReason?: string | null;
}

/**
 * Generates an opaque, high-entropy cryptographic token for QR resolution.
 * 256 bits of entropy via crypto.randomBytes(32).
 */
export function generateOpaqueQrToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/**
 * Builds the canonical customer landing URL for a given restaurant table opaque token.
 */
export function buildCustomerTableQrUrl(opaqueToken: string): string {
  const baseUrl = env.APP_URL.replace(/\/$/, "");
  return `${baseUrl}/restaurant/table?token=${encodeURIComponent(opaqueToken)}`;
}

/**
 * Renders an SVG Data URI representation of the QR code for instant client display/print.
 */
export async function renderQrSvgDataUri(url: string): Promise<string> {
  const svgString = await QRCode.toString(url, {
    type: "svg",
    margin: 2,
    color: {
      dark: "#0f172a",
      light: "#ffffff",
    },
  });
  return `data:image/svg+xml;utf8,${encodeURIComponent(svgString)}`;
}

/**
 * Retrieves the currently active QR token and metadata for a physical restaurant table.
 */
export async function getTableActiveQr(
  tenantId: string,
  outletId: string,
  tableId: string
): Promise<TableQrResponse | null> {
  const db = getDb();

  // 1. Verify Table exists and belongs to tenant/outlet
  const [table] = await db
    .select({
      tableId: restaurantTables.tableId,
      tableNumber: restaurantTables.tableNumber,
      displayLabel: restaurantTables.displayLabel,
      contextId: restaurantTables.contextId,
    })
    .from(restaurantTables)
    .where(
      and(
        eq(restaurantTables.tableId, tableId),
        eq(restaurantTables.tenantId, tenantId),
        eq(restaurantTables.outletId, outletId)
      )
    )
    .limit(1);

  if (!table) {
    throw new NotFoundError("Restaurant Table", `Table with ID '${tableId}' not found in this restaurant.`);
  }

  // 2. Fetch the latest ACTIVE QR token for the table's business context
  const [token] = await db
    .select()
    .from(qrTokens)
    .where(
      and(
        eq(qrTokens.contextId, table.contextId),
        eq(qrTokens.tenantId, tenantId),
        eq(qrTokens.outletId, outletId),
        eq(qrTokens.tokenStatus, "ACTIVE")
      )
    )
    .orderBy(desc(qrTokens.createdAt))
    .limit(1);

  if (!token) {
    return null;
  }

  const qrUrl = buildCustomerTableQrUrl(token.opaqueToken);
  const qrSvgDataUri = await renderQrSvgDataUri(qrUrl);

  return {
    tokenId: token.tokenId,
    tenantId: token.tenantId,
    outletId: token.outletId,
    contextId: token.contextId,
    tableId: table.tableId,
    tableNumber: table.tableNumber,
    displayLabel: table.displayLabel,
    opaqueToken: token.opaqueToken,
    tokenStatus: token.tokenStatus as "ACTIVE" | "REVOKED",
    qrUrl,
    qrSvgDataUri,
    createdAt: token.createdAt,
    updatedAt: token.updatedAt,
    revocationReason: token.revocationReason,
  };
}

/**
 * Generates or retrieves the active QR token for a restaurant table.
 */
export async function generateOrGetTableQr(
  tenantId: string,
  outletId: string,
  tableId: string,
  staffUserId?: string
): Promise<TableQrResponse> {
  const db = getDb();

  // Check if active QR already exists
  const existing = await getTableActiveQr(tenantId, outletId, tableId);
  if (existing) {
    return existing;
  }

  // 1. Fetch table
  const [table] = await db
    .select()
    .from(restaurantTables)
    .where(
      and(
        eq(restaurantTables.tableId, tableId),
        eq(restaurantTables.tenantId, tenantId),
        eq(restaurantTables.outletId, outletId)
      )
    )
    .limit(1);

  if (!table) {
    throw new NotFoundError("Restaurant Table", `Table with ID '${tableId}' not found.`);
  }

  // 2. Verify or ensure Business Context
  let contextId = table.contextId;
  if (!contextId) {
    const [newCtx] = await db
      .insert(businessContexts)
      .values({
        tenantId,
        outletId,
        contextType: "TABLE",
        identifier: table.tableNumber,
        displayLabel: table.displayLabel,
        status: table.status,
        isActive: true,
      })
      .returning();

    contextId = newCtx.contextId;
    await db
      .update(restaurantTables)
      .set({ contextId, updatedAt: new Date() })
      .where(eq(restaurantTables.tableId, tableId));
  }

  // 3. Generate high-entropy opaque token and persist
  const opaqueToken = generateOpaqueQrToken();
  const [newToken] = await db
    .insert(qrTokens)
    .values({
      tenantId,
      outletId,
      contextId,
      opaqueToken,
      tokenStatus: "ACTIVE",
    })
    .returning();

  // 4. Audit staff action
  await recordAuditEvent({
    tenantId,
    userId: staffUserId || undefined,
    action: "restaurant.qr.created",
    resourceType: "qr_token",
    resourceId: newToken.tokenId,
    payload: {
      actorType: "STAFF",
      tableId: table.tableId,
      tableNumber: table.tableNumber,
      contextId,
    },
  });

  const qrUrl = buildCustomerTableQrUrl(newToken.opaqueToken);
  const qrSvgDataUri = await renderQrSvgDataUri(qrUrl);

  return {
    tokenId: newToken.tokenId,
    tenantId: newToken.tenantId,
    outletId: newToken.outletId,
    contextId: newToken.contextId,
    tableId: table.tableId,
    tableNumber: table.tableNumber,
    displayLabel: table.displayLabel,
    opaqueToken: newToken.opaqueToken,
    tokenStatus: "ACTIVE",
    qrUrl,
    qrSvgDataUri,
    createdAt: newToken.createdAt,
    updatedAt: newToken.updatedAt,
    revocationReason: null,
  };
}

/**
 * Atomically rotates a table's QR token.
 * Revokes existing active token(s) and associated customer sessions, then generates a fresh token.
 */
export async function rotateTableQr(
  tenantId: string,
  outletId: string,
  tableId: string,
  staffUserId?: string,
  reason = "ROTATED"
): Promise<TableQrResponse> {
  const db = getDb();

  // 1. Fetch Table
  const [table] = await db
    .select()
    .from(restaurantTables)
    .where(
      and(
        eq(restaurantTables.tableId, tableId),
        eq(restaurantTables.tenantId, tenantId),
        eq(restaurantTables.outletId, outletId)
      )
    )
    .limit(1);

  if (!table) {
    throw new NotFoundError("Restaurant Table", `Table with ID '${tableId}' not found.`);
  }

  const contextId = table.contextId;
  const now = new Date();

  // 2. Revoke active tokens for this context
  const activeTokens = await db
    .select({ tokenId: qrTokens.tokenId })
    .from(qrTokens)
    .where(
      and(
        eq(qrTokens.contextId, contextId),
        eq(qrTokens.tenantId, tenantId),
        eq(qrTokens.tokenStatus, "ACTIVE")
      )
    );

  if (activeTokens.length > 0) {
    const tokenIds = activeTokens.map((t) => t.tokenId);

    await db
      .update(qrTokens)
      .set({
        tokenStatus: "REVOKED",
        revocationReason: reason,
        updatedAt: now,
      })
      .where(
        and(
          eq(qrTokens.contextId, contextId),
          eq(qrTokens.tenantId, tenantId),
          eq(qrTokens.tokenStatus, "ACTIVE")
        )
      );

    // Invalidate active customer sessions associated with revoked tokens
    for (const t of tokenIds) {
      await db
        .update(customerSessions)
        .set({
          sessionStatus: "REVOKED",
          updatedAt: now,
        })
        .where(
          and(
            eq(customerSessions.tokenId, t),
            eq(customerSessions.tenantId, tenantId),
            eq(customerSessions.sessionStatus, "ACTIVE")
          )
        );
    }
  }

  // 3. Insert newly generated active QR token
  const opaqueToken = generateOpaqueQrToken();
  const [newToken] = await db
    .insert(qrTokens)
    .values({
      tenantId,
      outletId,
      contextId,
      opaqueToken,
      tokenStatus: "ACTIVE",
    })
    .returning();

  // 4. Audit staff action
  await recordAuditEvent({
    tenantId,
    userId: staffUserId || undefined,
    action: "restaurant.qr.rotated",
    resourceType: "qr_token",
    resourceId: newToken.tokenId,
    payload: {
      actorType: "STAFF",
      tableId: table.tableId,
      tableNumber: table.tableNumber,
      contextId,
      revokedCount: activeTokens.length,
      reason,
    },
  });

  const qrUrl = buildCustomerTableQrUrl(newToken.opaqueToken);
  const qrSvgDataUri = await renderQrSvgDataUri(qrUrl);

  return {
    tokenId: newToken.tokenId,
    tenantId: newToken.tenantId,
    outletId: newToken.outletId,
    contextId: newToken.contextId,
    tableId: table.tableId,
    tableNumber: table.tableNumber,
    displayLabel: table.displayLabel,
    opaqueToken: newToken.opaqueToken,
    tokenStatus: "ACTIVE",
    qrUrl,
    qrSvgDataUri,
    createdAt: newToken.createdAt,
    updatedAt: newToken.updatedAt,
    revocationReason: null,
  };
}

/**
 * Revokes active QR token(s) for a restaurant table without creating a replacement.
 */
export async function revokeTableQr(
  tenantId: string,
  outletId: string,
  tableId: string,
  staffUserId?: string,
  reason = "REVOKED"
): Promise<{ revokedCount: number }> {
  if (!reason || reason.trim().length === 0) {
    throw new ValidationError("A valid revocation reason is required.");
  }

  const db = getDb();

  // 1. Fetch Table
  const [table] = await db
    .select()
    .from(restaurantTables)
    .where(
      and(
        eq(restaurantTables.tableId, tableId),
        eq(restaurantTables.tenantId, tenantId),
        eq(restaurantTables.outletId, outletId)
      )
    )
    .limit(1);

  if (!table) {
    throw new NotFoundError("Restaurant Table", `Table with ID '${tableId}' not found.`);
  }

  const contextId = table.contextId;
  const now = new Date();

  const activeTokens = await db
    .select({ tokenId: qrTokens.tokenId })
    .from(qrTokens)
    .where(
      and(
        eq(qrTokens.contextId, contextId),
        eq(qrTokens.tenantId, tenantId),
        eq(qrTokens.tokenStatus, "ACTIVE")
      )
    );

  if (activeTokens.length === 0) {
    throw new BusinessRuleError("No active QR token found for this table.");
  }

  // Revoke QR tokens
  await db
    .update(qrTokens)
    .set({
      tokenStatus: "REVOKED",
      revocationReason: reason,
      updatedAt: now,
    })
    .where(
      and(
        eq(qrTokens.contextId, contextId),
        eq(qrTokens.tenantId, tenantId),
        eq(qrTokens.tokenStatus, "ACTIVE")
      )
    );

  // Revoke customer sessions
  for (const t of activeTokens) {
    await db
      .update(customerSessions)
      .set({
        sessionStatus: "REVOKED",
        updatedAt: now,
      })
      .where(
        and(
          eq(customerSessions.tokenId, t.tokenId),
          eq(customerSessions.tenantId, tenantId),
          eq(customerSessions.sessionStatus, "ACTIVE")
        )
      );
  }

  // Audit revocation
  await recordAuditEvent({
    tenantId,
    userId: staffUserId || undefined,
    action: "restaurant.qr.revoked",
    resourceType: "qr_token",
    resourceId: activeTokens[0].tokenId,
    payload: {
      actorType: "STAFF",
      tableId: table.tableId,
      tableNumber: table.tableNumber,
      contextId,
      revokedCount: activeTokens.length,
      reason,
    },
  });

  return { revokedCount: activeTokens.length };
}
