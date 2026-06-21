import { PriceFetcher } from "@/components/price-fetcher";
import { CronStatus } from "@/components/cron-status";

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">设置</h1>
        <p className="text-muted mt-1">管理全局行情数据和自动化任务</p>
      </div>

      <section className="space-y-6">
        <h2 className="text-lg font-semibold border-b border-default pb-2">行情数据</h2>

        <div className="bg-card border border-default rounded-xl p-6">
          <h3 className="text-base font-medium mb-2">价格和汇率</h3>
          <p className="text-sm text-muted mb-4">
            从 Yahoo Finance 获取所有证券的价格和汇率数据，用于计算持仓市值和盈亏。
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
