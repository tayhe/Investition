import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { getLatestPrices } from "@/lib/prices/cache";
import { AnalyticsCharts } from "./analytics-charts";

async function getAnalyticsData() {
  const session = await auth();
  if (!session?.user?.id) return { snapshots: [], monthlyData: [], positionRanking: [] };

  const accounts = await db.account.findMany({
    where: { userId: session.user.id },
  });
  if (accounts.length === 0) return { snapshots: [], monthlyData: [], positionRanking: [] };

  const accountIds = accounts.map((a) => a.id);

  const [snapshots, positions] = await Promise.all([
    db.snapshot.findMany({
      where: { accountId: { in: accountIds } },
      orderBy: { date: "asc" },
    }),
    db.position.findMany({
      where: { accountId: { in: accountIds }, quantity: { not: 0 } },
      include: { security: true },
    }),
  ]);

  const securityIds = [...new Set(positions.map((p) => p.securityId))];
  const priceMap = await getLatestPrices(securityIds);

  // Monthly data
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

  // Position P&L ranking
  const positionPnl = positions.map((pos) => {
    const price = priceMap.get(pos.securityId) ?? Number(pos.avgCost);
    const mult = pos.security.type === "OPTION" ? 100 : 1;
    const qty = Number(pos.quantity);
    const costBasis = qty * mult * Number(pos.avgCost);
    const marketValue = qty * mult * price;
    const pnl = marketValue - costBasis;
    return {
      symbol: pos.security.symbol,
      name: pos.security.name,
      pnl,
      costBasis: Math.abs(costBasis),
    };
  });

  const totalPnl = positionPnl.reduce((sum, p) => sum + p.pnl, 0);
  const positionRanking = positionPnl
    .sort((a, b) => b.pnl - a.pnl)
    .map((p) => ({
      symbol: p.symbol,
      name: p.name,
      pnl: p.pnl,
      contribution: totalPnl !== 0 ? (p.pnl / Math.abs(totalPnl)) * 100 : 0,
    }));

  return {
    snapshots: snapshots.map((s) => ({
      date: s.date.toISOString().split("T")[0],
      value: Number(s.totalValue),
      maxDrawdown: s.maxDrawdown ? Number(s.maxDrawdown) : null,
    })),
    monthlyData,
    positionRanking,
  };
}

export default async function AnalyticsPage() {
  const { snapshots, monthlyData, positionRanking } = await getAnalyticsData();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">复盘分析</h1>
        <p className="text-muted mt-1">深入分析你的投资表现</p>
      </div>
      <AnalyticsCharts
        snapshots={snapshots}
        monthlyData={monthlyData}
        positionRanking={positionRanking}
      />
    </div>
  );
}
