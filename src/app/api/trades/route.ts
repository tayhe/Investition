import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId");
    const market = searchParams.get("market");
    const side = searchParams.get("side");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    if (!accountId) {
      return NextResponse.json(
        { error: "accountId is required" },
        { status: 400 }
      );
    }

    const where: Record<string, unknown> = { accountId };
    if (market) where.security = { market };
    if (side) where.side = side;

    const [trades, total] = await Promise.all([
      db.trade.findMany({
        where,
        include: { security: true },
        orderBy: { executedAt: "desc" },
        take: limit,
        skip: offset,
      }),
      db.trade.count({ where }),
    ]);

    return NextResponse.json({
      trades: trades.map((t) => ({
        id: t.id,
        date: t.executedAt.toISOString().split("T")[0],
        symbol: t.security.symbol,
        name: t.security.name,
        market: t.security.market,
        side: t.side,
        quantity: Number(t.quantity),
        price: Number(t.price),
        amount: Number(t.amount),
        commission: t.commission ? Number(t.commission) : 0,
        currency: t.currency,
      })),
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error("Trades error:", error);
    return NextResponse.json(
      { error: "Failed to fetch trades" },
      { status: 500 }
    );
  }
}
