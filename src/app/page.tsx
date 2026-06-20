import { StatCard } from "@/components/stat-card";
import { EquityCurve } from "@/components/equity-curve";
import { PositionsTable } from "@/components/positions-table";

const mockEquityData = [
  { date: "2024-01", value: 100000 },
  { date: "2024-02", value: 105000 },
  { date: "2024-03", value: 102000 },
  { date: "2024-04", value: 110000 },
  { date: "2024-05", value: 108000 },
  { date: "2024-06", value: 115000 },
  { date: "2024-07", value: 112000 },
  { date: "2024-08", value: 120000 },
  { date: "2024-09", value: 118000 },
  { date: "2024-10", value: 125000 },
  { date: "2024-11", value: 130000 },
  { date: "2024-12", value: 128000 },
];

const mockPositions = [
  { symbol: "AAPL", name: "Apple Inc.", market: "US", quantity: 100, avgCost: 150, currentPrice: 185, marketValue: 18500, pnl: 3500, pnlPercent: 23.33, currency: "USD" },
  { symbol: "0700.HK", name: "腾讯控股", market: "HK", quantity: 200, avgCost: 320, currentPrice: 380, marketValue: 76000, pnl: 12000, pnlPercent: 18.75, currency: "HKD" },
  { symbol: "600519.SS", name: "贵州茅台", market: "A", quantity: 10, avgCost: 1680, currentPrice: 1750, marketValue: 17500, pnl: 700, pnlPercent: 4.17, currency: "CNY" },
];

export default function Dashboard() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">投资仪表盘</h1>
        <p className="text-muted mt-1">总览你的投资组合表现</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="总资产" value="$128,000" subtitle="USD" />
        <StatCard title="今日盈亏" value="+$2,000" change="+1.59%" changePositive />
        <StatCard title="本月收益" value="+$5,000" change="+4.07%" changePositive />
        <StatCard title="最大回撤" value="-5.8%" subtitle="2024年3月" />
      </div>

      <div className="bg-card border border-default rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4">资产曲线</h2>
        <EquityCurve data={mockEquityData} />
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-4">当前持仓</h2>
        <PositionsTable positions={mockPositions} />
      </div>
    </div>
  );
}
