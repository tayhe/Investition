import { db } from "@/lib/db";
import { syncIbkrFlex, type IbkrFlexConfig, type FlexReport } from "./flex";
import { mapIbkrExchangeToMarket } from "./flex";
import { Prisma } from "@/generated/prisma/client";

const { Decimal } = Prisma;

export async function syncAccountData(accountId: string): Promise<{ trades: number; positions: number }> {
  const account = await db.account.findUnique({
    where: { id: accountId },
    include: { user: true },
  });

  if (!account) throw new Error("Account not found");
  if (!account.ibkrFlexToken || !account.ibkrFlexQueryId) {
    throw new Error("IBKR Flex credentials not configured");
  }

  const config: IbkrFlexConfig = {
    token: account.ibkrFlexToken,
    queryId: account.ibkrFlexQueryId,
  };

  const report = await syncIbkrFlex(config);

  const tradesCount = await upsertTrades(accountId, report);
  await upsertPositions(accountId, report);

  return { trades: tradesCount, positions: report.positions.length };
}

async function getOrCreateSecurity(ibkrSymbol: string, exchange: string, description: string, currency: string) {
  const market = mapIbkrExchangeToMarket(exchange);

  const existing = await db.security.findUnique({
    where: { symbol_exchange: { symbol: ibkrSymbol, exchange } },
  });

  if (existing) return existing;

  return db.security.create({
    data: {
      symbol: ibkrSymbol,
      name: description || ibkrSymbol,
      exchange,
      market,
      currency,
      type: "STOCK",
    },
  });
}

async function upsertTrades(accountId: string, report: FlexReport): Promise<number> {
  let count = 0;

  for (const trade of report.trades) {
    const security = await getOrCreateSecurity(
      trade.symbol,
      trade.exchange,
      trade.description,
      trade.currency
    );

    const tradeDate = new Date(`${trade.tradeDate}T${trade.tradeTime || "00:00:00"}`);

    await db.trade.upsert({
      where: {
        id: trade.transactionId || `${accountId}-${security.id}-${tradeDate.toISOString()}`,
      },
      update: {
        quantity: new Decimal(trade.quantity.toString()),
        price: new Decimal(trade.tradePrice.toString()),
        amount: new Decimal(trade.tradeMoney.toString()),
        commission: new Decimal(trade.ibCommission.toString()),
      },
      create: {
        id: trade.transactionId || undefined,
        accountId,
        securityId: security.id,
        orderId: trade.ibOrderID || undefined,
        side: trade.buySell,
        quantity: new Decimal(trade.quantity.toString()),
        price: new Decimal(trade.tradePrice.toString()),
        amount: new Decimal(trade.tradeMoney.toString()),
        commission: new Decimal(trade.ibCommission.toString()),
        currency: trade.currency,
        executedAt: tradeDate,
      },
    });
    count++;
  }

  return count;
}

async function upsertPositions(accountId: string, report: FlexReport) {
  for (const pos of report.positions) {
    if (pos.quantity === 0) continue;

    const security = await getOrCreateSecurity(
      pos.symbol,
      pos.exchange,
      pos.description,
      pos.currency
    );

    await db.position.upsert({
      where: {
        accountId_securityId: {
          accountId,
          securityId: security.id,
        },
      },
      update: {
        quantity: new Decimal(pos.quantity.toString()),
        avgCost: new Decimal(pos.averageCost.toString()),
        costBasis: new Decimal((pos.averageCost * Math.abs(pos.quantity)).toString()),
        updatedAt: new Date(),
      },
      create: {
        accountId,
        securityId: security.id,
        quantity: new Decimal(pos.quantity.toString()),
        avgCost: new Decimal(pos.averageCost.toString()),
        costBasis: new Decimal((pos.averageCost * Math.abs(pos.quantity)).toString()),
        currency: pos.currency,
      },
    });
  }
}

export async function createDailySnapshot(accountId: string, date: Date) {
  const account = await db.account.findUnique({ where: { id: accountId } });
  if (!account) throw new Error("Account not found");

  const positions = await db.position.findMany({
    where: { accountId },
    include: { security: true },
  });

  let positionsValue = new Decimal(0);
  for (const pos of positions) {
    const latestPrice = await db.price.findFirst({
      where: { securityId: pos.securityId },
      orderBy: { date: "desc" },
    });

    if (latestPrice) {
      positionsValue = positionsValue.add(pos.quantity.mul(latestPrice.close));
    } else {
      positionsValue = positionsValue.add(pos.quantity.mul(pos.avgCost));
    }
  }

  const cashBalance = new Decimal(0);
  const totalValue = positionsValue.add(cashBalance);

  const prevSnapshot = await db.snapshot.findFirst({
    where: { accountId },
    orderBy: { date: "desc" },
  });

  let dailyPnl = null;
  let dailyReturn = null;
  if (prevSnapshot) {
    dailyPnl = totalValue.sub(prevSnapshot.totalValue);
    if (!prevSnapshot.totalValue.isZero()) {
      dailyReturn = dailyPnl.div(prevSnapshot.totalValue).mul(100);
    }
  }

  const firstSnapshot = await db.snapshot.findFirst({
    where: { accountId },
    orderBy: { date: "asc" },
  });

  let cumulativeReturn = null;
  if (firstSnapshot && !firstSnapshot.totalValue.isZero()) {
    cumulativeReturn = totalValue.sub(firstSnapshot.totalValue).div(firstSnapshot.totalValue).mul(100);
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
    const dd = peak.sub(snap.totalValue).div(peak).mul(100);
    if (dd.greaterThan(maxDrawdown)) {
      maxDrawdown = dd;
    }
  }
  const currentDd = peak.greaterThan(0)
    ? peak.sub(totalValue).div(peak).mul(100)
    : new Decimal(0);
  if (currentDd.greaterThan(maxDrawdown)) {
    maxDrawdown = currentDd;
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
