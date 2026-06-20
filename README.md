# Investition

投资组合记录与复盘分析平台，支持美股、港股、A股市场的基金和股票追踪。

## 功能特性

- **投资仪表盘** — 总资产曲线、持仓概览、今日/本月盈亏、最大回撤
- **持仓管理** — 按市场分组（US/HK/A股），成本价、现价、盈亏一目了然
- **交易记录** — 买入/卖出时间线，支持按标的、时间、市场筛选
- **复盘分析** — 回撤图、月度收益、持仓集中度、与基准对比
- **IBKR 自动同步** — 对接 Interactive Brokers Flex Web Service，定时拉取持仓和交易数据
- **多币种支持** — USD/HKD/CNY 自动汇率换算
- **手动录入** — 非 IBKR 账户支持手动添加交易或 CSV 导入

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Next.js 16 (App Router) + TypeScript |
| 样式 | Tailwind CSS v4 |
| 数据库 | PostgreSQL + Prisma ORM |
| 认证 | NextAuth.js v5 |
| 图表 | Recharts |
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

# 启动开发服务器
npm run dev
```

访问 http://localhost:3000

### Docker 部署

```bash
# 配置环境变量
cp .env.example .env
# 编辑 .env，设置 AUTH_SECRET 等生产环境变量

# 一键启动
docker compose up -d --build
```

## IBKR 数据同步

1. 登录 [Interactive Brokers](https://www.interactivebrokers.com)，进入 **报告 → Flex Queries**
2. 创建自定义报告查询，勾选需要的字段（交易、持仓）
3. 获取 **Flex Token** 和 **Query ID**
4. 在网站设置页面填入 Token 和 Query ID
5. 点击同步或等待每日自动同步

## 项目结构

```
src/
├── app/
│   ├── page.tsx                # 仪表盘
│   ├── portfolio/              # 持仓管理
│   ├── transactions/           # 交易记录
│   ├── analytics/              # 复盘分析
│   ├── settings/               # 设置（IBKR 配置）
│   ├── login/                  # 登录
│   └── api/                    # REST API
├── components/                 # UI 组件
└── lib/
    ├── db.ts                   # Prisma 客户端
    ├── auth.ts                 # NextAuth 配置
    ├── utils.ts                # 工具函数
    └── ibkr/
        ├── flex.ts             # IBKR Flex API 集成
        └── sync.ts             # 数据同步逻辑
prisma/
└── schema.prisma               # 数据库模型定义
```

## License

MIT
