import { NextRequest, NextResponse } from "next/server";
import { syncAccountData, createDailySnapshot } from "@/lib/ibkr/sync";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { accountId } = body;

    if (!accountId) {
      return NextResponse.json(
        { error: "accountId is required" },
        { status: 400 }
      );
    }

    const result = await syncAccountData(accountId);

    await createDailySnapshot(accountId, new Date());

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("Sync error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 }
    );
  }
}
