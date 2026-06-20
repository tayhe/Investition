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
} from "recharts";
import { StatCard } from "@/components/stat-card";

const mockDrawdownData = [
  { date: "2024-01", drawdown: 0 },
  { date: "2024-02", drawdown: -2.3 },
  { date: "2024-03", drawdown: -5.8 },
  { date: "2024-04", drawdown: -1.2 },
  { date: "2024-05", drawdown: -3.1 },
  { date: "2024-06", drawdown: 0 },
  { date: "2024-07", drawdown: -1.8 },
  { date: "2024-08", drawdown: 0 },
  { date: "2024-09", drawdown: -0.5 },
  { date: "2024-10", drawdown: 0 },
  { date: "2024-11", drawdown: 0 },
  { date: "2024-12", drawdown: -1.2 },
];

const mockMonthlyReturns = [
  { month: "1月", return: 5.0 },
  { month: "2月", return: -2.3 },
  { month: "3月", return: 8.2 },
  { month: "4月", return: -1.5 },
  { month: "5月", return: 6.5 },
  { month: "6月", return: -2.8 },
  { month: "7月", return: 7.1 },
  { month: "8月", return: -1.2 },
  { month: "9月", return: 5.9 },
  { month: "10月", return: 4.0 },
  { month: "11月", return: -1.5 },
  { month: "12月", return: 3.2 },
];

const mockMarketAllocation = [
  { market: "美股", value: 37500, percent: 45 },
  { market: "港股", value: 99400, percent: 35 },
  { market: "A股", value: 32300, percent: 20 },
];

export default function AnalyticsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">复盘分析</h1>
        <p className="text-muted mt-1">深入分析你的投资表现</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="年化收益" value="+28.0%" changePositive />
        <StatCard title="最大回撤" value="-5.8%" subtitle="2024年3月" />
        <StatCard title="夏普比率" value="1.85" subtitle="基于日收益" />
      </div>

      <div className="bg-card border border-default rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4">回撤分析</h2>
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={mockDrawdownData}>
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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border border-default rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">月度收益</h2>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={mockMonthlyReturns}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--muted-foreground)" fontSize={12} tickFormatter={(v) => `${v}%`} />
              <Tooltip
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                }}
                formatter={(value) => [`${Number(value).toFixed(2)}%`, "收益"]}
              />
              <Bar
                dataKey="return"
                fill="#16a34a"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card border border-default rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">市场分布</h2>
          <div className="space-y-4">
            {mockMarketAllocation.map((item) => (
              <div key={item.market}>
                <div className="flex justify-between text-sm mb-1">
                  <span>{item.market}</span>
                  <span className="text-muted">{item.percent}%</span>
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
        </div>
      </div>
    </div>
  );
}
