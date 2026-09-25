import { StatCard } from "@/components/stat-card";
import { EquityCurve } from "./_components/equity-curve";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { formatCurrency, getToday } from "@/lib/utils";
import { getLatestPrices } from "@/lib/prices/cache";
import { calculateRealizedPnl } from "@/lib/ibkr/fifo";
import { parseCashFlowsByDate } from "@/lib/ibkr/flex";
import { convertCurrency, getLatestRatesMap } from "@/lib/prices/exchange-rate";
import { calculatePositionMetrics } from "@/lib/portfolio/calc";

async function getDashboardData() {
  const session = await auth();
  if (!session?.user?.id) return { snapshots: [], stats: null };

  const accounts = await db.account.findMany({
    where: { userId: session.user.id },
  });
  if (accounts.length === 0) return { snapshots: [], stats: null };

  const accountIds = accounts.map((a) => a.id);
  const baseCurrency = accounts[0].currency || "USD";

  const today = getToday();
  const currentYear = today.getUTCFullYear();
  const yearStart = new Date(Date.UTC(currentYear, 0, 1));
  const yearStartStr = `${currentYear}-01-01`;

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

  let positionsValue = 0;
  let unrealizedPnl = 0;
  for (const pos of positions) {
    const price = priceMap.get(pos.securityId);
    const metrics = calculatePositionMetrics(pos, price);
    positionsValue += convertCurrency(metrics.marketValue, pos.currency, baseCurrency, rates);
    unrealizedPnl += convertCurrency(metrics.pnl, pos.currency, baseCurrency, rates);
  }

  const totalValue = positionsValue + cashBalance;
  const positionRatio = totalValue > 0 ? (positionsValue / totalValue) * 100 : 0;

  let realizedPnl = 0;
  for (const [cur, amt] of realizedMap.entries()) {
    realizedPnl += convertCurrency(amt, cur, baseCurrency, rates);
  }

  const totalTradePnl = realizedPnl + unrealizedPnl;

  // Calculate net deposits (出入金) across accounts for current year
  let netDeposits = 0;
  const cashFlowsByAccountDate = new Map<string, Map<string, number>>();
  for (const fc of flexCaches) {
    const flows = parseCashFlowsByDate(fc.xml);
    cashFlowsByAccountDate.set(fc.accountId, flows);
    const acc = accounts.find((a) => a.id === fc.accountId);
    const cur = acc?.currency || baseCurrency;
    for (const [dateStr, amt] of flows.entries()) {
      if (dateStr >= yearStartStr) {
        netDeposits += convertCurrency(amt, cur, baseCurrency, rates);
      }
    }
  }

  // Group snapshots by date across accounts
  const accountCurrencyMap = new Map(accounts.map((a) => [a.id, a.currency]));
  const dateMap = new Map<string, { totalValue: number; cashFlow: number }>();

  for (const s of snapshots) {
    const dateKey = s.date.toISOString().split("T")[0];
    const accCurrency = s.currency || accountCurrencyMap.get(s.accountId) || baseCurrency;
    const val = convertCurrency(Number(s.totalValue), accCurrency, baseCurrency, rates);

    const accountFlows = cashFlowsByAccountDate.get(s.accountId);
    const rawFlow = accountFlows?.get(dateKey) || 0;
    const flow = convertCurrency(rawFlow, accCurrency, baseCurrency, rates);

    const existing = dateMap.get(dateKey) || { totalValue: 0, cashFlow: 0 };
    existing.totalValue += val;
    existing.cashFlow += flow;
    dateMap.set(dateKey, existing);
  }

  // Ensure latest live totalValue is reflected on the current date
  const todayKey = today.toISOString().split("T")[0];
  const existingToday = dateMap.get(todayKey);
  if (existingToday) {
    existingToday.totalValue = totalValue;
  } else {
    const accountFlowsToday = accounts.reduce((sum, a) => {
      const f = cashFlowsByAccountDate.get(a.id)?.get(todayKey) || 0;
      return sum + convertCurrency(f, a.currency, baseCurrency, rates);
    }, 0);
    dateMap.set(todayKey, { totalValue, cashFlow: accountFlowsToday });
  }

  const sortedDates = Array.from(dateMap.keys()).sort();

  let initialValue = 0;
  let ytdPnl = totalTradePnl;
  let ytdReturn = 0;

  if (sortedDates.length > 0) {
    const firstDateStr = sortedDates[0];
    initialValue = dateMap.get(firstDateStr)!.totalValue;

    // Time-weighted return (TWR)
    let twrFactor = 1;
    for (let idx = 1; idx < sortedDates.length; idx++) {
      const prevDate = sortedDates[idx - 1];
      const curDate = sortedDates[idx];
      const prevVal = dateMap.get(prevDate)!.totalValue;
      const curData = dateMap.get(curDate)!;
      const flow = curData.cashFlow;

      const dailyPnl = curData.totalValue - prevVal - flow;
      const dailyReturn = prevVal > 0 ? dailyPnl / prevVal : 0;
      twrFactor *= (1 + dailyReturn);
    }

    if (sortedDates.length > 1) {
      ytdPnl = totalValue - initialValue - netDeposits;
      ytdReturn = (twrFactor - 1) * 100;
    } else {
      const totalCost = totalValue - totalTradePnl;
      ytdReturn = Math.abs(totalCost) > 0 ? (totalTradePnl / Math.abs(totalCost)) * 100 : 0;
    }
  }

  // Monthly aggregated curve data (take the latest day in each month)
  const monthlySnapshots = new Map<string, number>();
  for (const dateStr of sortedDates) {
    const month = dateStr.slice(0, 7);
    monthlySnapshots.set(month, dateMap.get(dateStr)!.totalValue);
  }

  const curveData = Array.from(monthlySnapshots.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date: date.slice(5) + "月", value }));

  const maxDrawdown = snapshots.length > 0
    ? Math.max(0, ...snapshots.map((s) => Number(s.maxDrawdown ?? 0)))
    : 0;

  const totalCapital = initialValue + netDeposits;
  const simpleReturn = totalCapital > 0 ? (ytdPnl / totalCapital) * 100 : 0;

  return {
    snapshots: curveData,
    stats: {
      totalValue,
      positionsValue,
      positionRatio,
      initialValue,
      netDeposits,
      totalCapital,
      totalPnl: ytdPnl,
      ytdReturn,
      simpleReturn,
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

  const capitalSubtitle =
    stats.initialValue > 0
      ? stats.netDeposits >= 0
        ? `期初 ${formatCurrency(stats.initialValue, stats.currency)} + 净入金 ${formatCurrency(stats.netDeposits, stats.currency)}`
        : `期初 ${formatCurrency(stats.initialValue, stats.currency)} - 净出金 ${formatCurrency(Math.abs(stats.netDeposits), stats.currency)}`
      : `净入金 ${formatCurrency(stats.netDeposits, stats.currency)}`;

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
          title="年内总本金"
          value={formatCurrency(stats.totalCapital, stats.currency)}
          subtitle={capitalSubtitle}
        />
        <StatCard
          title="今年总盈亏"
          value={`${stats.totalPnl >= 0 ? "+" : ""}${formatCurrency(stats.totalPnl, stats.currency)}`}
          subtitle={`已实现 ${stats.realizedPnl >= 0 ? "+" : ""}${formatCurrency(stats.realizedPnl, stats.currency)} · 未实现 ${stats.unrealizedPnl >= 0 ? "+" : ""}${formatCurrency(stats.unrealizedPnl, stats.currency)}`}
          change={
            <span className="font-bold flex flex-wrap items-center gap-x-1.5">
              <span title="时间加权收益率 (TWR)，反映组合真实投资能力，剔除出入金干扰">
                TWR {stats.ytdReturn >= 0 ? "+" : ""}{stats.ytdReturn.toFixed(2)}%
              </span>
              <span className="text-muted/60 font-normal">·</span>
              <span title="简单收益率 = 今年总盈亏 / 年内总本金">
                简单 {stats.simpleReturn >= 0 ? "+" : ""}{stats.simpleReturn.toFixed(2)}%
              </span>
            </span>
          }
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
