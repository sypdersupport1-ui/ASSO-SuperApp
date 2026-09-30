import { getDb } from "@/db/client";
import { organizations, outlets } from "@/db/schema/core";
import { restaurantTables } from "@/db/schema/restaurant";
import { setTenantEntitlements } from "@/lib/entitlements/checker";
import {
  listRestaurantOutlets,
  createRestaurantOutlet,
  createTable,
  listTables,
} from "./table-service";
import { eq, and } from "drizzle-orm";
import { logger } from "@/lib/logger";

export const DEMO_TENANT_ID = "11111111-1111-1111-1111-111111111111";

/**
 * Ensures demo restaurant outlet and sample tables exist with proper entitlements and active QR tokens.
 */
export async function ensureRestaurantSeedData(tenantId: string = DEMO_TENANT_ID) {
  const db = getDb();

  // 1. Ensure Organization exists
  const existingOrgs = await db
    .select()
    .from(organizations)
    .where(eq(organizations.organizationId, tenantId))
    .limit(1);

  if (existingOrgs.length === 0) {
    await db.insert(organizations).values({
      organizationId: tenantId,
      name: "ASSO Hospitality Group",
      legalName: "ASSO Hospitality Group Private Limited",
      primaryBusinessType: "HOTEL",
      subscriptionStatus: "ACTIVE",
    });
  }

  // 2. Ensure RESTAURANT entitlement is granted alongside existing modules
  setTenantEntitlements(tenantId, ["CORE", "HOTEL", "RESTAURANT", "POS", "ORDERING"]);

  // 3. Check for existing restaurant outlet
  const restaurantOutlets = await listRestaurantOutlets(tenantId);
  let restaurantOutlet = restaurantOutlets[0];

  if (!restaurantOutlet) {
    restaurantOutlet = await createRestaurantOutlet(tenantId, {
      name: "The Royal Saffron Restaurant",
      code: "REST_MAIN",
      timezone: "Asia/Kolkata",
      currency: "INR",
    });
    logger.info({ message: "Seeded demo restaurant outlet", details: { outletId: restaurantOutlet.outletId } });
  }

  // 4. Check existing tables
  const existingTables = await listTables(tenantId, restaurantOutlet.outletId);
  if (existingTables.length === 0) {
    const defaultTables = [
      { tableNumber: "T-01", displayLabel: "Table 1 (Window)", capacity: 2, section: "Main Dining" },
      { tableNumber: "T-02", displayLabel: "Table 2 (Booth)", capacity: 4, section: "Main Dining" },
      { tableNumber: "T-03", displayLabel: "Table 3 (Center)", capacity: 4, section: "Main Dining" },
      { tableNumber: "T-04", displayLabel: "Table 4 (Family)", capacity: 6, section: "Main Dining" },
      { tableNumber: "T-05", displayLabel: "Table 5 (Terrace)", capacity: 2, section: "Terrace Garden" },
      { tableNumber: "T-06", displayLabel: "Table 6 (Terrace)", capacity: 4, section: "Terrace Garden" },
      { tableNumber: "T-07", displayLabel: "Table 7 (PDR Deluxe)", capacity: 8, section: "Private Dining" },
      { tableNumber: "T-08", displayLabel: "Table 8 (PDR Executive)", capacity: 4, section: "Private Dining" },
    ];

    for (const item of defaultTables) {
      await createTable(tenantId, restaurantOutlet.outletId, {
        tableNumber: item.tableNumber,
        displayLabel: item.displayLabel,
        capacity: item.capacity,
        section: item.section,
        status: "AVAILABLE",
      });
    }

    logger.info({
      message: "Seeded demo restaurant tables with active QR tokens",
      details: { count: defaultTables.length, outletId: restaurantOutlet.outletId },
    });
  }

  return { outlet: restaurantOutlet };
}
