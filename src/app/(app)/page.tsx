import { StatCard } from "@/components/stat-card";
import { EquityCurve } from "@/components/equity-curve";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { formatCurrency } from "@/lib/utils";
import { getLatestPrices } from "@/lib/prices/cache";

async function getLatestRates(): Promise<Map<string, number>> {
  const rates = await db.exchangeRate.findMany({
    orderBy: { date: "desc" },
  });
  const map = new Map<string, number>();
  for (const r of rates) {
    const key = `${r.baseCurrency}_${r.quoteCurrency}`;
    if (!map.has(key)) map.set(key, Number(r.rate));
  }
  return map;
}

function convertCurrency(amount: number, from: string, to: string, rates: Map<string, number>): number {
  if (from === to) return amount;
  const direct = rates.get(`${from}_${to}`);
  if (direct) return amount * direct;
  const inverse = rates.get(`${to}_${from}`);
  if (inverse && inverse > 0) return amount / inverse;
  const fromToUsd = from === "USD" ? 1 : (rates.get(`${from}_USD`) ?? (rates.get(`USD_${from}`) ? 1 / rates.get(`USD_${from}`)! : null));
  const toToUsd = to === "USD" ? 1 : (rates.get(`${to}_USD`) ?? (rates.get(`USD_${to}`) ? 1 / rates.get(`USD_${to}`)! : null));
  if (fromToUsd !== null && toToUsd !== null && toToUsd > 0) {
    return (amount * fromToUsd) / toToUsd;
  }
  return amount;
}

async function getDashboardData() {
  const session = await auth();
  if (!session?.user?.id) return { snapshots: [], stats: null };

  const accounts = await db.account.findMany({
    where: { userId: session.user.id },
  });
  if (accounts.length === 0) return { snapshots: [], stats: null };

  const accountIds = accounts.map((a) => a.id);
  const baseCurrency = accounts[0].currency || "USD";

  const now = new Date();
  const yearStart = new Date(Date.UTC(now.getFullYear(), 0, 1));

  const [positions, snapshots, rates] = await Promise.all([
    db.position.findMany({
      where: { accountId: { in: accountIds }, quantity: { not: 0 } },
      include: { security: true },
    }),
    db.snapshot.findMany({
      where: { accountId: { in: accountIds }, date: { gte: yearStart } },
      orderBy: { date: "asc" },
    }),
    getLatestRates(),
  ]);

  const securityIds = [...new Set(positions.map((p) => p.securityId))];
  const priceMap = await getLatestPrices(securityIds);

  const cashBalance = 0;

  const positionsValue = positions.reduce((sum, pos) => {
    const price = priceMap.get(pos.securityId) ?? Number(pos.avgCost);
    const mult = pos.security.type === "OPTION" ? 100 : Number(pos.security.multiplier || 1);
    const posVal = Number(pos.quantity) * mult * price;
    const convertedVal = convertCurrency(posVal, pos.currency, baseCurrency, rates);
    return sum + convertedVal;
  }, 0);

  const totalValue = positionsValue + cashBalance;

  const totalPnl = positions.reduce((sum, pos) => {
    const price = priceMap.get(pos.securityId) ?? Number(pos.avgCost);
    const mult = pos.security.type === "OPTION" ? 100 : Number(pos.security.multiplier || 1);
    const qty = Number(pos.quantity);
    const cost = qty * mult * Number(pos.avgCost);
    const mv = qty * mult * price;
    const pnl = mv - cost;
    const convertedPnl = convertCurrency(pnl, pos.currency, baseCurrency, rates);
    return sum + convertedPnl;
  }, 0);

  // Group snapshots by date across accounts, summing values converted to base currency
  const dateSnapshotMap = new Map<string, number>();
  const accountCurrencyMap = new Map(accounts.map((a) => [a.id, a.currency]));

  for (const s of snapshots) {
    const dateKey = s.date.toISOString().split("T")[0];
    const accCurrency = s.currency || accountCurrencyMap.get(s.accountId) || baseCurrency;
    const val = convertCurrency(Number(s.totalValue), accCurrency, baseCurrency, rates);
    dateSnapshotMap.set(dateKey, (dateSnapshotMap.get(dateKey) || 0) + val);
  }

  // Monthly aggregated curve data (take the latest day in each month)
  const monthlySnapshots = new Map<string, number>();
  const sortedDates = Array.from(dateSnapshotMap.keys()).sort();
  for (const dateStr of sortedDates) {
    const month = dateStr.slice(0, 7);
    monthlySnapshots.set(month, dateSnapshotMap.get(dateStr)!);
  }

  const curveData = Array.from(monthlySnapshots.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date: date.slice(5) + "月", value }));

  const maxDrawdown = snapshots.length > 0
    ? Math.max(0, ...snapshots.map((s) => Number(s.maxDrawdown ?? 0)))
    : 0;

  return {
    snapshots: curveData,
    stats: {
      totalValue,
      totalPnl,
      cashBalance,
      positionCount: positions.length,
      maxDrawdown,
      currency: baseCurrency,
    },
  };
}

export default async function Dashboard() {
  const { snapshots, stats } = await getDashboardData();

  if (!stats) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold">投资仪表盘</h1>
          <p className="text-muted mt-1">总览你的投资组合表现</p>
        </div>
        <div className="text-center py-20 text-muted border border-default rounded-xl">
          暂无数据。请先在账户管理页面配置券商账户。
        </div>
      </div>
    );
  }

  const totalCost = stats.totalValue - stats.totalPnl;
  const changePercent = Math.abs(totalCost) > 0 ? (stats.totalPnl / Math.abs(totalCost)) * 100 : 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">投资仪表盘</h1>
        <p className="text-muted mt-1">总览你的投资组合表现</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="总资产"
          value={formatCurrency(stats.totalValue, stats.currency)}
          subtitle={`${stats.currency} (含现金 ${formatCurrency(stats.cashBalance, stats.currency)})`}
        />
        <StatCard
          title="总盈亏"
          value={formatCurrency(stats.totalPnl, stats.currency)}
          change={`${stats.totalPnl >= 0 ? "+" : ""}${changePercent.toFixed(2)}%`}
          changePositive={stats.totalPnl >= 0}
        />
        <StatCard
          title="持仓数"
          value={String(stats.positionCount)}
          subtitle="只标的"
        />
        <StatCard
          title="最大回撤"
          value={`${stats.maxDrawdown.toFixed(2)}%`}
          subtitle="历史最大"
        />
      </div>

      <div className="bg-card border border-default rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4">资产曲线</h2>
        <EquityCurve data={snapshots} currency={stats.currency} />
      </div>
    </div>
  );
}
