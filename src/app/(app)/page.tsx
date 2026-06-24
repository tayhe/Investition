import { StatCard } from "@/components/stat-card";
import { EquityCurve } from "@/components/equity-curve";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { formatCurrency } from "@/lib/utils";
import { getLatestPrices } from "@/lib/prices/cache";

async function getDashboardData() {
  const session = await auth();
  if (!session?.user?.id) return { snapshots: [], stats: null };

  const accounts = await db.account.findMany({
    where: { userId: session.user.id },
  });
  if (accounts.length === 0) return { snapshots: [], stats: null };

  const accountIds = accounts.map((a) => a.id);

  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);

  const [positions, snapshots] = await Promise.all([
    db.position.findMany({
      where: { accountId: { in: accountIds }, quantity: { not: 0 } },
      include: { security: true },
    }),
    db.snapshot.findMany({
      where: { accountId: { in: accountIds }, date: { gte: yearStart } },
      orderBy: { date: "asc" },
    }),
  ]);

  const securityIds = [...new Set(positions.map((p) => p.securityId))];
  const priceMap = await getLatestPrices(securityIds);

  const cashBalance = 0;

  const positionsValue = positions.reduce((sum, pos) => {
    const price = priceMap.get(pos.securityId) ?? Number(pos.avgCost);
    const mult = pos.security.type === "OPTION" ? 100 : 1;
    return sum + Number(pos.quantity) * mult * price;
  }, 0);

  const totalValue = positionsValue + cashBalance;

  const totalPnl = positions.reduce((sum, pos) => {
    const price = priceMap.get(pos.securityId) ?? Number(pos.avgCost);
    const mult = pos.security.type === "OPTION" ? 100 : 1;
    const qty = Number(pos.quantity);
    const cost = qty * mult * Number(pos.avgCost);
    const mv = qty * mult * price;
    return sum + (mv - cost);
  }, 0);

  const monthlySnapshots = new Map<string, number>();
  for (const s of snapshots) {
    const month = s.date.toISOString().slice(0, 7);
    monthlySnapshots.set(month, Number(s.totalValue));
  }

  const curveData = Array.from(monthlySnapshots.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date: date.slice(5) + "月", value }));

  const maxDrawdown = snapshots.reduce(
    (min, s) => (s.maxDrawdown && Number(s.maxDrawdown) < min ? Number(s.maxDrawdown) : min),
    0
  );

  return {
    snapshots: curveData,
    stats: {
      totalValue,
      totalPnl,
      cashBalance,
      positionCount: positions.length,
      maxDrawdown,
      currency: accounts[0].currency,
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
          change={`${stats.totalPnl >= 0 ? "+" : ""}${stats.totalValue - stats.totalPnl > 0 ? ((stats.totalPnl / (stats.totalValue - stats.totalPnl)) * 100).toFixed(2) : "0.00"}%`}
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
