import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { syncAccountData, syncFromCache, createDailySnapshot } from "@/lib/ibkr/sync";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { accountId, mode, force } = body;

    if (!accountId) {
      return NextResponse.json({ error: "accountId is required" }, { status: 400 });
    }

    let result;
    if (mode === "reprocess") {
      result = await syncFromCache(accountId);
    } else {
      result = await syncAccountData(accountId, force === true);
    }

    await createDailySnapshot(accountId, new Date());

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Sync error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 }
    );
  }
}
