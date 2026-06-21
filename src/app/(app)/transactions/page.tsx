import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { formatCurrency } from "@/lib/utils";

async function getTrades() {
  const session = await auth();
  if (!session?.user?.id) return [];

  const accounts = await db.account.findMany({
    where: { userId: session.user.id },
  });

  if (accounts.length === 0) return [];

  const accountIds = accounts.map((a) => a.id);

  const trades = await db.trade.findMany({
    where: { accountId: { in: accountIds } },
    include: { security: true },
    orderBy: { executedAt: "desc" },
    take: 200,
  });

  return trades.map((t) => ({
    id: t.id,
    date: t.executedAt.toISOString().split("T")[0],
    symbol: t.security.symbol,
    name: t.security.name,
    market: t.security.market,
    side: t.side,
    quantity: Number(t.quantity),
    price: Number(t.price),
    amount: Number(t.amount),
    commission: t.commission ? Number(t.commission) : 0,
    currency: t.currency,
  }));
}

export default async function TransactionsPage() {
  const trades = await getTrades();

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">交易记录</h1>
          <p className="text-muted mt-1">查看所有买入/卖出记录</p>
        </div>
      </div>

      {trades.length === 0 ? (
        <div className="text-center py-20 text-muted border border-default rounded-xl">
          暂无交易记录
        </div>
      ) : (
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
              {trades.map((trade) => (
                <tr key={trade.id} className="border-b border-default last:border-0 hover:bg-accent/50">
                  <td className="py-3 px-4 text-sm">{trade.date}</td>
                  <td className="py-3 px-4">
                    <div className="font-medium text-sm">{trade.symbol}</div>
                    <div className="text-xs text-muted">{trade.name}</div>
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
      )}
    </div>
  );
}
