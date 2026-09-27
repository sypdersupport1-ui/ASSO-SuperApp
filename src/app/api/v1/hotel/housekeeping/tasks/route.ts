import { NextRequest } from "next/server";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { PermissionDeniedError, NotFoundError, ValidationError } from "@/lib/api/errors";
import { hasPermission } from "@/lib/auth/rbac";
import {
  listHousekeepingTasks,
  createHousekeepingTask,
} from "@/lib/hotel/housekeeping-service";
import { listHotelProperties } from "@/lib/hotel/service";
import { DEMO_TENANT_ID } from "@/lib/hotel/seed";
import type {
  HotelHousekeepingTaskStatus,
  HotelHousekeepingTaskType,
  HotelHousekeepingTaskPriority,
} from "@/db/schema/hotel";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ctx = extractRequestContext(req, {
      requireAuth: true,
      requiredModule: "HOTEL",
    });

    if (
      ctx.user &&
      !hasPermission(ctx.user, "hotel.housekeeping.read") &&
      !hasPermission(ctx.user, "hotel.read")
    ) {
      throw new PermissionDeniedError("hotel.housekeeping.read");
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
    const status = (req.nextUrl.searchParams.get("status") as HotelHousekeepingTaskStatus) || undefined;
    const assignedStaffId = req.nextUrl.searchParams.get("assignedStaffId") || undefined;
    const priority = (req.nextUrl.searchParams.get("priority") as HotelHousekeepingTaskPriority) || undefined;
    const taskType = (req.nextUrl.searchParams.get("taskType") as HotelHousekeepingTaskType) || undefined;
    const floorNumber = req.nextUrl.searchParams.get("floorNumber") || undefined;
    const search = req.nextUrl.searchParams.get("search") || undefined;
    const limit = Number(req.nextUrl.searchParams.get("limit") || 50);
    const offset = Number(req.nextUrl.searchParams.get("offset") || 0);

    const tasks = await listHousekeepingTasks(tenantId, {
      outletId,
      roomId,
      status,
      assignedStaffId,
      priority,
      taskType,
      floorNumber,
      search,
      limit,
      offset,
    });

    return apiSuccess(tasks, ctx.requestId, 200, {
      limit,
      offset,
      count: tasks.length,
      outletId,
    });
  } catch (err) {
    return apiError(err);
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
      !hasPermission(ctx.user, "hotel.housekeeping.manage") &&
      !hasPermission(ctx.user, "hotel.manage") &&
      !hasPermission(ctx.user, "hotel.*")
    ) {
      throw new PermissionDeniedError("hotel.housekeeping.manage");
    }

    const tenantId = ctx.tenantId || req.headers.get("x-tenant-id") || DEMO_TENANT_ID;
    const body = await req.json();

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

    if (!body.roomId) {
      throw new ValidationError("roomId is required to create a housekeeping task.");
    }

    const task = await createHousekeepingTask(
      tenantId,
      {
        outletId,
        roomId: body.roomId,
        taskType: body.taskType,
        priority: body.priority,
        notes: body.notes,
        assignedStaffId: body.assignedStaffId,
        scheduledAt: body.scheduledAt,
      },
      ctx.user?.sub
    );

    return apiSuccess(task, ctx.requestId, 201);
  } catch (err) {
    return apiError(err);
  }
}
