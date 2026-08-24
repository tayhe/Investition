import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId");

    if (!accountId) {
      return NextResponse.json(
        { error: "accountId is required" },
        { status: 400 }
      );
    }

    const positions = await db.position.findMany({
      where: { accountId },
      include: {
        security: true,
      },
      orderBy: { updatedAt: "desc" },
    });

    const enriched = await Promise.all(
      positions.map(async (pos) => {
        const latestPrice = await db.price.findFirst({
          where: { securityId: pos.securityId },
          orderBy: { date: "desc" },
        });

        const currentPrice = latestPrice ? Number(latestPrice.close) : Number(pos.avgCost);
        const multiplier = pos.security.type === "OPTION" ? 100 : Number(pos.security.multiplier || 1);
        const qty = Number(pos.quantity);
        const avgCost = Number(pos.avgCost);
        const marketValue = qty * multiplier * currentPrice;
        const rawCostBasis = Number(pos.costBasis);
        const costBasis = rawCostBasis > 0 ? rawCostBasis : Math.abs(qty * multiplier * avgCost);
        // Unified PnL formula: for short positions, costBasis is treated as negative (sold proceeds)
        const signedCostBasis = qty >= 0 ? costBasis : -costBasis;
        const pnl = marketValue - signedCostBasis;
        const pnlPercent = costBasis > 0 ? (pnl / costBasis) * 100 : 0;

        return {
          id: pos.id,
          symbol: pos.security.symbol,
          name: pos.security.name,
          market: pos.security.market,
          quantity: qty,
          avgCost,
          currentPrice,
          marketValue,
          pnl,
          pnlPercent,
          currency: pos.currency,
        };
      })
    );

    return NextResponse.json(enriched);
  } catch (error) {
    console.error("Positions error:", error);
    return NextResponse.json(
      { error: "Failed to fetch positions" },
      { status: 500 }
    );
  }
}
