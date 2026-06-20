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
        const marketValue = Number(pos.quantity) * currentPrice;
        const costBasis = Number(pos.costBasis);
        const pnl = marketValue - costBasis;
        const pnlPercent = costBasis > 0 ? (pnl / costBasis) * 100 : 0;

        return {
          id: pos.id,
          symbol: pos.security.symbol,
          name: pos.security.name,
          market: pos.security.market,
          quantity: Number(pos.quantity),
          avgCost: Number(pos.avgCost),
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
