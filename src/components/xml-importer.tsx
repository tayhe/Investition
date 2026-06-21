"use client";

import { useState, useRef } from "react";

interface ImportResult {
  success: boolean;
  trades: number;
  positions: number;
}

export function XmlImporter() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("请选择 XML 文件");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/ibkr/import", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "导入失败");
      }

      const data = await res.json();
      setResult(data);
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "导入失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        从 IBKR 客户门户下载 Flex Query XML 文件，然后在此导入。
        导入后数据会自动存入缓存，后续可从缓存重新处理。
      </p>
      <div className="flex gap-3 items-center">
        <input
          ref={fileRef}
          type="file"
          accept=".xml"
          className="text-sm text-muted file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:opacity-90"
        />
        <button
          onClick={handleUpload}
          disabled={loading}
          className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "导入中..." : "导入"}
        </button>
      </div>

      {error && (
        <div className="bg-red/10 text-red text-sm p-3 rounded-lg">{error}</div>
      )}

      {result && (
        <div className="bg-green/10 text-green text-sm p-3 rounded-lg">
          导入成功！更新了 {result.trades} 笔交易，{result.positions} 个持仓。
        </div>
      )}
    </div>
  );
}
