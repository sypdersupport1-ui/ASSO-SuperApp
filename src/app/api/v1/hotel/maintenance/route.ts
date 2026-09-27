import { NextRequest } from "next/server";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { hasPermission } from "@/lib/auth/rbac";
import {
  PermissionDeniedError,
  NotFoundError,
  ValidationError,
} from "@/lib/api/errors";
import { listHotelProperties } from "@/lib/hotel/service";
import {
  listMaintenanceRequests,
  createMaintenanceRequest,
  type CreateMaintenanceRequestInput,
} from "@/lib/hotel/maintenance-service";
import {
  type ServiceRequestStatus,
  type ServiceRequestPriority,
  type HotelMaintenanceCategory,
} from "@/db/schema/operations";
import { DEMO_TENANT_ID } from "@/lib/hotel/seed";

export async function GET(req: NextRequest) {
  try {
    const ctx = extractRequestContext(req, {
      requireAuth: true,
      requiredModule: "HOTEL",
    });

    if (
      ctx.user &&
      !hasPermission(ctx.user, "hotel.maintenance.read") &&
      !hasPermission(ctx.user, "hotel.read") &&
      !hasPermission(ctx.user, "service.view")
    ) {
      throw new PermissionDeniedError("hotel.maintenance.read");
    }

    const tenantId = ctx.tenantId || req.headers.get("x-tenant-id") || DEMO_TENANT_ID;
    let outletId = req.nextUrl.searchParams.get("outletId") || ctx.outletId;

    if (!outletId) {
      const properties = await listHotelProperties(tenantId);
      if (properties.length > 0) {
        outletId = properties[0].outletId;
      } else {
        throw new NotFoundError("No hotel properties found for this tenant.");
      }
    } else {
      const properties = await listHotelProperties(tenantId);
      const property = properties.find((p) => p.outletId === outletId);
      if (!property) {
        throw new NotFoundError(`Property with ID '${outletId}' not found for this tenant.`);
      }
    }

    const roomId = req.nextUrl.searchParams.get("roomId") || undefined;
    const status = (req.nextUrl.searchParams.get("status") as ServiceRequestStatus) || undefined;
    const priority = (req.nextUrl.searchParams.get("priority") as ServiceRequestPriority) || undefined;
    const category = (req.nextUrl.searchParams.get("category") as HotelMaintenanceCategory) || undefined;
    const assignedToStaffId = req.nextUrl.searchParams.get("assignedToStaffId") || undefined;
    const search = req.nextUrl.searchParams.get("search") || undefined;
    const limit = Number(req.nextUrl.searchParams.get("limit") || 50);
    const offset = Number(req.nextUrl.searchParams.get("offset") || 0);

    const requests = await listMaintenanceRequests(tenantId, {
      outletId,
      roomId,
      status,
      priority,
      category,
      assignedToStaffId,
      search,
      limit,
      offset,
    });

    return apiSuccess(requests, ctx.requestId, 200, {
      count: requests.length,
      limit,
      offset,
    });
  } catch (error) {
    return apiError(error, req.headers.get("x-request-id") || "req_local");
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = extractRequestContext(req, {
      requireAuth: true,
      requiredModule: "HOTEL",
    });

    if (
      ctx.user &&
      !hasPermission(ctx.user, "hotel.maintenance.manage") &&
      !hasPermission(ctx.user, "hotel.manage") &&
      !hasPermission(ctx.user, "service.create")
    ) {
      throw new PermissionDeniedError("hotel.maintenance.manage");
    }

    const tenantId = ctx.tenantId || req.headers.get("x-tenant-id") || DEMO_TENANT_ID;
    const body = await req.json();

    if (!body || typeof body !== "object") {
      throw new ValidationError("Invalid request body.");
    }

    let outletId = body.outletId || ctx.outletId;
    if (!outletId) {
      const properties = await listHotelProperties(tenantId);
      if (properties.length > 0) {
        outletId = properties[0].outletId;
      } else {
        throw new NotFoundError("No hotel properties found for this tenant.");
      }
    } else {
      const properties = await listHotelProperties(tenantId);
      const property = properties.find((p) => p.outletId === outletId);
      if (!property) {
        throw new NotFoundError(`Property with ID '${outletId}' not found for this tenant.`);
      }
    }

    const input: CreateMaintenanceRequestInput = {
      outletId,
      roomId: body.roomId || undefined,
      category: body.category,
      priority: body.priority,
      title: body.title,
      description: body.description,
      assignedToStaffId: body.assignedToStaffId || undefined,
      operationalImpact: body.operationalImpact || "NONE",
      notes: body.notes || undefined,
    };

    const created = await createMaintenanceRequest(
      tenantId,
      input,
      ctx.user?.sub
    );

    return apiSuccess(created, ctx.requestId, 201);
  } catch (error) {
    return apiError(error, req.headers.get("x-request-id") || "req_local");
  }
}
