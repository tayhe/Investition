import { PriceFetcher } from "@/components/price-fetcher";
import { IbkrConfig } from "@/components/ibkr-config";
import { IbkrSync } from "@/components/ibkr-sync";
import { XmlImporter } from "@/components/xml-importer";
import { CronStatus } from "@/components/cron-status";

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">设置</h1>
        <p className="text-muted mt-1">管理你的账户和数据源配置</p>
      </div>

      <div className="bg-card border border-default rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4">IBKR 数据同步</h2>
        <p className="text-sm text-muted mb-4">
          配置 Interactive Brokers Flex Web Service 以同步交易数据和持仓。
          你需要在 IBKR 官网的 Reports → Flex Queries 中创建查询，并在 Settings → API Access 中获取 Token。
        </p>
        <IbkrConfig />
        <div className="border-t border-default mt-6 pt-6">
          <h3 className="text-sm font-medium mb-3">执行同步</h3>
          <IbkrSync />
        </div>
      </div>

      <div className="bg-card border border-default rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4">价格数据</h2>
        <p className="text-sm text-muted mb-4">
          从 Yahoo Finance 获取最新行情和汇率数据，用于计算持仓市值和盈亏。
        </p>
        <PriceFetcher />
      </div>

      <div className="bg-card border border-default rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4">定时任务</h2>
        <CronStatus />
      </div>

      <div className="bg-card border border-default rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4">手动导入 Flex XML</h2>
        <p className="text-sm text-muted mb-4">
          从 IBKR 客户门户手动下载 Flex Query 的 XML 报告文件，然后在此导入。
          适合 API 被限流时使用。
        </p>
        <XmlImporter />
      </div>
    </div>
  );
}
