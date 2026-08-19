import { PositionsTable } from "@/components/positions-table";
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
    getLatestRates(),
  ]);

  const enriched = positions.map((pos) => {
    const currentPrice = priceMap.get(pos.securityId) ?? Number(pos.avgCost);
    const qty = Number(pos.quantity);
    const avgCost = Number(pos.avgCost);
    const multiplier = pos.security.type === "OPTION" ? 100 : Number(pos.security.multiplier || 1);
    const costBasis = qty * multiplier * avgCost;
    const marketValue = qty * multiplier * currentPrice;
    const pnl = marketValue - costBasis;
    const pnlPercent = Math.abs(costBasis) > 0 ? (pnl / Math.abs(costBasis)) * 100 : 0;
    const usdMarketValue = convertCurrency(marketValue, pos.currency, "USD", rates);
    const usdPrice = convertCurrency(currentPrice, pos.currency, "USD", rates);

    return {
      symbol: pos.security.symbol,
      name: pos.security.name,
      market: pos.security.market,
      quantity: qty,
      avgCost,
      currentPrice,
      usdPrice,
      marketValue,
      usdMarketValue,
      pnl,
      pnlPercent,
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
