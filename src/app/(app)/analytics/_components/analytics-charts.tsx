"use client";

import { useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { StatCard } from "@/components/stat-card";

interface SnapshotData {
  date: string;
  value: number;
  dailyReturn: number | null;
  dailyPnl: number | null;
  cashFlow?: number | null;
  maxDrawdown: number | null;
}

interface MonthlyItem {
  month: string;
  label: string;
  shortLabel: string;
  startValue: number;
  endValue: number;
  cashFlow: number;
  pnl: number;
  returnRate: number;
}

interface PositionRankItem {
  symbol: string;
  name: string;
  pnl: number;
  contribution: number;
  changePercent?: number;
}

interface DailyPositionEntry {
  symbol: string;
  name: string;
  quantity: number;
  marketValue: number;
  marketPrice: number;
  currency: string;
}

interface AnalyticsChartsProps {
  snapshots: SnapshotData[];
  dailyPositions: Record<string, DailyPositionEntry[]>;
  monthlyData: MonthlyItem[];
  positionRanking: PositionRankItem[];
}

export function AnalyticsCharts({ snapshots, dailyPositions, monthlyData, positionRanking }: AnalyticsChartsProps) {
  const [view, setView] = useState<"month" | "year">("month");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  const now = new Date();
  const currentMonth = now.toISOString().slice(0, 7);
  const currentYear = now.getFullYear();

  const availableMonths = useMemo(() => {
    const set = new Set(snapshots.map((s) => s.date.slice(0, 7)));
    return Array.from(set).sort();
  }, [snapshots]);

  const availableYears = useMemo(() => {
    const set = new Set(monthlyData.map((m) => m.month.slice(0, 4)));
    return Array.from(set).map(Number).sort();
  }, [monthlyData]);

  const [viewMonth, setViewMonth] = useState(currentMonth);
  const [viewYear, setViewYear] = useState(currentYear);

  const monthSnapshots = snapshots.filter((s) => s.date.startsWith(viewMonth));
  const monthNetFlow = monthSnapshots.reduce((sum, s) => sum + (s.cashFlow ?? 0), 0);
  const monthPnl = monthSnapshots.reduce((sum, s) => sum + (s.dailyPnl ?? 0), 0);
  let monthTwr = 1;
  for (const s of monthSnapshots) {
    monthTwr *= (1 + (s.dailyReturn ?? 0) / 100);
  }
  const monthReturn = monthSnapshots.length > 0 ? (monthTwr - 1) * 100 : 0;
  const monthMaxDD = monthSnapshots.length > 0
    ? Math.max(0, ...monthSnapshots.map((s) => s.maxDrawdown ?? 0))
    : 0;

  const dailyChartData = monthSnapshots.map((s) => ({
    date: s.date.slice(8),
    fullDate: s.date,
    returnRate: s.dailyReturn ?? 0,
    pnl: s.dailyPnl ?? 0,
  }));

  const yearSnapshots = snapshots.filter((s) => s.date.startsWith(String(viewYear)));
  const yearNetFlow = yearSnapshots.reduce((sum, s) => sum + (s.cashFlow ?? 0), 0);
  const yearPnl = yearSnapshots.reduce((sum, s) => sum + (s.dailyPnl ?? 0), 0);
  let yearTwr = 1;
  for (const s of yearSnapshots) {
    yearTwr *= (1 + (s.dailyReturn ?? 0) / 100);
  }
  const yearReturn = yearSnapshots.length > 0 ? (yearTwr - 1) * 100 : 0;
  const yearMaxDD = yearSnapshots.length > 0
    ? Math.max(0, ...yearSnapshots.map((s) => s.maxDrawdown ?? 0))
    : 0;

  const filteredMonthlyData = monthlyData.filter((m) => m.month.startsWith(String(viewYear)));
  const monthlyChartData = filteredMonthlyData.map((m) => ({
    month: m.shortLabel,
    fullMonth: m.month,
    returnRate: Number(m.returnRate.toFixed(2)),
  }));

  // Position ranking based on selection
  const filteredPositionRanking = useMemo(() => {
    if (view === "month") {
      if (!selectedDay) {
        // Aggregate for viewMonth
        const monthDates = Object.keys(dailyPositions)
          .filter((d) => d.startsWith(viewMonth))
          .sort();
        if (monthDates.length <= 1) return positionRanking;

        const firstDate = monthDates[0];
        const monthStartVal = snapshots.find((s) => s.date === firstDate || s.date.startsWith(viewMonth))?.value || 0;

        const symbolMap = new Map<string, {
          symbol: string;
          name: string;
          pnl: number;
          firstPrice: number;
          lastPrice: number;
        }>();

        for (let i = 1; i < monthDates.length; i++) {
          const prevD = monthDates[i - 1];
          const curD = monthDates[i];
          const prevPositions = dailyPositions[prevD] || [];
          const curPositions = dailyPositions[curD] || [];
          const prevMap = new Map(prevPositions.map((p) => [p.symbol, p]));

          for (const cur of curPositions) {
            const prev = prevMap.get(cur.symbol);
            if (!prev || prev.marketPrice <= 0) continue;
            const priceDiff = cur.marketPrice - prev.marketPrice;
            const factor = Math.abs(cur.marketValue) / (cur.marketPrice * Math.abs(cur.quantity) || 1);
            const pnl = priceDiff * cur.quantity * factor;

            const existing = symbolMap.get(cur.symbol) || {
              symbol: cur.symbol,
              name: cur.name,
              pnl: 0,
              firstPrice: prev.marketPrice,
              lastPrice: cur.marketPrice,
            };
            existing.pnl += pnl;
            existing.lastPrice = cur.marketPrice;
            symbolMap.set(cur.symbol, existing);
          }
        }

        const list = Array.from(symbolMap.values())
          .filter((item) => Math.abs(item.pnl) >= 0.01)
          .map((item) => {
            const changePercent = item.firstPrice > 0 ? ((item.lastPrice - item.firstPrice) / item.firstPrice) * 100 : 0;
            const contribution = monthStartVal > 0 ? (item.pnl / monthStartVal) * 100 : 0;
            return {
              symbol: item.symbol,
              name: item.name,
              pnl: item.pnl,
              changePercent,
              contribution,
            };
          })
          .sort((a, b) => b.pnl - a.pnl);

        return list.length > 0 ? list : positionRanking;
      }

      // Specific day selected
      const dayPositions = dailyPositions[selectedDay];
      if (!dayPositions || dayPositions.length === 0) return [];

      const allDates = Object.keys(dailyPositions).sort();
      const prevDateIdx = allDates.indexOf(selectedDay) - 1;
      const prevPositions = prevDateIdx >= 0 ? dailyPositions[allDates[prevDateIdx]] : [];
      const prevMap = new Map(prevPositions.map((p) => [p.symbol, p]));

      const prevDate = prevDateIdx >= 0 ? allDates[prevDateIdx] : null;
      const prevPortfolioTotal = prevDate
        ? snapshots.find((s) => s.date === prevDate)?.value || 0
        : 0;

      const pnlList = dayPositions
        .map((p) => {
          const prev = prevMap.get(p.symbol);
          if (!prev || prev.marketPrice <= 0) return null;
          const priceDiff = p.marketPrice - prev.marketPrice;
          const changePercent = (priceDiff / prev.marketPrice) * 100;
          const factor = Math.abs(p.marketValue) / (p.marketPrice * Math.abs(p.quantity) || 1);
          const pnl = priceDiff * p.quantity * factor;
          const contribution = prevPortfolioTotal > 0 ? (pnl / prevPortfolioTotal) * 100 : 0;
          return {
            symbol: p.symbol,
            name: p.name,
            pnl,
            changePercent,
            contribution,
          };
        })
        .filter((p): p is NonNullable<typeof p> => p !== null && Math.abs(p.pnl) >= 0.005)
        .sort((a, b) => b.pnl - a.pnl);

      return pnlList.length > 0 ? pnlList : positionRanking;
    } else {
      // view === "year"
      const targetYear = String(viewYear);
      const targetMonth = selectedMonth;

      const targetDates = Object.keys(dailyPositions)
        .filter((d) => (targetMonth ? d.startsWith(targetMonth) : d.startsWith(targetYear)))
        .sort();

      if (targetDates.length <= 1) return positionRanking;

      const firstDate = targetDates[0];
      const startSnapshot = snapshots.find(
        (s) => s.date === firstDate || (targetMonth ? s.date.startsWith(targetMonth) : s.date.startsWith(targetYear))
      );
      const startVal = startSnapshot?.value || 0;

      const symbolMap = new Map<string, {
        symbol: string;
        name: string;
        pnl: number;
        firstPrice: number;
        lastPrice: number;
      }>();

      for (let i = 1; i < targetDates.length; i++) {
        const prevD = targetDates[i - 1];
        const curD = targetDates[i];
        const prevPositions = dailyPositions[prevD] || [];
        const curPositions = dailyPositions[curD] || [];
        const prevMap = new Map(prevPositions.map((p) => [p.symbol, p]));

        for (const cur of curPositions) {
          const prev = prevMap.get(cur.symbol);
          if (!prev || prev.marketPrice <= 0) continue;
          const priceDiff = cur.marketPrice - prev.marketPrice;
          const factor = Math.abs(cur.marketValue) / (cur.marketPrice * Math.abs(cur.quantity) || 1);
          const pnl = priceDiff * cur.quantity * factor;

          const existing = symbolMap.get(cur.symbol) || {
            symbol: cur.symbol,
            name: cur.name,
            pnl: 0,
            firstPrice: prev.marketPrice,
            lastPrice: cur.marketPrice,
          };
          existing.pnl += pnl;
          existing.lastPrice = cur.marketPrice;
          symbolMap.set(cur.symbol, existing);
        }
      }

      const list = Array.from(symbolMap.values())
        .filter((item) => Math.abs(item.pnl) >= 0.01)
        .map((item) => {
          const changePercent = item.firstPrice > 0 ? ((item.lastPrice - item.firstPrice) / item.firstPrice) * 100 : 0;
          const contribution = startVal > 0 ? (item.pnl / startVal) * 100 : 0;
          return {
            symbol: item.symbol,
            name: item.name,
            pnl: item.pnl,
            changePercent,
            contribution,
          };
        })
        .sort((a, b) => b.pnl - a.pnl);

      return list.length > 0 ? list : positionRanking;
    }
  }, [view, selectedDay, selectedMonth, viewMonth, viewYear, dailyPositions, positionRanking, snapshots]);

  if (snapshots.length === 0) {
    return (
      <div className="text-center py-20 text-muted border border-default rounded-xl">
        暂无数据。请先同步 IBKR 数据并获取价格。
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2 mb-6">
        <button
          onClick={() => { setView("month"); setSelectedDay(null); setSelectedMonth(null); }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${view === "month" ? "bg-primary text-primary-foreground" : "border border-default text-muted hover:text-foreground"}`}
        >
          月
        </button>
        <button
          onClick={() => { setView("year"); setSelectedDay(null); setSelectedMonth(null); }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${view === "year" ? "bg-primary text-primary-foreground" : "border border-default text-muted hover:text-foreground"}`}
        >
          年
        </button>

        {view === "month" ? (
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => {
                const idx = availableMonths.indexOf(viewMonth);
                if (idx > 0) { setViewMonth(availableMonths[idx - 1]); setSelectedDay(null); }
              }}
              disabled={availableMonths.indexOf(viewMonth) <= 0}
              className="px-2 py-1 rounded border border-default text-sm text-muted hover:text-foreground disabled:opacity-30"
            >
              ←
            </button>
            <span className="text-sm font-medium min-w-[80px] text-center">{viewMonth}</span>
            <button
              onClick={() => {
                const idx = availableMonths.indexOf(viewMonth);
                if (idx < availableMonths.length - 1) { setViewMonth(availableMonths[idx + 1]); setSelectedDay(null); }
              }}
              disabled={availableMonths.indexOf(viewMonth) >= availableMonths.length - 1}
              className="px-2 py-1 rounded border border-default text-sm text-muted hover:text-foreground disabled:opacity-30"
            >
              →
            </button>
          </div>
        ) : (
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => {
                const idx = availableYears.indexOf(viewYear);
                if (idx > 0) { setViewYear(availableYears[idx - 1]); setSelectedMonth(null); }
              }}
              disabled={availableYears.indexOf(viewYear) <= 0}
              className="px-2 py-1 rounded border border-default text-sm text-muted hover:text-foreground disabled:opacity-30"
            >
              ←
            </button>
            <span className="text-sm font-medium min-w-[50px] text-center">{viewYear}年</span>
            <button
              onClick={() => {
                const idx = availableYears.indexOf(viewYear);
                if (idx < availableYears.length - 1) { setViewYear(availableYears[idx + 1]); setSelectedMonth(null); }
              }}
              disabled={availableYears.indexOf(viewYear) >= availableYears.length - 1}
              className="px-2 py-1 rounded border border-default text-sm text-muted hover:text-foreground disabled:opacity-30"
            >
              →
            </button>
          </div>
        )}
      </div>

      {view === "month" ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title={`${viewMonth} 出入金`}
              value={`${monthNetFlow >= 0 ? "+" : ""}$${monthNetFlow.toFixed(2)}`}
              subtitle="本月净入金"
            />
            <StatCard
              title={`${viewMonth} 收益`}
              value={`${monthReturn >= 0 ? "+" : ""}${monthReturn.toFixed(2)}%`}
              changePositive={monthReturn >= 0}
            />
            <StatCard
              title={`${viewMonth} 盈亏`}
              value={`${monthPnl >= 0 ? "+" : ""}$${monthPnl.toFixed(0)}`}
              changePositive={monthPnl >= 0}
            />
            <StatCard title={`${viewMonth} 最大回撤`} value={`${monthMaxDD.toFixed(2)}%`} />
          </div>

          <div className="bg-card border border-default rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4">每日收益率</h2>
            {dailyChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={dailyChartData} onClick={(e: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
                  if (e?.activeLabel) {
                    const clicked = dailyChartData.find((d) => d.date === e.activeLabel);
                    if (clicked) {
                      setSelectedDay(selectedDay === clicked.fullDate ? null : clicked.fullDate);
                    }
                  } else {
                    setSelectedDay(null);
                  }
                }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={12} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={12} tickFormatter={(v) => `${v}%`} />
                  <Tooltip
                    contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px" }}
                    formatter={(value, name, props) => {
                      const item = props.payload;
                      return [`${Number(value).toFixed(2)}% (${item.pnl >= 0 ? "+" : ""}$${item.pnl.toFixed(0)})`, "日收益"];
                    }}
                  />
                  <Bar dataKey="returnRate" radius={[4, 4, 0, 0]}>
                    {dailyChartData.map((entry) => (
                      <Cell
                        key={entry.fullDate}
                        fill={selectedDay === entry.fullDate ? "#f59e0b" : entry.returnRate >= 0 ? "#16a34a" : "#dc2626"}
                        opacity={selectedDay && selectedDay !== entry.fullDate ? 0.4 : 1}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center py-12 text-muted">暂无本月数据</div>
            )}
            {selectedDay && (
              <div className="text-xs text-muted mt-2">
                已选中：{selectedDay}（点击柱子取消选中）
              </div>
            )}
          </div>

          <div className="bg-card border border-default rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4">
              标的盈亏排行
              <span className="text-sm font-normal text-muted ml-2">
                ({selectedDay || `${viewMonth} 全月`})
              </span>
            </h2>
            <PositionRankList data={filteredPositionRanking} />
          </div>

          <div className="bg-card border border-default rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4">日收益明细</h2>
            <DailyDetailTable snapshots={monthSnapshots} />
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title={`${viewYear}年出入金`}
              value={`${yearNetFlow >= 0 ? "+" : ""}$${yearNetFlow.toFixed(2)}`}
              subtitle="全年净入金"
            />
            <StatCard
              title={`${viewYear}年收益`}
              value={`${yearReturn >= 0 ? "+" : ""}${yearReturn.toFixed(2)}%`}
              changePositive={yearReturn >= 0}
            />
            <StatCard
              title={`${viewYear}年盈亏`}
              value={`${yearPnl >= 0 ? "+" : ""}$${yearPnl.toFixed(0)}`}
              changePositive={yearPnl >= 0}
            />
            <StatCard title={`${viewYear}年最大回撤`} value={`${yearMaxDD.toFixed(2)}%`} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-card border border-default rounded-xl p-6">
              <h2 className="text-lg font-semibold mb-4">月度收益率</h2>
              {monthlyChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={monthlyChartData} onClick={(e: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
                    if (e?.activeLabel) {
                      const clicked = monthlyChartData.find((d) => d.month === e.activeLabel);
                      if (clicked) {
                        setSelectedMonth(selectedMonth === clicked.fullMonth ? null : clicked.fullMonth);
                      }
                    } else {
                      setSelectedMonth(null);
                    }
                  }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={12} />
                    <YAxis stroke="var(--muted-foreground)" fontSize={12} tickFormatter={(v) => `${v}%`} />
                    <Tooltip
                      contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px" }}
                      formatter={(value) => [`${Number(value).toFixed(2)}%`, "收益率"]}
                    />
                    <Bar dataKey="returnRate" radius={[4, 4, 0, 0]}>
                      {monthlyChartData.map((entry) => (
                        <Cell
                          key={entry.fullMonth}
                          fill={selectedMonth === entry.fullMonth ? "#f59e0b" : entry.returnRate >= 0 ? "#16a34a" : "#dc2626"}
                          opacity={selectedMonth && selectedMonth !== entry.fullMonth ? 0.4 : 1}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center py-12 text-muted">暂无月度数据</div>
              )}
              {selectedMonth && (
                <div className="text-xs text-muted mt-2">
                  已选中：{selectedMonth}（点击柱子取消选中）
                </div>
              )}
            </div>

            <div className="bg-card border border-default rounded-xl p-6">
              <h2 className="text-lg font-semibold mb-4">
                标的盈亏排行
                <span className="text-sm font-normal text-muted ml-2">
                  ({selectedMonth || `${viewYear}年 全年`})
                </span>
              </h2>
              <PositionRankList data={filteredPositionRanking} />
            </div>
          </div>

          <div className="bg-card border border-default rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4">月度收益明细</h2>
            <MonthlyDetailTable data={filteredMonthlyData} />
          </div>
        </>
      )}
    </>
  );
}

function PositionRankList({ data }: { data: PositionRankItem[] }) {
  const [tab, setTab] = useState<"all" | "gainers" | "losers">("all");

  const gainers = useMemo(() => data.filter((d) => d.pnl > 0).sort((a, b) => b.pnl - a.pnl), [data]);
  const losers = useMemo(() => data.filter((d) => d.pnl < 0).sort((a, b) => a.pnl - b.pnl), [data]);
  const allSorted = useMemo(() => [...data].sort((a, b) => b.pnl - a.pnl), [data]);

  const displayList = tab === "gainers" ? gainers : tab === "losers" ? losers : allSorted;

  if (data.length === 0) {
    return <div className="text-center py-8 text-muted">暂无数据</div>;
  }

  return (
    <div>
      <div className="flex items-center gap-1 mb-3 bg-muted/40 p-1 rounded-lg w-fit text-xs">
        <button
          type="button"
          onClick={() => setTab("all")}
          className={`px-3 py-1 rounded-md transition-colors font-medium ${
            tab === "all" ? "bg-card text-foreground shadow-sm" : "text-muted hover:text-foreground"
          }`}
        >
          全部 ({data.length})
        </button>
        <button
          type="button"
          onClick={() => setTab("gainers")}
          className={`px-3 py-1 rounded-md transition-colors font-medium ${
            tab === "gainers" ? "bg-card text-green shadow-sm" : "text-muted hover:text-foreground"
          }`}
        >
          盈利榜 ({gainers.length})
        </button>
        <button
          type="button"
          onClick={() => setTab("losers")}
          className={`px-3 py-1 rounded-md transition-colors font-medium ${
            tab === "losers" ? "bg-card text-red shadow-sm" : "text-muted hover:text-foreground"
          }`}
        >
          亏损榜 ({losers.length})
        </button>
      </div>

      <div className="space-y-1.5 max-h-[350px] overflow-y-auto pr-1">
        {displayList.length === 0 ? (
          <div className="text-center py-8 text-xs text-muted">
            {tab === "gainers" ? "当前周期无盈利标的" : "当前周期无亏损标的"}
          </div>
        ) : (
          displayList.map((pos, i) => (
            <div
              key={pos.symbol}
              className="flex items-center gap-3 py-2 px-2.5 rounded-lg hover:bg-muted/30 transition-colors"
            >
              <span
                className={`text-xs font-semibold w-5 text-center ${
                  i < 3 && tab === "gainers"
                    ? "text-green font-bold"
                    : i < 3 && tab === "losers"
                    ? "text-red font-bold"
                    : "text-muted"
                }`}
              >
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-semibold truncate max-w-[150px] sm:max-w-none">{pos.symbol}</span>
                    {pos.changePercent !== undefined && (
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                          pos.changePercent >= 0 ? "bg-green/10 text-green" : "bg-red/10 text-red"
                        }`}
                        title="标的自身价格涨跌幅"
                      >
                        {pos.changePercent >= 0 ? "+" : ""}
                        {pos.changePercent.toFixed(2)}%
                      </span>
                    )}
                  </div>
                  <span className={`font-semibold ${pos.pnl >= 0 ? "text-green" : "text-red"}`}>
                    {pos.pnl >= 0 ? "+" : ""}${pos.pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs text-muted mt-0.5">
                  <span className="truncate max-w-[200px]" title={pos.name}>
                    {pos.name}
                  </span>
                  <span title="对投资组合总资产收益率的拉动点数（贡献度）">
                    拉动 {pos.contribution >= 0 ? "+" : ""}{pos.contribution.toFixed(2)}%
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function DailyDetailTable({ snapshots }: { snapshots: SnapshotData[] }) {
  if (snapshots.length === 0) {
    return <div className="text-center py-8 text-muted">暂无数据</div>;
  }
  return (
    <div className="border border-default rounded-xl overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-default bg-muted/50">
            <th className="text-left py-3 px-4 text-sm font-medium text-muted">日期</th>
            <th className="text-right py-3 px-4 text-sm font-medium text-muted">总资产</th>
            <th className="text-right py-3 px-4 text-sm font-medium text-muted">出入金</th>
            <th className="text-right py-3 px-4 text-sm font-medium text-muted">日盈亏</th>
            <th className="text-right py-3 px-4 text-sm font-medium text-muted">日收益率</th>
          </tr>
        </thead>
        <tbody>
          {snapshots.map((s) => (
            <tr key={s.date} className="border-b border-default last:border-0 hover:bg-accent/50">
              <td className="py-3 px-4 text-sm">{s.date}</td>
              <td className="text-right py-3 px-4 text-sm">${s.value.toFixed(2)}</td>
              <td className="text-right py-3 px-4 text-sm text-muted">
                {(s.cashFlow ?? 0) !== 0 ? `${(s.cashFlow ?? 0) >= 0 ? "+" : ""}$${(s.cashFlow ?? 0).toFixed(2)}` : "-"}
              </td>
              <td className={`text-right py-3 px-4 text-sm font-medium ${(s.dailyPnl ?? 0) >= 0 ? "text-green" : "text-red"}`}>
                {(s.dailyPnl ?? 0) >= 0 ? "+" : ""}${(s.dailyPnl ?? 0).toFixed(2)}
              </td>
              <td className={`text-right py-3 px-4 text-sm font-medium ${(s.dailyReturn ?? 0) >= 0 ? "text-green" : "text-red"}`}>
                {(s.dailyReturn ?? 0) >= 0 ? "+" : ""}{(s.dailyReturn ?? 0).toFixed(2)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MonthlyDetailTable({ data }: { data: MonthlyItem[] }) {
  if (data.length === 0) {
    return <div className="text-center py-8 text-muted">暂无数据</div>;
  }
  return (
    <div className="border border-default rounded-xl overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-default bg-muted/50">
            <th className="text-left py-3 px-4 text-sm font-medium text-muted">月份</th>
            <th className="text-right py-3 px-4 text-sm font-medium text-muted">期初资产</th>
            <th className="text-right py-3 px-4 text-sm font-medium text-muted">出入金</th>
            <th className="text-right py-3 px-4 text-sm font-medium text-muted">期末资产</th>
            <th className="text-right py-3 px-4 text-sm font-medium text-muted">盈亏</th>
            <th className="text-right py-3 px-4 text-sm font-medium text-muted">收益率</th>
          </tr>
        </thead>
        <tbody>
          {data.map((m) => (
            <tr key={m.month} className="border-b border-default last:border-0 hover:bg-accent/50">
              <td className="py-3 px-4 text-sm font-medium">{m.label}</td>
              <td className="text-right py-3 px-4 text-sm">${m.startValue.toFixed(2)}</td>
              <td className="text-right py-3 px-4 text-sm text-muted">
                {m.cashFlow !== 0 ? `${m.cashFlow >= 0 ? "+" : ""}$${m.cashFlow.toFixed(2)}` : "-"}
              </td>
              <td className="text-right py-3 px-4 text-sm">${m.endValue.toFixed(2)}</td>
              <td className={`text-right py-3 px-4 text-sm font-medium ${m.pnl >= 0 ? "text-green" : "text-red"}`}>
                {m.pnl >= 0 ? "+" : ""}${m.pnl.toFixed(2)}
              </td>
              <td className={`text-right py-3 px-4 text-sm font-medium ${m.returnRate >= 0 ? "text-green" : "text-red"}`}>
                {m.returnRate >= 0 ? "+" : ""}{m.returnRate.toFixed(2)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
