import { NextRequest } from "next/server";
import { eq, and, or, desc } from "drizzle-orm";
import { getDb } from "@/db/client";
import { inAppNotifications } from "@/db/schema/communication";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { AuthenticationError, PermissionDeniedError } from "@/lib/api/errors";
import { hasPermission } from "@/lib/auth/rbac";
import { DEMO_TENANT_ID } from "@/lib/hotel/seed";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ctx = extractRequestContext(req, {
      requiredModule: "HOTEL",
      requireAuth: true,
    });

    if (!ctx.user || ctx.user.sessionType !== "STAFF") {
      throw new AuthenticationError("Staff credentials required.");
    }

    if (
      !hasPermission(ctx.user, "hotel.front_desk.view") &&
      !hasPermission(ctx.user, "hotel.manage") &&
      !hasPermission(ctx.user, "hotel.staff")
    ) {
      throw new PermissionDeniedError("hotel.front_desk.view");
    }

    const tenantId = ctx.tenantId || DEMO_TENANT_ID;
    const staffId = ctx.user.sub;
    const userRoles = ctx.user.roles || ["STAFF"];

    const db = getDb();

    // Staff receives notifications targeted to their staffId, their role scope, or broadcast
    const roleConditions = userRoles.map((r) => eq(inAppNotifications.roleScope, r));

    const rows = await db
      .select()
      .from(inAppNotifications)
      .where(
        and(
          eq(inAppNotifications.tenantId, tenantId),
          eq(inAppNotifications.recipientType, "STAFF"),
          or(
            eq(inAppNotifications.recipientId, staffId),
            ...roleConditions,
            eq(inAppNotifications.recipientId, "FRONT_DESK"),
            eq(inAppNotifications.recipientId, "ALL_STAFF")
          )
        )
      )
      .orderBy(desc(inAppNotifications.createdAt))
      .limit(50);

    return apiSuccess(
      rows.map((n) => ({
        notificationId: n.notificationId,
        title: n.title,
        body: n.body,
        eventType: n.eventType,
        isRead: n.isRead,
        readAt: n.readAt?.toISOString() || null,
        deepLink: n.deepLink,
        metadata: n.metadata,
        createdAt: n.createdAt.toISOString(),
      })),
      ctx.requestId,
      200
    );
  } catch (err: unknown) {
    return apiError(err);
  }
}
