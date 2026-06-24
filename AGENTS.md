<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Investition — Agent 开发指南

投资组合记录与复盘分析网站。详见 `PLAN.md` 获取完整项目计划和待办事项。

## 快速上手

```bash
npm install
cp .env.example .env          # 编辑 DATABASE_URL
npx prisma migrate dev --name init  # 首次迁移
npx prisma db seed             # 种子数据（可选）
npm run dev                    # http://localhost:3000
```

## 技术栈

- **Next.js 16** (App Router) + TypeScript + Tailwind CSS v4
- **Prisma 7** + PostgreSQL — 使用 `@prisma/adapter-pg` 驱动适配器
- **NextAuth v5** (beta) — Credentials Provider, JWT session
- **Recharts** — 图表
- **yahoo-finance2** — 价格数据
- **node-cron** — 定时任务
- **csv-parse** — CSV 解析
- **Docker Compose** — 部署

## 关键约束

### Prisma v7 语法

- Generator 用 `prisma-client`（不是旧版 `prisma-client-js`）
- 客户端 import 路径: `@/generated/prisma/client`（不是 `@prisma/client`）
- Decimal 类型: `import { Prisma } from "@/generated/prisma/client"; const { Decimal } = Prisma;`
- 需要 `@prisma/adapter-pg` + `pg` 包，构造函数必须传 adapter:

```ts
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });
```

### Next.js 16 注意事项

- 输出模式: `standalone`（见 `next.config.ts`）
- 先读 `node_modules/next/dist/docs/` 再写代码
- middleware 已弃用，改用 Server Component 中 `auth()` 检查
- instrumentation 自动启动（无需 experimental 配置）

### Auth 拆分

Prisma 客户端不兼容 Edge Runtime，因此 auth 分为两个文件：
- `src/lib/auth.ts` — 仅 JWT 验证，不导入 Prisma（用于 middleware/Server Component）
- `src/lib/auth-providers.ts` — 完整配置，含 Credentials Provider + Prisma（用于 API Route）

### IBKR 限流

- `/SendRequest` 限制：每秒 1 次，每分钟 10 次
- 错误 1001：服务器繁忙，需等待
- 错误 1025：IP 级别封锁（多次失败），需等待 24 小时或生成新 Token
- 系统内置 15 分钟冷却期 + FlexCache 缓存自动降级

### IBKR 定时同步

每日 00:30 NY 时间自动执行 `syncAccountData(force=true)`，遍历所有配置了 Flex 凭据的账户，绕过冷却期强制拉取。失败时记录日志但不影响其他账户。手动按钮触发时受 15 分钟冷却期保护。

### NY 时区（重要）

服务器在 UTC+8（中国时间），美股交易日为 `America/New_York` 时区。所有写入数据库的日期（Price/ExchangeRate/Snapshot/DailyPosition）**必须**使用 `getToday()`（`src/lib/utils.ts`）获取"今天"。历史价格日期提取用 `getUTCFullYear()/getUTCMonth()/getUTCDate()`。

```ts
// 正确：NY 时区
import { getToday } from "@/lib/utils";
const today = getToday();

// 错误：服务器本地时间（UTC+8 会和美股错位一天）
const today = new Date();
today.setHours(0, 0, 0, 0);
```

### IBKR Flex XML 解析（重要教训）

Flex Query 若配置了「年初至今 + 按日细分」，XML 会包含多个 `<FlexStatement>`（每天一个），每个都有完整的持仓和交易数据。**必须只取最后一个 statement**。

```ts
// 正确：只取最后一个 statement
const lastStatementIdx = xml.lastIndexOf("<FlexStatement");
const xmlToParse = lastStatementIdx >= 0 ? xml.slice(lastStatementIdx) : xml;

// 错误：解析全部会导致数据膨胀（24 个持仓 → 2152 个）
```

其他注意事项：
- OpenPosition 是 tax lot 级别，同一 symbol 有多条记录，需按 symbol 聚合
- OpenPosition 包含已过期期权，需按 expiry 日期过滤
- `costBasisPrice` 可能为 0（Flex Query 未配置成本字段时）
- 多 statement 中同一交易会重复（commission 正负不同），需按 `ibOrderID + side + qty + price` 去重
- FlexCache 年份从 XML `fromDate` 提取，不依赖系统时间

### 期权计算（美股）

美股期权 1 手 = 100 股。核心公式（quantity 用真实值，负=空头）：

```
avgCost      = 每股价格（IBKR 原始 / FIFO 计算）
currentPrice = 每股价格（Yahoo 原始）
costBasis    = quantity × 100 × avgCost（做空为负值）
marketValue  = quantity × 100 × currentPrice（做空为负值）
pnl          = marketValue - costBasis（统一公式，无需分支）
```

注意：Prisma Decimal 在 Server Component 中 `Number()` 返回 NaN，不能用。改用 `type === "OPTION" ? 100 : 1`。

### FIFO 成本计算

支持双向（做多+做空）：
- BUY：先关空仓 lots（FIFO），再创建/合并多仓 lots
- SELL：先关多仓 lots（FIFO），再创建/合并空仓 lots
- 剩余 lots 的加权平均 = avgCost（每股）

### Yahoo Finance 符号映射

- 外汇对：`USD.CNH` → `USDCNH=X`
- 瑞典股票：`SIVE` (SFB) → `SIVE.ST`
- 期权：`GOOGL 261016P00325000` → `GOOGL261016P00325000`（去空格）
- 其他交易所后缀：`.L` (伦敦)、`.DE` (法兰克福)、`.T` (东京) 等

### 项目结构

```
src/
├── app/
│   ├── (app)/                    # 认证保护的页面（有侧边栏）
│   │   ├── layout.tsx            # 侧边栏 + SessionProvider + auth 检查
│   │   ├── page.tsx              # 仪表盘
│   │   ├── portfolio/            # 持仓管理
│   │   ├── transactions/         # 交易记录
│   │   ├── analytics/            # 复盘分析
│   │   ├── accounts/             # 账户管理
│   │   └── settings/             # 设置
│   ├── login/                    # 登录（独立布局，无侧边栏）
│   ├── auth-provider.tsx         # SessionProvider 封装
│   ├── layout.tsx                # 根布局（最小化）
│   └── api/                      # REST API
├── components/                   # UI 组件
├── lib/
│   ├── db.ts                     # Prisma 客户端单例
│   ├── auth.ts                   # NextAuth（Edge-safe）
│   ├── auth-providers.ts         # NextAuth（完整）
│   ├── scheduler.ts              # 定时任务调度器
│   ├── utils.ts                  # 工具函数（含 getToday()）
│   ├── prices/                   # 价格和汇率
│   ├── csv/                      # CSV 解析
│   └── ibkr/                     # IBKR 集成
├── generated/prisma/             # Prisma 自动生成（不要修改）
└── instrumentation.ts            # 启动调度器
prisma/
├── schema.prisma                 # 数据库模型（11 张表）
├── seed.ts                       # 种子数据脚本
└── migrations/                   # 数据库迁移
```

## 开发工作流

1. **改代码前** — 先读相关文件，理解现有模式
2. **改 Prisma schema 后** — `npx prisma migrate dev --name <描述>` + `npx prisma generate`
3. **提交前** — `npm run build` 确保无类型错误 + `npm run lint`
4. **API 路由** — 统一返回 `{ data }` 或 `{ error }` 格式
5. **页面数据** — Server Component 直接调用 `db` 查询，用 `auth()` 获取当前用户

## 当前状态

- ✅ 数据库迁移完成，所有页面接入真实数据
- ✅ 登录/登出 + 路由保护
- ✅ IBKR Flex 同步（API + XML 导入 + 缓存降级 + 每日定时同步）
- ✅ Yahoo Finance 价格获取（含符号映射）
- ✅ 定时任务（价格/汇率/快照/IBKR 同步）
- ✅ CSV 导入（Schwab/IBKR/通用）
- ✅ 暗色模式 + 账户管理
- ✅ NY 时区统一（getToday()）
- ❌ 无注册页面
- ❌ 无 Schwab API 集成

**详细待办**: 见 `PLAN.md` 第五章。

## 部署

```bash
docker compose up -d --build
docker compose exec app npx prisma migrate deploy
docker compose exec app npx prisma db seed  # 可选
```

## 禁止事项

- 不要修改 `src/generated/prisma/`（Prisma 自动生成）
- 不要将 `.env` 提交到 Git
- 不要在没有运行 build 验证的情况下提交代码
- 不要引入项目未使用的依赖
