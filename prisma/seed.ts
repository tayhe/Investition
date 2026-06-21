import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding database...");

  const passwordHash = await bcrypt.hash("demo1234", 10);

  const user = await db.user.upsert({
    where: { email: "tayhe@investition.app" },
    update: {},
    create: {
      email: "tayhe@investition.app",
      name: "tayhe",
      password: passwordHash,
    },
  });
  console.log(`User: ${user.email}`);

  const account = await db.account.upsert({
    where: { id: "demo-account" },
    update: {},
    create: {
      id: "demo-account",
      userId: user.id,
      name: "模拟账户",
      broker: "MANUAL",
      currency: "USD",
    },
  });
  console.log(`Account: ${account.name}`);

  const securities = [
    { symbol: "AAPL", name: "Apple Inc.", exchange: "NASDAQ", market: "US" as const, currency: "USD" },
    { symbol: "MSFT", name: "Microsoft Corp.", exchange: "NASDAQ", market: "US" as const, currency: "USD" },
    { symbol: "GOOGL", name: "Alphabet Inc.", exchange: "NASDAQ", market: "US" as const, currency: "USD" },
    { symbol: "0700.HK", name: "腾讯控股", exchange: "SEHK", market: "HK" as const, currency: "HKD" },
    { symbol: "9988.HK", name: "阿里巴巴", exchange: "SEHK", market: "HK" as const, currency: "HKD" },
    { symbol: "600519.SS", name: "贵州茅台", exchange: "SSE", market: "A" as const, currency: "CNY" },
    { symbol: "000858.SZ", name: "五粮液", exchange: "SZSE", market: "A" as const, currency: "CNY" },
  ];

  const createdSecurities = [];
  for (const sec of securities) {
    const s = await db.security.upsert({
      where: { symbol_exchange: { symbol: sec.symbol, exchange: sec.exchange! } },
      update: {},
      create: sec,
    });
    createdSecurities.push(s);
  }
  console.log(`Securities: ${createdSecurities.length}`);

  const positions = [
    { symbol: "AAPL", quantity: 100, avgCost: 150, currency: "USD" },
    { symbol: "MSFT", quantity: 50, avgCost: 320, currency: "USD" },
    { symbol: "0700.HK", quantity: 200, avgCost: 320, currency: "HKD" },
    { symbol: "9988.HK", quantity: 300, avgCost: 85, currency: "HKD" },
    { symbol: "600519.SS", quantity: 10, avgCost: 1680, currency: "CNY" },
    { symbol: "000858.SZ", quantity: 100, avgCost: 155, currency: "CNY" },
  ];

  for (const pos of positions) {
    const sec = createdSecurities.find((s) => s.symbol === pos.symbol)!;
    await db.position.upsert({
      where: { accountId_securityId: { accountId: account.id, securityId: sec.id } },
      update: {},
      create: {
        accountId: account.id,
        securityId: sec.id,
        quantity: pos.quantity,
        avgCost: pos.avgCost,
        costBasis: pos.quantity * pos.avgCost,
        currency: pos.currency,
      },
    });
  }
  console.log(`Positions: ${positions.length}`);

  const now = new Date();
  const priceData: { symbol: string; close: number }[] = [
    { symbol: "AAPL", close: 185 },
    { symbol: "MSFT", close: 380 },
    { symbol: "GOOGL", close: 140 },
    { symbol: "0700.HK", close: 380 },
    { symbol: "9988.HK", close: 78 },
    { symbol: "600519.SS", close: 1750 },
    { symbol: "000858.SZ", close: 148 },
  ];

  for (const p of priceData) {
    const sec = createdSecurities.find((s) => s.symbol === p.symbol)!;
    await db.price.upsert({
      where: { securityId_date: { securityId: sec.id, date: now } },
      update: { close: p.close },
      create: {
        securityId: sec.id,
        date: now,
        close: p.close,
        currency: sec.currency,
      },
    });
  }
  console.log(`Prices: ${priceData.length}`);

  const trades = [
    { symbol: "AAPL", side: "BUY" as const, quantity: 50, price: 175, currency: "USD", daysAgo: 60 },
    { symbol: "AAPL", side: "BUY" as const, quantity: 50, price: 180, currency: "USD", daysAgo: 30 },
    { symbol: "MSFT", side: "BUY" as const, quantity: 50, price: 320, currency: "USD", daysAgo: 45 },
    { symbol: "0700.HK", side: "BUY" as const, quantity: 100, price: 310, currency: "HKD", daysAgo: 50 },
    { symbol: "0700.HK", side: "BUY" as const, quantity: 100, price: 330, currency: "HKD", daysAgo: 20 },
    { symbol: "9988.HK", side: "BUY" as const, quantity: 300, price: 85, currency: "HKD", daysAgo: 40 },
    { symbol: "600519.SS", side: "BUY" as const, quantity: 10, price: 1680, currency: "CNY", daysAgo: 35 },
    { symbol: "000858.SZ", side: "BUY" as const, quantity: 100, price: 155, currency: "CNY", daysAgo: 25 },
  ];

  for (const t of trades) {
    const sec = createdSecurities.find((s) => s.symbol === t.symbol)!;
    const tradeDate = new Date(now);
    tradeDate.setDate(tradeDate.getDate() - t.daysAgo);
    await db.trade.create({
      data: {
        accountId: account.id,
        securityId: sec.id,
        side: t.side,
        quantity: t.quantity,
        price: t.price,
        amount: t.quantity * t.price,
        commission: 0,
        currency: t.currency,
        executedAt: tradeDate,
      },
    });
  }
  console.log(`Trades: ${trades.length}`);

  const baseValues = [95000, 98000, 96000, 102000, 100000, 105000, 103000, 108000, 106000, 112000, 115000, 118000];
  let peak = baseValues[0];
  for (let i = 0; i < baseValues.length; i++) {
    const snapshotDate = new Date(now);
    snapshotDate.setDate(snapshotDate.getDate() - (baseValues.length - 1 - i) * 30);
    const totalValue = baseValues[i];
    if (totalValue > peak) peak = totalValue;
    const drawdown = ((totalValue - peak) / peak) * 100;
    const dailyReturn = i > 0 ? ((totalValue - baseValues[i - 1]) / baseValues[i - 1]) * 100 : 0;
    const cumulativeReturn = ((totalValue - baseValues[0]) / baseValues[0]) * 100;

    await db.snapshot.create({
      data: {
        accountId: account.id,
        date: snapshotDate,
        totalValue,
        cashBalance: 0,
        positionsValue: totalValue,
        dailyPnl: i > 0 ? totalValue - baseValues[i - 1] : 0,
        dailyReturn,
        cumulativeReturn,
        maxDrawdown: drawdown,
        currency: "USD",
      },
    });
  }
  console.log(`Snapshots: ${baseValues.length}`);

  console.log("Seeding complete!");
  console.log("Login: tayhe@investition.app / demo1234");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
