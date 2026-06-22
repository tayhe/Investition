import { db } from "@/lib/db";
import { syncIbkrFlex, parseFlexXml, type IbkrFlexConfig, type FlexReport } from "./flex";
import { mapIbkrExchangeToMarket } from "./flex";
import { updatePositionsWithFifo } from "./fifo";
import { Prisma } from "@/generated/prisma/client";

const { Decimal } = Prisma;

const SYNC_COOLDOWN_MS = 15 * 60 * 1000;

async function canSync(accountId: string): Promise<{ allowed: boolean; waitSeconds: number }> {
  const lastCache = await db.flexCache.findFirst({
    where: { accountId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  if (!lastCache) return { allowed: true, waitSeconds: 0 };

  const elapsed = Date.now() - lastCache.createdAt.getTime();
  if (elapsed >= SYNC_COOLDOWN_MS) return { allowed: true, waitSeconds: 0 };

  const waitSeconds = Math.ceil((SYNC_COOLDOWN_MS - elapsed) / 1000);
  return { allowed: false, waitSeconds };
}

export async function syncAccountData(accountId: string, force = false): Promise<{ trades: number; positions: number; fromCache: boolean }> {
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

  if (!force) {
    const { allowed, waitSeconds } = await canSync(accountId);
    if (!allowed) {
      const cached = await db.flexCache.findFirst({
        where: { accountId },
        orderBy: { createdAt: "desc" },
      });
      if (cached) {
        const report = parseFlexXml(cached.xml);
        const tradesCount = await upsertTrades(accountId, report);
        await upsertPositions(accountId, report);
        return { trades: tradesCount, positions: report.positions.length, fromCache: true };
      }
      throw new Error(`IBKR API 冷却中，请 ${waitSeconds} 秒后重试`);
    }
  }

  let report: FlexReport;
  let rawXml: string;
  let fromCache = false;

  try {
    const result = await syncIbkrFlex(config);
    report = result.report;
    rawXml = result.rawXml;

    await db.flexCache.upsert({
      where: {
        accountId_year: { accountId, year: report.year },
      },
      update: {
        xml: rawXml,
        tradesCount: report.trades.length,
        positionsCount: report.positions.length,
        createdAt: new Date(),
      },
      create: {
        accountId,
        year: report.year,
        xml: rawXml,
        tradesCount: report.trades.length,
        positionsCount: report.positions.length,
      },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "";

    const isMaintenance = errorMsg.includes("unavailable") ||
                          errorMsg.includes("maintenance");
    const isLocked = errorMsg.includes("1025") ||
                     errorMsg.includes("failed attempts");
    const isRateLimit = errorMsg.includes("could not be generated") ||
                        errorMsg.includes("try again") ||
                        errorMsg.includes("1001") ||
                        errorMsg.includes("1018");

    if (!isMaintenance && !isLocked && !isRateLimit) throw error;

    const cached = await db.flexCache.findFirst({
      where: { accountId },
      orderBy: { createdAt: "desc" },
    });

    if (cached) {
      report = parseFlexXml(cached.xml);
      rawXml = cached.xml;
      fromCache = true;
    } else {
      if (isMaintenance) throw new Error("IBKR 报告系统正在维护中，请稍后再试");
      if (isLocked) throw new Error("IBKR API 已被临时锁定（多次失败），请等待 24 小时或生成新 Token");
      throw new Error("IBKR API 暂时不可用且无缓存数据，请稍后重试");
    }
  }

  const tradesCount = await upsertTrades(accountId, report);
  await upsertPositions(accountId, report);
  await updatePositionsWithFifo(accountId);

  return { trades: tradesCount, positions: report.positions.length, fromCache };
}

export async function syncFromCache(accountId: string): Promise<{ trades: number; positions: number }> {
  const cached = await db.flexCache.findFirst({
    where: { accountId },
    orderBy: { createdAt: "desc" },
  });

  if (!cached) throw new Error("无缓存数据，请先执行一次 IBKR 同步");

  const report = parseFlexXml(cached.xml);

  const tradesCount = await upsertTrades(accountId, report);
  await upsertPositions(accountId, report);
  await updatePositionsWithFifo(accountId);

  return { trades: tradesCount, positions: report.positions.length };
}

async function getOrCreateSecurity(ibkrSymbol: string, exchange: string, description: string, currency: string, assetClass?: string, multiplier?: number) {
  const market = mapIbkrExchangeToMarket(exchange);
  const type = mapIbkrAssetClass(assetClass || "STK");
  const mult = multiplier ?? (type === "OPTION" ? 100 : 1);

  const existing = await db.security.findUnique({
    where: { symbol_exchange: { symbol: ibkrSymbol, exchange } },
  });

  if (existing) {
    if (Number(existing.multiplier) !== mult) {
      await db.security.update({
        where: { id: existing.id },
        data: { multiplier: mult },
      });
    }
    return existing;
  }

  return db.security.create({
    data: {
      symbol: ibkrSymbol,
      name: description || ibkrSymbol,
      exchange,
      market,
      currency,
      type,
      multiplier: mult,
    },
  });
}

function mapIbkrAssetClass(assetClass: string): "STOCK" | "ETF" | "FUND" | "BOND" | "OPTION" | "FUTURE" {
  const upper = assetClass.toUpperCase();
  if (upper === "OPT") return "OPTION";
  if (upper === "FUT") return "FUTURE";
  if (upper === "FUND") return "FUND";
  if (upper === "BOND") return "BOND";
  return "STOCK";
}

export async function upsertTrades(accountId: string, report: FlexReport): Promise<number> {
  let count = 0;

  for (const trade of report.trades) {
    const security = await getOrCreateSecurity(
      trade.symbol,
      trade.exchange,
      trade.description,
      trade.currency,
      trade.contractType
    );

    const tradeDate = parseIbkrDate(trade.tradeDate, trade.tradeTime);

    await db.trade.upsert({
      where: {
        id: trade.transactionId || `${accountId}-${security.id}-${tradeDate.toISOString()}`,
      },
      update: {
        quantity: new Decimal(trade.quantity.toString()),
        price: new Decimal(trade.price.toString()),
        amount: new Decimal(trade.amount.toString()),
        commission: new Decimal(trade.commission.toString()),
      },
      create: {
        id: trade.transactionId || undefined,
        accountId,
        securityId: security.id,
        orderId: trade.ibOrderID || undefined,
        side: trade.buySell,
        quantity: new Decimal(trade.quantity.toString()),
        price: new Decimal(trade.price.toString()),
        amount: new Decimal(trade.amount.toString()),
        commission: new Decimal(trade.commission.toString()),
        currency: trade.currency,
        executedAt: tradeDate,
      },
    });
    count++;
  }

  return count;
}

function parseIbkrDate(dateStr: string, timeStr?: string): Date {
  if (!dateStr) return new Date();
  const clean = dateStr.replace(/[^0-9]/g, "");
  const year = parseInt(clean.slice(0, 4));
  const month = parseInt(clean.slice(4, 6)) - 1;
  const day = parseInt(clean.slice(6, 8));

  if (timeStr) {
    const t = timeStr.replace(/[^0-9]/g, "");
    const hour = parseInt(t.slice(0, 2)) || 0;
    const min = parseInt(t.slice(2, 4)) || 0;
    const sec = parseInt(t.slice(4, 6)) || 0;
    return new Date(year, month, day, hour, min, sec);
  }
  return new Date(year, month, day);
}

export async function upsertPositions(accountId: string, report: FlexReport) {
  const activeSecurityIds = new Set<string>();

  for (const pos of report.positions) {
    if (pos.quantity === 0) continue;

    const security = await getOrCreateSecurity(
      pos.symbol,
      pos.exchange,
      pos.description,
      pos.currency,
      pos.contractType,
      pos.multiplier
    );

    activeSecurityIds.add(security.id);

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

  const allPositions = await db.position.findMany({
    where: { accountId, quantity: { not: 0 } },
    select: { id: true, securityId: true },
  });

  const closedIds = allPositions
    .filter((p) => !activeSecurityIds.has(p.securityId))
    .map((p) => p.id);

  if (closedIds.length > 0) {
    await db.position.updateMany({
      where: { id: { in: closedIds } },
      data: { quantity: 0, updatedAt: new Date() },
    });
  }
}

export async function createDailySnapshot(accountId: string, date: Date) {
  const account = await db.account.findUnique({ where: { id: accountId } });
  if (!account) throw new Error("Account not found");

  const positions = await db.position.findMany({
    where: { accountId, quantity: { not: 0 } },
    include: { security: true },
  });

  let positionsValue = new Decimal(0);
  for (const pos of positions) {
    const latestPrice = await db.price.findFirst({
      where: { securityId: pos.securityId },
      orderBy: { date: "desc" },
    });

    const multiplier = pos.security.multiplier || new Decimal(1);
    const price = latestPrice ? latestPrice.close : pos.avgCost;
    positionsValue = positionsValue.add(pos.quantity.mul(multiplier).mul(price));
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
