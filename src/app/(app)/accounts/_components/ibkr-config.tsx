"use client";

import { useState, useEffect } from "react";

export function IbkrConfig() {
  const [token, setToken] = useState("");
  const [queryId, setQueryId] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [configured, setConfigured] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/ibkr/config")
      .then((r) => r.json())
      .then((data) => setConfigured(data.configured))
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    setStatus("saving");
    setMessage("");

    try {
      const res = await fetch("/api/ibkr/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, queryId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "保存失败");
      }

      setStatus("saved");
      setConfigured(true);
      setMessage("配置已保存");
      setToken("");
      setQueryId("");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "保存失败");
    }
  };

  return (
    <div className="space-y-4 max-w-lg">
      {configured && (
        <div className="bg-green/10 text-green text-sm p-3 rounded-lg">
          IBKR Flex 已配置
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-1">Flex Token</label>
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder={configured ? "输入新 Token 以更新" : "你的 IBKR Flex Token"}
          className="w-full bg-background border border-default rounded-lg px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Flex Query ID</label>
        <input
          type="text"
          value={queryId}
          onChange={(e) => setQueryId(e.target.value)}
          placeholder={configured ? "输入新 Query ID 以更新" : "你的 Flex Query ID"}
          className="w-full bg-background border border-default rounded-lg px-3 py-2 text-sm"
        />
      </div>

      {message && (
        <div
          className={`text-sm p-3 rounded-lg ${
            status === "error" ? "bg-red/10 text-red" : "bg-green/10 text-green"
          }`}
        >
          {message}
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={status === "saving" || (!token && !queryId)}
        className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
      >
        {status === "saving" ? "保存中..." : "保存配置"}
      </button>
    </div>
  );
}
