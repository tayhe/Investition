import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { getLatestPrices } from "@/lib/prices/cache";
import { AnalyticsCharts } from "./analytics-charts";

async function getLatestRates(): Promise<Map<string, number>> {
  const rates = await db.exchangeRate.findMany({ orderBy: { date: "desc" } });
  const map = new Map<string, number>();
  for (const r of rates) {
    const key = `${r.baseCurrency}_${r.quoteCurrency}`;
    if (!map.has(key)) map.set(key, Number(r.rate));
  }
  return map;
}

function convertToUsd(amount: number, currency: string, rates: Map<string, number>): number {
  if (currency === "USD") return amount;
  const direct = rates.get(`USD_${currency}`);
  if (direct) return amount / direct;
  const inverse = rates.get(`${currency}_USD`);
  if (inverse) return amount * inverse;
  return amount;
}

async function getAnalyticsData() {
  const session = await auth();
  if (!session?.user?.id) {
    return { snapshots: [], dailyPositions: {} as Record<string, Array<{ symbol: string; name: string; quantity: number; marketValue: number; marketPrice: number; currency: string }>>, monthlyData: [], positionRanking: [] };
  }

  const accounts = await db.account.findMany({
    where: { userId: session.user.id },
  });
  if (accounts.length === 0) {
    return { snapshots: [], dailyPositions: {} as Record<string, Array<{ symbol: string; name: string; quantity: number; marketValue: number; marketPrice: number; currency: string }>>, monthlyData: [], positionRanking: [] };
  }

  const accountIds = accounts.map((a) => a.id);

  const [snapshots, positions, dailyPositions] = await Promise.all([
    db.snapshot.findMany({
      where: { accountId: { in: accountIds } },
      orderBy: { date: "asc" },
    }),
    db.position.findMany({
      where: { accountId: { in: accountIds }, quantity: { not: 0 } },
      include: { security: true },
    }),
    db.dailyPosition.findMany({
      where: { accountId: { in: accountIds } },
      include: { security: true },
      orderBy: { date: "asc" },
    }),
  ]);

  const securityIds = [...new Set(positions.map((p) => p.securityId))];
  const [priceMap, rates] = await Promise.all([
    getLatestPrices(securityIds),
    getLatestRates(),
  ]);

  // Current position P&L ranking (USD)
  const positionRanking = positions
    .map((pos) => {
      const price = priceMap.get(pos.securityId) ?? Number(pos.avgCost);
      const mult = pos.security.type === "OPTION" ? 100 : 1;
      const qty = Number(pos.quantity);
      const costBasis = qty * mult * Number(pos.avgCost);
      const marketValue = qty * mult * price;
      const pnl = marketValue - costBasis;
      const usdPnl = convertToUsd(pnl, pos.currency, rates);
      return {
        symbol: pos.security.symbol,
        name: pos.security.name,
        pnl: usdPnl,
        contribution: 0,
      };
    })
    .sort((a, b) => b.pnl - a.pnl);

  const totalPnl = positionRanking.reduce((sum, p) => sum + p.pnl, 0);
  for (const p of positionRanking) {
    p.contribution = totalPnl !== 0 ? (p.pnl / Math.abs(totalPnl)) * 100 : 0;
  }

  // Monthly data from snapshots
  const monthlyMap = new Map<string, { startValue: number; endValue: number; pnl: number }>();
  for (const s of snapshots) {
    const month = s.date.toISOString().slice(0, 7);
    const val = Number(s.totalValue);
    const existing = monthlyMap.get(month) || { startValue: val, endValue: val, pnl: 0 };
    existing.endValue = val;
    existing.pnl += s.dailyPnl ? Number(s.dailyPnl) : 0;
    monthlyMap.set(month, existing);
  }
  const monthlyData = Array.from(monthlyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, data]) => ({
      month,
      label: month.slice(0, 4) + "年" + month.slice(5) + "月",
      shortLabel: month.slice(5) + "月",
      startValue: data.startValue,
      endValue: data.endValue,
      pnl: data.pnl,
      returnRate: data.startValue > 0 ? ((data.endValue - data.startValue) / data.startValue) * 100 : 0,
    }));

  // Daily position data grouped by date
  const dailyPositionMap = new Map<string, typeof dailyPositions>();
  for (const dp of dailyPositions) {
    const dateKey = dp.date.toISOString().slice(0, 10);
    if (!dailyPositionMap.has(dateKey)) dailyPositionMap.set(dateKey, []);
    dailyPositionMap.get(dateKey)!.push(dp);
  }

  return {
    snapshots: snapshots.map((s) => ({
      date: s.date.toISOString().split("T")[0],
      value: Number(s.totalValue),
      dailyReturn: s.dailyReturn ? Number(s.dailyReturn) : null,
      dailyPnl: s.dailyPnl ? Number(s.dailyPnl) : null,
      maxDrawdown: s.maxDrawdown ? Number(s.maxDrawdown) : null,
    })),
    dailyPositions: Object.fromEntries(
      Array.from(dailyPositionMap.entries()).map(([date, dps]) => [
        date,
        dps.map((dp) => ({
          symbol: dp.security.symbol,
          name: dp.security.name,
          quantity: Number(dp.quantity),
          marketValue: Number(dp.marketValue),
          marketPrice: Number(dp.marketPrice),
          currency: dp.currency,
        })),
      ])
    ) as Record<string, Array<{ symbol: string; name: string; quantity: number; marketValue: number; marketPrice: number; currency: string }>>,
    monthlyData,
    positionRanking,
  };
}

export default async function AnalyticsPage() {
  const { snapshots, dailyPositions, monthlyData, positionRanking } = await getAnalyticsData();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">复盘分析</h1>
        <p className="text-muted mt-1">深入分析你的投资表现</p>
      </div>
      <AnalyticsCharts
        snapshots={snapshots}
        dailyPositions={dailyPositions}
        monthlyData={monthlyData}
        positionRanking={positionRanking}
      />
    </div>
  );
}
