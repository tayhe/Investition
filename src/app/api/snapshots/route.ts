import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId");
    const days = parseInt(searchParams.get("days") || "365");

    if (!accountId) {
      return NextResponse.json(
        { error: "accountId is required" },
        { status: 400 }
      );
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const snapshots = await db.snapshot.findMany({
      where: {
        accountId,
        date: { gte: startDate },
      },
      orderBy: { date: "asc" },
    });

    return NextResponse.json(
      snapshots.map((s) => ({
        date: s.date.toISOString().split("T")[0],
        value: Number(s.totalValue),
        dailyPnl: s.dailyPnl ? Number(s.dailyPnl) : null,
        dailyReturn: s.dailyReturn ? Number(s.dailyReturn) : null,
        maxDrawdown: s.maxDrawdown ? Number(s.maxDrawdown) : null,
        currency: s.currency,
      }))
    );
  } catch (error) {
    console.error("Snapshots error:", error);
    return NextResponse.json(
      { error: "Failed to fetch snapshots" },
      { status: 500 }
    );
  }
}
