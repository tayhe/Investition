import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";

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
      const mult = trade.security.type === "OPTION" ? 100 : Number(trade.security.multiplier || 1);
      securityInfoMap.set(secId, { symbol: trade.security.symbol, multiplier: mult });
    }

    const lots = lotsMap.get(secId)!;
    const qty = Math.abs(Number(trade.quantity));
    if (qty === 0) continue;

    const rawPrice = Number(trade.price);
    const comm = trade.commission ? Math.abs(Number(trade.commission)) : 0;
    const commPerUnit = qty > 0 ? comm / qty : 0;

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
      const mult = pos.security.type === "OPTION" ? 100 : Number(pos.security.multiplier || 1);
      const newCostBasis = Math.abs(Number(pos.quantity) * mult * fifo.avgCost);

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
