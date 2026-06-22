import { PositionsTable } from "@/components/positions-table";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { formatCurrency } from "@/lib/utils";
import { getLatestPrices } from "@/lib/prices/cache";

async function getPortfolioData() {
  const session = await auth();
  if (!session?.user?.id) return { positions: [], marketSummary: [] };

  const accounts = await db.account.findMany({
    where: { userId: session.user.id },
  });

  if (accounts.length === 0) return { positions: [], marketSummary: [] };

  const accountIds = accounts.map((a) => a.id);

  const positions = await db.position.findMany({
    where: { accountId: { in: accountIds }, quantity: { not: 0 } },
    include: { security: true },
    orderBy: { updatedAt: "desc" },
  });

  const securityIds = [...new Set(positions.map((p) => p.securityId))];
  const priceMap = await getLatestPrices(securityIds);

  const enriched = positions.map((pos) => {
    const currentPrice = priceMap.get(pos.securityId) ?? Number(pos.avgCost);
    const qty = Number(pos.quantity);
    const absQty = Math.abs(qty);
    const costBasis = Number(pos.costBasis);
    const marketValue = absQty * currentPrice;
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

  const marketMap = new Map<string, { value: number; pnl: number; currency: string }>();
  for (const pos of enriched) {
    const existing = marketMap.get(pos.market) || { value: 0, pnl: 0, currency: pos.currency };
    existing.value += pos.quantity > 0 ? pos.marketValue : -pos.marketValue;
    existing.pnl += pos.pnl;
    marketMap.set(pos.market, existing);
  }

  const marketLabels: Record<string, string> = { US: "美股", HK: "港股", A: "A股", FUND: "基金" };
  const marketSummary = Array.from(marketMap.entries()).map(([market, data]) => ({
    market,
    label: marketLabels[market] || market,
    value: data.value,
    pnl: data.pnl,
    currency: data.currency,
  }));

  return { positions: enriched, marketSummary };
}

export default async function PortfolioPage() {
  const { positions, marketSummary } = await getPortfolioData();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">持仓管理</h1>
        <p className="text-muted mt-1">查看和管理你的投资持仓</p>
      </div>

      {marketSummary.length > 0 ? (
        <div className="flex gap-4">
          {marketSummary.map((m) => (
            <div key={m.market} className="bg-card border border-default rounded-xl p-4 flex-1">
              <div className="text-sm text-muted">{m.label}持仓</div>
              <div className="text-xl font-bold mt-1">{formatCurrency(m.value, m.currency)}</div>
              <div className={`text-sm mt-1 ${m.pnl >= 0 ? "text-green" : "text-red"}`}>
                {m.pnl >= 0 ? "+" : ""}
                {formatCurrency(m.pnl, m.currency)}
                {" "}
                ({m.value - m.pnl > 0 ? ((m.pnl / (m.value - m.pnl)) * 100).toFixed(2) : "0.00"}%)
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-muted border border-default rounded-xl">
          暂无持仓数据
        </div>
      )}

      <div>
        <h2 className="text-lg font-semibold mb-4">全部持仓</h2>
        <PositionsTable positions={positions} />
      </div>
    </div>
  );
}
