# Investition — 项目计划与开发路线图

> 本文档供服务器端 MiMo Code Agent 接手后续开发和部署使用。
> 最后更新: 2026-06-20

---

## 一、项目概述

投资组合记录与复盘分析网站，用于追踪个人在美股、港股、A股市场的股票和基金持仓，记录交易历史，分析资产增值与回撤情况，方便随时复盘。

**仓库**: https://github.com/tayhe/Investition

---

## 二、技术栈（已选定）

| 层级 | 技术 | 版本 |
|------|------|------|
| 框架 | Next.js (App Router) + TypeScript | 16.x |
| 样式 | Tailwind CSS | v4 |
| 数据库 | PostgreSQL | 16 |
| ORM | Prisma (@prisma/adapter-pg) | 7.x |
| 认证 | NextAuth.js (Credentials Provider) | v5 beta |
| 图表 | Recharts | 3.x |
| UI 图标 | lucide-react | latest |
| 部署 | Docker Compose | — |

---

## 三、数据库模型（已定义，未迁移）

见 `prisma/schema.prisma`，核心表：

- **User** — 用户（email, password, name）
- **Session** — NextAuth 会话
- **Account** — 券商账户（IBKR / 手动），含 IBKR Flex Token/QueryId 字段
- **Security** — 标的证券主数据（symbol, exchange, market: US/HK/A/FUND）
- **Position** — 当前持仓（accountId + securityId 唯一）
- **Trade** — 交易记录（BUY/SELL，含手续费）
- **Price** — 每日价格缓存
- **Snapshot** — 每日资产快照（用于画权益曲线和计算回撤）
- **ExchangeRate** — 汇率缓存（多币种换算用）

---

## 四、已完成的工作

### 4.1 项目骨架 ✅
- Next.js 16 + TypeScript + Tailwind CSS 初始化
- Prisma schema 设计完成
- Docker Compose + Dockerfile 配置
- 环境变量模板 `.env.example`
- Git 仓库已推送到 GitHub

### 4.2 页面 UI（mock 数据）✅
所有页面已创建，但**使用硬编码 mock 数据，未接入数据库**：

| 页面 | 文件 | 功能 |
|------|------|------|
| 仪表盘 | `src/app/page.tsx` | 统计卡片 + 权益曲线 + 持仓表 |
| 持仓管理 | `src/app/portfolio/page.tsx` | 按市场分组的持仓列表 |
| 交易记录 | `src/app/transactions/page.tsx` | 交易时间线 + 筛选 |
| 复盘分析 | `src/app/analytics/page.tsx` | 回撤图 + 月度收益 + 市场分布 |
| 设置 | `src/app/settings/page.tsx` | IBKR Flex 配置表单 + CSV 导入占位 |
| 登录 | `src/app/login/page.tsx` | NextAuth credentials 登录 |

### 4.3 UI 组件 ✅
- `src/components/sidebar.tsx` — 侧边栏导航
- `src/components/stat-card.tsx` — 统计卡片
- `src/components/equity-curve.tsx` — Recharts 权益曲线
- `src/components/positions-table.tsx` — 持仓表格

### 4.4 后端模块（代码写好，未测试）⚠️
- `src/lib/db.ts` — Prisma 客户端（使用 @prisma/adapter-pg）
- `src/lib/auth.ts` — NextAuth v5 credentials 配置
- `src/lib/utils.ts` — 格式化工具（currency, percent, number）
- `src/lib/ibkr/flex.ts` — IBKR Flex Web Service XML 解析
- `src/lib/ibkr/sync.ts` — 数据同步 + 快照生成逻辑
- `src/app/api/sync/route.ts` — POST 同步触发
- `src/app/api/positions/route.ts` — GET 持仓列表
- `src/app/api/trades/route.ts` — GET 交易记录（分页+筛选）
- `src/app/api/snapshots/route.ts` — GET 快照数据（权益曲线）

---

## 五、待完成工作（按优先级排序）

### P0 — 部署前置（必须先完成）

#### 5.1 数据库迁移
```bash
# 确保 PostgreSQL 运行且 DATABASE_URL 正确
npx prisma migrate dev --name init
npx prisma generate
```
迁移后数据库中将创建所有表。

#### 5.2 页面接入真实数据
当前所有页面使用 mock 数据。需要改为：
- 仪表盘 (`src/app/page.tsx`) — 从 `/api/snapshots` 和 `/api/positions` 获取数据
- 持仓管理 (`src/app/portfolio/page.tsx`) — 从 `/api/positions` 获取
- 交易记录 (`src/app/transactions/page.tsx`) — 从 `/api/trades` 获取
- 复盘分析 (`src/app/analytics/page.tsx`) — 从 `/api/snapshots` 获取

有两种方案：
- **方案 A**: 改为 `"use client"` + `useEffect` + fetch 调用 API
- **方案 B**: 保持 Server Component，直接调用 `db` 查询（推荐，更简单）

#### 5.3 注册流程
当前只有登录页，没有注册。需要：
- 创建 `src/app/register/page.tsx` 注册页面
- 创建 `src/app/api/auth/register/route.ts` 注册 API
- 密码需要 bcrypt 哈希（`npm install bcryptjs`）
- 登录页添加"注册"链接

#### 5.4 种子数据 / 首个用户
部署后需要一个初始管理员账户。选择：
- **方案 A**: 注册页面（见 5.3）
- **方案 B**: seed 脚本 `prisma/seed.ts` 创建默认用户

### P1 — 核心功能补全

#### 5.5 IBKR Flex 同步端到端打通
- `src/lib/ibkr/flex.ts` 中 `syncIbkrFlex()` 已实现但未测试
- 需要真实的 IBKR Flex Token + Query ID 测试
- 测试要点：XML 解析是否正确、交易/持仓 upsert 逻辑、错误处理
- IBKR Flex API 文档: https://www.interactivebrokers.com/campus/ibkr-api-page/flex-web-service/

#### 5.6 价格数据获取
当前 `Price` 表有 schema 但无写入逻辑。需要：
- 选择行情数据源（推荐 Yahoo Finance API 或 Alpha Vantage，免费）
- 创建 `src/lib/prices/fetcher.ts` 获取每日收盘价
- 用于：持仓市值计算、权益曲线、盈亏百分比
- 可用 npm 包: `yahoo-finance2`

#### 5.7 汇率数据
`ExchangeRate` 表已定义，需要：
- 汇率数据源（推荐 exchangerate-api.com 或央行数据）
- `src/lib/prices/exchange-rate.ts` 获取 USD/HKD/CNY 汇率
- 仪表盘总资产需要将多币种持仓统一换算

#### 5.8 定时任务
每日自动执行：
- 同步 IBKR 数据（如果配置了 Flex）
- 获取最新价格和汇率
- 生成每日 Snapshot

方案选择：
- **方案 A**: node-cron 在 Next.js 进程内运行（简单）
- **方案 B**: 独立 cron 容器（Docker Compose 加一个 worker 服务）
- **方案 C**: 系统 crontab 调用 API endpoint

推荐方案 A 或 C。

#### 5.9 CSV 导入
设置页已有 UI 占位，需要实现：
- 支持 IBKR Activity Statement CSV
- 支持通用格式（date, symbol, side, quantity, price）
- `src/app/api/import/csv/route.ts` 文件上传处理
- 使用 `papaparse` 或 `csv-parse` 解析

### P2 — 体验优化

#### 5.10 Dashboard 接通后优化
- 添加"手动同步"按钮（调用 `/api/sync`）
- 最近交易列表
- 今日行情概览

#### 5.11 复盘分析增强
- 与基准指数对比（SPY / HSI / 沪深300）
- 持仓集中度分析（HHI 指数）
- 交易频率统计
- 按时间段自定义分析

#### 5.12 移动端适配
- 侧边栏在移动端改为底部导航或抽屉
- 表格响应式处理

#### 5.13 暗色模式
- 已有 CSS 变量基础（`globals.css` 中 `prefers-color-scheme: dark`）
- 需要添加手动切换按钮

---

## 六、部署指南

### 6.1 服务器要求
- Linux (Ubuntu 22.04+ 推荐)
- Docker + Docker Compose
- 2GB+ RAM
- 域名 + SSL 证书（可选，用 Nginx 反向代理）

### 6.2 部署步骤

```bash
# 1. 克隆仓库
git clone https://github.com/tayhe/Investition.git
cd Investition

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，设置以下关键变量：
#   DATABASE_URL — PostgreSQL 连接串
#   AUTH_SECRET  — 随机生成的密钥 (openssl rand -base64 32)
#   AUTH_URL     — 网站域名，如 https://invest.example.com
#   DB_PASSWORD  — 数据库密码

# 3. 启动服务
docker compose up -d --build

# 4. 运行数据库迁移
docker compose exec app npx prisma migrate deploy

# 5. 访问
# http://服务器IP:3000
```

### 6.3 Nginx 反向代理（可选）

```nginx
server {
    listen 80;
    server_name invest.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 6.4 Dockerfile 已知问题
当前 Dockerfile 使用 `standalone` 输出模式，但 Prisma 需要额外处理：
- `src/generated/prisma` 目录需要被 COPY 到容器
- 运行时需要 `@prisma/adapter-pg` 和 `pg` 包
- 如果构建失败，可能需要在 runner 阶段安装运行时依赖

---

## 七、开发规范

### 命令参考
```bash
npm run dev          # 启动开发服务器 (http://localhost:3000)
npm run build        # 生产构建
npm run lint         # ESLint 检查
npx prisma studio    # 数据库可视化管理 (http://localhost:5555)
npx prisma migrate dev --name <name>  # 创建迁移
npx prisma generate  # 重新生成 Prisma 客户端
```

### 项目结构
```
src/
├── app/
│   ├── page.tsx                 # 仪表盘（需接入数据）
│   ├── layout.tsx               # 全局布局（Sidebar）
│   ├── globals.css              # 全局样式 + CSS 变量
│   ├── portfolio/page.tsx       # 持仓管理
│   ├── transactions/page.tsx    # 交易记录
│   ├── analytics/page.tsx       # 复盘分析
│   ├── settings/page.tsx        # 设置
│   ├── login/page.tsx           # 登录
│   └── api/
│       ├── auth/                # NextAuth + 注册
│       ├── sync/route.ts        # IBKR 同步触发
│       ├── positions/route.ts   # 持仓 API
│       ├── trades/route.ts      # 交易 API
│       └── snapshots/route.ts   # 快照 API
├── components/                  # 可复用 UI 组件
└── lib/
    ├── db.ts                    # Prisma 客户端单例
    ├── auth.ts                  # NextAuth 配置
    ├── utils.ts                 # 工具函数
    └── ibkr/
        ├── flex.ts              # IBKR Flex API 集成
        └── sync.ts              # 同步 + 快照逻辑
prisma/
└── schema.prisma                # 数据库模型定义
```

---

## 八、关键决策记录

1. **IBKR 数据获取方式**: 选择 Flex Web Service（REST API 需要 OAuth + Client Portal Gateway，复杂度高）
2. **Prisma 版本**: 使用 v7 新语法（`prisma-client` generator），需要 `@prisma/adapter-pg` 驱动适配器
3. **认证方案**: NextAuth v5 credentials provider，JWT session strategy
4. **多币种处理**: 通过 ExchangeRate 表缓存汇率，Dashboard 统一换算为账户基准货币
5. **权益曲线**: 通过 Snapshot 表每日快照实现，支持回撤计算

---

## 九、风险与注意事项

1. **IBKR Flex API 有频率限制**: 同一请求 15 分钟内不能重复调用，需做节流
2. **Prisma v7 + adapter-pg**: 与旧版 Prisma 语法不兼容，注意 import 路径是 `@/generated/prisma/client` 不是 `@prisma/client`
3. **NextAuth v5 仍为 beta**: API 可能变动，锁定版本
4. **A股数据获取**: Yahoo Finance 不覆盖 A 股，可能需要 Tushare 或 AKShare 等国内数据源
5. **密码存储**: 注册时必须用 bcrypt 哈希，禁止明文存储
