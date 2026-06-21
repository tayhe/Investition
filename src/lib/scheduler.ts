import cron from "node-cron";
import { db } from "@/lib/db";
import { fetchPrices } from "@/lib/prices/fetcher";
import { fetchExchangeRates } from "@/lib/prices/exchange-rate";
import { createDailySnapshot } from "@/lib/ibkr/sync";

let started = false;

function log(msg: string) {
  console.log(`[Cron] ${new Date().toISOString()} ${msg}`);
}

async function runPriceUpdate() {
  try {
    log("Starting price update...");
    const result = await fetchPrices();
    log(`Price update done: ${result.updated} updated, ${result.skipped} skipped, ${result.errors.length} errors`);
    if (result.errors.length > 0) {
      log(`Price errors: ${result.errors.slice(0, 5).join(", ")}`);
    }
  } catch (err) {
    log(`Price update failed: ${err instanceof Error ? err.message : err}`);
  }
}

async function runExchangeRateUpdate() {
  try {
    log("Starting exchange rate update...");
    const result = await fetchExchangeRates();
    log(`Exchange rate update done: ${result.updated} updated, ${result.skipped} skipped`);
  } catch (err) {
    log(`Exchange rate update failed: ${err instanceof Error ? err.message : err}`);
  }
}

async function runDailySnapshot() {
  try {
    log("Starting daily snapshot...");
    const accounts = await db.account.findMany({ select: { id: true } });
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const account of accounts) {
      await createDailySnapshot(account.id, today);
    }
    log(`Daily snapshot done for ${accounts.length} accounts`);
  } catch (err) {
    log(`Daily snapshot failed: ${err instanceof Error ? err.message : err}`);
  }
}

export function startScheduler() {
  if (started) return;
  started = true;

  const enabled = process.env.CRON_ENABLED !== "false";
  if (!enabled) {
    log("Scheduler disabled via CRON_ENABLED=false");
    return;
  }

  log("Starting scheduler...");

  cron.schedule("0 */4 * * *", runPriceUpdate, { timezone: "America/New_York" });
  log("Scheduled: price update every 4 hours (NYSE timezone)");

  cron.schedule("0 */4 * * *", runExchangeRateUpdate, { timezone: "America/New_York" });
  log("Scheduled: exchange rate update every 4 hours");

  cron.schedule("0 1 * * *", runDailySnapshot, { timezone: "America/New_York" });
  log("Scheduled: daily snapshot at 01:00 NYSE time");

  runPriceUpdate();
  runExchangeRateUpdate();

  log("Scheduler started");
}
