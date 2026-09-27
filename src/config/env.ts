import { z } from "zod";

export type AppEnvironment = "local" | "development" | "test" | "preview" | "staging" | "production";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ENV: z.enum(["local", "development", "test", "preview", "staging", "production"]).optional(),
  PORT: z.coerce.number().default(3000),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().default("postgresql://postgres:postgres@localhost:5432/asso_dev"),
  DATABASE_DIRECT_URL: z.string().optional(),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters long").default("super-secret-local-dev-jwt-key-minimum-32-chars-long"),
  STORAGE_BUCKET: z.string().default("asso-media-dev"),
  STORAGE_REGION: z.string().default("ap-south-1"),
  STORAGE_ENDPOINT: z.string().optional(),
  REALTIME_HEARTBEAT_INTERVAL_MS: z.coerce.number().default(15000),
  IDEMPOTENCY_EXPIRATION_HOURS: z.coerce.number().default(24),
});

export type Env = z.infer<typeof envSchema>;

export function getAppEnvironment(): AppEnvironment {
  const explicit = (
    process.env.APP_ENV ||
    process.env.ASSO_ENV ||
    process.env.VERCEL_ENV
  )?.toLowerCase();

  if (explicit) {
    if (explicit === "preview") return "preview";
    if (explicit === "staging") return "staging";
    if (explicit === "production" || explicit === "prod") return "production";
    if (explicit === "development" || explicit === "dev") return "development";
    if (explicit === "local") return "local";
    if (explicit === "test") return "test";
  }

  const nodeEnv = (process.env.NODE_ENV || "development").toLowerCase();
  if (nodeEnv === "production") return "production";
  if (nodeEnv === "test") return "test";
  return "local";
}

export function isLocalOrDevEnvironment(): boolean {
  const env = getAppEnvironment();
  return env === "local" || env === "development" || env === "test";
}

function validateEnv(): Env {
  // Read process.env with defaults
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    console.error(`\n❌ CRITICAL: Invalid environment configuration:\n${issues}\n`);
    // In production or test, fail closed
    if (process.env.NODE_ENV === "production" || process.env.APP_ENV === "production") {
      throw new Error(`Invalid environment configuration:\n${issues}`);
    }
  }

  return parsed.success
    ? parsed.data
    : {
        NODE_ENV: (process.env.NODE_ENV as "development" | "test" | "production") || "development",
        APP_ENV: (process.env.APP_ENV as AppEnvironment) || undefined,
        PORT: Number(process.env.PORT) || 3000,
        APP_URL: process.env.APP_URL || "http://localhost:3000",
        DATABASE_URL: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/asso_dev",
        JWT_SECRET: process.env.JWT_SECRET || "super-secret-local-dev-jwt-key-minimum-32-chars-long",
        STORAGE_BUCKET: process.env.STORAGE_BUCKET || "asso-media-dev",
        STORAGE_REGION: process.env.STORAGE_REGION || "ap-south-1",
        REALTIME_HEARTBEAT_INTERVAL_MS: Number(process.env.REALTIME_HEARTBEAT_INTERVAL_MS) || 15000,
        IDEMPOTENCY_EXPIRATION_HOURS: Number(process.env.IDEMPOTENCY_EXPIRATION_HOURS) || 24,
      };
}

export const env = validateEnv();

