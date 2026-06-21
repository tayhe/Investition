"use client";

import { useState, useEffect, useCallback } from "react";
import { IbkrConfig } from "@/components/ibkr-config";
import { IbkrSync } from "@/components/ibkr-sync";
import { XmlImporter } from "@/components/xml-importer";
import { CsvImporter } from "@/components/csv-importer";

interface Account {
  id: string;
  name: string;
  broker: string;
  currency: string;
  hasIbkrConfig: boolean;
  createdAt: string;
}

type ImportMethod = "api" | "manual";

export function AccountManager() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [importMethod, setImportMethod] = useState<ImportMethod>("api");
  const [name, setName] = useState("");
  const [broker, setBroker] = useState("MANUAL");
  const [currency, setCurrency] = useState("USD");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/accounts");
      if (res.ok) {
        const data = await res.json();
        setAccounts(data);
        if (!initialized && data.length > 0) {
          setExpandedId(data[0].id);
          setInitialized(true);
        }
      }
    } catch {} finally {
      setLoading(false);
    }
  }, [initialized]);

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
    if (!confirm(`确定删除账户「${accountName}」？该账户下的所有持仓、交易和快照数据将被永久删除。`)) return;
    try {
      const res = await fetch(`/api/accounts?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        if (expandedId === id) setExpandedId(null);
        fetchAccounts();
      }
    } catch {}
  };

  const brokerLabels: Record<string, string> = { MANUAL: "手动录入", IBKR: "Interactive Brokers" };
  const currencyOptions = ["USD", "HKD", "CNY", "EUR", "GBP", "JPY", "SEK"];

  if (loading) return <div className="text-sm text-muted">加载中...</div>;

  return (
    <div className="space-y-6">
      {accounts.length === 0 ? (
        <div className="text-center py-8 text-muted border border-default rounded-xl">
          暂无账户，请先添加
        </div>
      ) : (
        <div className="space-y-2">
          {accounts.map((account) => (
            <div key={account.id} className="border border-default rounded-xl overflow-hidden">
              <button
                onClick={() => setExpandedId(expandedId === account.id ? null : account.id)}
                className="w-full flex items-center justify-between p-4 hover:bg-accent/50 transition-colors text-left"
              >
                <div>
                  <div className="font-medium text-sm">{account.name}</div>
                  <div className="text-xs text-muted">
                    {brokerLabels[account.broker] || account.broker} · {account.currency}
                    {account.hasIbkrConfig && <span className="text-green ml-2">IBKR 已配置</span>}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted">{new Date(account.createdAt).toLocaleDateString("zh-CN")}</span>
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(account.id, account.name); }} className="text-xs text-red hover:underline">删除</button>
                  <svg className={`h-4 w-4 text-muted transition-transform ${expandedId === account.id ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </div>
              </button>

              {expandedId === account.id && (
                <div className="border-t border-default p-4 space-y-6 bg-muted/20">
                  {account.broker === "IBKR" && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-medium">数据来源</h4>
                        <div className="flex bg-background rounded-lg border border-default p-0.5">
                          <button
                            onClick={() => setImportMethod("api")}
                            className={`px-3 py-1 text-xs rounded-md transition-colors ${importMethod === "api" ? "bg-primary text-primary-foreground" : "text-muted hover:text-foreground"}`}
                          >
                            API 自动同步
                          </button>
                          <button
                            onClick={() => setImportMethod("manual")}
                            className={`px-3 py-1 text-xs rounded-md transition-colors ${importMethod === "manual" ? "bg-primary text-primary-foreground" : "text-muted hover:text-foreground"}`}
                          >
                            手动导入文件
                          </button>
                        </div>
                      </div>

                      {importMethod === "api" ? (
                        <div className="space-y-4">
                          <IbkrConfig />
                          <div className="border-t border-default pt-4">
                            <IbkrSync />
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <p className="text-xs text-muted">支持 CSV（Schwab/IBKR/通用格式）和 IBKR Flex XML 文件。</p>
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div>
                              <h5 className="text-xs text-muted mb-2">CSV 导入</h5>
                              <CsvImporter />
                            </div>
                            <div>
                              <h5 className="text-xs text-muted mb-2">IBKR Flex XML</h5>
                              <XmlImporter />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {account.broker === "MANUAL" && (
                    <div className="space-y-4">
                      <p className="text-sm text-muted">手动录入账户，可通过 CSV 导入交易记录。</p>
                      <CsvImporter />
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showForm ? (
        <div className="bg-card border border-default rounded-xl p-6 space-y-4">
          <h3 className="text-sm font-medium">添加新账户</h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-muted mb-1">账户名称</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="如：美股账户" className="w-full bg-background border border-default rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">券商类型</label>
              <select value={broker} onChange={(e) => setBroker(e.target.value)} className="w-full bg-background border border-default rounded-lg px-3 py-2 text-sm">
                <option value="MANUAL">手动录入</option>
                <option value="IBKR">Interactive Brokers</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">基准币种</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-full bg-background border border-default rounded-lg px-3 py-2 text-sm">
                {currencyOptions.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          {error && <div className="text-sm text-red">{error}</div>}
          <div className="flex gap-3">
            <button onClick={handleCreate} disabled={saving} className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50">{saving ? "创建中..." : "创建"}</button>
            <button onClick={() => { setShowForm(false); setError(""); }} className="border border-default px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent">取消</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowForm(true)} className="border border-default px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent">+ 添加账户</button>
      )}
    </div>
  );
}
