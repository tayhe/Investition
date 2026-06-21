import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accounts = await db.account.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(
    accounts.map((a) => ({
      id: a.id,
      name: a.name,
      broker: a.broker,
      currency: a.currency,
      hasIbkrConfig: !!(a.ibkrFlexToken && a.ibkrFlexQueryId),
      createdAt: a.createdAt.toISOString(),
    }))
  );
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { name, broker, currency } = body;

  if (!name || !currency) {
    return NextResponse.json({ error: "名称和币种不能为空" }, { status: 400 });
  }

  const account = await db.account.create({
    data: {
      userId: session.user.id,
      name,
      broker: broker || "MANUAL",
      currency,
    },
  });

  return NextResponse.json({
    id: account.id,
    name: account.name,
    broker: account.broker,
    currency: account.currency,
  });
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get("id");

  if (!accountId) {
    return NextResponse.json({ error: "accountId is required" }, { status: 400 });
  }

  const account = await db.account.findFirst({
    where: { id: accountId, userId: session.user.id },
  });

  if (!account) {
    return NextResponse.json({ error: "账户不存在" }, { status: 404 });
  }

  await db.snapshot.deleteMany({ where: { accountId } });
  await db.trade.deleteMany({ where: { accountId } });
  await db.position.deleteMany({ where: { accountId } });
  await db.flexCache.deleteMany({ where: { accountId } });
  await db.account.delete({ where: { id: accountId } });

  return NextResponse.json({ success: true });
}
