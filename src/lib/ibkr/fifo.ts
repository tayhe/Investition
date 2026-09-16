import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { getMultiplier, calculateCostBasis } from "@/lib/portfolio/calc";

interface Lot {
  quantity: number;
  costPerUnit: number;
  isShort: boolean;
}

export interface FifoPositionResult {
  securityId: string;
  symbol: string;
  avgCost: number;
  quantity: number;
  totalCostBasis: number;
}

export async function calculateFifoCostBasis(
  accountId: string
): Promise<Map<string, FifoPositionResult>> {
  const trades = await db.trade.findMany({
    where: { accountId },
    include: { security: true },
    orderBy: { executedAt: "asc" },
  });

  const lotsMap = new Map<string, Lot[]>();
  const securityInfoMap = new Map<string, { symbol: string; multiplier: number }>();

  for (const trade of trades) {
    const secId = trade.securityId;
    if (!lotsMap.has(secId)) {
      lotsMap.set(secId, []);
      const mult = getMultiplier(trade.security);
      securityInfoMap.set(secId, { symbol: trade.security.symbol, multiplier: mult });
    }

    const lots = lotsMap.get(secId)!;
    const qty = Math.abs(Number(trade.quantity));
    if (qty === 0) continue;

    const mult = getMultiplier(trade.security);
    const rawPrice = Number(trade.price);
    const comm = trade.commission ? Math.abs(Number(trade.commission)) : 0;
    const commPerUnit = (qty * mult) > 0 ? comm / (qty * mult) : 0;

    if (trade.side === "BUY") {
      let remaining = qty;
      const unitCost = rawPrice + commPerUnit;

      // Close short lots first (FIFO from head)
      while (remaining > 0 && lots.length > 0 && lots[0].isShort) {
        const shortLot = lots[0];
        if (shortLot.quantity <= remaining) {
          remaining -= shortLot.quantity;
          lots.shift();
        } else {
          shortLot.quantity -= remaining;
          remaining = 0;
        }
      }

      // Add remaining as new long lot
      if (remaining > 0) {
        lots.push({ quantity: remaining, costPerUnit: unitCost, isShort: false });
      }
    } else {
      // SELL
      let remaining = qty;
      const unitCost = Math.max(0, rawPrice - commPerUnit);

      // Close long lots first (FIFO from head)
      while (remaining > 0 && lots.length > 0 && !lots[0].isShort) {
        const longLot = lots[0];
        if (longLot.quantity <= remaining) {
          remaining -= longLot.quantity;
          lots.shift();
        } else {
          longLot.quantity -= remaining;
          remaining = 0;
        }
      }

      // Add remaining as new short lot
      if (remaining > 0) {
        lots.push({ quantity: remaining, costPerUnit: unitCost, isShort: true });
      }
    }
  }

  const result = new Map<string, FifoPositionResult>();

  for (const [secId, lots] of lotsMap) {
    if (lots.length === 0) continue;

    const longLots = lots.filter((l) => !l.isShort);
    const shortLots = lots.filter((l) => l.isShort);

    const longQty = longLots.reduce((sum, l) => sum + l.quantity, 0);
    const shortQty = shortLots.reduce((sum, l) => sum + l.quantity, 0);
    const netQty = longQty - shortQty;

    if (netQty === 0) continue;

    const info = securityInfoMap.get(secId) || { symbol: secId, multiplier: 1 };

    if (netQty > 0 && longLots.length > 0) {
      const totalCost = longLots.reduce((sum, l) => sum + l.quantity * l.costPerUnit, 0);
      const avgCost = totalCost / longQty;
      const totalCostBasis = totalCost * info.multiplier;
      result.set(secId, {
        securityId: secId,
        symbol: info.symbol,
        avgCost,
        quantity: netQty,
        totalCostBasis,
      });
      result.set(info.symbol, {
        securityId: secId,
        symbol: info.symbol,
        avgCost,
        quantity: netQty,
        totalCostBasis,
      });
    } else if (netQty < 0 && shortLots.length > 0) {
      const totalCost = shortLots.reduce((sum, l) => sum + l.quantity * l.costPerUnit, 0);
      const avgCost = totalCost / shortQty;
      const totalCostBasis = totalCost * info.multiplier;
      result.set(secId, {
        securityId: secId,
        symbol: info.symbol,
        avgCost,
        quantity: netQty,
        totalCostBasis,
      });
      result.set(info.symbol, {
        securityId: secId,
        symbol: info.symbol,
        avgCost,
        quantity: netQty,
        totalCostBasis,
      });
    }
  }

  return result;
}

export async function updatePositionsWithFifo(accountId: string) {
  const fifoResult = await calculateFifoCostBasis(accountId);

  const positions = await db.position.findMany({
    where: { accountId, quantity: { not: 0 } },
    include: { security: true },
  });

  let updated = 0;

  for (const pos of positions) {
    const fifo = fifoResult.get(pos.securityId) || fifoResult.get(pos.security.symbol);

    if (fifo && fifo.avgCost > 0) {
      const currentAvg = Number(pos.avgCost);
      const newCostBasis = calculateCostBasis(pos.quantity, fifo.avgCost, pos.security);

      if (Math.abs(currentAvg - fifo.avgCost) > 0.0001 || Math.abs(Number(pos.costBasis) - newCostBasis) > 0.01) {
        await db.position.update({
          where: { id: pos.id },
          data: {
            avgCost: new Prisma.Decimal(fifo.avgCost.toFixed(6)),
            costBasis: new Prisma.Decimal(newCostBasis.toFixed(4)),
            updatedAt: new Date(),
          },
        });
        updated++;
      }
    }
  }

  return updated;
}

/**
 * Calculates total realized P&L by currency for one or more accounts using FIFO trade matching.
 */
export async function calculateRealizedPnl(
  accountIds: string[] | string
): Promise<Map<string, number>> {
  const ids = Array.isArray(accountIds) ? accountIds : [accountIds];
  const trades = await db.trade.findMany({
    where: { accountId: { in: ids } },
    include: { security: true },
    orderBy: { executedAt: "asc" },
  });

  const lotsMap = new Map<string, Lot[]>();
  const realizedByCurrency = new Map<string, number>();

  for (const trade of trades) {
    const secId = trade.securityId;
    if (!lotsMap.has(secId)) {
      lotsMap.set(secId, []);
    }

    const lots = lotsMap.get(secId)!;
    const qty = Math.abs(Number(trade.quantity));
    if (qty === 0) continue;

    const mult = getMultiplier(trade.security);
    const rawPrice = Number(trade.price);
    const comm = trade.commission ? Math.abs(Number(trade.commission)) : 0;
    const commPerUnit = (qty * mult) > 0 ? comm / (qty * mult) : 0;
    const cur = trade.currency || trade.security.currency || "USD";

    let tradeRealized = 0;

    if (trade.side === "BUY") {
      let remaining = qty;
      const unitCost = rawPrice + commPerUnit;

      while (remaining > 0 && lots.length > 0 && lots[0].isShort) {
        const shortLot = lots[0];
        const closeQty = Math.min(remaining, shortLot.quantity);
        const pnl = (shortLot.costPerUnit - unitCost) * closeQty * mult;
        tradeRealized += pnl;
        remaining -= closeQty;
        shortLot.quantity -= closeQty;
        if (shortLot.quantity === 0) lots.shift();
      }

      if (remaining > 0) {
        lots.push({ quantity: remaining, costPerUnit: unitCost, isShort: false });
      }
    } else {
      // SELL
      let remaining = qty;
      const unitCost = Math.max(0, rawPrice - commPerUnit);

      while (remaining > 0 && lots.length > 0 && !lots[0].isShort) {
        const longLot = lots[0];
        const closeQty = Math.min(remaining, longLot.quantity);
        const pnl = (unitCost - longLot.costPerUnit) * closeQty * mult;
        tradeRealized += pnl;
        remaining -= closeQty;
        longLot.quantity -= closeQty;
        if (longLot.quantity === 0) lots.shift();
      }

      if (remaining > 0) {
        lots.push({ quantity: remaining, costPerUnit: unitCost, isShort: true });
      }
    }

    if (tradeRealized !== 0) {
      realizedByCurrency.set(cur, (realizedByCurrency.get(cur) || 0) + tradeRealized);
    }
  }

  return realizedByCurrency;
}
