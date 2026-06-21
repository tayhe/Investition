import { PriceFetcher } from "@/components/price-fetcher";
import { IbkrConfig } from "@/components/ibkr-config";
import { IbkrSync } from "@/components/ibkr-sync";
import { XmlImporter } from "@/components/xml-importer";
import { CsvImporter } from "@/components/csv-importer";
import { CronStatus } from "@/components/cron-status";

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">设置</h1>
        <p className="text-muted mt-1">管理你的账户、数据源和自动化任务</p>
      </div>

      <section className="space-y-6">
        <h2 className="text-lg font-semibold border-b border-default pb-2">券商集成</h2>

        <div className="bg-card border border-default rounded-xl p-6">
          <h3 className="text-base font-medium mb-2">Interactive Brokers</h3>
          <p className="text-sm text-muted mb-4">
            配置 Flex Web Service 自动同步 IBKR 账户的交易和持仓数据。
            需要在 IBKR 客户门户获取 Flex Token 和 Query ID。
          </p>
          <IbkrConfig />
          <div className="border-t border-default mt-6 pt-6">
            <h4 className="text-sm font-medium mb-3">执行同步</h4>
            <IbkrSync />
          </div>
        </div>

        <div className="bg-card border border-default rounded-xl p-6 opacity-60">
          <h3 className="text-base font-medium mb-2">Charles Schwab</h3>
          <p className="text-sm text-muted">
            暂不支持自动同步。请使用下方 CSV 导入功能导入 Schwab 数据。
          </p>
        </div>
      </section>

      <section className="space-y-6">
        <h2 className="text-lg font-semibold border-b border-default pb-2">数据导入</h2>

        <div className="bg-card border border-default rounded-xl p-6">
          <h3 className="text-base font-medium mb-2">CSV 文件导入</h3>
          <p className="text-sm text-muted mb-4">
            从券商导出 CSV 文件，批量导入交易记录和持仓。支持 Schwab、IBKR 和通用格式。
          </p>
          <CsvImporter />
        </div>

        <div className="bg-card border border-default rounded-xl p-6">
          <h3 className="text-base font-medium mb-2">IBKR Flex XML 导入</h3>
          <p className="text-sm text-muted mb-4">
            从 IBKR 客户门户手动下载 Flex Query XML 文件导入。适合 API 限流时使用。
          </p>
          <XmlImporter />
        </div>
      </section>

      <section className="space-y-6">
        <h2 className="text-lg font-semibold border-b border-default pb-2">行情数据</h2>

        <div className="bg-card border border-default rounded-xl p-6">
          <h3 className="text-base font-medium mb-2">价格和汇率</h3>
          <p className="text-sm text-muted mb-4">
            从 Yahoo Finance 获取股票价格和汇率数据，用于计算持仓市值和盈亏。
          </p>
          <PriceFetcher />
        </div>

        <div className="bg-card border border-default rounded-xl p-6">
          <h3 className="text-base font-medium mb-2">定时任务</h3>
          <p className="text-sm text-muted mb-4">
            自动定时获取价格、汇率和生成资产快照。
          </p>
          <CronStatus />
        </div>
      </section>
    </div>
  );
}
