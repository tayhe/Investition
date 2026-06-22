"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { StatCard } from "@/components/stat-card";

interface SnapshotData {
  date: string;
  value: number;
  maxDrawdown: number | null;
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

interface PositionRankItem {
  symbol: string;
  name: string;
  pnl: number;
  contribution: number;
}

interface AnalyticsChartsProps {
  snapshots: SnapshotData[];
  monthlyData: MonthlyItem[];
  positionRanking: PositionRankItem[];
}

export function AnalyticsCharts({ snapshots, monthlyData, positionRanking }: AnalyticsChartsProps) {
  if (snapshots.length === 0 && monthlyData.length === 0) {
    return (
      <div className="text-center py-20 text-muted border border-default rounded-xl">
        暂无数据。请先录入持仓和交易记录。
      </div>
    );
  }

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
  }));

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                  contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px" }}
                  formatter={(value) => [`${Number(value).toFixed(2)}%`, "收益率"]}
                />
                <Bar dataKey="returnRate" radius={[4, 4, 0, 0]}>
                  {monthlyChartData.map((entry, i) => (
                    <Cell key={i} fill={entry.returnRate >= 0 ? "#16a34a" : "#dc2626"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center py-12 text-muted">暂无月度数据</div>
          )}
        </div>

        <div className="bg-card border border-default rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">标的盈亏排行</h2>
          {positionRanking.length > 0 ? (
            <div className="space-y-3 max-h-[250px] overflow-y-auto">
              {positionRanking.map((pos, i) => (
                <div key={pos.symbol} className="flex items-center gap-3">
                  <span className="text-xs text-muted w-5 text-right">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{pos.symbol}</span>
                      <span className={pos.pnl >= 0 ? "text-green" : "text-red"}>
                        {pos.pnl >= 0 ? "+" : ""}${pos.pnl.toFixed(0)}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs text-muted mt-0.5">
                      <span>{pos.name}</span>
                      <span>贡献 {pos.contribution >= 0 ? "+" : ""}{pos.contribution.toFixed(1)}%</span>
                    </div>
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
