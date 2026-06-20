import { PositionsTable } from "@/components/positions-table";

const mockPositions = [
  { symbol: "AAPL", name: "Apple Inc.", market: "US", quantity: 100, avgCost: 150, currentPrice: 185, marketValue: 18500, pnl: 3500, pnlPercent: 23.33, currency: "USD" },
  { symbol: "MSFT", name: "Microsoft Corp.", market: "US", quantity: 50, avgCost: 320, currentPrice: 380, marketValue: 19000, pnl: 3000, pnlPercent: 18.75, currency: "USD" },
  { symbol: "0700.HK", name: "腾讯控股", market: "HK", quantity: 200, avgCost: 320, currentPrice: 380, marketValue: 76000, pnl: 12000, pnlPercent: 18.75, currency: "HKD" },
  { symbol: "9988.HK", name: "阿里巴巴", market: "HK", quantity: 300, avgCost: 85, currentPrice: 78, marketValue: 23400, pnl: -2100, pnlPercent: -8.24, currency: "HKD" },
  { symbol: "600519.SS", name: "贵州茅台", market: "A", quantity: 10, avgCost: 1680, currentPrice: 1750, marketValue: 17500, pnl: 700, pnlPercent: 4.17, currency: "CNY" },
  { symbol: "000858.SZ", name: "五粮液", market: "A", quantity: 100, avgCost: 155, currentPrice: 148, marketValue: 14800, pnl: -700, pnlPercent: -4.52, currency: "CNY" },
];

export default function PortfolioPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">持仓管理</h1>
        <p className="text-muted mt-1">查看和管理你的投资持仓</p>
      </div>

      <div className="flex gap-4">
        <div className="bg-card border border-default rounded-xl p-4 flex-1">
          <div className="text-sm text-muted">美股持仓</div>
          <div className="text-xl font-bold mt-1">$37,500</div>
          <div className="text-sm text-green mt-1">+$6,500 (+20.97%)</div>
        </div>
        <div className="bg-card border border-default rounded-xl p-4 flex-1">
          <div className="text-sm text-muted">港股持仓</div>
          <div className="text-xl font-bold mt-1">HK$99,400</div>
          <div className="text-sm text-green mt-1">+HK$9,900 (+11.06%)</div>
        </div>
        <div className="bg-card border border-default rounded-xl p-4 flex-1">
          <div className="text-sm text-muted">A股持仓</div>
          <div className="text-xl font-bold mt-1">¥32,300</div>
          <div className="text-sm text-muted mt-1">¥0 (0.00%)</div>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-4">全部持仓</h2>
        <PositionsTable positions={mockPositions} />
      </div>
    </div>
  );
}
