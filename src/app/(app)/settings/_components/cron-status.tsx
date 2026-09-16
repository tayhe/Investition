"use client";

import { useState } from "react";

export function CronStatus() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>("");

  const handleTrigger = async (task: string) => {
    setLoading(true);
    setResult("");

    try {
      const res = await fetch("/api/cron/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "执行失败");
      }

      const data = await res.json();
      setResult(data.message);
    } catch (err) {
      setResult(err instanceof Error ? err.message : "执行失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        系统自动执行：每 4 小时更新价格和汇率，每日凌晨 1 点生成资产快照（纽约时间）。
      </p>
      <div className="flex gap-3">
        <button
          onClick={() => handleTrigger("prices")}
          disabled={loading}
          className="border border-default px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-accent disabled:opacity-50"
        >
          {loading ? "执行中..." : "手动获取价格"}
        </button>
        <button
          onClick={() => handleTrigger("rates")}
          disabled={loading}
          className="border border-default px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-accent disabled:opacity-50"
        >
          {loading ? "执行中..." : "手动获取汇率"}
        </button>
        <button
          onClick={() => handleTrigger("snapshot")}
          disabled={loading}
          className="border border-default px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-accent disabled:opacity-50"
        >
          {loading ? "执行中..." : "手动生成快照"}
        </button>
      </div>
      {result && <div className="text-sm text-muted">{result}</div>}
    </div>
  );
}
