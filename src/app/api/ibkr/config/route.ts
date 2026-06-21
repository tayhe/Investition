import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const account = await db.account.findFirst({
    where: { userId: session.user.id, broker: "IBKR" },
  });

  return NextResponse.json({
    configured: !!(account?.ibkrFlexToken && account?.ibkrFlexQueryId),
    accountId: account?.id || null,
    hasToken: !!account?.ibkrFlexToken,
    hasQueryId: !!account?.ibkrFlexQueryId,
  });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { token, queryId } = body;

  if (!token || !queryId) {
    return NextResponse.json(
      { error: "Token 和 Query ID 不能为空" },
      { status: 400 }
    );
  }

  let account = await db.account.findFirst({
    where: { userId: session.user.id, broker: "IBKR" },
  });

  if (account) {
    account = await db.account.update({
      where: { id: account.id },
      data: { ibkrFlexToken: token, ibkrFlexQueryId: queryId },
    });
  } else {
    account = await db.account.create({
      data: {
        userId: session.user.id,
        name: "IBKR 账户",
        broker: "IBKR",
        currency: "USD",
        ibkrFlexToken: token,
        ibkrFlexQueryId: queryId,
      },
    });
  }

  return NextResponse.json({
    success: true,
    accountId: account.id,
  });
}
