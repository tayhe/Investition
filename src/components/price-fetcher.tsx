"use client";

import { useState } from "react";

interface FetchResult {
  prices: { updated: number; skipped?: number; errors: string[] };
  exchangeRates: { updated: number; skipped?: number; errors: string[] };
}

export function PriceFetcher() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FetchResult | null>(null);
  const [error, setError] = useState("");

  const handleFetch = async (historical = false) => {
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ historical, days: 30 }),
      });

      if (!res.ok) throw new Error("获取失败");

      const data = await res.json();
      setResult(data);
    } catch {
      setError("价格获取失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <button
          onClick={() => handleFetch(false)}
          disabled={loading}
          className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "获取中..." : "获取最新价格"}
        </button>
        <button
          onClick={() => handleFetch(true)}
          disabled={loading}
          className="border border-default px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent disabled:opacity-50"
        >
          {loading ? "获取中..." : "获取近30天历史价格"}
        </button>
      </div>

      {error && (
        <div className="bg-red/10 text-red text-sm p-3 rounded-lg">{error}</div>
      )}

      {result && (
        <div className="bg-muted/50 rounded-lg p-4 text-sm space-y-2">
          <div>
            <span className="font-medium">价格更新：</span>
            {result.prices.updated} 只标的
            {result.prices.skipped ? <span className="text-muted ml-2">（{result.prices.skipped} 只跳过，4小时内已更新）</span> : null}
            {result.prices.errors.length > 0 && (
              <span className="text-red ml-2">
                ({result.prices.errors.length} 个失败)
              </span>
            )}
          </div>
          <div>
            <span className="font-medium">汇率更新：</span>
            {result.exchangeRates.updated} 个币对
            {result.exchangeRates.errors.length > 0 && (
              <span className="text-red ml-2">
                ({result.exchangeRates.errors.length} 个失败)
              </span>
            )}
          </div>
          {result.prices.errors.length > 0 && (
            <div className="text-xs text-muted mt-2">
              {result.prices.errors.map((e, i) => (
                <div key={i}>{e}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
