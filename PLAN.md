# Investition — 项目计划与开发路线图

> 本文档供服务器端 MiMo Code Agent 接手后续开发和部署使用。
> 最后更新: 2026-06-24

---

## 一、项目概述

投资组合记录与复盘分析网站，用于追踪个人在美股、港股、A股市场的股票和基金持仓，记录交易历史，分析资产增值与回撤情况，方便随时复盘。

**仓库**: https://github.com/tayhe/Investition

---

## 二、技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 框架 | Next.js (App Router) + TypeScript | 16.x |
| 样式 | Tailwind CSS | v4 |
| 数据库 | PostgreSQL | 16 |
| ORM | Prisma (@prisma/adapter-pg) | 7.x |
| 认证 | NextAuth.js (Credentials Provider) | v5 beta |
| 图表 | Recharts | 3.x |
| UI 图标 | lucide-react | latest |
| 定时任务 | node-cron | latest |
| CSV 解析 | csv-parse | latest |
| 价格数据 | yahoo-finance2 | 3.x |
| 密码哈希 | bcryptjs | latest |
| 部署 | Docker Compose | — |

---

## 三、数据库模型

见 `prisma/schema.prisma`，核心表（均已迁移）：

- **User** — 用户（email, password, name）
- **Session** — NextAuth 会话
- **Account** — 券商账户（IBKR / 手动），含 IBKR Flex Token/QueryId 字段
- **Security** — 标的证券主数据（symbol, exchange, market: US/HK/A/FUND，type: STOCK/ETF/FUND/BOND/OPTION/FUTURE）
- **Position** — 当前持仓（accountId + securityId 唯一）
- **Trade** — 交易记录（BUY/SELL，含手续费）
- **Price** — 每日价格缓存
- **Snapshot** — 每日资产快照（用于画权益曲线和计算回撤）
- **ExchangeRate** — 汇率缓存（多币种换算用）
- **FlexCache** — IBKR Flex XML 原始报告缓存

---

## 四、已完成的工作

### 4.1 项目骨架 ✅
- Next.js 16 + TypeScript + Tailwind CSS 初始化
- Prisma schema 设计完成并迁移
- Docker Compose + Dockerfile 配置
- 环境变量模板 `.env.example`
- Git 仓库已推送到 GitHub

### 4.2 数据库 + 真实数据 ✅
- PostgreSQL 运行，Prisma 迁移完成
- 所有页面从 mock 数据改为数据库真实查询
- Server Component 直接调用 `db` 查询
- 种子数据脚本 `prisma/seed.ts`
- N+1 查询优化：批量价格查询 `lib/prices/cache.ts`

### 4.3 认证系统 ✅
- 登录/登出，bcrypt 密码验证
- 路由保护：Server Component 中 `auth()` 检查，未登录重定向到 `/login`
- 登录页独立布局（无侧边栏）
- 侧边栏「退出登录」按钮
- Auth 拆分：`auth.ts`（Edge-safe，无 Prisma）+ `auth-providers.ts`（完整，含 Credentials Provider）

### 4.4 IBKR 集成 ✅
- Flex Web Service API 对接（官方 URL: `ndcdyn.interactivebrokers.com`）
- XML 解析器支持 `<Trade>`、`<OpenPosition>`、`<ComplexPosition>` 标签
- 属性映射：`position` → 数量、`markPrice` → 现价、`costBasisPrice` → 成本价、`assetCategory` → 资产类型
- FlexCache 表缓存原始 XML，限流时自动降级
- 15 分钟冷却期防止触发限流
- 手动 XML 文件导入
- 账户页「数据来源」切换：API 自动同步 / 手动导入文件

### 4.5 价格数据 ✅
- Yahoo Finance 集成（yahoo-finance2 v3）
- 符号映射：外汇对 `USD.CNH` → `USDCNH=X`、瑞典股票 `SIVE` → `SIVE.ST` 等
- 4 小时价格缓存，避免重复请求
- 200ms 请求间隔，失败后 400ms 间隔
- 过滤无效标的（期权合约等）

### 4.6 汇率数据 ✅
- USD/CNY、USD/HKD、HKD/CNY 三对汇率
- 4 小时缓存
- 批量价格查询消除 N+1 问题

### 4.7 定时任务 ✅
- node-cron 调度器，通过 Next.js instrumentation 启动
- 每 4 小时：更新价格和汇率（`America/New_York` 时区）
- 每日 00:30：IBKR Flex 数据同步（`syncAccountData(force=true)`，绕过冷却期）
- 每日凌晨 1 点：生成资产快照
- 设置页手动触发按钮
- `CRON_ENABLED=false` 可禁用

### 4.11 日期时区统一 ✅
- 新增 `lib/utils.ts` → `getToday()`，基于 `America/New_York` 时区获取"今天"
- 所有写日期到数据库的逻辑统一使用 `getToday()`，避免服务器（UTC+8）与美股交易日错位
- 历史价格日期提取改用 UTC 组件（Yahoo Finance 返回 UTC 午夜）
- Snapshot 价格查询加 `date: { lte: date }` 过滤，确保只用截止快照日的价格
- Snapshot prevSnapshot 查询加 `date: { lt: date }`，避免同日重复比较

### 4.12 Snapshot 现金统一 ✅
- Dashboard 和 Snapshot 的 `cashBalance` 统一为 0
- 真实现金数据待 IBKR Flex API 启用 cash balance 字段后从 XML 提取

### 4.8 CSV 导入 ✅
- 支持 Schwab 交易/持仓 CSV
- 支持 IBKR Activity Statement CSV
- 支持通用格式（date, symbol, side, quantity, price）
- 自动格式检测

### 4.9 UI/UX ✅
- 暗色模式切换（localStorage 持久化，防闪烁脚本）
- 账户管理页面：CRUD + 展开详情 + 重命名
- 复盘分析：月度收益明细表格（期初/期末/盈亏/收益率）
- 市场分布显示实际金额
- 侧边栏导航：仪表盘、持仓管理、交易记录、复盘分析、账户管理、设置

### 4.10 页面结构 ✅
- 路由组：`(app)/` 认证页面（有侧边栏）、`login/` 独立布局
- 所有页面按用户隔离数据

---

## 五、待完成工作

### P1 — 功能补全

#### 5.1 注册页面
- 创建 `src/app/register/page.tsx`
- 创建 `src/app/api/auth/register/route.ts`
- 登录页添加"注册"链接

#### 5.2 Schwab API 集成
- OAuth 2.0 授权流程
- 需要在 developer.schwab.com 注册开发者账号
- 获取账户、持仓、交易数据

#### 5.3 复盘分析增强
- 与基准指数对比（SPY / HSI / 沪深300）
- 持仓集中度分析（HHI 指数）
- 交易频率统计

### P2 — 体验优化

#### 5.4 移动端适配
- 侧边栏在移动端改为底部导航或抽屉
- 表格响应式处理

#### 5.5 Dashboard 优化
- 最近交易列表
- 今日行情概览

---

## 六、部署指南

### 6.1 服务器要求
- Linux (Ubuntu 22.04+ 推荐)
- Docker + Docker Compose
- 2GB+ RAM

### 6.2 部署步骤

```bash
# 1. 克隆仓库
git clone https://github.com/tayhe/Investition.git
cd Investition

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，设置 DATABASE_URL, AUTH_SECRET, AUTH_URL

# 3. 启动服务
docker compose up -d --build

# 4. 运行数据库迁移
docker compose exec app npx prisma migrate deploy

# 5. 种子数据（可选）
docker compose exec app npx prisma db seed
```

### 6.3 Tailscale 远程访问
如果通过 Tailscale 访问，需在 `next.config.ts` 的 `allowedDevOrigins` 中添加 Tailscale 域名，并将 `AUTH_URL` 设为 Tailscale 地址。

---

## 七、开发规范

### 命令参考
```bash
npm run dev          # 启动开发服务器
npm run build        # 生产构建
npm run lint         # ESLint 检查
npx prisma studio    # 数据库可视化管理
npx prisma migrate dev --name <name>  # 创建迁移
npx prisma generate  # 重新生成 Prisma 客户端
npx prisma db seed   # 运行种子数据
```

### 项目结构
```
src/
├── app/
│   ├── (app)/                    # 认证保护的页面（有侧边栏）
│   │   ├── layout.tsx            # 侧边栏 + SessionProvider + auth 检查
│   │   ├── page.tsx              # 仪表盘
│   │   ├── portfolio/            # 持仓管理
│   │   ├── transactions/         # 交易记录
│   │   ├── analytics/            # 复盘分析（月度收益明细）
│   │   ├── accounts/             # 账户管理（券商集成 + 数据导入）
│   │   └── settings/             # 设置（行情数据 + 定时任务）
│   ├── login/                    # 登录（独立布局，无侧边栏）
│   ├── auth-provider.tsx         # SessionProvider 封装
│   ├── layout.tsx                # 根布局（最小化）
│   └── api/
│       ├── auth/                 # NextAuth
│       ├── accounts/             # 账户 CRUD（GET/POST/PATCH/DELETE）
│       ├── ibkr/                 # IBKR 配置、缓存状态、XML 导入
│       ├── import/csv/           # CSV 导入
│       ├── prices/               # 价格获取触发
│       ├── cron/trigger/         # 手动触发定时任务
│       ├── sync/                 # IBKR 同步触发
│       ├── positions/            # 持仓 API
│       ├── trades/               # 交易 API
│       └── snapshots/            # 快照 API
├── components/                   # UI 组件
│   ├── sidebar.tsx               # 侧边栏（含暗色模式切换 + 退出登录）
│   ├── account-manager.tsx       # 账户管理（CRUD + 展开 + 重命名 + 券商集成）
│   ├── ibkr-config.tsx           # IBKR Token 配置
│   ├── ibkr-sync.tsx             # IBKR 同步按钮（含冷却倒计时）
│   ├── csv-importer.tsx          # CSV 文件导入
│   ├── xml-importer.tsx          # IBKR Flex XML 导入
│   ├── price-fetcher.tsx         # 价格获取按钮
│   ├── cron-status.tsx           # 定时任务状态和手动触发
│   ├── theme-toggle.tsx          # 暗色模式切换
│   ├── stat-card.tsx             # 统计卡片
│   ├── equity-curve.tsx          # 权益曲线
│   └── positions-table.tsx       # 持仓表格
├── lib/
│   ├── db.ts                     # Prisma 客户端单例
│   ├── auth.ts                   # NextAuth（Edge-safe，无 Prisma）
│   ├── auth-providers.ts         # NextAuth（完整，含 Credentials Provider）
│   ├── scheduler.ts              # 定时任务调度器
│   ├── utils.ts                  # 工具函数
│   ├── prices/
│   │   ├── cache.ts              # 批量价格查询（消除 N+1）
│   │   ├── fetcher.ts            # Yahoo Finance 价格获取
│   │   └── exchange-rate.ts      # 汇率获取
│   ├── csv/
│   │   └── parser.ts             # CSV 解析（Schwab/IBKR/通用格式）
│   └── ibkr/
│       ├── flex.ts               # IBKR Flex API + XML 解析
│       └── sync.ts               # 数据同步 + 快照生成
├── generated/prisma/             # Prisma 自动生成（不要修改）
└── instrumentation.ts            # Next.js instrumentation（启动调度器）
prisma/
├── schema.prisma                 # 数据库模型定义
├── seed.ts                       # 种子数据脚本
└── migrations/                   # 数据库迁移文件
```

---

## 八、关键决策记录

1. **IBKR 数据获取方式**: Flex Web Service（REST API 需要 OAuth，复杂度高）
2. **Prisma 版本**: v7 新语法（`prisma-client` generator），`@prisma/adapter-pg` 驱动适配器
3. **认证方案**: NextAuth v5 credentials provider，JWT session strategy
4. **Auth 拆分**: `auth.ts`（Edge-safe）+ `auth-providers.ts`（完整），避免 Prisma 在 Edge Runtime 报错
5. **多币种处理**: ExchangeRate 表缓存汇率，Dashboard 统一换算
6. **权益曲线**: Snapshot 表每日快照，支持回撤计算
7. **IBKR 限流防护**: FlexCache 缓存 + 15 分钟冷却期 + 自动降级到缓存
8. **Yahoo Finance 符号映射**: 外汇对加 `=X` 后缀，国际股票按交易所加 `.ST`/`.L` 等后缀，期权去空格
9. **页面结构**: 路由组 `(app)/` + `login/`，Server Component 直接查询数据库
10. **暗色模式**: CSS 变量 + `data-theme` 属性 + localStorage 持久化
11. **IBKR Flex XML 解析**: 只取最后一个 `<FlexStatement>`，按 symbol 聚合 tax lots，过滤过期期权
12. **期权计算逻辑**: avgCost 和 currentPrice 为每股价格（原始数据），costBasis 和 marketValue 为实际金额（`qty × multiplier × price`）
13. **统一盈亏公式**: `pnl = marketValue - costBasis`，quantity 使用真实值（负=空头），无需分支判断
14. **FIFO 双向追踪**: BUY 先关空仓再开多仓，SELL 先关多仓再开空仓，支持做空期权的成本计算
15. **交易去重**: 按 `ibOrderID + side + quantity + price` 去重，避免多 statement 重复
16. **FlexCache 分年存储**: `accountId + year` 唯一约束，年份从 XML `fromDate` 提取
17. **Prisma Decimal 序列化**: Server Component 中 `Number(Decimal)` 失效，改用 `type === "OPTION" ? 100 : 1`
18. **日期基准时区**: 所有写入数据库的日期（Price/ExchangeRate/Snapshot/DailyPosition）必须基于 `America/New_York` 时区，使用 `getToday()` 获取。服务器在 UTC+8，若用本地时间会导致美股 6/24 的数据被记录为 6/24，但实际是 6/23 收盘价，跨时区错位
19. **历史价格日期提取**: Yahoo Finance historical API 返回 `date` 字段为 UTC 午夜，提取日期用 `getUTCFullYear()/getUTCMonth()/getUTCDate()`，不能直接 `setHours(0,0,0,0)`（会按本地时区退后一天）
20. **Snapshot 价格截止日**: `createDailySnapshot` 中 Price 查询必须加 `date: { lte: date }`，否则会用未来日期的价格，导致历史 snapshot 值错误
21. **prevSnapshot 严格小于当前日**: 必须 `date: { lt: date }` 而非任意 `date desc`，否则同日重复生成 snapshot 时会与自己比较，dailyPnl = 0
22. **IBKR 定时同步策略**: 每日 00:30 NY 时间强制拉取一次（`force=true` 绕过 15 分钟冷却期），其他时间通过手动按钮触发并受冷却期保护

---

## 九、风险与注意事项

1. **IBKR Flex API 限流**: 每分钟最多 10 次请求，多次失败会触发 IP 级别封锁（错误 1025），需等待 24 小时或生成新 Token
2. **IBKR 报告系统维护**: 定期维护期间 API 不可用，需使用手动 XML 导入
3. **IBKR Flex XML 多 Statement 问题**: Flex Query 若配置了「年初至今 + 按日细分」，会返回多个 `<FlexStatement>`（每天一个），每个都包含当日的持仓和交易。**必须只取最后一个 statement**（`xml.lastIndexOf("<FlexStatement")`），否则会导致数据膨胀（24 个持仓变成 2152 个）
4. **IBKR Flex XML Tax Lot 问题**: OpenPosition 是 tax lot 级别数据，同一 symbol 有多条记录。解析器已按 symbol 聚合（数量求和）
5. **IBKR Flex XML 过期期权**: OpenPosition 包含已过期的期权合约。解析器已按 expiry 日期过滤
6. **IBKR Flex 交易重复**: 多 statement 中同一交易会重复出现（commission 正负不同），需按 `ibOrderID + side + qty + price` 去重
7. **IBKR Flex 年份边界**: FlexCache 年份从 XML `fromDate` 提取，不依赖系统时间，防止跨年时数据错乱
8. **Prisma v7 + adapter-pg**: import 路径是 `@/generated/prisma/client` 不是 `@prisma/client`
9. **Prisma Decimal 序列化**: Server Component 中 `Number(Decimal)` 返回 NaN，不能用于 multiplier 等字段。改用 `type === "OPTION" ? 100 : 1` 判断
10. **NextAuth v5 beta**: API 可能变动，锁定版本
11. **Yahoo Finance 非官方 API**: 无官方限流声明，实践中 200ms 间隔 + 4 小时缓存足够安全
12. **Yahoo Finance 期权格式**: IBKR symbol `GOOGL 261016P00325000` 需去空格转为 `GOOGL261016P00325000`
13. **A 股数据**: Yahoo Finance 不直接覆盖 A 股，需通过 `.SS`/`.SZ` 后缀。符号已含后缀时不要重复添加
14. **密码存储**: 必须用 bcrypt 哈希，禁止明文存储
15. **期权乘数**: 美股期权 1 手 = 100 股，市值 = quantity × 100 × optionPrice
16. **跨时区日期错位**: 服务器在 UTC+8（中国时间），美股交易日为 `America/New_York` 时区。所有日期写入数据库时必须用 `getToday()`（基于 NY 时区），否则 6/24 凌晨跑价格更新时，Price 表日期会标为 6/24 但实际抓取的是 6/23 收盘价，导致 Price/Snapshot/DailyPosition 日期不一致，dailyPnl 偏差
17. **MiMoCode subagent 模型**: 配置文件 `~/.config/mimocode/mimocode.json` 中 subagent 的 `model` 字段必须使用 `mimo models` 列表中存在的完整 provider 前缀。`minimax-cn/MiniMax-M3` 不可用，正确写法是 `minimax-cn-coding-plan/MiniMax-M3`（漏写 `-coding-plan` 会触发 ProviderModelNotFoundError）
