import { eq, and, desc } from "drizzle-orm";
import { getDb } from "@/db/client";
import { serviceRequests, type ServiceRequest } from "@/db/schema/operations";
import { hotelRooms } from "@/db/schema/hotel";
import { recordAuditEvent } from "@/lib/audit";
import { getRealtimeHub } from "@/lib/realtime/sse";
import { type JwtPayload } from "@/lib/auth/jwt";
import { ValidationError, NotFoundError, BusinessRuleError, AuthenticationError } from "@/lib/api/errors";

export type CustomerRequestCategory =
  | "HOUSEKEEPING"
  | "AMENITY"
  | "GUEST_ASSISTANCE"
  | "MAINTENANCE"
  | "OTHER";

export interface CreateCustomerServiceRequestInput {
  requestType: CustomerRequestCategory;
  category?: string;
  title: string;
  description: string;
  priority?: "NORMAL" | "URGENT";
  guestNotes?: string;
}

export interface CustomerServiceRequestDto {
  requestId: string;
  requestType: CustomerRequestCategory;
  category: string;
  priority: "NORMAL" | "URGENT";
  displayStatus: "Submitted" | "In Progress" | "Resolved" | "Completed" | "Cancelled";
  rawStatus: string;
  title: string;
  description: string;
  roomNumber: string;
  createdAt: string;
  resolvedAt?: string | null;
}

export function mapToCustomerStatus(
  status: string
): "Submitted" | "In Progress" | "Resolved" | "Completed" | "Cancelled" {
  switch (status) {
    case "OPEN":
      return "Submitted";
    case "IN_PROGRESS":
      return "In Progress";
    case "RESOLVED":
      return "Resolved";
    case "CLOSED":
      return "Completed";
    case "CANCELLED":
      return "Cancelled";
    default:
      return "Submitted";
  }
}

/**
 * Creates a guest service request from an authenticated room customer session.
 */
export async function createCustomerServiceRequest(
  user: JwtPayload,
  input: CreateCustomerServiceRequestInput
): Promise<CustomerServiceRequestDto> {
  if (user.sessionType !== "CUSTOMER" || !user.tenantId || !user.contextId || !user.outletId) {
    throw new AuthenticationError("Invalid or unbound customer session.");
  }

  // 1. Validate Input
  if (!input.title || input.title.trim().length < 3) {
    throw new ValidationError("Request title must be at least 3 characters long.");
  }
  if (!input.description || input.description.trim().length < 3) {
    throw new ValidationError("Request description must be at least 3 characters long.");
  }

  const validCategories: CustomerRequestCategory[] = [
    "HOUSEKEEPING",
    "AMENITY",
    "GUEST_ASSISTANCE",
    "MAINTENANCE",
    "OTHER",
  ];
  if (!validCategories.includes(input.requestType)) {
    throw new ValidationError(
      `Invalid request type '${input.requestType}'. Must be one of: ${validCategories.join(", ")}.`
    );
  }

  const tenantId = user.tenantId;
  const outletId = user.outletId;
  const contextId = user.contextId;
  const db = getDb();

  // 2. Fetch room information for context
  const [room] = await db
    .select({
      roomId: hotelRooms.roomId,
      roomNumber: hotelRooms.roomNumber,
    })
    .from(hotelRooms)
    .where(
      and(
        eq(hotelRooms.contextId, contextId),
        eq(hotelRooms.tenantId, tenantId),
        eq(hotelRooms.outletId, outletId)
      )
    )
    .limit(1);

  const roomNumber = room?.roomNumber || "Unknown";

  // 3. Insert into shared service_requests
  const [created] = await db
    .insert(serviceRequests)
    .values({
      tenantId,
      outletId,
      contextId,
      requestType: input.requestType,
      category: input.category || input.requestType,
      priority: input.priority || "NORMAL",
      status: "OPEN",
      title: input.title.trim(),
      description: input.description.trim(),
      metadata: {
        roomId: room?.roomId,
        roomNumber,
        customerSessionId: user.sub,
        guestRequested: true,
        guestNotes: input.guestNotes || undefined,
      },
    })
    .returning();

  // 4. Audit creation
  await recordAuditEvent({
    tenantId,
    userId: user.sub,
    action: "customer.service_request.created",
    resourceType: "service_request",
    resourceId: created.requestId,
    payload: {
      actorType: "CUSTOMER",
      requestType: created.requestType,
      title: created.title,
      contextId,
      roomNumber,
    },
  });

  const customerDto: CustomerServiceRequestDto = {
    requestId: created.requestId,
    requestType: created.requestType as CustomerRequestCategory,
    category: created.category,
    priority: created.priority as "NORMAL" | "URGENT",
    displayStatus: mapToCustomerStatus(created.status),
    rawStatus: created.status,
    title: created.title,
    description: created.description,
    roomNumber,
    createdAt: created.createdAt.toISOString(),
    resolvedAt: created.resolvedAt ? created.resolvedAt.toISOString() : null,
  };

  // 5. Emit room & tenant scoped realtime event
  getRealtimeHub().broadcastToContext(tenantId, contextId, "service_request.created", {
    requestId: created.requestId,
    contextId,
    roomNumber,
    requestType: created.requestType,
    status: created.status,
    displayStatus: customerDto.displayStatus,
    title: created.title,
  });

  return customerDto;
}

/**
 * Lists all service requests for the customer's current room context.
 */
export async function listCustomerServiceRequests(
  user: JwtPayload
): Promise<CustomerServiceRequestDto[]> {
  if (user.sessionType !== "CUSTOMER" || !user.tenantId || !user.contextId) {
    throw new AuthenticationError("Invalid or unbound customer session.");
  }

  const tenantId = user.tenantId;
  const contextId = user.contextId;
  const db = getDb();

  // 1. Fetch Room Number
  const [room] = await db
    .select({ roomNumber: hotelRooms.roomNumber })
    .from(hotelRooms)
    .where(and(eq(hotelRooms.contextId, contextId), eq(hotelRooms.tenantId, tenantId)))
    .limit(1);

  const roomNumber = room?.roomNumber || "Unknown";

  // 2. Fetch requests for this room context
  const records = await db
    .select()
    .from(serviceRequests)
    .where(
      and(
        eq(serviceRequests.contextId, contextId),
        eq(serviceRequests.tenantId, tenantId)
      )
    )
    .orderBy(desc(serviceRequests.createdAt));

  return records.map((r: ServiceRequest) => ({
    requestId: r.requestId,
    requestType: r.requestType as CustomerRequestCategory,
    category: r.category,
    priority: r.priority as "NORMAL" | "URGENT",
    displayStatus: mapToCustomerStatus(r.status),
    rawStatus: r.status,
    title: r.title,
    description: r.description,
    roomNumber,
    createdAt: r.createdAt.toISOString(),
    resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
  }));
}

/**
 * Retrieves a single service request ensuring it strictly belongs to the customer's authorized room context.
 */
export async function getCustomerServiceRequestById(
  user: JwtPayload,
  requestId: string
): Promise<CustomerServiceRequestDto> {
  if (user.sessionType !== "CUSTOMER" || !user.tenantId || !user.contextId) {
    throw new AuthenticationError("Invalid or unbound customer session.");
  }

  const tenantId = user.tenantId;
  const contextId = user.contextId;
  const db = getDb();

  const [record] = await db
    .select()
    .from(serviceRequests)
    .where(
      and(
        eq(serviceRequests.requestId, requestId),
        eq(serviceRequests.contextId, contextId),
        eq(serviceRequests.tenantId, tenantId)
      )
    )
    .limit(1);

  if (!record) {
    throw new NotFoundError(
      "Service Request",
      `Service request with ID '${requestId}' was not found for this room.`
    );
  }

  const [room] = await db
    .select({ roomNumber: hotelRooms.roomNumber })
    .from(hotelRooms)
    .where(and(eq(hotelRooms.contextId, contextId), eq(hotelRooms.tenantId, tenantId)))
    .limit(1);

  return {
    requestId: record.requestId,
    requestType: record.requestType as CustomerRequestCategory,
    category: record.category,
    priority: record.priority as "NORMAL" | "URGENT",
    displayStatus: mapToCustomerStatus(record.status),
    rawStatus: record.status,
    title: record.title,
    description: record.description,
    roomNumber: room?.roomNumber || "Unknown",
    createdAt: record.createdAt.toISOString(),
    resolvedAt: record.resolvedAt ? record.resolvedAt.toISOString() : null,
  };
}
