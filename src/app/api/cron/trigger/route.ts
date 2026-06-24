import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { fetchPrices } from "@/lib/prices/fetcher";
import { fetchExchangeRates } from "@/lib/prices/exchange-rate";
import { createDailySnapshot } from "@/lib/ibkr/sync";
import { getToday } from "@/lib/utils";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { task } = await request.json();

    switch (task) {
      case "prices": {
        const result = await fetchPrices();
        return NextResponse.json({
          message: `价格更新完成：${result.updated} 只更新，${result.skipped} 只跳过`,
        });
      }
      case "rates": {
        const result = await fetchExchangeRates();
        return NextResponse.json({
          message: `汇率更新完成：${result.updated} 个更新`,
        });
      }
      case "snapshot": {
        const accounts = await db.account.findMany({
          where: { userId: session.user.id },
          select: { id: true },
        });
        const today = getToday();
        for (const account of accounts) {
          await createDailySnapshot(account.id, today);
        }
        return NextResponse.json({
          message: `快照生成完成：${accounts.length} 个账户`,
        });
      }
      default:
        return NextResponse.json({ error: "未知任务" }, { status: 400 });
    }
  } catch (error) {
    console.error("Cron trigger error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "执行失败" },
      { status: 500 }
    );
  }
}
