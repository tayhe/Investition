import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { getLatestPrices } from "@/lib/prices/cache";
import { parseCashFlowsByDate } from "@/lib/ibkr/flex";
import { convertCurrency, getLatestRatesMap } from "@/lib/prices/exchange-rate";
import { AnalyticsCharts } from "./_components/analytics-charts";

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
  const baseCurrency = accounts[0].currency || "USD";

  const [snapshots, positions, dailyPositions, rates, flexCaches] = await Promise.all([
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
    getLatestRatesMap(),
    db.flexCache.findMany({
      where: { accountId: { in: accountIds } },
    }),
  ]);

  const securityIds = [...new Set(positions.map((p) => p.securityId))];
  const priceMap = await getLatestPrices(securityIds);

  // Current position P&L ranking (USD)
  const positionRanking = positions
    .map((pos) => {
      const price = priceMap.get(pos.securityId) ?? Number(pos.avgCost);
      const mult = pos.security.type === "OPTION" ? 100 : Number(pos.security.multiplier || 1);
      const qty = Number(pos.quantity);
      const costBasis = qty * mult * Number(pos.avgCost);
      const marketValue = qty * mult * price;
      const pnl = marketValue - costBasis;
      const usdPnl = convertCurrency(pnl, pos.currency, "USD", rates);
      return {
        symbol: pos.security.symbol,
        name: pos.security.name,
        pnl: usdPnl,
        contribution: 0,
      };
    })
    .sort((a, b) => b.pnl - a.pnl);

  const totalAbsPnl = positionRanking.reduce((sum, p) => sum + Math.abs(p.pnl), 0);
  for (const p of positionRanking) {
    p.contribution = totalAbsPnl > 0 ? (p.pnl / totalAbsPnl) * 100 : 0;
  }

  // Parse external cash flows (deposits/withdrawals) by account and date
  const cashFlowsByAccountDate = new Map<string, Map<string, number>>();
  for (const fc of flexCaches) {
    const flows = parseCashFlowsByDate(fc.xml);
    cashFlowsByAccountDate.set(fc.accountId, flows);
  }

  // Combine multi-account snapshots by date
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

  const sortedDates = Array.from(dateMap.keys()).sort();
  let peak = 0;
  let runningMaxDrawdown = 0;
  const combinedSnapshots = sortedDates.map((dateStr, idx) => {
    const data = dateMap.get(dateStr)!;
    const prevVal = idx > 0 ? dateMap.get(sortedDates[idx - 1])!.totalValue : 0;
    // Exclude cash flow from daily investment P&L
    const dailyPnl = idx > 0 ? data.totalValue - prevVal - data.cashFlow : 0;
    const dailyReturn = idx > 0 && prevVal > 0 ? (dailyPnl / prevVal) * 100 : 0;

    if (data.totalValue > peak) peak = data.totalValue;
    if (peak > 0) {
      const dd = ((peak - data.totalValue) / peak) * 100;
      if (dd > runningMaxDrawdown) runningMaxDrawdown = dd;
    }

    return {
      date: dateStr,
      value: data.totalValue,
      dailyReturn,
      dailyPnl,
      cashFlow: data.cashFlow,
      maxDrawdown: runningMaxDrawdown,
    };
  });

  // Monthly data from combined snapshots using Time-Weighted Return (TWR)
  const monthlyMap = new Map<string, {
    startValue: number;
    endValue: number;
    cashFlow: number;
    pnl: number;
    dailyReturns: number[];
  }>();

  for (const s of combinedSnapshots) {
    const month = s.date.slice(0, 7);
    const existing = monthlyMap.get(month) || {
      startValue: s.value,
      endValue: s.value,
      cashFlow: 0,
      pnl: 0,
      dailyReturns: [],
    };
    existing.endValue = s.value;
    existing.cashFlow += s.cashFlow;
    existing.pnl += s.dailyPnl;
    existing.dailyReturns.push(s.dailyReturn);
    monthlyMap.set(month, existing);
  }

  const monthlyData = Array.from(monthlyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, data]) => {
      let twrFactor = 1;
      for (const ret of data.dailyReturns) {
        twrFactor *= (1 + ret / 100);
      }
      const returnRate = (twrFactor - 1) * 100;

      return {
        month,
        label: month.slice(0, 4) + "年" + month.slice(5) + "月",
        shortLabel: month.slice(5) + "月",
        startValue: data.startValue,
        endValue: data.endValue,
        cashFlow: data.cashFlow,
        pnl: data.pnl,
        returnRate,
      };
    });

  // Daily position data grouped by date (merged across accounts if same symbol)
  const dailyPositionMap = new Map<string, Map<string, { symbol: string; name: string; quantity: number; marketValue: number; marketPrice: number; currency: string }>>();
  for (const dp of dailyPositions) {
    const dateKey = dp.date.toISOString().split("T")[0];
    if (!dailyPositionMap.has(dateKey)) dailyPositionMap.set(dateKey, new Map());
    const datePositions = dailyPositionMap.get(dateKey)!;

    const sym = dp.security.symbol;
    const existing = datePositions.get(sym);
    if (existing) {
      existing.quantity += Number(dp.quantity);
      existing.marketValue += Number(dp.marketValue);
    } else {
      datePositions.set(sym, {
        symbol: sym,
        name: dp.security.name,
        quantity: Number(dp.quantity),
        marketValue: Number(dp.marketValue),
        marketPrice: Number(dp.marketPrice),
        currency: dp.currency,
      });
    }
  }

  const formattedDailyPositions: Record<string, Array<{ symbol: string; name: string; quantity: number; marketValue: number; marketPrice: number; currency: string }>> = {};
  for (const [dateKey, posMap] of dailyPositionMap.entries()) {
    formattedDailyPositions[dateKey] = Array.from(posMap.values());
  }

  return {
    snapshots: combinedSnapshots,
    dailyPositions: formattedDailyPositions,
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
