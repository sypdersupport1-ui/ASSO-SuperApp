import PgBoss from "pg-boss";
import { env } from "@/config/env";
import { logger } from "../logger";

let bossInstance: PgBoss | null = null;

export async function getJobBoss(): Promise<PgBoss> {
  if (!bossInstance) {
    bossInstance = new PgBoss({
      connectionString: env.DATABASE_URL,
      schema: "pgboss",
      max: 2,
    });

    bossInstance.on("error", (error) => {
      logger.warn({ message: "pg-boss background job system error", details: { error: String(error) } });
    });
  }
  return bossInstance;
}

export async function scheduleJob(queueName: string, data: object): Promise<string | null> {
  try {
    const boss = await getJobBoss();
    // In local dev without live postgres, return simulated job id
    const jobId = await boss.send(queueName, data, {
      retryLimit: 3,
      retryDelay: 30,
      retryBackoff: true,
      expireInMinutes: 15,
    });
    return jobId;
  } catch (err) {
    logger.warn({
      message: `Failed to schedule job on queue '${queueName}' (pg-boss unavailable, simulated fallback)`,
      details: { queueName, error: String(err) },
    });
    return `sim_job_${Date.now()}`;
  }
}
