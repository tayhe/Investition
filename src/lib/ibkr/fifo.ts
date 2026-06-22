import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";

interface Lot {
  quantity: number;
  costPerUnit: number;
  isShort: boolean;
}

export async function calculateFifoCostBasis(
  accountId: string
): Promise<Map<string, { avgCost: number; quantity: number }>> {
  const trades = await db.trade.findMany({
    where: { accountId },
    include: { security: true },
    orderBy: { executedAt: "asc" },
  });

  const lotsMap = new Map<string, Lot[]>();

  for (const trade of trades) {
    const symbol = trade.security.symbol;
    if (!lotsMap.has(symbol)) {
      lotsMap.set(symbol, []);
    }
    const lots = lotsMap.get(symbol)!;
    const qty = Math.abs(Number(trade.quantity));
    const price = Number(trade.price);

    if (trade.side === "BUY") {
      let remaining = qty;
      while (remaining > 0) {
        const shortLot = lots.find((l) => l.isShort);
        if (shortLot) {
          if (shortLot.quantity <= remaining) {
            remaining -= shortLot.quantity;
            lots.splice(lots.indexOf(shortLot), 1);
          } else {
            shortLot.quantity -= remaining;
            remaining = 0;
          }
        } else {
          const existing = lots.find((l) => !l.isShort);
          if (existing) {
            const totalCost = existing.quantity * existing.costPerUnit + remaining * price;
            existing.quantity += remaining;
            existing.costPerUnit = totalCost / existing.quantity;
          } else {
            lots.push({ quantity: remaining, costPerUnit: price, isShort: false });
          }
          remaining = 0;
        }
      }
    } else {
      let remaining = qty;
      while (remaining > 0) {
        const longLot = lots.find((l) => !l.isShort);
        if (longLot) {
          if (longLot.quantity <= remaining) {
            remaining -= longLot.quantity;
            lots.splice(lots.indexOf(longLot), 1);
          } else {
            longLot.quantity -= remaining;
            remaining = 0;
          }
        } else {
          const existing = lots.find((l) => l.isShort);
          if (existing) {
            const totalCost = existing.quantity * existing.costPerUnit + remaining * price;
            existing.quantity += remaining;
            existing.costPerUnit = totalCost / existing.quantity;
          } else {
            lots.push({ quantity: remaining, costPerUnit: price, isShort: true });
          }
          remaining = 0;
        }
      }
    }
  }

  const result = new Map<string, { avgCost: number; quantity: number }>();

  for (const [symbol, lots] of lotsMap) {
    if (lots.length === 0) continue;
    const longLots = lots.filter((l) => !l.isShort);
    const shortLots = lots.filter((l) => l.isShort);

    const longQty = longLots.reduce((sum, l) => sum + l.quantity, 0);
    const shortQty = shortLots.reduce((sum, l) => sum + l.quantity, 0);
    const netQty = longQty - shortQty;

    if (netQty === 0) continue;

    if (netQty > 0 && longLots.length > 0) {
      const totalCost = longLots.reduce((sum, l) => sum + l.quantity * l.costPerUnit, 0);
      result.set(symbol, { avgCost: totalCost / longQty, quantity: netQty });
    } else if (netQty < 0 && shortLots.length > 0) {
      const totalCost = shortLots.reduce((sum, l) => sum + l.quantity * l.costPerUnit, 0);
      result.set(symbol, { avgCost: totalCost / shortQty, quantity: netQty });
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
    const symbol = pos.security.symbol;
    const fifo = fifoResult.get(symbol);

    if (fifo && fifo.avgCost > 0) {
      const currentAvg = Number(pos.avgCost);
      if (Math.abs(currentAvg - fifo.avgCost) > 0.0001) {
        await db.position.update({
          where: { id: pos.id },
          data: {
            avgCost: new Prisma.Decimal(fifo.avgCost.toFixed(6)),
          },
        });
        updated++;
      }
    }
  }

  return updated;
}
