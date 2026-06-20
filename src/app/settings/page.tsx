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
          配置 Interactive Brokers Flex Web Service 以自动同步交易数据。
          你需要在 IBKR 官网创建 Flex Query 并获取 Token。
        </p>

        <div className="space-y-4 max-w-lg">
          <div>
            <label className="block text-sm font-medium mb-1">Flex Token</label>
            <input
              type="password"
              placeholder="你的 IBKR Flex Token"
              className="w-full bg-background border border-default rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Flex Query ID</label>
            <input
              type="text"
              placeholder="你的 Flex Query ID"
              className="w-full bg-background border border-default rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <button className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90">
            保存配置
          </button>
        </div>
      </div>

      <div className="bg-card border border-default rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4">手动录入</h2>
        <p className="text-sm text-muted mb-4">
          如果你没有 IBKR 账户，可以手动录入交易记录。
        </p>
        <button className="border border-default px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent">
          添加交易记录
        </button>
      </div>

      <div className="bg-card border border-default rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4">数据导入</h2>
        <p className="text-sm text-muted mb-4">
          从 CSV 文件批量导入交易记录。
        </p>
        <div className="border-2 border-dashed border-default rounded-xl p-8 text-center">
          <p className="text-muted">拖拽 CSV 文件到此处，或点击选择文件</p>
          <p className="text-xs text-muted mt-2">支持 IBKR、富途、老虎等券商导出格式</p>
        </div>
      </div>
    </div>
  );
}
