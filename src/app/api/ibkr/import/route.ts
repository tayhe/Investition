import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseFlexXml } from "@/lib/ibkr/flex";
import { upsertTrades, upsertPositions, createDailySnapshot } from "@/lib/ibkr/sync";
import { getToday } from "@/lib/utils";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "请上传 XML 文件" }, { status: 400 });
    }

    const xml = await file.text();

    if (!xml.includes("<FlexStatement") && !xml.includes("<Trade") && !xml.includes("<OpenPosition")) {
      return NextResponse.json({ error: "不是有效的 IBKR Flex XML 文件" }, { status: 400 });
    }

    const report = parseFlexXml(xml);

    const account = await db.account.findFirst({
      where: { userId: session.user.id, broker: "IBKR" },
    });

    if (!account) {
      return NextResponse.json({ error: "未找到 IBKR 账户，请先配置" }, { status: 400 });
    }

    await db.flexCache.upsert({
      where: {
        accountId_year: { accountId: account.id, year: report.year },
      },
      update: {
        xml,
        tradesCount: report.trades.length,
        positionsCount: report.positions.length,
        createdAt: new Date(),
      },
      create: {
        accountId: account.id,
        year: report.year,
        xml,
        tradesCount: report.trades.length,
        positionsCount: report.positions.length,
      },
    });

    const tradesCount = await upsertTrades(account.id, report);
    await upsertPositions(account.id, report);
    await createDailySnapshot(account.id, getToday());

    return NextResponse.json({
      success: true,
      trades: tradesCount,
      positions: report.positions.length,
    });
  } catch (error) {
    console.error("XML import error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "导入失败" },
      { status: 500 }
    );
  }
}
