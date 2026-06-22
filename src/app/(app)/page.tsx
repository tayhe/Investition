import { StatCard } from "@/components/stat-card";
import { EquityCurve } from "@/components/equity-curve";
import { PositionsTable } from "@/components/positions-table";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { formatCurrency } from "@/lib/utils";
import { getLatestPrices } from "@/lib/prices/cache";

async function getDashboardData() {
  const session = await auth();
  if (!session?.user?.id) return { positions: [], snapshots: [], stats: null };

  const accounts = await db.account.findMany({
    where: { userId: session.user.id },
  });

  if (accounts.length === 0) return { positions: [], snapshots: [], stats: null };

  const accountIds = accounts.map((a) => a.id);

  const positions = await db.position.findMany({
    where: { accountId: { in: accountIds }, quantity: { not: 0 } },
    include: { security: true },
    orderBy: { updatedAt: "desc" },
  });

  const securityIds = [...new Set(positions.map((p) => p.securityId))];
  const priceMap = await getLatestPrices(securityIds);

  const enrichedPositions = positions.map((pos) => {
    const currentPrice = priceMap.get(pos.securityId) ?? Number(pos.avgCost);
    const qty = Number(pos.quantity);
    const absQty = Math.abs(qty);
    const multiplier = pos.security.type === "OPTION" ? 100 : 1;
    const costBasis = Number(pos.costBasis);
    const marketValue = absQty * multiplier * currentPrice;
    const isShort = qty < 0;
    const pnl = isShort ? (costBasis - marketValue) : (marketValue - costBasis);
    const pnlPercent = costBasis > 0 ? (pnl / costBasis) * 100 : 0;

    return {
      symbol: pos.security.symbol,
      name: pos.security.name,
      market: pos.security.market,
      quantity: qty,
      avgCost: Number(pos.avgCost),
      currentPrice,
      marketValue,
      pnl,
      pnlPercent,
      currency: pos.currency,
    };
  });

  const snapshots = await db.snapshot.findMany({
    where: { accountId: { in: accountIds } },
    orderBy: { date: "asc" },
  });

  const totalValue = enrichedPositions.reduce((sum, p) => {
    return sum + (p.quantity > 0 ? p.marketValue : -p.marketValue);
  }, 0);
  const totalPnl = enrichedPositions.reduce((sum, p) => sum + p.pnl, 0);

  const maxDrawdown = snapshots.reduce(
    (min, s) => (s.maxDrawdown && Number(s.maxDrawdown) < min ? Number(s.maxDrawdown) : min),
    0
  );

  return {
    positions: enrichedPositions,
    snapshots: snapshots.map((s) => ({
      date: s.date.toISOString().split("T")[0],
      value: Number(s.totalValue),
    })),
    stats: {
      totalValue,
      totalPnl,
      maxDrawdown,
      currency: accounts[0].currency,
    },
  };
}

export default async function Dashboard() {
  const { positions, snapshots, stats } = await getDashboardData();

  if (!stats) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold">投资仪表盘</h1>
          <p className="text-muted mt-1">总览你的投资组合表现</p>
        </div>
        <div className="text-center py-20 text-muted border border-default rounded-xl">
          暂无数据。请先在设置页面配置券商账户或手动录入持仓。
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
          subtitle={stats.currency}
        />
        <StatCard
          title="总盈亏"
          value={formatCurrency(stats.totalPnl, stats.currency)}
          change={`${stats.totalPnl >= 0 ? "+" : ""}${stats.totalValue - stats.totalPnl > 0 ? ((stats.totalPnl / (stats.totalValue - stats.totalPnl)) * 100).toFixed(2) : "0.00"}%`}
          changePositive={stats.totalPnl >= 0}
        />
        <StatCard
          title="持仓数"
          value={String(positions.length)}
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

      <div>
        <h2 className="text-lg font-semibold mb-4">当前持仓</h2>
        <PositionsTable positions={positions} />
      </div>
    </div>
  );
}
