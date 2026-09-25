import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { getToday } from "@/lib/utils";

// GET /api/trades?symbol=AAPL&year=2026
export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get("symbol");
    const currentYear = getToday().getUTCFullYear();
    const year = parseInt(searchParams.get("year") ?? String(currentYear), 10);

    if (!symbol) {
      return NextResponse.json({ error: "symbol is required" }, { status: 400 });
    }

    const accounts = await db.account.findMany({
      where: { userId: session.user.id },
      select: { id: true },
    });

    if (accounts.length === 0) {
      return NextResponse.json({ data: [] });
    }

    const accountIds = accounts.map((a) => a.id);

    const trades = await db.trade.findMany({
      where: {
        accountId: { in: accountIds },
        security: { symbol },
        executedAt: {
          gte: new Date(`${year}-01-01T00:00:00Z`),
          lt: new Date(`${year + 1}-01-01T00:00:00Z`),
        },
      },
      include: {
        security: {
          select: {
            name: true,
            currency: true,
            type: true,
            multiplier: true,
          },
        },
        account: {
          select: {
            name: true,
          },
        },
      },
      orderBy: { executedAt: "desc" },
    });

    const data = trades.map((t) => ({
      id: t.id,
      date: t.executedAt.toISOString().split("T")[0],
      time: t.executedAt.toISOString().split("T")[1].substring(0, 5),
      side: t.side,
      quantity: Math.abs(Number(t.quantity)),
      price: Number(t.price),
      amount: Math.abs(Number(t.amount)),
      commission: t.commission ? Number(t.commission) : 0,
      currency: t.currency,
      accountName: t.account.name,
      securityType: t.security.type,
      multiplier: Number(t.security.multiplier || 1),
    }));

    return NextResponse.json({ data });
  } catch (error) {
    console.error("Trade fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch trades" }, { status: 500 });
  }
}
