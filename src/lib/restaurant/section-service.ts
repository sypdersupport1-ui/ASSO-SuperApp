import { eq, and, asc } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  restaurantSections,
  restaurantTables,
  type RestaurantSection,
} from "@/db/schema/restaurant";
import { recordAuditEvent } from "@/lib/audit";
import { realtimeHub } from "@/lib/realtime/sse";
import { NotFoundError, BusinessRuleError, ValidationError } from "@/lib/api/errors";

export interface CreateSectionInput {
  name: string;
  code?: string;
  displayOrder?: number;
}

export interface UpdateSectionInput {
  name?: string;
  code?: string;
  displayOrder?: number;
  isActive?: boolean;
}

/**
 * Standard seed sections populated when a restaurant outlet has none.
 */
export const DEFAULT_RESTAURANT_SECTIONS = [
  { name: "Main Dining", code: "MAIN", displayOrder: 1 },
  { name: "Outdoor Patio", code: "PATIO", displayOrder: 2 },
  { name: "Bar Area", code: "BAR", displayOrder: 3 },
  { name: "Private Dining", code: "PRIVATE", displayOrder: 4 },
];

/**
 * Lists all sections configured for an outlet, ordered by displayOrder then name.
 */
export async function listSections(
  tenantId: string,
  outletId: string,
  includeInactive: boolean = false
): Promise<RestaurantSection[]> {
  const db = getDb();

  const conditions = [
    eq(restaurantSections.tenantId, tenantId),
    eq(restaurantSections.outletId, outletId),
  ];

  if (!includeInactive) {
    conditions.push(eq(restaurantSections.isActive, true));
  }

  const rows = await db
    .select()
    .from(restaurantSections)
    .where(and(...conditions))
    .orderBy(asc(restaurantSections.displayOrder), asc(restaurantSections.name));

  // If no sections exist yet for this outlet, initialize default sections
  if (rows.length === 0) {
    return ensureDefaultSections(tenantId, outletId);
  }

  return rows;
}

/**
 * Gets a single section by its ID with tenant and outlet scoping.
 */
export async function getSectionById(
  tenantId: string,
  outletId: string,
  sectionId: string
): Promise<RestaurantSection> {
  const db = getDb();

  const [section] = await db
    .select()
    .from(restaurantSections)
    .where(
      and(
        eq(restaurantSections.sectionId, sectionId),
        eq(restaurantSections.tenantId, tenantId),
        eq(restaurantSections.outletId, outletId)
      )
    )
    .limit(1);

  if (!section) {
    throw new NotFoundError("Restaurant Section", `Section with ID '${sectionId}' not found.`);
  }

  return section;
}

/**
 * Creates a new restaurant section.
 */
export async function createSection(
  tenantId: string,
  outletId: string,
  input: CreateSectionInput,
  userId?: string
): Promise<RestaurantSection> {
  const db = getDb();

  const name = input.name.trim();
  if (!name) {
    throw new ValidationError("Section name is required.");
  }

  // Check uniqueness within outlet
  const existing = await db
    .select({ sectionId: restaurantSections.sectionId })
    .from(restaurantSections)
    .where(
      and(
        eq(restaurantSections.outletId, outletId),
        eq(restaurantSections.name, name)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    throw new BusinessRuleError(`Section with name '${name}' already exists in this restaurant.`);
  }

  const [section] = await db
    .insert(restaurantSections)
    .values({
      tenantId,
      outletId,
      name,
      code: input.code?.trim().toUpperCase() || null,
      displayOrder: input.displayOrder ?? 0,
      isActive: true,
    })
    .returning();

  await recordAuditEvent({
    tenantId,
    userId,
    action: "restaurant.section.created",
    resourceType: "restaurant_section",
    resourceId: section.sectionId,
    payload: {
      name: section.name,
      code: section.code,
      displayOrder: section.displayOrder,
    },
  });

  await realtimeHub.broadcastToTenant(tenantId, "restaurant:section_created", {
    sectionId: section.sectionId,
    name: section.name,
    code: section.code,
    displayOrder: section.displayOrder,
  });

  return section;
}

/**
 * Updates an existing section.
 */
export async function updateSection(
  tenantId: string,
  outletId: string,
  sectionId: string,
  input: UpdateSectionInput,
  userId?: string
): Promise<RestaurantSection> {
  const db = getDb();

  const existing = await getSectionById(tenantId, outletId, sectionId);

  const updates: Partial<typeof restaurantSections.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new ValidationError("Section name cannot be empty.");
    
    // Check uniqueness if name changed
    if (name.toLowerCase() !== existing.name.toLowerCase()) {
      const duplicate = await db
        .select({ sectionId: restaurantSections.sectionId })
        .from(restaurantSections)
        .where(
          and(
            eq(restaurantSections.outletId, outletId),
            eq(restaurantSections.name, name)
          )
        )
        .limit(1);

      if (duplicate.length > 0) {
        throw new BusinessRuleError(`Another section with name '${name}' already exists.`);
      }
    }

    updates.name = name;
  }

  if (input.code !== undefined) {
    updates.code = input.code.trim().toUpperCase() || null;
  }

  if (input.displayOrder !== undefined) {
    updates.displayOrder = input.displayOrder;
  }

  if (input.isActive !== undefined) {
    updates.isActive = input.isActive;
  }

  const [updated] = await db
    .update(restaurantSections)
    .set(updates)
    .where(eq(restaurantSections.sectionId, sectionId))
    .returning();

  // If section name was changed, sync string section on existing tables referencing this sectionId
  if (updates.name && updates.name !== existing.name) {
    await db
      .update(restaurantTables)
      .set({
        section: updates.name,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(restaurantTables.tenantId, tenantId),
          eq(restaurantTables.outletId, outletId),
          eq(restaurantTables.sectionId, sectionId)
        )
      );
  }

  await recordAuditEvent({
    tenantId,
    userId,
    action: "restaurant.section.updated",
    resourceType: "restaurant_section",
    resourceId: updated.sectionId,
    payload: {
      name: updated.name,
      code: updated.code,
      changes: updates,
    },
  });

  await realtimeHub.broadcastToTenant(tenantId, "restaurant:section_updated", {
    sectionId: updated.sectionId,
    name: updated.name,
    code: updated.code,
    isActive: updated.isActive,
    displayOrder: updated.displayOrder,
  });

  return updated;
}

/**
 * Safely deletes a section if no tables are assigned to it.
 */
export async function deleteSection(
  tenantId: string,
  outletId: string,
  sectionId: string,
  userId?: string
): Promise<{ success: boolean; sectionId: string }> {
  const db = getDb();

  const section = await getSectionById(tenantId, outletId, sectionId);

  // Check if tables are assigned to this section
  const assignedTables = await db
    .select({ tableId: restaurantTables.tableId, tableNumber: restaurantTables.tableNumber })
    .from(restaurantTables)
    .where(
      and(
        eq(restaurantTables.tenantId, tenantId),
        eq(restaurantTables.outletId, outletId),
        eq(restaurantTables.sectionId, sectionId)
      )
    )
    .limit(5);

  if (assignedTables.length > 0) {
    const tableList = assignedTables.map((t) => t.tableNumber).join(", ");
    throw new BusinessRuleError(
      `Cannot delete section '${section.name}' because it contains assigned tables (${tableList}). Reassign or delete these tables first.`
    );
  }

  await db
    .delete(restaurantSections)
    .where(
      and(
        eq(restaurantSections.sectionId, sectionId),
        eq(restaurantSections.tenantId, tenantId),
        eq(restaurantSections.outletId, outletId)
      )
    );

  await recordAuditEvent({
    tenantId,
    userId,
    action: "restaurant.section.deleted",
    resourceType: "restaurant_section",
    resourceId: sectionId,
    payload: { name: section.name, code: section.code },
  });

  await realtimeHub.broadcastToTenant(tenantId, "restaurant:section_deleted", {
    sectionId,
    name: section.name,
  });

  return { success: true, sectionId };
}

/**
 * Initializes default sections for an outlet and links existing tables by matching section name.
 */
export async function ensureDefaultSections(
  tenantId: string,
  outletId: string
): Promise<RestaurantSection[]> {
  const db = getDb();

  const existing = await db
    .select()
    .from(restaurantSections)
    .where(
      and(
        eq(restaurantSections.tenantId, tenantId),
        eq(restaurantSections.outletId, outletId)
      )
    )
    .orderBy(asc(restaurantSections.displayOrder));

  if (existing.length > 0) {
    return existing;
  }

  const insertedSections: RestaurantSection[] = [];
  for (const def of DEFAULT_RESTAURANT_SECTIONS) {
    const [created] = await db
      .insert(restaurantSections)
      .values({
        tenantId,
        outletId,
        name: def.name,
        code: def.code,
        displayOrder: def.displayOrder,
        isActive: true,
      })
      .onConflictDoNothing()
      .returning();

    if (created) {
      insertedSections.push(created);
    }
  }

  // Link existing tables that match section string
  const allSections = insertedSections.length > 0
    ? insertedSections
    : await db
        .select()
        .from(restaurantSections)
        .where(
          and(
            eq(restaurantSections.tenantId, tenantId),
            eq(restaurantSections.outletId, outletId)
          )
        );

  for (const sec of allSections) {
    await db
      .update(restaurantTables)
      .set({ sectionId: sec.sectionId })
      .where(
        and(
          eq(restaurantTables.tenantId, tenantId),
          eq(restaurantTables.outletId, outletId),
          eq(restaurantTables.section, sec.name)
        )
      );
  }

  return allSections;
}
