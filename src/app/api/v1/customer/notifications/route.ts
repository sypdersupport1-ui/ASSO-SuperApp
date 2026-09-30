import { NextRequest } from "next/server";
import { eq, and, desc } from "drizzle-orm";
import { getDb } from "@/db/client";
import { inAppNotifications } from "@/db/schema/communication";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { AuthenticationError } from "@/lib/api/errors";
import { DEMO_TENANT_ID } from "@/lib/hotel/seed";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ctx = extractRequestContext(req, { requireAuth: true });

    if (!ctx.user || ctx.user.sessionType !== "CUSTOMER") {
      throw new AuthenticationError("Customer authentication required.");
    }

    const tenantId = ctx.tenantId || DEMO_TENANT_ID;
    const customerId = ctx.user.sub;

    const db = getDb();
    const rows = await db
      .select()
      .from(inAppNotifications)
      .where(
        and(
          eq(inAppNotifications.tenantId, tenantId),
          eq(inAppNotifications.recipientType, "CUSTOMER"),
          eq(inAppNotifications.recipientId, customerId)
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
