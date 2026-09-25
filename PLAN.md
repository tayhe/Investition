# Investition — 项目计划与开发路线图

> 本文档供服务器端 MiMo Code Agent 接手后续开发和部署使用。
> 最后更新: 2026-09-25

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
- **DailyPosition** — 每日持仓明细（按日存储，用于持仓历史追踪）

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
- USD/CNY、USD/HKD、HKD/CNY、USD/SEK 四对汇率
- 4 小时缓存
- 批量价格查询消除 N+1 问题

### 4.7 定时任务 ✅
- node-cron 调度器，通过 Next.js instrumentation 启动
- 每 4 小时：更新价格和汇率（`America/New_York` 时区）
- 每日 00:30：IBKR Flex 数据同步（`syncAccountData(force=true)`，绕过冷却期）
- 每日凌晨 1 点：生成资产快照
- 设置页手动触发按钮
- `CRON_ENABLED=false` 可禁用

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

### 4.11 日期时区统一 ✅
- 新增 `lib/utils.ts` → `getToday()`，基于 `America/New_York` 时区获取"今天"
- 所有写日期到数据库的逻辑统一使用 `getToday()`，避免服务器（UTC+8）与美股交易日错位
- 历史价格日期提取改用 UTC 组件（Yahoo Finance 返回 UTC 午夜）
- Snapshot 价格查询加 `date: { lte: date }` 过滤，确保只用截止快照日的价格
- Snapshot prevSnapshot 查询加 `date: { lt: date }`，避免同日重复比较

### 4.12 Snapshot 现金统一 ✅
- 从 IBKR Flex 每日报告（`<CashReportCurrency currency="BASE_SUMMARY">`）提取真实每日 `endingCash`
- 消除现金为 0 导致的入金与建仓净值大幅虚假跳变

### 4.13 出入金与时间加权收益率 (TWR) ✅
- 在 `src/lib/ibkr/flex.ts` 中实现 `parseCashFlowsByDate` 与 `parseAllDailySnapshots`
- 剔除出入金后的真实投资日盈亏：`dailyPnl = totalValue - prevTotalValue - cashFlow`
- 月度和年度收益率采用时间加权收益率（TWR）复合：`R = ∏(1 + dailyReturn) - 1`
- 复盘分析页在月/年标签新增「出入金」StatCard 与明细列表格列

### 4.14 仪表盘仓位比重与盈亏拆分 ✅
- 仪表盘新增「出入金」StatCard（累计净入金）
- 总资产卡片展示仓位比重与现金余额
- 总盈亏卡片拆分列出已实现盈亏（FIFO 确权）与未实现浮动盈亏

### 4.15 持仓管理明确标注未实现盈亏 ✅
- 持仓管理各市场汇总卡片及持仓表格表头明确标注为「未实现盈亏」

### 4.16 核心计算公式与架构重构优化 ✅
- FIFO 成本计算修正：期权及非1乘数标的佣金分摊统一为 `comm / (qty * mult)`，避免期权每股成本放大 100 倍
- 空头 costBasis 符号统一：保留真实代数负值，移除 `Math.abs` 翻转
- 历史价格时区统一：`fetchHistoricalPrices` 历史日期统一使用 `Date.UTC`，消除 8 小时本地时区偏移
- 快照期权乘数兜底：`createDailySnapshot` 补充 `pos.security.type === "OPTION" ? 100 : 1` 兜底
- 汇率转换模块化复用：统一由 `src/lib/prices/exchange-rate.ts` 导出 `convertCurrency` 与 `getLatestRatesMap`，消除三处页面重复代码
- 调度器非交易日防护：美东时间周末及非交易日跳过空快照生成，保护连续净值序列

### 4.17 架构与文件组织优化 ✅
- 清理废弃且无鉴权的冗余 API 路由（`api/positions`, `api/trades`, `api/snapshots`），消除越权与死代码风险
- 彻底修复 `sync.ts` 中 `costBasis` 的 `Math.abs` 历史遗留，统一做空代数负值
- 抽离通用组合模块 `src/lib/portfolio/`：
  - `calc.ts`：纯函数统一持仓乘数、市值、成本、盈亏与盈亏率代数计算
  - `snapshot.ts`：通用资产快照与回撤计算（解耦对 IBKR 券商逻辑的反向依赖，价格并发查询优化）
- 组件结构按 Next.js 规范就近收敛：页面私有组件放入对应路由 `_components/`，`src/components/` 仅保留全局通用 UI 组件（Sidebar, StatCard, ThemeToggle）

### 4.18 持仓标的历史交易明细抽屉 ✅
- 新增 `GET /api/trades?symbol=&year=`：用户鉴权隔离，按标的与年份查询成交记录，默认 NY 时区当年，按 `executedAt: "desc"` 输出
- 持仓列表点击交互：`PositionsTable` 行增设手型悬停高亮与点击事件，直接弹出 `TradeHistoryDrawer` 侧边抽屉
- 统计聚合与单位自适应：
  - 顶部卡片视觉层级突出买入/卖出「均价」（大字粗体），次行显示「共 X 股/手」累计数量
  - 根据标的类型（`securityType`）自动匹配精准数量单位（股票/ETF 为股，期权/期货为手，基金为份，债券为张）
- 逐笔流水与多年度切换：支持近三年快速切换，时间线展示每笔时间、方向、数量、单价、总额及手续费，支持 ESC 与遮罩快捷退出

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

#### 5.4 IBKR Flex Query 字段补全（本次建议）

背景：`Account.ibkrFlexToken = 234831580682609539488966`，`ibkrFlexQueryId` 不变；只需在 IBKR Client Portal → Reporting → Flex Queries → Edit 里改 Section 勾选，**Token 不需要重新生成**（之前换 Token 是为了解锁 1025 / IP 级封锁，已确认为维护期误导错误）。

| 优先级 | Flex Section | 对应 XML | 项目里现状 / 收益 |
|---|---|---|---|
| 必勾 | **Cash Balance** | `<AssetSummary assetCategory="CASH">`（字段 `proceeds`） | 解 §4.12 的 `cashBalance = 0` 占位符（`sync.ts:364`、`src/app/(app)/page.tsx:36`） |
| 必勾 | **Cash Transactions** | `<CashTransaction>` / `<ChangeInCash>` | 后续算净入金 / 出金曲线、复盘分析需要时间序列 |
| 强烈建议 | **Base Currency Summary** | `<AssetSummary>` 每币种汇总 | 多币种账户换算到 base currency，目前未做 |
| 强烈建议 | **Account Information** | `<AccountInfo>` | accountId / accountAlias / baseCurrency，目前 `accounts[0].currency` 硬编码，多账户会出错 |
| 强烈建议 | **Conversion Rates** | `<ConversionRate fromCurrency toCurrency rate>` | IBKR 给出的实时 FX，可**省掉 Yahoo Finance 的 USD/CNY、USD/HKD、HKD/CNY、USD/SEK 拉取**（`PLAN.md §4.6`） |
| 建议 | **Realized & Unrealized PnL Summary** | `<RealizedPnL>` / `<UnrealizedPnL>` | `page.tsx:46-53` 的 `totalPnl` 只算浮动盈亏，缺已实现 PnL |
| 建议 | **Financial Instrument Information** | `<SecurityInfo>`（含 `expireDate`、`strike`、`multiplier`） | 期权 `multiplier` 在 `page.tsx:40` 硬写 100；持仓描述字段统一 |

不勾：`Margin / Mark-to-Market PnL`（现金账户用不到）、`Client Portal Reports`（冗余）、`Option Exercises & Assignments`（当前不处理 corporate actions）。

IBKR 后台步骤：
1. 登录 Client Portal → Reporting → Flex Queries → 选当前 Query → Edit
2. Sections 里勾上上表中勾选项
3. Report Type 保持 **Activity Statement**，Period 保持 **Year to Date**
4. Save → Refresh 重新生成 XML → 下载用编辑器打开确认 `<AssetSummary assetCategory="CASH">` 出现

代码侧待办（与本节配套）：
- `src/lib/ibkr/flex.ts`：新增 `<AssetSummary assetCategory="CASH">` 解析分支，提取 `proceeds`
- `src/lib/ibkr/sync.ts`：`createDailySnapshot` 接收真实 `cashBalance` 写入（`sync.ts:364` 去掉写死的 0）
- `src/app/(app)/page.tsx:36`：把 `const cashBalance = 0` 换成从最近一个 Snapshot 取真实值
- 验证：force-sync 后查 `Snapshot.cashBalance` 是否非零

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
│   │   ├── _components/          # 仪表盘专属组件（EquityCurve）
│   │   ├── layout.tsx            # 侧边栏 + SessionProvider + auth 检查
│   │   ├── page.tsx              # 仪表盘
│   │   ├── portfolio/            # 持仓管理（_components/ 含 PositionsTable）
│   │   ├── transactions/         # 交易记录
│   │   ├── analytics/            # 复盘分析（_components/ 含 AnalyticsCharts）
│   │   ├── accounts/             # 账户管理（_components/ 含 AccountManager 等）
│   │   └── settings/             # 设置（_components/ 含 PriceFetcher, CronStatus）
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
│       └── sync/                 # IBKR 同步触发
├── components/                   # 全局共享 UI 组件（Sidebar, StatCard, ThemeToggle）
├── lib/
│   ├── db.ts                     # Prisma 客户端单例
│   ├── auth.ts                   # NextAuth（Edge-safe，无 Prisma）
│   ├── auth-providers.ts         # NextAuth（完整，含 Credentials Provider）
│   ├── scheduler.ts              # 定时任务调度器
│   ├── utils.ts                  # 工具函数
│   ├── portfolio/                # 组合级通用计算与快照（calc.ts, snapshot.ts）
│   ├── prices/
│   │   ├── cache.ts              # 批量价格查询（消除 N+1）
│   │   ├── fetcher.ts            # Yahoo Finance 价格获取
│   │   └── exchange-rate.ts      # 汇率获取
│   ├── csv/
│   │   └── parser.ts             # CSV 解析（Schwab/IBKR/通用格式）
│   └── ibkr/
│       ├── flex.ts               # IBKR Flex API + XML 解析
│       ├── fifo.ts               # FIFO 成本与已实现盈亏
│       └── sync.ts               # 数据拉取与持久化
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
