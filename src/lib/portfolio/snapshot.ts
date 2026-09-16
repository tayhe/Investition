import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { getLatestRatesMap, convertCurrency } from "@/lib/prices/exchange-rate";
import { parseFlexXml, getCashBalance, parseCashFlowsByDate } from "@/lib/ibkr/flex";

const { Decimal } = Prisma;

export async function createDailySnapshot(accountId: string, date: Date) {
  const account = await db.account.findUnique({ where: { id: accountId } });
  if (!account) throw new Error("Account not found");

  const positions = await db.position.findMany({
    where: { accountId, quantity: { not: 0 } },
    include: { security: true },
  });

  const securityIds = [...new Set(positions.map((p) => p.securityId))];
  const [rates, priceEntries] = await Promise.all([
    getLatestRatesMap(),
    Promise.all(
      securityIds.map(async (secId) => {
        const p = await db.price.findFirst({
          where: { securityId: secId, date: { lte: date } },
          orderBy: { date: "desc" },
        });
        return [secId, p ? Number(p.close) : null] as const;
      })
    ),
  ]);
  const priceMap = new Map<string, number | null>(priceEntries);

  let positionsValue = new Decimal(0);
  for (const pos of positions) {
    const currentPrice = priceMap.get(pos.securityId);
    const mult =
      pos.security.type === "OPTION" ? 100 : Number(pos.security.multiplier || 1);
    const multiplier = new Decimal(mult);
    const price =
      currentPrice !== null && currentPrice !== undefined
        ? new Decimal(currentPrice.toString())
        : pos.avgCost;
    const rawValue = pos.quantity.mul(multiplier).mul(price);

    // Convert to account base currency using cached rates
    const rate = convertCurrency(1, pos.currency, account.currency, rates);
    positionsValue = positionsValue.add(
      rawValue.mul(new Decimal(rate.toString()))
    );
  }

  // Get real cash balance from latest cached Flex XML if available
  let cashBalance = new Decimal(0);
  const latestCache = await db.flexCache.findFirst({
    where: { accountId },
    orderBy: { createdAt: "desc" },
    select: { xml: true },
  });
  if (latestCache) {
    const cachedReport = parseFlexXml(latestCache.xml);
    const cash = getCashBalance(cachedReport.cashBalances, account.currency);
    if (cash !== 0) cashBalance = new Decimal(cash.toFixed(4));
  }
  const totalValue = positionsValue.add(cashBalance);

  // Check if there was cash flow on this date from latest Flex cache
  let cashFlowOnDate = new Decimal(0);
  if (latestCache) {
    const flows = parseCashFlowsByDate(latestCache.xml);
    const dateStr = date.toISOString().split("T")[0];
    const flowAmt = flows.get(dateStr) || 0;
    if (flowAmt !== 0) {
      cashFlowOnDate = new Decimal(flowAmt.toFixed(4));
    }
  }

  const prevSnapshot = await db.snapshot.findFirst({
    where: { accountId, date: { lt: date } },
    orderBy: { date: "desc" },
  });

  let dailyPnl = null;
  let dailyReturn = null;
  if (prevSnapshot) {
    dailyPnl = totalValue.sub(prevSnapshot.totalValue).sub(cashFlowOnDate);
    if (!prevSnapshot.totalValue.isZero()) {
      dailyReturn = dailyPnl.div(prevSnapshot.totalValue.abs()).mul(100);
    }
  }

  const firstSnapshot = await db.snapshot.findFirst({
    where: { accountId },
    orderBy: { date: "asc" },
  });

  let cumulativeReturn = null;
  if (firstSnapshot && !firstSnapshot.totalValue.isZero()) {
    cumulativeReturn = totalValue
      .sub(firstSnapshot.totalValue)
      .div(firstSnapshot.totalValue.abs())
      .mul(100);
  }

  const allSnapshots = await db.snapshot.findMany({
    where: { accountId },
    orderBy: { date: "asc" },
    select: { totalValue: true },
  });

  let maxDrawdown = new Decimal(0);
  let peak = new Decimal(0);
  for (const snap of allSnapshots) {
    if (snap.totalValue.greaterThan(peak)) {
      peak = snap.totalValue;
    }
    if (peak.greaterThan(0)) {
      const dd = peak.sub(snap.totalValue).div(peak).mul(100);
      if (dd.greaterThan(maxDrawdown)) {
        maxDrawdown = dd;
      }
    }
  }
  if (totalValue.greaterThan(peak)) {
    peak = totalValue;
  }
  if (peak.greaterThan(0)) {
    const currentDd = peak.sub(totalValue).div(peak).mul(100);
    if (currentDd.greaterThan(maxDrawdown)) {
      maxDrawdown = currentDd;
    }
  }

  await db.snapshot.upsert({
    where: {
      accountId_date: { accountId, date },
    },
    update: {
      totalValue,
      cashBalance,
      positionsValue,
      dailyPnl: dailyPnl || undefined,
      dailyReturn: dailyReturn || undefined,
      cumulativeReturn: cumulativeReturn || undefined,
      maxDrawdown,
      currency: account.currency,
    },
    create: {
      accountId,
      date,
      totalValue,
      cashBalance,
      positionsValue,
      dailyPnl: dailyPnl || undefined,
      dailyReturn: dailyReturn || undefined,
      cumulativeReturn: cumulativeReturn || undefined,
      maxDrawdown,
      currency: account.currency,
    },
  });
}
