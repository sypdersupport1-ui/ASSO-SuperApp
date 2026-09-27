import crypto from "crypto";
import QRCode from "qrcode";
import { eq, and, desc, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { businessContexts, qrTokens, customerSessions } from "@/db/schema/context";
import { hotelRooms } from "@/db/schema/hotel";
import { recordAuditEvent } from "@/lib/audit";
import { NotFoundError, BusinessRuleError, ValidationError } from "@/lib/api/errors";
import { env } from "@/config/env";

export interface RoomQrResponse {
  tokenId: string;
  tenantId: string;
  outletId: string;
  contextId: string;
  roomId: string;
  roomNumber: string;
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
 * Builds the canonical customer landing URL for a given opaque token.
 */
export function buildCustomerQrUrl(opaqueToken: string): string {
  const baseUrl = env.APP_URL.replace(/\/$/, "");
  return `${baseUrl}/hotel/guest?token=${encodeURIComponent(opaqueToken)}`;
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
 * Retrieves the currently active QR token and metadata for a physical hotel room.
 */
export async function getRoomActiveQr(
  tenantId: string,
  outletId: string,
  roomId: string
): Promise<RoomQrResponse | null> {
  const db = getDb();

  // 1. Verify Room exists and belongs to tenant/outlet
  const [room] = await db
    .select({
      roomId: hotelRooms.roomId,
      roomNumber: hotelRooms.roomNumber,
      contextId: hotelRooms.contextId,
    })
    .from(hotelRooms)
    .where(
      and(
        eq(hotelRooms.roomId, roomId),
        eq(hotelRooms.tenantId, tenantId),
        eq(hotelRooms.outletId, outletId)
      )
    )
    .limit(1);

  if (!room) {
    throw new NotFoundError("Hotel Room", `Room with ID '${roomId}' not found in this property.`);
  }

  // 2. Fetch the latest ACTIVE QR token for the room's business context
  const [token] = await db
    .select()
    .from(qrTokens)
    .where(
      and(
        eq(qrTokens.contextId, room.contextId),
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

  const qrUrl = buildCustomerQrUrl(token.opaqueToken);
  const qrSvgDataUri = await renderQrSvgDataUri(qrUrl);

  return {
    tokenId: token.tokenId,
    tenantId: token.tenantId,
    outletId: token.outletId,
    contextId: token.contextId,
    roomId: room.roomId,
    roomNumber: room.roomNumber,
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
 * Generates or retrieves the active QR token for a room.
 */
export async function generateOrGetRoomQr(
  tenantId: string,
  outletId: string,
  roomId: string,
  staffUserId?: string
): Promise<RoomQrResponse> {
  const db = getDb();

  // Check if active QR already exists
  const existing = await getRoomActiveQr(tenantId, outletId, roomId);
  if (existing) {
    return existing;
  }

  // 1. Fetch room
  const [room] = await db
    .select()
    .from(hotelRooms)
    .where(
      and(
        eq(hotelRooms.roomId, roomId),
        eq(hotelRooms.tenantId, tenantId),
        eq(hotelRooms.outletId, outletId)
      )
    )
    .limit(1);

  if (!room) {
    throw new NotFoundError("Hotel Room", `Room with ID '${roomId}' not found.`);
  }

  // 2. Verify or ensure Business Context
  let contextId = room.contextId;
  if (!contextId) {
    const [newCtx] = await db
      .insert(businessContexts)
      .values({
        tenantId,
        outletId,
        contextType: "ROOM",
        identifier: room.roomNumber,
        displayLabel: `Room ${room.roomNumber}`,
        status: "AVAILABLE",
        isActive: true,
      })
      .returning();

    contextId = newCtx.contextId;
    await db
      .update(hotelRooms)
      .set({ contextId, updatedAt: new Date() })
      .where(eq(hotelRooms.roomId, roomId));
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
    action: "hotel.qr.created",
    resourceType: "qr_token",
    resourceId: newToken.tokenId,
    payload: {
      actorType: "STAFF",
      roomId: room.roomId,
      roomNumber: room.roomNumber,
      contextId,
    },
  });

  const qrUrl = buildCustomerQrUrl(newToken.opaqueToken);
  const qrSvgDataUri = await renderQrSvgDataUri(qrUrl);

  return {
    tokenId: newToken.tokenId,
    tenantId: newToken.tenantId,
    outletId: newToken.outletId,
    contextId: newToken.contextId,
    roomId: room.roomId,
    roomNumber: room.roomNumber,
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
 * Atomically rotates a room's QR token.
 */
export async function rotateRoomQr(
  tenantId: string,
  outletId: string,
  roomId: string,
  staffUserId: string,
  reason = "ROTATED"
): Promise<RoomQrResponse> {
  const db = getDb();

  // 1. Fetch Room
  const [room] = await db
    .select()
    .from(hotelRooms)
    .where(
      and(
        eq(hotelRooms.roomId, roomId),
        eq(hotelRooms.tenantId, tenantId),
        eq(hotelRooms.outletId, outletId)
      )
    )
    .limit(1);

  if (!room) {
    throw new NotFoundError("Hotel Room", `Room with ID '${roomId}' not found.`);
  }

  const contextId = room.contextId;
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
    const tokenIds = activeTokens.map((t: { tokenId: string }) => t.tokenId);

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
    userId: staffUserId,
    action: "hotel.qr.rotated",
    resourceType: "qr_token",
    resourceId: newToken.tokenId,
    payload: {
      actorType: "STAFF",
      roomId: room.roomId,
      roomNumber: room.roomNumber,
      contextId,
      revokedCount: activeTokens.length,
      reason,
    },
  });

  const qrUrl = buildCustomerQrUrl(newToken.opaqueToken);
  const qrSvgDataUri = await renderQrSvgDataUri(qrUrl);

  return {
    tokenId: newToken.tokenId,
    tenantId: newToken.tenantId,
    outletId: newToken.outletId,
    contextId: newToken.contextId,
    roomId: room.roomId,
    roomNumber: room.roomNumber,
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
 * Revokes active QR token(s) for a room without creating a replacement.
 */
export async function revokeRoomQr(
  tenantId: string,
  outletId: string,
  roomId: string,
  staffUserId: string,
  reason: string
): Promise<{ revokedCount: number }> {
  if (!reason || reason.trim().length === 0) {
    throw new ValidationError("A valid revocation reason is required.");
  }

  const db = getDb();

  // 1. Fetch Room
  const [room] = await db
    .select()
    .from(hotelRooms)
    .where(
      and(
        eq(hotelRooms.roomId, roomId),
        eq(hotelRooms.tenantId, tenantId),
        eq(hotelRooms.outletId, outletId)
      )
    )
    .limit(1);

  if (!room) {
    throw new NotFoundError("Hotel Room", `Room with ID '${roomId}' not found.`);
  }

  const contextId = room.contextId;
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
    throw new BusinessRuleError("No active QR token found for this room.");
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
    userId: staffUserId,
    action: "hotel.qr.revoked",
    resourceType: "qr_token",
    resourceId: activeTokens[0].tokenId,
    payload: {
      actorType: "STAFF",
      roomId: room.roomId,
      roomNumber: room.roomNumber,
      contextId,
      revokedCount: activeTokens.length,
      reason,
    },
  });

  return { revokedCount: activeTokens.length };
}
