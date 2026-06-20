const mockTrades = [
  { id: "1", date: "2024-12-15", symbol: "AAPL", side: "BUY" as const, quantity: 50, price: 180, amount: 9000, currency: "USD", commission: 1 },
  { id: "2", date: "2024-12-10", symbol: "0700.HK", side: "BUY" as const, quantity: 100, price: 370, amount: 37000, currency: "HKD", commission: 15 },
  { id: "3", date: "2024-12-05", symbol: "MSFT", side: "SELL" as const, quantity: 20, price: 385, amount: 7700, currency: "USD", commission: 1 },
  { id: "4", date: "2024-11-28", symbol: "600519.SS", side: "BUY" as const, quantity: 5, price: 1700, amount: 8500, currency: "CNY", commission: 5 },
  { id: "5", date: "2024-11-20", symbol: "AAPL", side: "BUY" as const, quantity: 50, price: 175, amount: 8750, currency: "USD", commission: 1 },
  { id: "6", date: "2024-11-15", symbol: "9988.HK", side: "SELL" as const, quantity: 100, price: 82, amount: 8200, currency: "HKD", commission: 10 },
];

function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(value);
}

export default function TransactionsPage() {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">交易记录</h1>
          <p className="text-muted mt-1">查看所有买入/卖出记录</p>
        </div>
        <div className="flex gap-2">
          <select className="bg-card border border-default rounded-lg px-3 py-2 text-sm">
            <option>全部市场</option>
            <option>美股</option>
            <option>港股</option>
            <option>A股</option>
          </select>
          <select className="bg-card border border-default rounded-lg px-3 py-2 text-sm">
            <option>全部类型</option>
            <option>买入</option>
            <option>卖出</option>
          </select>
        </div>
      </div>

      <div className="border border-default rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-default bg-muted/50">
              <th className="text-left py-3 px-4 text-sm font-medium text-muted">日期</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-muted">标的</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-muted">方向</th>
              <th className="text-right py-3 px-4 text-sm font-medium text-muted">数量</th>
              <th className="text-right py-3 px-4 text-sm font-medium text-muted">价格</th>
              <th className="text-right py-3 px-4 text-sm font-medium text-muted">金额</th>
              <th className="text-right py-3 px-4 text-sm font-medium text-muted">手续费</th>
            </tr>
          </thead>
          <tbody>
            {mockTrades.map((trade) => (
              <tr key={trade.id} className="border-b border-default last:border-0 hover:bg-accent/50">
                <td className="py-3 px-4 text-sm">{trade.date}</td>
                <td className="py-3 px-4">
                  <div className="font-medium text-sm">{trade.symbol}</div>
                </td>
                <td className="py-3 px-4">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                      trade.side === "BUY"
                        ? "bg-green/10 text-green"
                        : "bg-red/10 text-red"
                    }`}
                  >
                    {trade.side === "BUY" ? "买入" : "卖出"}
                  </span>
                </td>
                <td className="text-right py-3 px-4 text-sm">{trade.quantity}</td>
                <td className="text-right py-3 px-4 text-sm">
                  {formatCurrency(trade.price, trade.currency)}
                </td>
                <td className="text-right py-3 px-4 text-sm font-medium">
                  {formatCurrency(trade.amount, trade.currency)}
                </td>
                <td className="text-right py-3 px-4 text-sm text-muted">
                  {formatCurrency(trade.commission, trade.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
