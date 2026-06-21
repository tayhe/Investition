import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const SYNC_COOLDOWN_MS = 15 * 60 * 1000;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accounts = await db.account.findMany({
    where: { userId: session.user.id, broker: "IBKR" },
  });

  if (accounts.length === 0) {
    return NextResponse.json({ hasCache: false, lastSync: null, canSync: true, waitSeconds: 0 });
  }

  const account = accounts[0];
  const lastCache = await db.flexCache.findFirst({
    where: { accountId: account.id },
    orderBy: { createdAt: "desc" },
  });

  if (!lastCache) {
    return NextResponse.json({ hasCache: false, lastSync: null, canSync: true, waitSeconds: 0 });
  }

  const elapsed = Date.now() - lastCache.createdAt.getTime();
  const canSync = elapsed >= SYNC_COOLDOWN_MS;
  const waitSeconds = canSync ? 0 : Math.ceil((SYNC_COOLDOWN_MS - elapsed) / 1000);

  return NextResponse.json({
    hasCache: true,
    lastSync: lastCache.createdAt.toISOString(),
    tradesCount: lastCache.tradesCount,
    positionsCount: lastCache.positionsCount,
    canSync,
    waitSeconds,
  });
}
