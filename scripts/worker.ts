// Background jobs (PRD 9: pg-boss). Run next to the web app: `npm run worker`.
//  - daily absence balances (phase 2)
//  - overdue step notices every 5 minutes, Telegram delivery every 10 s, bot updates by long polling (phase 5)
import "dotenv/config";
import { PgBoss } from "pg-boss";
import { runDailyBalances } from "../src/server/services/absences";
import { notifyOverdue } from "../src/server/services/notifications";
import { DELIVERY_INTERVAL_MS, deliverPending, getTransport, pollUpdates } from "../src/server/notifications/telegram";

const DAILY_BALANCES = "daily-balances";
const OVERDUE = "overdue-steps";

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

  await boss.createQueue(OVERDUE);
  await boss.schedule(OVERDUE, "*/5 * * * *", null, { tz: "Europe/Kyiv" });
  await boss.work(OVERDUE, async () => {
    const result = await notifyOverdue();
    if (result.steps) console.log(`[worker] ${OVERDUE}: ${result.steps} steps, ${result.notified} notifications`);
  });

  // catch up right away after a restart — both jobs are idempotent
  await boss.send(DAILY_BALANCES);
  await boss.send(OVERDUE);

  let stopping = false;
  const transport = getTransport();
  if (transport) {
    // Telegram delivery: a short loop instead of cron keeps "new step → message" well under a minute (PRD 8)
    const deliver = async () => {
      try {
        const r = await deliverPending(transport);
        if (r.sent || r.failed) console.log(`[worker] telegram: ${r.sent} sent, ${r.failed} failed`);
      } catch (err) {
        console.error("[worker] telegram delivery", err);
      }
      if (!stopping) setTimeout(deliver, DELIVERY_INTERVAL_MS);
    };
    void deliver();

    // bot updates: long polling unless a webhook is configured (Telegram allows only one of the two)
    if (!process.env.TELEGRAM_WEBHOOK_SECRET) {
      let offset = 0;
      const poll = async () => {
        while (!stopping) {
          try {
            offset = await pollUpdates(offset, transport);
          } catch (err) {
            console.error("[worker] telegram polling", err);
            await new Promise((r) => setTimeout(r, 5000));
          }
        }
      };
      void poll();
    }
  } else {
    console.log("[worker] TELEGRAM_BOT_TOKEN is not set — Telegram delivery is off, in-app notifications still work");
  }
  console.log("[worker] started");

  const stop = async () => {
    stopping = true;
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
