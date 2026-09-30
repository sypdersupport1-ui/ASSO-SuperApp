import { NextRequest } from "next/server";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/db/client";
import { inAppNotifications } from "@/db/schema/communication";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { AuthenticationError, NotFoundError } from "@/lib/api/errors";
import { DEMO_TENANT_ID } from "@/lib/hotel/seed";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: notificationId } = await params;
    const ctx = extractRequestContext(req, { requireAuth: true });

    if (!ctx.user) {
      throw new AuthenticationError("Authentication required.");
    }

    const tenantId = ctx.tenantId || DEMO_TENANT_ID;
    const userId = ctx.user.sub;
    const db = getDb();

    // Find notification with tenant isolation
    const [existing] = await db
      .select()
      .from(inAppNotifications)
      .where(
        and(
          eq(inAppNotifications.notificationId, notificationId),
          eq(inAppNotifications.tenantId, tenantId)
        )
      )
      .limit(1);

    if (!existing) {
      throw new NotFoundError("Notification not found.");
    }

    const now = new Date();
    const [updated] = await db
      .update(inAppNotifications)
      .set({
        isRead: true,
        readAt: now,
      })
      .where(
        and(
          eq(inAppNotifications.notificationId, notificationId),
          eq(inAppNotifications.tenantId, tenantId)
        )
      )
      .returning();

    return apiSuccess(
      {
        notificationId: updated.notificationId,
        isRead: updated.isRead,
        readAt: updated.readAt?.toISOString(),
      },
      ctx.requestId,
      200
    );
  } catch (err: unknown) {
    return apiError(err);
  }
}
