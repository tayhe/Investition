"use client";

import { useEffect, useState, useMemo } from "react";
import { X, ArrowUpRight, ArrowDownRight, Loader2 } from "lucide-react";
import { formatCurrency, formatNumber } from "@/lib/utils";

interface TradeRecord {
  id: string;
  date: string;
  time: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  amount: number;
  commission: number;
  currency: string;
  accountName?: string;
  securityType?: string;
  multiplier?: number;
}

interface TradeHistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  symbol: string | null;
  name?: string;
  currency?: string;
  securityType?: string;
}

function getSecurityUnit(type?: string): string {
  switch (type) {
    case "OPTION":
    case "FUTURE":
      return "手";
    case "FUND":
      return "份";
    case "BOND":
      return "张";
    case "STOCK":
    case "ETF":
    default:
      return "股";
  }
}

export function TradeHistoryDrawer({
  isOpen,
  onClose,
  symbol,
  name,
  currency = "USD",
  securityType,
}: TradeHistoryDrawerProps) {
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unit = useMemo(() => {
    return getSecurityUnit(securityType || trades[0]?.securityType);
  }, [securityType, trades]);


  // Handle ESC key press
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Fetch trades
  useEffect(() => {
    if (!isOpen || !symbol) return;

    let cancelled = false;
    async function loadTrades() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/trades?symbol=${encodeURIComponent(symbol!)}&year=${selectedYear}`
        );
        if (!res.ok) {
          throw new Error("获取交易记录失败");
        }
        const json = await res.json();
        if (!cancelled) {
          setTrades(json.data || []);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "未知错误");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadTrades();

    return () => {
      cancelled = true;
    };
  }, [isOpen, symbol, selectedYear]);

  // Compute summary stats
  const summary = useMemo(() => {
    let buyCount = 0;
    let buyQty = 0;
    let buyAmount = 0;
    let sellCount = 0;
    let sellQty = 0;
    let sellAmount = 0;
    let buyWeightedPriceSum = 0;
    let sellWeightedPriceSum = 0;
    let totalCommission = 0;

    for (const t of trades) {
      totalCommission += t.commission;
      if (t.side === "BUY") {
        buyCount += 1;
        buyQty += t.quantity;
        buyAmount += t.amount;
        buyWeightedPriceSum += t.price * t.quantity;
      } else {
        sellCount += 1;
        sellQty += t.quantity;
        sellAmount += t.amount;
        sellWeightedPriceSum += t.price * t.quantity;
      }
    }

    const buyAvgPrice = buyQty > 0 ? buyWeightedPriceSum / buyQty : 0;
    const sellAvgPrice = sellQty > 0 ? sellWeightedPriceSum / sellQty : 0;

    return {
      buyCount,
      buyQty,
      buyAvgPrice,
      buyAmount,
      sellCount,
      sellQty,
      sellAvgPrice,
      sellAmount,
      totalCommission,
      tradeCount: trades.length,
    };
  }, [trades]);

  if (!isOpen || !symbol) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Drawer content */}
      <aside
        aria-label="交易明细抽屉"
        className="relative z-10 w-full max-w-2xl bg-card border-l border-default h-full flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-right duration-200"
      >
        {/* Header */}
        <div className="p-6 border-b border-default flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold">{symbol}</h2>
              <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted">
                {currency}
              </span>
            </div>
            {name && <p className="text-sm text-muted mt-0.5">{name}</p>}
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-muted hover:text-foreground hover:bg-accent transition-colors"
            title="关闭 (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Year Filter & Overview */}
        <div className="p-6 border-b border-default space-y-4 bg-muted/20">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted">查询年份</span>
            <div className="flex items-center gap-1.5 bg-muted/60 p-1 rounded-lg border border-default text-xs">
              {[currentYear, currentYear - 1, currentYear - 2].map((y) => (
                <button
                  key={y}
                  onClick={() => setSelectedYear(y)}
                  className={`px-3 py-1 rounded font-medium transition-all ${
                    selectedYear === y
                      ? "bg-card text-foreground shadow-xs font-semibold"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  {y === currentYear ? `今年 (${y})` : y}
                </button>
              ))}
            </div>
          </div>

          {/* Aggregated Stats Cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl border border-default bg-card">
              <div className="flex items-center gap-1 text-xs text-green font-medium">
                <ArrowUpRight className="w-3.5 h-3.5" />
                <span>累计买入</span>
                <span className="text-muted ml-auto">
                  {summary.buyCount} 笔
                </span>
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-lg font-bold">
                  {summary.buyQty > 0 ? formatCurrency(summary.buyAvgPrice, currency) : "-"}
                </span>
                <span className="text-xs text-muted">均价</span>
              </div>
              <div className="mt-1 text-xs text-muted">
                共 {formatNumber(summary.buyQty)} {unit}
              </div>
            </div>

            <div className="p-3.5 rounded-xl border border-default bg-card">
              <div className="flex items-center gap-1 text-xs text-red font-medium">
                <ArrowDownRight className="w-3.5 h-3.5" />
                <span>累计卖出</span>
                <span className="text-muted ml-auto">
                  {summary.sellCount} 笔
                </span>
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-lg font-bold">
                  {summary.sellQty > 0 ? formatCurrency(summary.sellAvgPrice, currency) : "-"}
                </span>
                <span className="text-xs text-muted">均价</span>
              </div>
              <div className="mt-1 text-xs text-muted">
                共 {formatNumber(summary.sellQty)} {unit}
              </div>
            </div>
          </div>
        </div>

        {/* Content Table / List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted">
              <Loader2 className="w-6 h-6 animate-spin mb-2" />
              <span className="text-sm">正在加载交易记录...</span>
            </div>
          ) : error ? (
            <div className="text-center py-20 text-red px-6 text-sm">{error}</div>
          ) : trades.length === 0 ? (
            <div className="text-center py-20 text-muted text-sm">
              {selectedYear} 年无 {symbol} 的交易记录
            </div>
          ) : (
            <table className="w-full">
              <thead className="sticky top-0 bg-card border-b border-default z-10">
                <tr className="bg-muted/40">
                  <th className="text-left py-2.5 px-4 text-xs font-medium text-muted">
                    成交时间
                  </th>
                  <th className="text-left py-2.5 px-3 text-xs font-medium text-muted">
                    方向
                  </th>
                  <th className="text-right py-2.5 px-3 text-xs font-medium text-muted">
                    数量 ({unit})
                  </th>
                  <th className="text-right py-2.5 px-3 text-xs font-medium text-muted">
                    成交价
                  </th>
                  <th className="text-right py-2.5 px-4 text-xs font-medium text-muted">
                    总金额
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-default">
                {trades.map((t) => (
                  <tr key={t.id} className="hover:bg-accent/40 text-sm transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-medium text-xs">{t.date}</div>
                      <div className="text-[11px] text-muted">{t.time}</div>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold ${
                          t.side === "BUY"
                            ? "bg-green/10 text-green"
                            : "bg-red/10 text-red"
                        }`}
                      >
                        {t.side === "BUY" ? "买入" : "卖出"}
                      </span>
                    </td>
                    <td className="text-right py-3 px-3 font-medium text-xs">
                      {formatNumber(t.quantity)}
                    </td>
                    <td className="text-right py-3 px-3 text-xs">
                      {formatCurrency(t.price, t.currency)}
                    </td>
                    <td className="text-right py-3 px-4 text-xs">
                      <div className="font-medium">
                        {formatCurrency(t.amount, t.currency)}
                      </div>
                      {t.commission > 0 && (
                        <div className="text-[10px] text-muted">
                          费: {formatCurrency(t.commission, t.currency)}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        {trades.length > 0 && (
          <div className="p-3 border-t border-default bg-muted/20 text-xs text-muted flex justify-between items-center px-4">
            <span>共 {trades.length} 笔交易</span>
            {summary.totalCommission > 0 && (
              <span>累计手续费: {formatCurrency(summary.totalCommission, currency)}</span>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
