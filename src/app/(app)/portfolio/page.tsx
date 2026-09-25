import { PositionsTable } from "./_components/positions-table";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { formatCurrency } from "@/lib/utils";
import { getLatestPrices } from "@/lib/prices/cache";
import { convertCurrency, getLatestRatesMap } from "@/lib/prices/exchange-rate";
import { calculatePositionMetrics } from "@/lib/portfolio/calc";

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
  const [priceMap, rates] = await Promise.all([
    getLatestPrices(securityIds),
    getLatestRatesMap(),
  ]);

  const enriched = positions.map((pos) => {
    const currentPrice = priceMap.get(pos.securityId);
    const metrics = calculatePositionMetrics(pos, currentPrice);
    const usdMarketValue = convertCurrency(metrics.marketValue, pos.currency, "USD", rates);
    const usdPrice = convertCurrency(metrics.currentPrice, pos.currency, "USD", rates);

    return {
      symbol: pos.security.symbol,
      name: pos.security.name,
      market: pos.security.market,
      type: pos.security.type,
      quantity: metrics.quantity,
      avgCost: metrics.avgCost,
      currentPrice: metrics.currentPrice,
      usdPrice,
      marketValue: metrics.marketValue,
      usdMarketValue,
      pnl: metrics.pnl,
      pnlPercent: metrics.pnlPercent,
      currency: pos.currency,
    };
  });

  enriched.sort((a, b) => b.usdMarketValue - a.usdMarketValue);

  const marketTargetCurrency: Record<string, string> = {
    US: "USD",
    HK: "HKD",
    A: "CNY",
    FUND: "USD",
  };

  const marketMap = new Map<string, { value: number; pnl: number; currency: string }>();
  for (const pos of enriched) {
    const targetCur = marketTargetCurrency[pos.market] || pos.currency;
    const existing = marketMap.get(pos.market) || { value: 0, pnl: 0, currency: targetCur };
    const convertedVal = convertCurrency(pos.marketValue, pos.currency, targetCur, rates);
    const convertedPnl = convertCurrency(pos.pnl, pos.currency, targetCur, rates);
    existing.value += convertedVal;
    existing.pnl += convertedPnl;
    marketMap.set(pos.market, existing);
  }

  const marketLabels: Record<string, string> = { US: "美股", HK: "港股", A: "A股", FUND: "基金" };
  const marketSummary = Array.from(marketMap.entries()).map(([market, data]) => {
    const cost = data.value - data.pnl;
    const pnlPct = Math.abs(cost) > 0 ? (data.pnl / Math.abs(cost)) * 100 : 0;
    return {
      market,
      label: marketLabels[market] || market,
      value: data.value,
      pnl: data.pnl,
      pnlPct,
      currency: data.currency,
    };
  });

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
                <span className="text-xs text-muted mr-1">未实现</span>
                {m.pnl >= 0 ? "+" : ""}
                {formatCurrency(m.pnl, m.currency)}
                {" "}
                ({m.pnl >= 0 ? "+" : ""}{m.pnlPct.toFixed(2)}%)
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
