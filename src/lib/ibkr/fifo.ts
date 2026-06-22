import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";

interface Lot {
  quantity: number;
  costPerUnit: number;
  totalCost: number;
}

export async function calculateFifoCostBasis(
  accountId: string
): Promise<Map<string, { avgCost: number; totalCost: number; quantity: number }>> {
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
    const qty = Number(trade.quantity);
    const price = Number(trade.price);
    const commission = trade.commission ? Number(trade.commission) : 0;

    if (trade.side === "BUY") {
      const totalCost = qty * price + commission;
      lots.push({
        quantity: qty,
        costPerUnit: totalCost / qty,
        totalCost,
      });
    } else if (trade.side === "SELL") {
      let remaining = qty;
      const sellProceeds = qty * price - commission;

      while (remaining > 0 && lots.length > 0) {
        const lot = lots[0];
        if (lot.quantity <= remaining) {
          remaining -= lot.quantity;
          lots.shift();
        } else {
          lot.quantity -= remaining;
          lot.totalCost = lot.quantity * lot.costPerUnit;
          remaining = 0;
        }
      }
    }
  }

  const result = new Map<string, { avgCost: number; totalCost: number; quantity: number }>();

  for (const [symbol, lots] of lotsMap) {
    if (lots.length === 0) continue;
    const totalQty = lots.reduce((sum, l) => sum + l.quantity, 0);
    const totalCost = lots.reduce((sum, l) => sum + l.totalCost, 0);
    if (totalQty > 0) {
      result.set(symbol, {
        avgCost: totalCost / totalQty,
        totalCost,
        quantity: totalQty,
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
    const symbol = pos.security.symbol;
    const fifo = fifoResult.get(symbol);

    if (fifo && fifo.avgCost > 0) {
      const currentAvgCost = Number(pos.avgCost);
      if (Math.abs(currentAvgCost - fifo.avgCost) > 0.001) {
        await db.position.update({
          where: { id: pos.id },
          data: {
            avgCost: new Prisma.Decimal(fifo.avgCost.toFixed(6)),
            costBasis: new Prisma.Decimal(fifo.totalCost.toFixed(4)),
          },
        });
        updated++;
      }
    }
  }

  return updated;
}
