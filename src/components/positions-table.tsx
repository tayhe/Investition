"use client";

import { formatCurrency, formatPercent, getReturnColor } from "@/lib/utils";

interface PositionRow {
  symbol: string;
  name: string;
  market: string;
  quantity: number;
  avgCost: number;
  currentPrice: number;
  usdPrice?: number;
  marketValue: number;
  usdMarketValue?: number;
  pnl: number;
  pnlPercent: number;
  currency: string;
}

interface PositionsTableProps {
  positions: PositionRow[];
}

export function PositionsTable({ positions }: PositionsTableProps) {
  if (positions.length === 0) {
    return (
      <div className="text-center py-12 text-muted border border-default rounded-xl">
        暂无持仓数据
      </div>
    );
  }

  return (
    <div className="border border-default rounded-xl overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-default bg-muted/50">
            <th className="text-left py-3 px-4 text-sm font-medium text-muted">标的</th>
            <th className="text-right py-3 px-4 text-sm font-medium text-muted">数量</th>
            <th className="text-right py-3 px-4 text-sm font-medium text-muted">成本价</th>
            <th className="text-right py-3 px-4 text-sm font-medium text-muted">现价</th>
            <th className="text-right py-3 px-4 text-sm font-medium text-muted">市值</th>
            <th className="text-right py-3 px-4 text-sm font-medium text-muted">盈亏</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((pos) => {
            const isNonUsd = pos.currency !== "USD" && pos.usdMarketValue !== undefined;
            return (
              <tr key={pos.symbol} className="border-b border-default last:border-0 hover:bg-accent/50">
                <td className="py-3 px-4">
                  <div className="font-medium text-sm">{pos.symbol}</div>
                  <div className="text-xs text-muted">{pos.name}</div>
                </td>
                <td className="text-right py-3 px-4 text-sm">{pos.quantity}</td>
                <td className="text-right py-3 px-4 text-sm">
                  {formatCurrency(pos.avgCost, pos.currency)}
                </td>
                <td className="text-right py-3 px-4 text-sm">
                  <div>{formatCurrency(pos.currentPrice, pos.currency)}</div>
                  {isNonUsd && pos.usdPrice !== undefined && (
                    <div className="text-xs text-muted">≈${pos.usdPrice.toFixed(2)}</div>
                  )}
                </td>
                <td className="text-right py-3 px-4 text-sm font-medium">
                  <div>{formatCurrency(pos.marketValue, pos.currency)}</div>
                  {isNonUsd && pos.usdMarketValue !== undefined && (
                    <div className="text-xs text-muted">≈${pos.usdMarketValue.toFixed(2)}</div>
                  )}
                </td>
                <td className="text-right py-3 px-4">
                  <div className={`text-sm font-medium ${getReturnColor(pos.pnl)}`}>
                    {formatCurrency(pos.pnl, pos.currency)}
                  </div>
                  <div className={`text-xs ${getReturnColor(pos.pnlPercent)}`}>
                    {formatPercent(pos.pnlPercent)}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
