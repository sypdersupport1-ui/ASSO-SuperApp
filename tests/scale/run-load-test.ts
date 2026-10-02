import { seedScaleFixtures, SCALE_TENANT_IDS } from "./deterministic-data-generator";
import {
  runScenario1CustomerMenuReads,
  runScenario2OrderLoad,
  runScenario3KdsLoad,
  runScenario4HotelOperationalReads,
  runScenario5MixedLoad,
  ScenarioResult,
  LoadLevel,
} from "./load-test-harness";
import { withPlatformScope } from "@/db/rls";

interface LevelPlan {
  level: LoadLevel;
  concurrency: number;
  requests: number;
  rampUpMs?: number;
}

const PROGRESSION_PLAN: Record<number, LevelPlan[]> = {
  1: [
    { level: "A", concurrency: 5, requests: 50 },
    { level: "B", concurrency: 10, requests: 100 },
    { level: "C", concurrency: 20, requests: 200 },
    { level: "D", concurrency: 35, requests: 350, rampUpMs: 200 },
  ],
  2: [
    { level: "A", concurrency: 5, requests: 30 },
    { level: "B", concurrency: 10, requests: 60 },
    { level: "C", concurrency: 20, requests: 120 },
    { level: "D", concurrency: 30, requests: 180, rampUpMs: 200 },
  ],
  3: [
    { level: "A", concurrency: 5, requests: 40 },
    { level: "B", concurrency: 10, requests: 80 },
    { level: "C", concurrency: 20, requests: 160 },
    { level: "D", concurrency: 30, requests: 240, rampUpMs: 200 },
  ],
  4: [
    { level: "A", concurrency: 5, requests: 40 },
    { level: "B", concurrency: 10, requests: 80 },
    { level: "C", concurrency: 20, requests: 160 },
    { level: "D", concurrency: 30, requests: 240, rampUpMs: 200 },
  ],
  5: [
    { level: "A", concurrency: 5, requests: 50 },
    { level: "B", concurrency: 10, requests: 100 },
    { level: "C", concurrency: 20, requests: 200 },
    { level: "D", concurrency: 35, requests: 350, rampUpMs: 200 },
  ],
};

async function cleanupScaleEvents() {
  try {
    await withPlatformScope(async (tx) => {
      await tx`DELETE FROM communication_delivery_logs WHERE tenant_id IN (${SCALE_TENANT_IDS[0]}, ${SCALE_TENANT_IDS[1]})`;
      await tx`DELETE FROM domain_outbox_events WHERE tenant_id IN (${SCALE_TENANT_IDS[0]}, ${SCALE_TENANT_IDS[1]})`;
    });
  } catch (err) {
    // Non-fatal cleanup
  }
}

async function main() {
  console.log("================================================================================");
  console.log("      ASSO SCALE FOUNDATION S6 — PROGRESSIVE LOAD & CAPACITY VALIDATION         ");
  console.log("================================================================================\n");

  const args = process.argv.slice(2);
  const targetScenarioArg = args.find((a) => a.startsWith("--scenario="))?.split("=")[1];
  const targetLevelArg = args.find((a) => a.startsWith("--level="))?.split("=")[1]?.toUpperCase();

  const selectedScenarios = targetScenarioArg
    ? [parseInt(targetScenarioArg, 10)]
    : [1, 2, 3, 4, 5];

  console.log("1. Seeding deterministic multi-tenant scale fixtures...");
  const fixtures = await seedScaleFixtures();
  console.log(`✓ Seeded ${fixtures.length} isolated scale tenants (Tenants 99990001, 99990002).\n`);

  const results: ScenarioResult[] = [];

  try {
    for (const scId of selectedScenarios) {
      const planList = PROGRESSION_PLAN[scId];
      if (!planList) continue;

      const filteredPlans = targetLevelArg
        ? planList.filter((p) => p.level === targetLevelArg)
        : planList;

      for (const plan of filteredPlans) {
        process.stdout.write(
          `Running Scenario ${scId} [Level ${plan.level}] (concurrency=${plan.concurrency}, requests=${plan.requests})... `
        );

        let res: ScenarioResult;
        switch (scId) {
          case 1:
            res = await runScenario1CustomerMenuReads(
              fixtures,
              plan.level,
              plan.concurrency,
              plan.requests,
              { rampUpMs: plan.rampUpMs }
            );
            break;
          case 2:
            res = await runScenario2OrderLoad(
              fixtures,
              plan.level,
              plan.concurrency,
              plan.requests,
              { rampUpMs: plan.rampUpMs }
            );
            break;
          case 3:
            res = await runScenario3KdsLoad(
              fixtures,
              plan.level,
              plan.concurrency,
              plan.requests,
              { rampUpMs: plan.rampUpMs }
            );
            break;
          case 4:
            res = await runScenario4HotelOperationalReads(
              fixtures,
              plan.level,
              plan.concurrency,
              plan.requests,
              { rampUpMs: plan.rampUpMs }
            );
            break;
          case 5:
            res = await runScenario5MixedLoad(
              fixtures,
              plan.level,
              plan.concurrency,
              plan.requests,
              { rampUpMs: plan.rampUpMs }
            );
            break;
          default:
            throw new Error(`Unknown scenario ${scId}`);
        }

        results.push(res);
        console.log(
          `DONE in ${res.durationSeconds}s | ${res.throughputRps} RPS | p50=${res.p50Ms}ms | p95=${res.p95Ms}ms | p99=${res.p99Ms}ms | errors=${res.errorCount}`
        );
      }
      console.log("");
    }

    console.log("================================================================================");
    console.log("                    PROGRESSIVE MEASURED PERFORMANCE RESULTS                    ");
    console.log("================================================================================\n");

    console.table(
      results.map((r) => ({
        Scenario: r.scenarioName.split(" — ")[1],
        Lvl: r.level,
        Conc: r.concurrency,
        Reqs: r.totalRequests,
        "Dur (s)": r.durationSeconds,
        RPS: r.throughputRps,
        "p50 (ms)": r.p50Ms,
        "p95 (ms)": r.p95Ms,
        "p99 (ms)": r.p99Ms,
        "Max (ms)": r.maxMs,
        "DB Conns": `${r.dbActiveConnsBefore ?? 0}→${r.dbActiveConnsAfter ?? 0}`,
        "Errors (%)": `${r.errorRatePct}%`,
        Timeouts: r.timeoutCount,
      }))
    );

    console.log("\n================================================================================");
    console.log("  PROGRESSIVE LOAD VALIDATION COMPLETE: ALL LEVELS EXECUTED AGAINST POSTGRESQL  ");
    console.log("================================================================================\n");
  } finally {
    await cleanupScaleEvents();
  }

  process.exit(0);
}

main().catch(async (err) => {
  console.error("❌ Fatal error executing progressive load tests:", err);
  await cleanupScaleEvents();
  process.exit(1);
});
