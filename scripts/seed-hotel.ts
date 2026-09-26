import { ensureHotelSeedData } from "../src/lib/hotel/seed";

async function main() {
  console.log("Seeding hotel data in Supabase PostgreSQL...");
  const res = await ensureHotelSeedData();
  console.log("✅ Seed complete:", {
    propertyName: res.property.name,
    outletId: res.property.outletId,
    roomTypesCount: res.roomTypes.length,
    roomsCount: res.roomsCount,
  });
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Seed error:", err);
  process.exit(1);
});
