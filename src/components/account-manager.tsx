"use client";

import { useState, useEffect, useCallback } from "react";

interface Account {
  id: string;
  name: string;
  broker: string;
  currency: string;
  hasIbkrConfig: boolean;
  createdAt: string;
}

export function AccountManager() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [broker, setBroker] = useState("MANUAL");
  const [currency, setCurrency] = useState("USD");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/accounts");
      if (res.ok) {
        const data = await res.json();
        setAccounts(data);
      }
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const handleCreate = async () => {
    if (!name.trim()) {
      setError("请输入账户名称");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), broker, currency }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "创建失败");
      }

      setName("");
      setShowForm(false);
      fetchAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, accountName: string) => {
    if (!confirm(`确定删除账户「${accountName}」？该账户下的所有持仓、交易和快照数据将被永久删除。`)) {
      return;
    }

    try {
      const res = await fetch(`/api/accounts?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        fetchAccounts();
      }
    } catch {}
  };

  const brokerLabels: Record<string, string> = {
    MANUAL: "手动录入",
    IBKR: "Interactive Brokers",
  };

  const currencyOptions = ["USD", "HKD", "CNY", "EUR", "GBP", "JPY", "SEK"];

  if (loading) {
    return <div className="text-sm text-muted">加载中...</div>;
  }

  return (
    <div className="space-y-4">
      {accounts.length === 0 ? (
        <div className="text-center py-8 text-muted border border-default rounded-xl">
          暂无账户，请添加
        </div>
      ) : (
        <div className="border border-default rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-default bg-muted/50">
                <th className="text-left py-3 px-4 text-sm font-medium text-muted">名称</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-muted">券商</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-muted">币种</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-muted">IBKR</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-muted">创建时间</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-muted">操作</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.id} className="border-b border-default last:border-0 hover:bg-accent/50">
                  <td className="py-3 px-4 text-sm font-medium">{account.name}</td>
                  <td className="py-3 px-4 text-sm">{brokerLabels[account.broker] || account.broker}</td>
                  <td className="py-3 px-4 text-sm">{account.currency}</td>
                  <td className="py-3 px-4 text-sm">
                    {account.hasIbkrConfig ? (
                      <span className="text-green">已配置</span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-sm text-muted">
                    {new Date(account.createdAt).toLocaleDateString("zh-CN")}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => handleDelete(account.id, account.name)}
                      className="text-sm text-red hover:underline"
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm ? (
        <div className="bg-card border border-default rounded-xl p-6 space-y-4">
          <h3 className="text-sm font-medium">添加新账户</h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-muted mb-1">账户名称</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="如：美股账户"
                className="w-full bg-background border border-default rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">券商类型</label>
              <select
                value={broker}
                onChange={(e) => setBroker(e.target.value)}
                className="w-full bg-background border border-default rounded-lg px-3 py-2 text-sm"
              >
                <option value="MANUAL">手动录入</option>
                <option value="IBKR">Interactive Brokers</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">基准币种</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full bg-background border border-default rounded-lg px-3 py-2 text-sm"
              >
                {currencyOptions.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
          {error && <div className="text-sm text-red">{error}</div>}
          <div className="flex gap-3">
            <button
              onClick={handleCreate}
              disabled={saving}
              className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "创建中..." : "创建"}
            </button>
            <button
              onClick={() => { setShowForm(false); setError(""); }}
              className="border border-default px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent"
            >
              取消
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="border border-default px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent"
        >
          + 添加账户
        </button>
      )}
    </div>
  );
}
