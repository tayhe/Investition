import { StatCard } from "@/components/stat-card";
import { EquityCurve } from "@/components/equity-curve";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { formatCurrency } from "@/lib/utils";
import { getLatestPrices } from "@/lib/prices/cache";
import { calculateRealizedPnl } from "@/lib/ibkr/fifo";
import { parseCashFlowsByDate } from "@/lib/ibkr/flex";
import { convertCurrency, getLatestRatesMap } from "@/lib/prices/exchange-rate";

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

  const [positions, snapshots, rates, realizedMap, flexCaches] = await Promise.all([
    db.position.findMany({
      where: { accountId: { in: accountIds }, quantity: { not: 0 } },
      include: { security: true },
    }),
    db.snapshot.findMany({
      where: { accountId: { in: accountIds }, date: { gte: yearStart } },
      orderBy: { date: "asc" },
    }),
    getLatestRatesMap(),
    calculateRealizedPnl(accountIds),
    db.flexCache.findMany({
      where: { accountId: { in: accountIds } },
    }),
  ]);

  const securityIds = [...new Set(positions.map((p) => p.securityId))];
  const priceMap = await getLatestPrices(securityIds);

  // Sum latest cashBalance per account from snapshots (ordered asc → last entry = latest per account)
  const latestCashByAccount = new Map<string, { cashBalance: number; currency: string }>();
  for (const s of snapshots) {
    latestCashByAccount.set(s.accountId, { cashBalance: Number(s.cashBalance), currency: s.currency });
  }
  const cashBalance = Array.from(latestCashByAccount.values()).reduce((sum, s) => {
    return sum + convertCurrency(s.cashBalance, s.currency, baseCurrency, rates);
  }, 0);

  const positionsValue = positions.reduce((sum, pos) => {
    const price = priceMap.get(pos.securityId) ?? Number(pos.avgCost);
    const mult = pos.security.type === "OPTION" ? 100 : Number(pos.security.multiplier || 1);
    const posVal = Number(pos.quantity) * mult * price;
    const convertedVal = convertCurrency(posVal, pos.currency, baseCurrency, rates);
    return sum + convertedVal;
  }, 0);

  const totalValue = positionsValue + cashBalance;
  const positionRatio = totalValue > 0 ? (positionsValue / totalValue) * 100 : 0;

  const unrealizedPnl = positions.reduce((sum, pos) => {
    const price = priceMap.get(pos.securityId) ?? Number(pos.avgCost);
    const mult = pos.security.type === "OPTION" ? 100 : Number(pos.security.multiplier || 1);
    const qty = Number(pos.quantity);
    const cost = qty * mult * Number(pos.avgCost);
    const mv = qty * mult * price;
    const pnl = mv - cost;
    const convertedPnl = convertCurrency(pnl, pos.currency, baseCurrency, rates);
    return sum + convertedPnl;
  }, 0);

  let realizedPnl = 0;
  for (const [cur, amt] of realizedMap.entries()) {
    realizedPnl += convertCurrency(amt, cur, baseCurrency, rates);
  }

  const totalPnl = realizedPnl + unrealizedPnl;

  // Calculate cumulative net deposits (出入金) across accounts
  let netDeposits = 0;
  for (const fc of flexCaches) {
    const flows = parseCashFlowsByDate(fc.xml);
    const acc = accounts.find((a) => a.id === fc.accountId);
    const cur = acc?.currency || baseCurrency;
    for (const amt of flows.values()) {
      netDeposits += convertCurrency(amt, cur, baseCurrency, rates);
    }
  }

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
      positionsValue,
      positionRatio,
      netDeposits,
      totalPnl,
      realizedPnl,
      unrealizedPnl,
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          title="总资产"
          value={formatCurrency(stats.totalValue, stats.currency)}
          subtitle={`仓位 ${stats.positionRatio.toFixed(1)}% · 现金 ${formatCurrency(stats.cashBalance, stats.currency)}`}
        />
        <StatCard
          title="出入金"
          value={`${stats.netDeposits >= 0 ? "+" : ""}${formatCurrency(stats.netDeposits, stats.currency)}`}
          subtitle="累计净入金"
        />
        <StatCard
          title="总盈亏"
          value={`${stats.totalPnl >= 0 ? "+" : ""}${formatCurrency(stats.totalPnl, stats.currency)}`}
          subtitle={`已实现 ${stats.realizedPnl >= 0 ? "+" : ""}${formatCurrency(stats.realizedPnl, stats.currency)} · 未实现 ${stats.unrealizedPnl >= 0 ? "+" : ""}${formatCurrency(stats.unrealizedPnl, stats.currency)}`}
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
