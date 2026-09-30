import crypto from "crypto";
import { eq, and, desc, gt } from "drizzle-orm";
import { getDb } from "@/db/client";
import { qrTokens, businessContexts, customerSessions } from "@/db/schema/context";
import { hotelRooms, hotelStays, hotelGuests } from "@/db/schema/hotel";
import { restaurantTables } from "@/db/schema/restaurant";
import { outlets, organizations, customers } from "@/db/schema/core";
import { signJwt, verifyJwt, type JwtPayload } from "@/lib/auth/jwt";
import { NotFoundError, BusinessRuleError, AuthenticationError } from "@/lib/api/errors";

export interface CustomerSessionResolution {
  sessionToken: string;
  sessionId: string;
  expiresAt: string;
  context: {
    contextId: string;
    contextType: string;
    identifier: string;
    displayLabel: string;
    roomId?: string;
    roomNumber?: string;
    floor?: string | null;
    tableId?: string;
    tableNumber?: string;
    section?: string;
    capacity?: number;
    propertyName: string;
    hotelName?: string;
    restaurantName?: string;
  };
  stay?: {
    hasActiveStay: boolean;
    guestFirstName?: string | null;
    checkInDate?: string | null;
    checkOutDate?: string | null;
  };
  table?: {
    tableId: string;
    tableNumber: string;
    capacity: number;
    section: string;
    status: string;
  };
  availableServices: string[];
}

export const CUSTOMER_AVAILABLE_SERVICES = [
  "HOUSEKEEPING",
  "AMENITY",
  "GUEST_ASSISTANCE",
  "MAINTENANCE",
  "OTHER",
] as const;

/**
 * Public Server-Side QR Token Resolution & Ephemeral Customer Session Issuance.
 */
export async function resolveCustomerQr(
  opaqueToken: string,
  clientInfo: { userAgent?: string; ip?: string } = {}
): Promise<CustomerSessionResolution> {
  if (!opaqueToken || opaqueToken.trim().length === 0) {
    throw new NotFoundError("QR Token", "Invalid or missing QR token.");
  }

  const db = getDb();

  // 1. Initial lookup by opaque token
  const [tokenRecord] = await db
    .select()
    .from(qrTokens)
    .where(eq(qrTokens.opaqueToken, opaqueToken.trim()))
    .limit(1);

  if (!tokenRecord) {
    throw new NotFoundError("QR Token", "QR code was not recognized or is invalid.");
  }

  if (tokenRecord.tokenStatus !== "ACTIVE") {
    throw new BusinessRuleError(
      "This QR code has been revoked or replaced. Please request a new QR code from hotel staff.",
      { code: "QR_REVOKED", status: tokenRecord.tokenStatus }
    );
  }

  const tenantId = tokenRecord.tenantId;

  // 2. Perform tenant-scoped resolution
  // A. Business Context
  const [context] = await db
    .select()
    .from(businessContexts)
    .where(
      and(
        eq(businessContexts.contextId, tokenRecord.contextId),
        eq(businessContexts.tenantId, tenantId),
        eq(businessContexts.isActive, true)
      )
    )
    .limit(1);

  if (!context) {
    throw new NotFoundError("Room Context", "Associated room context is inactive or unavailable.");
  }

  // B. Context-Specific Domain Entity (Table vs Room)
  const isRestaurantTable = context.contextType === "TABLE";
  let room: typeof hotelRooms.$inferSelect | undefined;
  let table: typeof restaurantTables.$inferSelect | undefined;

  if (isRestaurantTable) {
    const [tableRow] = await db
      .select()
      .from(restaurantTables)
      .where(
        and(
          eq(restaurantTables.contextId, context.contextId),
          eq(restaurantTables.tenantId, tenantId),
          eq(restaurantTables.outletId, tokenRecord.outletId)
        )
      )
      .limit(1);

    if (!tableRow) {
      throw new NotFoundError("Restaurant Table", "Restaurant table associated with this QR context was not found.");
    }
    table = tableRow;
  } else {
    const [roomRow] = await db
      .select()
      .from(hotelRooms)
      .where(
        and(
          eq(hotelRooms.contextId, context.contextId),
          eq(hotelRooms.tenantId, tenantId),
          eq(hotelRooms.outletId, tokenRecord.outletId)
        )
      )
      .limit(1);

    if (!roomRow) {
      throw new NotFoundError("Hotel Room", "Hotel room associated with this QR context was not found.");
    }
    room = roomRow;
  }

  // C. Property & Organization Branding
  const [property] = await db
    .select({ outletId: outlets.outletId, name: outlets.name })
    .from(outlets)
    .where(and(eq(outlets.outletId, tokenRecord.outletId), eq(outlets.tenantId, tenantId)))
    .limit(1);

  const [org] = await db
    .select({ organizationId: organizations.organizationId, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.organizationId, tenantId))
    .limit(1);

  // D. Safe Active Stay check (for hotel rooms only)
  let activeStay: {
    stayId: string;
    guestId: string;
    checkInAt: Date;
    expectedCheckOutAt: Date;
  } | undefined;
  let guestFirstName: string | null = null;

  if (room) {
    const [foundStay] = await db
      .select({
        stayId: hotelStays.stayId,
        guestId: hotelStays.guestId,
        checkInAt: hotelStays.checkInAt,
        expectedCheckOutAt: hotelStays.expectedCheckOutAt,
      })
      .from(hotelStays)
      .where(
        and(
          eq(hotelStays.roomId, room.roomId),
          eq(hotelStays.tenantId, tenantId),
          eq(hotelStays.status, "ACTIVE")
        )
      )
      .orderBy(desc(hotelStays.checkInAt))
      .limit(1);

    activeStay = foundStay;

    if (activeStay) {
      const [guestRecord] = await db
        .select({
          customerName: customers.fullName,
        })
        .from(hotelGuests)
        .innerJoin(customers, eq(hotelGuests.customerId, customers.customerId))
        .where(
          and(
            eq(hotelGuests.guestId, activeStay.guestId),
            eq(hotelGuests.tenantId, tenantId)
          )
        )
        .limit(1);

      if (guestRecord?.customerName) {
        guestFirstName = guestRecord.customerName.split(" ")[0];
      }
    }
  }

  // E. Create Ephemeral Customer Session in PostgreSQL
  const sessionDurationSeconds = 14400; // 4 hours
  const expiresAt = new Date(Date.now() + sessionDurationSeconds * 1000);
  const fingerprintString = `${clientInfo.userAgent || "unknown"}|${clientInfo.ip || "unknown"}`;
  const deviceFingerprint = crypto
    .createHash("sha256")
    .update(fingerprintString)
    .digest("hex")
    .slice(0, 32);

  const [session] = await db
    .insert(customerSessions)
    .values({
      tenantId,
      outletId: tokenRecord.outletId,
      contextId: tokenRecord.contextId,
      tokenId: tokenRecord.tokenId,
      deviceFingerprint,
      sessionStatus: "ACTIVE",
      expiresAt,
    })
    .returning();

  // F. Mint Customer JWT
  const sessionToken = signJwt(
    {
      sub: session.sessionId,
      tenantId,
      outletId: tokenRecord.outletId,
      contextId: tokenRecord.contextId,
      sessionType: "CUSTOMER",
      roles: [],
      permissions: [],
      isSuperAdmin: false,
    },
    sessionDurationSeconds
  );

  if (isRestaurantTable && table) {
    return {
      sessionToken,
      sessionId: session.sessionId,
      expiresAt: expiresAt.toISOString(),
      context: {
        contextId: context.contextId,
        contextType: "TABLE",
        identifier: context.identifier,
        displayLabel: context.displayLabel,
        tableId: table.tableId,
        tableNumber: table.tableNumber,
        section: table.section,
        capacity: table.capacity,
        propertyName: property?.name || "Restaurant Outlet",
        restaurantName: org?.name || "ASSO Dining",
      },
      table: {
        tableId: table.tableId,
        tableNumber: table.tableNumber,
        capacity: table.capacity,
        section: table.section,
        status: table.status,
      },
      availableServices: ["TABLE_ORDERING", "SERVICE_CALL", "BILL_REQUEST"],
    };
  }

  return {
    sessionToken,
    sessionId: session.sessionId,
    expiresAt: expiresAt.toISOString(),
    context: {
      contextId: context.contextId,
      contextType: "HOTEL_ROOM",
      identifier: context.identifier,
      displayLabel: context.displayLabel,
      roomId: room!.roomId,
      roomNumber: room!.roomNumber,
      floor: room!.floorNumber,
      propertyName: property?.name || "Hotel Property",
      hotelName: org?.name || "ASSO Hospitality",
    },
    stay: {
      hasActiveStay: !!activeStay,
      guestFirstName,
      checkInDate: activeStay?.checkInAt ? new Date(activeStay.checkInAt).toISOString() : null,
      checkOutDate: activeStay?.expectedCheckOutAt ? new Date(activeStay.expectedCheckOutAt).toISOString() : null,
    },
    availableServices: [...CUSTOMER_AVAILABLE_SERVICES],
  };
}

/**
 * Validates an existing customer session token from request authorization header.
 */
export async function validateCustomerSession(
  customerToken: string
): Promise<{ user: JwtPayload; session: typeof customerSessions.$inferSelect }> {
  const decoded = verifyJwt(customerToken);

  if (decoded.sessionType !== "CUSTOMER") {
    throw new AuthenticationError("Invalid session type. Expected customer session.");
  }

  if (!decoded.tenantId || !decoded.contextId) {
    throw new AuthenticationError("Customer session token is missing required context bounds.");
  }

  const tenantId = decoded.tenantId;
  const db = getDb();

  const [session] = await db
    .select()
    .from(customerSessions)
    .where(
      and(
        eq(customerSessions.sessionId, decoded.sub),
        eq(customerSessions.tenantId, tenantId),
        eq(customerSessions.sessionStatus, "ACTIVE"),
        gt(customerSessions.expiresAt, new Date())
      )
    )
    .limit(1);

  if (!session) {
    throw new AuthenticationError("Customer session is expired, revoked, or invalid.");
  }

  return { user: decoded, session };
}
