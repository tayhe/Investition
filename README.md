# Investition

投资组合记录与复盘分析平台，支持美股、港股、A股市场的基金和股票追踪。

## 功能特性

- **投资仪表盘** — 总资产曲线、持仓概览、盈亏统计、最大回撤
- **持仓管理** — 按市场分组（US/HK/A股），成本价、现价、盈亏一目了然
- **交易记录** — 买入/卖出时间线，按标的、时间、市场筛选
- **复盘分析** — 回撤图、月度收益明细、市场分布
- **账户管理** — 多账户支持，每个账户独立的券商集成和数据导入
- **IBKR 自动同步** — 对接 Interactive Brokers Flex Web Service，含缓存和限流防护
- **CSV 导入** — 支持 Schwab、IBKR、通用格式
- **价格数据** — Yahoo Finance 自动获取，定时任务
- **多币种支持** — USD/HKD/CNY/EUR/GBP/JPY/SEK 汇率换算
- **暗色模式** — 一键切换，偏好本地保存

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Next.js 16 (App Router) + TypeScript |
| 样式 | Tailwind CSS v4 |
| 数据库 | PostgreSQL + Prisma ORM |
| 认证 | NextAuth.js v5 |
| 图表 | Recharts |
| 定时任务 | node-cron |
| 价格数据 | yahoo-finance2 |
| 部署 | Docker Compose |

## 快速开始

### 前置要求

- Node.js 20+
- PostgreSQL 16+（或使用 Docker）

### 本地开发

```bash
# 克隆仓库
git clone https://github.com/tayhe/Investition.git
cd Investition

# 安装依赖
npm install

# 启动数据库
docker compose up -d db

# 配置环境变量
cp .env.example .env
# 编辑 .env，确认 DATABASE_URL 正确

# 运行数据库迁移
npx prisma migrate dev

# 种子数据（创建 demo 用户和示例数据）
npx prisma db seed

# 启动开发服务器
npm run dev
```

访问 http://localhost:3000

**默认账户**: `demo@investition.app` / `demo1234`

### Docker 部署

```bash
cp .env.example .env
# 编辑 .env，设置 AUTH_SECRET 等生产环境变量

docker compose up -d --build
docker compose exec app npx prisma migrate deploy
docker compose exec app npx prisma db seed  # 可选
```

## IBKR 数据同步

### 方式一：API 自动同步

1. 登录 IBKR 客户门户 → **报告 → Flex 查询**
2. 创建 Activity Flex Query，勾选交易和持仓字段
3. 获取 **Flex Token**（报告 → Flex 查询 → Flex Web Service 配置）
4. 获取 **Query ID**（点击查询旁的 ℹ️ 图标）
5. 在网站「账户管理」页面展开 IBKR 账户 → API 自动同步 → 输入 Token 和 Query ID

### 方式二：手动导入文件

- **CSV 导入**: 从 Schwab/IBKR 导出 CSV 文件上传
- **XML 导入**: 从 IBKR 下载 Flex Query XML 文件上传

### IBKR Flex Query 配置

需要勾选的区段：
- **交易**（Trades）— 所有字段
- **未平仓仓位**（Open Positions）— 所有字段
- **复杂持仓**（Complex Positions）— 期权持仓

## 项目结构

```
src/
├── app/
│   ├── (app)/                    # 认证保护的页面
│   │   ├── page.tsx              # 仪表盘
│   │   ├── portfolio/            # 持仓管理
│   │   ├── transactions/         # 交易记录
│   │   ├── analytics/            # 复盘分析
│   │   ├── accounts/             # 账户管理
│   │   └── settings/             # 设置
│   ├── login/                    # 登录
│   └── api/                      # REST API
├── components/                   # UI 组件
├── lib/
│   ├── db.ts                     # Prisma 客户端
│   ├── auth.ts                   # NextAuth（Edge-safe）
│   ├── auth-providers.ts         # NextAuth（完整）
│   ├── scheduler.ts              # 定时任务
│   ├── prices/                   # 价格和汇率
│   ├── csv/                      # CSV 解析
│   └── ibkr/                     # IBKR 集成
└── instrumentation.ts            # 启动调度器
prisma/
├── schema.prisma                 # 数据库模型
└── seed.ts                       # 种子数据
```

## License

MIT
