# 仪表盘和复盘分析重构计划

## 数据层

### 1. 新建 DailyPosition 表
```prisma
model DailyPosition {
  id          String   @id @default(cuid())
  accountId   String
  securityId  String
  date        DateTime @db.Date
  quantity    Decimal  @db.Decimal(18, 6)
  marketPrice Decimal  @db.Decimal(18, 6)
  marketValue Decimal  @db.Decimal(18, 4)
  currency    String

  @@unique([accountId, securityId, date])
  @@index([accountId, date])
}
```

### 2. Flex 解析器改造
- `parseFlexXml` → `parseAllFlexStatements`：解析所有 statement，返回每个 statement 的 positions + date
- 最后一个 statement 用于当前持仓同步（现有逻辑不变）
- 所有 statement 的 positions 用于存入 DailyPosition

### 3. 同步流程改造
- `syncAccountData`：存入当前持仓 + 所有 DailyPosition
- `syncFromCache`：从缓存 XML 重新处理

## 仪表盘（宏观）

### 改动
- 4 个统计卡片：总资产、总盈亏、持仓数、最大回撤（全时间范围）
- 资产曲线：横坐标从本年 1 月到本月，按月聚合
- 数据源：Snapshot 表

## 复盘分析（微观）

### 顶部：月/年切换 Tab
- 默认选中「月」
- 切换时重新渲染整个页面内容

### 月视图
**第一行：本月统计**
- 本月累计收益%、盈亏$、最大回撤%
- 数据源：当月 Snapshot

**第二行：每日收益率柱状图（全宽）**
- 横坐标：本月 1 日 — 今日
- 每日收益 = 当日 Snapshot 的 dailyReturn
- 柱子可点击选中/取消选中
- 点击空白处取消选中
- 选中时高亮，Tooltip 显示详情

**第三行：标的盈亏排行**
- 未选中任何日：显示本月累计数据（从 DailyPosition 按月聚合）
- 选中某日：显示当日数据（该日的 DailyPosition）
- 数据源：DailyPosition 表

**第四行：日收益明细表**
- 列：日期、总资产、日盈亏、日收益率
- 数据源：Snapshot 表

### 年视图
**第一行：本年统计**
- 本年累计收益%、盈亏$、最大回撤%

**第二行：左右布局**
- 左：月度收益率柱状图（1月—本月），可点击选中
- 右：标的盈亏排行（跟随选中月份变化）

**第三行：月度收益明细表**

## 关键文件

| 文件 | 改动 |
|------|------|
| `prisma/schema.prisma` | 新增 DailyPosition 表 |
| `src/lib/ibkr/flex.ts` | 新增 parseAllFlexStatements |
| `src/lib/ibkr/sync.ts` | 存入 DailyPosition |
| `src/app/(app)/page.tsx` | 仪表盘：月度曲线 |
| `src/app/(app)/analytics/page.tsx` | 服务端数据查询 |
| `src/app/(app)/analytics/analytics-charts.tsx` | 完全重写：月/年 Tab + 交互图表 |

## 实现顺序
1. DailyPosition 表 + 迁移
2. Flex 解析器改造
3. 同步流程改造
4. 仪表盘改造
5. 复盘分析 UI

## 验证
1. `npm run build` 通过
2. 重新同步 IBKR 数据，DailyPosition 表有数据
3. 仪表盘显示月度曲线
4. 复盘分析月/年切换正常
5. 点击柱子切换标的排行数据
