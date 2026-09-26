import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

async function runMigrations() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("❌ DATABASE_URL environment variable is not defined.");
    process.exit(1);
  }

  console.log("Connecting to PostgreSQL to run migrations...");
  const migrationClient = postgres(connectionString, {
    max: 1,
    ssl: "require",
    connect_timeout: 10,
  });

  const db = drizzle(migrationClient);

  try {
    console.log("Applying migrations from ./src/db/migrations ...");
    await migrate(db, { migrationsFolder: "./src/db/migrations" });
    console.log("✅ Migrations applied successfully!");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  } finally {
    await migrationClient.end();
  }
}

runMigrations();
