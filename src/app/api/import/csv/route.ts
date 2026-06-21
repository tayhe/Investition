import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseCsv } from "@/lib/csv/parser";
import { Prisma } from "@/generated/prisma/client";

const { Decimal } = Prisma;

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const accountId = formData.get("accountId") as string | null;

    if (!file) {
      return NextResponse.json({ error: "请上传 CSV 文件" }, { status: 400 });
    }

    if (!accountId) {
      return NextResponse.json({ error: "请选择账户" }, { status: 400 });
    }

    const account = await db.account.findFirst({
      where: { id: accountId, userId: session.user.id },
    });

    if (!account) {
      return NextResponse.json({ error: "账户不存在" }, { status: 404 });
    }

    const content = await file.text();
    const result = parseCsv(content);

    if (result.errors.length > 0 && result.trades.length === 0 && result.positions.length === 0) {
      return NextResponse.json({ errors: result.errors }, { status: 400 });
    }

    let tradesCount = 0;
    let positionsCount = 0;

    for (const trade of result.trades) {
      const exchange = guessExchange(trade.symbol);
      const market = guessMarket(trade.symbol, exchange);

      let security = await db.security.findUnique({
        where: { symbol_exchange: { symbol: trade.symbol, exchange } },
      });

      if (!security) {
        security = await db.security.create({
          data: {
            symbol: trade.symbol,
            name: trade.description || trade.symbol,
            exchange,
            market,
            currency: trade.currency,
            type: "STOCK",
          },
        });
      }

      const tradeDate = parseDate(trade.date);

      await db.trade.create({
        data: {
          accountId: account.id,
          securityId: security.id,
          side: trade.side,
          quantity: new Decimal(trade.quantity.toString()),
          price: new Decimal(trade.price.toString()),
          amount: new Decimal(trade.amount.toString()),
          commission: trade.commission ? new Decimal(trade.commission.toString()) : null,
          currency: trade.currency,
          executedAt: tradeDate,
        },
      });
      tradesCount++;
    }

    for (const pos of result.positions) {
      const exchange = guessExchange(pos.symbol);
      const market = guessMarket(pos.symbol, exchange);

      let security = await db.security.findUnique({
        where: { symbol_exchange: { symbol: pos.symbol, exchange } },
      });

      if (!security) {
        security = await db.security.create({
          data: {
            symbol: pos.symbol,
            name: pos.description || pos.symbol,
            exchange,
            market,
            currency: pos.currency,
            type: "STOCK",
          },
        });
      }

      await db.position.upsert({
        where: {
          accountId_securityId: { accountId: account.id, securityId: security.id },
        },
        update: {
          quantity: new Decimal(pos.quantity.toString()),
          avgCost: new Decimal(pos.price.toString()),
          costBasis: new Decimal((pos.price * Math.abs(pos.quantity)).toString()),
          updatedAt: new Date(),
        },
        create: {
          accountId: account.id,
          securityId: security.id,
          quantity: new Decimal(pos.quantity.toString()),
          avgCost: new Decimal(pos.price.toString()),
          costBasis: new Decimal((pos.price * Math.abs(pos.quantity)).toString()),
          currency: pos.currency,
        },
      });
      positionsCount++;
    }

    return NextResponse.json({
      success: true,
      format: result.format,
      trades: tradesCount,
      positions: positionsCount,
      errors: result.errors,
    });
  } catch (error) {
    console.error("CSV import error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "导入失败" },
      { status: 500 }
    );
  }
}

function guessExchange(symbol: string): string {
  if (symbol.endsWith(".HK")) return "SEHK";
  if (symbol.endsWith(".SS")) return "SSE";
  if (symbol.endsWith(".SZ")) return "SZSE";
  if (symbol.endsWith(".T")) return "TSE";
  if (symbol.endsWith(".L")) return "LSE";
  if (symbol.endsWith(".ST")) return "SFB";
  return "NASDAQ";
}

function guessMarket(symbol: string, exchange: string): "US" | "HK" | "A" | "FUND" {
  if (["SEHK"].includes(exchange)) return "HK";
  if (["SSE", "SZSE"].includes(exchange)) return "A";
  return "US";
}

function parseDate(dateStr: string): Date {
  if (!dateStr) return new Date();
  const cleaned = dateStr.replace(/[^0-9\-\/]/g, " ").trim();
  const d = new Date(cleaned);
  return isNaN(d.getTime()) ? new Date() : d;
}
