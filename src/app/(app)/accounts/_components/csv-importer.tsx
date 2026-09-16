"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface Account {
  id: string;
  name: string;
  broker: string;
  currency: string;
}

interface ImportResult {
  success: boolean;
  format: string;
  trades: number;
  positions: number;
  errors: string[];
}

export function CsvImporter() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/accounts");
      if (res.ok) {
        const data = await res.json();
        setAccounts(data);
        if (data.length > 0 && !selectedAccount) {
          setSelectedAccount(data[0].id);
        }
      }
    } catch {}
  }, [selectedAccount]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAccounts();
  }, [fetchAccounts]);

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("请选择 CSV 文件");
      return;
    }

    if (!selectedAccount) {
      setError("请选择账户");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("accountId", selectedAccount);

      const res = await fetch("/api/import/csv", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || data.errors?.join(", ") || "导入失败");
      }

      setResult(data);
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "导入失败");
    } finally {
      setLoading(false);
    }
  };

  const formatLabels: Record<string, string> = {
    schwab_transactions: "Schwab 交易记录",
    schwab_positions: "Schwab 持仓",
    ibkr: "IBKR Activity Statement",
    generic: "通用格式",
  };

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted space-y-2">
        <p>支持以下 CSV 格式：</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Schwab</strong> — 交易历史导出（含 Action、Symbol、Quantity 等列）</li>
          <li><strong>Schwab</strong> — 持仓导出（含 Symbol、Quantity、Price 等列）</li>
          <li><strong>IBKR</strong> — Activity Statement CSV</li>
          <li><strong>通用格式</strong> — 必须包含 date, symbol, side, quantity, price 列</li>
        </ul>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-muted mb-1">选择账户</label>
          <select
            value={selectedAccount}
            onChange={(e) => setSelectedAccount(e.target.value)}
            className="w-full bg-background border border-default rounded-lg px-3 py-2 text-sm"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.broker === "IBKR" ? "IBKR" : "手动"})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">选择 CSV 文件</label>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="w-full text-sm text-muted file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:opacity-90"
          />
        </div>
      </div>

      <button
        onClick={handleUpload}
        disabled={loading || accounts.length === 0}
        className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
      >
        {loading ? "导入中..." : "导入 CSV"}
      </button>

      {error && (
        <div className="bg-red/10 text-red text-sm p-3 rounded-lg">{error}</div>
      )}

      {result && (
        <div className="bg-green/10 text-green text-sm p-3 rounded-lg space-y-1">
          <div>识别格式：{formatLabels[result.format] || result.format}</div>
          {result.trades > 0 && <div>导入 {result.trades} 笔交易</div>}
          {result.positions > 0 && <div>导入 {result.positions} 个持仓</div>}
          {result.errors.length > 0 && (
            <div className="text-yellow-600 mt-2">
              警告：{result.errors.join("; ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
