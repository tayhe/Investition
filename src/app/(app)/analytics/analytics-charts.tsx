"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import { StatCard } from "@/components/stat-card";

interface SnapshotData {
  date: string;
  value: number;
  dailyReturn: number | null;
  maxDrawdown: number | null;
}

interface PositionData {
  market: string;
  marketValue: number;
}

interface MonthlyItem {
  month: string;
  label: string;
  shortLabel: string;
  startValue: number;
  endValue: number;
  pnl: number;
  returnRate: number;
}

interface AnalyticsChartsProps {
  snapshots: SnapshotData[];
  positions: PositionData[];
  monthlyData: MonthlyItem[];
}

function formatMoney(value: number): string {
  if (Math.abs(value) >= 10000) {
    return `$${(value / 1000).toFixed(1)}k`;
  }
  return `$${value.toFixed(0)}`;
}

export function AnalyticsCharts({ snapshots, positions, monthlyData }: AnalyticsChartsProps) {
  if (snapshots.length === 0 && positions.length === 0) {
    return (
      <div className="text-center py-20 text-muted border border-default rounded-xl">
        暂无数据。请先录入持仓和交易记录。
      </div>
    );
  }

  const drawdownData = snapshots.map((s) => ({
    date: s.date,
    drawdown: s.maxDrawdown ?? 0,
  }));

  const marketMap = new Map<string, number>();
  for (const p of positions) {
    marketMap.set(p.market, (marketMap.get(p.market) || 0) + p.marketValue);
  }
  const totalMarketValue = Array.from(marketMap.values()).reduce((a, b) => a + b, 0);
  const marketLabels: Record<string, string> = { US: "美股", HK: "港股", A: "A股", FUND: "基金" };
  const marketAllocation = Array.from(marketMap.entries()).map(([market, value]) => ({
    market: marketLabels[market] || market,
    value,
    percent: totalMarketValue > 0 ? Math.round((value / totalMarketValue) * 100) : 0,
  }));

  const firstValue = snapshots.length > 0 ? snapshots[0].value : 0;
  const lastValue = snapshots.length > 0 ? snapshots[snapshots.length - 1].value : 0;
  const totalReturn = firstValue > 0 ? ((lastValue - firstValue) / firstValue) * 100 : 0;
  const totalPnl = lastValue - firstValue;
  const maxDD = snapshots.reduce(
    (min, s) => (s.maxDrawdown !== null && s.maxDrawdown < min ? s.maxDrawdown : min),
    0
  );

  const monthlyChartData = monthlyData.map((m) => ({
    month: m.shortLabel,
    returnRate: Number(m.returnRate.toFixed(2)),
    pnl: m.pnl,
  }));

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="累计收益"
          value={`${totalReturn >= 0 ? "+" : ""}${totalReturn.toFixed(2)}%`}
          changePositive={totalReturn >= 0}
        />
        <StatCard
          title="累计盈亏"
          value={`$${totalPnl.toFixed(0)}`}
          changePositive={totalPnl >= 0}
        />
        <StatCard title="最大回撤" value={`${maxDD.toFixed(2)}%`} subtitle="历史最大" />
        <StatCard title="数据天数" value={String(snapshots.length)} subtitle="天" />
      </div>

      <div className="bg-card border border-default rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4">回撤分析</h2>
        {drawdownData.length > 0 ? (
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={drawdownData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--muted-foreground)" fontSize={12} tickFormatter={(v) => `${v}%`} />
              <Tooltip
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                }}
                formatter={(value) => [`${Number(value).toFixed(2)}%`, "回撤"]}
              />
              <Area type="monotone" dataKey="drawdown" stroke="#dc2626" fill="#dc2626" fillOpacity={0.2} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-center py-12 text-muted">暂无回撤数据</div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border border-default rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">月度收益率</h2>
          {monthlyChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={monthlyChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--muted-foreground)" fontSize={12} tickFormatter={(v) => `${v}%`} />
                <Tooltip
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                  }}
                  formatter={(value, name) => {
                    if (name === "returnRate") return [`${Number(value).toFixed(2)}%`, "收益率"];
                    return [value, name];
                  }}
                  labelFormatter={(label) => `${label}`}
                />
                <Bar dataKey="returnRate" radius={[4, 4, 0, 0]}>
                  {monthlyChartData.map((entry, index) => (
                    <Cell key={index} fill={entry.returnRate >= 0 ? "#16a34a" : "#dc2626"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center py-12 text-muted">暂无月度数据</div>
          )}
        </div>

        <div className="bg-card border border-default rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">市场分布</h2>
          {marketAllocation.length > 0 ? (
            <div className="space-y-4">
              {marketAllocation.map((item) => (
                <div key={item.market}>
                  <div className="flex justify-between text-sm mb-1">
                    <span>{item.market}</span>
                    <span className="text-muted">${item.value.toFixed(0)} ({item.percent}%)</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{ width: `${item.percent}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted">暂无持仓数据</div>
          )}
        </div>
      </div>

      {monthlyData.length > 0 && (
        <div className="bg-card border border-default rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">月度收益明细</h2>
          <div className="border border-default rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-default bg-muted/50">
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted">月份</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-muted">期初资产</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-muted">期末资产</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-muted">盈亏</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-muted">收益率</th>
                </tr>
              </thead>
              <tbody>
                {monthlyData.map((m) => (
                  <tr key={m.month} className="border-b border-default last:border-0 hover:bg-accent/50">
                    <td className="py-3 px-4 text-sm font-medium">{m.label}</td>
                    <td className="text-right py-3 px-4 text-sm">${m.startValue.toFixed(2)}</td>
                    <td className="text-right py-3 px-4 text-sm">${m.endValue.toFixed(2)}</td>
                    <td className={`text-right py-3 px-4 text-sm font-medium ${m.pnl >= 0 ? "text-green" : "text-red"}`}>
                      {m.pnl >= 0 ? "+" : ""}${m.pnl.toFixed(2)}
                    </td>
                    <td className={`text-right py-3 px-4 text-sm font-medium ${m.returnRate >= 0 ? "text-green" : "text-red"}`}>
                      {m.returnRate >= 0 ? "+" : ""}{m.returnRate.toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
