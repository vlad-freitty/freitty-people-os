// Background jobs (PRD 9: pg-boss). Run next to the web app: `npm run worker`.
// Phase 2: daily absence balances (accruals, carryovers, expiries). Later phases add their queues here.
import "dotenv/config";
import { PgBoss } from "pg-boss";
import { runDailyBalances } from "../src/server/services/absences";

const DAILY_BALANCES = "daily-balances";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const boss = new PgBoss(url);
  boss.on("error", (err) => console.error("[worker]", err));
  await boss.start();

  await boss.createQueue(DAILY_BALANCES);
  await boss.schedule(DAILY_BALANCES, "30 0 * * *", null, { tz: "Europe/Kyiv" });
  await boss.work(DAILY_BALANCES, async () => {
    const result = await runDailyBalances();
    console.log(`[worker] ${DAILY_BALANCES}: ${result.employees} employees, ${result.booked} entries booked`);
  });

  // catch up right away after a restart — the job is idempotent
  await boss.send(DAILY_BALANCES);
  console.log("[worker] started");

  const stop = async () => {
    await boss.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
