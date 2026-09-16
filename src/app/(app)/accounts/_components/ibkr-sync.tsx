"use client";

import { useState, useEffect, useCallback } from "react";

interface SyncResult {
  success: boolean;
  trades: number;
  positions: number;
  fromCache?: boolean;
}

interface CacheStatus {
  hasCache: boolean;
  lastSync: string | null;
  tradesCount?: number;
  positionsCount?: number;
  canSync: boolean;
  waitSeconds: number;
}

export function IbkrSync() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState("");
  const [configured, setConfigured] = useState(false);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [cacheStatus, setCacheStatus] = useState<CacheStatus | null>(null);
  const [countdown, setCountdown] = useState(0);

  const fetchCacheStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/ibkr/cache-status");
      if (res.ok) {
        const data = await res.json();
        setCacheStatus(data);
        if (!data.canSync && data.waitSeconds > 0) {
          setCountdown(data.waitSeconds);
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetch("/api/ibkr/config")
      .then((r) => r.json())
      .then((data) => {
        setConfigured(data.configured);
        setAccountId(data.accountId);
        if (data.configured) fetchCacheStatus();
      })
      .catch(() => {});
  }, [fetchCacheStatus]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          fetchCacheStatus();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown, fetchCacheStatus]);

  const handleSync = async (mode: "sync" | "reprocess" = "sync", force = false) => {
    if (!accountId) return;

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, mode, force }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "同步失败");
      }

      const data = await res.json();
      setResult(data);
      fetchCacheStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "同步失败");
    } finally {
      setLoading(false);
    }
  };

  if (!configured) {
    return (
      <div className="text-sm text-muted">
        请先在上方配置 IBKR Flex Token 和 Query ID。
      </div>
    );
  }

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}分${s}秒` : `${s}秒`;
  };

  return (
    <div className="space-y-4">
      {cacheStatus?.hasCache && (
        <div className="text-sm text-muted">
          上次同步：{new Date(cacheStatus.lastSync!).toLocaleString("zh-CN")}
          （{cacheStatus.tradesCount} 笔交易，{cacheStatus.positionsCount} 个持仓）
        </div>
      )}

      <div className="flex gap-3 items-center">
        <button
          onClick={() => handleSync("sync")}
          disabled={loading || countdown > 0}
          className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "同步中..." : countdown > 0 ? `冷却中 (${formatTime(countdown)})` : "从 IBKR 同步"}
        </button>
        <button
          onClick={() => handleSync("reprocess")}
          disabled={loading}
          className="border border-default px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent disabled:opacity-50"
        >
          {loading ? "处理中..." : "从缓存重新处理"}
        </button>
        {countdown > 0 && (
          <button
            onClick={() => handleSync("sync", true)}
            disabled={loading}
            className="text-xs text-muted hover:text-foreground underline"
          >
            强制同步
          </button>
        )}
      </div>
      <p className="text-xs text-muted">
        IBKR API 限制：每分钟最多 10 次请求。系统自动遵守 15 分钟冷却期，避免触发限流。
        「从缓存重新处理」不消耗 API 配额。
      </p>

      {error && (
        <div className="bg-red/10 text-red text-sm p-3 rounded-lg">{error}</div>
      )}

      {result && (
        <div className="bg-green/10 text-green text-sm p-3 rounded-lg">
          {result.fromCache ? "使用缓存数据" : "从 IBKR 拉取"}，
          更新了 {result.trades} 笔交易，{result.positions} 个持仓。
        </div>
      )}
    </div>
  );
}
