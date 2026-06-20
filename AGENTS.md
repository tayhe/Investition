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
npm run dev                    # http://localhost:3000
```

## 技术栈

- **Next.js 16** (App Router) + TypeScript + Tailwind CSS v4
- **Prisma 7** + PostgreSQL — 使用 `@prisma/adapter-pg` 驱动适配器
- **NextAuth v5** (beta) — Credentials Provider, JWT session
- **Recharts** — 图表
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
- 不要假设 API 与旧版相同

### 项目结构

```
src/
├── app/                    # 页面和 API Routes
│   ├── page.tsx            # 仪表盘（当前用 mock 数据，需接入 DB）
│   ├── portfolio/          # 持仓管理
│   ├── transactions/       # 交易记录
│   ├── analytics/          # 复盘分析
│   ├── settings/           # IBKR 配置
│   ├── login/              # 登录
│   └── api/                # REST API endpoints
├── components/             # UI 组件
└── lib/
    ├── db.ts               # Prisma 客户端单例
    ├── auth.ts             # NextAuth 配置
    ├── utils.ts            # 格式化工具
    └── ibkr/
        ├── flex.ts         # IBKR Flex XML 解析
        └── sync.ts         # 同步 + 快照逻辑
prisma/
└── schema.prisma           # 数据库模型（9 张表）
```

## 开发工作流

1. **改代码前** — 先读相关文件，理解现有模式
2. **改 Prisma schema 后** — `npx prisma migrate dev --name <描述>` + `npx prisma generate`
3. **提交前** — `npm run build` 确保无类型错误
4. **API 路由** — 统一返回 `{ data }` 或 `{ error }` 格式
5. **页面数据** — 推荐 Server Component 直接调用 `db` 查询，避免不必要的 client fetch

## 当前状态

- ✅ 项目骨架完成，`npm run build` 通过
- ✅ 数据库 schema 设计完成（未迁移）
- ⚠️ 所有页面使用 mock 数据，未接入数据库
- ❌ 无注册流程、无价格数据源、无定时任务

**详细待办**: 见 `PLAN.md` 第五章，按 P0/P1/P2 优先级排列。

## 部署

```bash
docker compose up -d --build
docker compose exec app npx prisma migrate deploy
```

## 禁止事项

- 不要修改 `src/generated/prisma/`（Prisma 自动生成）
- 不要将 `.env` 提交到 Git
- 不要在没有运行 build 验证的情况下提交代码
- 不要引入项目未使用的依赖
