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
  maxDrawdown: number | null;
}

interface MonthlyItem {
  month: string;
  label: string;
  shortLabel: string;
  startValue: number;
  endValue: number;
  pnl: number;
  returnRate: number;
}

interface PositionRankItem {
  symbol: string;
  name: string;
  pnl: number;
  contribution: number;
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
  const monthStart = monthSnapshots.length > 0 ? monthSnapshots[0].value : 0;
  const monthEnd = monthSnapshots.length > 0 ? monthSnapshots[monthSnapshots.length - 1].value : 0;
  const monthPnl = monthEnd - monthStart;
  const monthReturn = monthStart > 0 ? (monthPnl / monthStart) * 100 : 0;
  const monthMaxDD = monthSnapshots.reduce(
    (min, s) => (s.maxDrawdown !== null && s.maxDrawdown < min ? s.maxDrawdown : min),
    0
  );

  const dailyChartData = monthSnapshots.map((s) => ({
    date: s.date.slice(8),
    fullDate: s.date,
    returnRate: s.dailyReturn ?? 0,
    pnl: s.dailyPnl ?? 0,
  }));

  const yearSnapshots = snapshots.filter((s) => s.date.startsWith(String(viewYear)));
  const yearStart = yearSnapshots.length > 0 ? yearSnapshots[0].value : 0;
  const yearEnd = yearSnapshots.length > 0 ? yearSnapshots[yearSnapshots.length - 1].value : 0;
  const yearPnl = yearEnd - yearStart;
  const yearReturn = yearStart > 0 ? (yearPnl / yearStart) * 100 : 0;
  const yearMaxDD = yearSnapshots.reduce(
    (min, s) => (s.maxDrawdown !== null && s.maxDrawdown < min ? s.maxDrawdown : min),
    0
  );

  const filteredMonthlyData = monthlyData.filter((m) => m.month.startsWith(String(viewYear)));
  const monthlyChartData = filteredMonthlyData.map((m) => ({
    month: m.shortLabel,
    fullMonth: m.month,
    returnRate: Number(m.returnRate.toFixed(2)),
  }));

  // Position ranking based on selection
  const filteredPositionRanking = useMemo(() => {
    if (view === "month") {
      if (!selectedDay) return positionRanking;
      const dayPositions = dailyPositions[selectedDay];
      if (!dayPositions || dayPositions.length === 0) return [];

      const monthStart = viewMonth + "-01";
      let startPositions: DailyPositionEntry[] = [];
      for (const [date, dps] of Object.entries(dailyPositions)) {
        if (date.startsWith(viewMonth) && date <= selectedDay) {
          if (!startPositions.length || date < monthStart) {
            startPositions = dps;
            break;
          }
        }
      }
      const startMap = new Map(startPositions.map((p) => [p.symbol, p.marketValue]));

      const pnlList = dayPositions
        .map((p) => {
          const startValue = startMap.get(p.symbol) ?? 0;
          const pnl = p.marketValue - startValue;
          return { symbol: p.symbol, name: p.name, pnl, contribution: 0 };
        })
        .filter((p) => p.pnl !== 0)
        .sort((a, b) => b.pnl - a.pnl);

      const totalPnl = pnlList.reduce((sum, p) => sum + Math.abs(p.pnl), 0);
      for (const p of pnlList) {
        p.contribution = totalPnl !== 0 ? (p.pnl / totalPnl) * 100 : 0;
      }
      return pnlList;
    } else {
      if (!selectedMonth) return positionRanking;
      const firstDate = Object.keys(dailyPositions)
        .filter((d) => d.startsWith(selectedMonth))
        .sort()[0];
      const lastDate = Object.keys(dailyPositions)
        .filter((d) => d.startsWith(selectedMonth))
        .sort()
        .pop();

      if (!firstDate || !lastDate) return [];
      const firstPositions = dailyPositions[firstDate];
      const lastPositions = dailyPositions[lastDate];
      const firstMap = new Map(firstPositions.map((p) => [p.symbol, p.marketValue]));

      const pnlList = lastPositions
        .map((p) => {
          const startValue = firstMap.get(p.symbol) ?? 0;
          const pnl = p.marketValue - startValue;
          return { symbol: p.symbol, name: p.name, pnl, contribution: 0 };
        })
        .filter((p) => p.pnl !== 0)
        .sort((a, b) => b.pnl - a.pnl);

      const totalPnl = pnlList.reduce((sum, p) => sum + Math.abs(p.pnl), 0);
      for (const p of pnlList) {
        p.contribution = totalPnl !== 0 ? (p.pnl / totalPnl) * 100 : 0;
      }
      return pnlList;
    }
  }, [view, selectedDay, selectedMonth, dailyPositions, positionRanking, viewMonth]);

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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard
              title={`${viewMonth} 收益`}
              value={`${monthReturn >= 0 ? "+" : ""}${monthReturn.toFixed(2)}%`}
              changePositive={monthReturn >= 0}
            />
            <StatCard
              title={`${viewMonth} 盈亏`}
              value={`$${monthPnl.toFixed(0)}`}
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
              {selectedDay && <span className="text-sm font-normal text-muted ml-2">({selectedDay})</span>}
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard
              title={`${viewYear}年收益`}
              value={`${yearReturn >= 0 ? "+" : ""}${yearReturn.toFixed(2)}%`}
              changePositive={yearReturn >= 0}
            />
            <StatCard
              title={`${viewYear}年盈亏`}
              value={`$${yearPnl.toFixed(0)}`}
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
                {selectedMonth && <span className="text-sm font-normal text-muted ml-2">({selectedMonth})</span>}
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
  if (data.length === 0) {
    return <div className="text-center py-8 text-muted">暂无数据</div>;
  }
  return (
    <div className="space-y-3 max-h-[250px] overflow-y-auto">
      {data.slice(0, 15).map((pos, i) => (
        <div key={pos.symbol} className="flex items-center gap-3">
          <span className="text-xs text-muted w-5 text-right">{i + 1}</span>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between text-sm">
              <span className="font-medium">{pos.symbol}</span>
              <span className={pos.pnl >= 0 ? "text-green" : "text-red"}>
                {pos.pnl >= 0 ? "+" : ""}${pos.pnl.toFixed(0)}
              </span>
            </div>
            <div className="flex justify-between text-xs text-muted mt-0.5">
              <span>{pos.name}</span>
              <span>贡献 {pos.contribution >= 0 ? "+" : ""}{pos.contribution.toFixed(1)}%</span>
            </div>
          </div>
        </div>
      ))}
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
            <th className="text-right py-3 px-4 text-sm font-medium text-muted">日盈亏</th>
            <th className="text-right py-3 px-4 text-sm font-medium text-muted">日收益率</th>
          </tr>
        </thead>
        <tbody>
          {snapshots.map((s) => (
            <tr key={s.date} className="border-b border-default last:border-0 hover:bg-accent/50">
              <td className="py-3 px-4 text-sm">{s.date}</td>
              <td className="text-right py-3 px-4 text-sm">${s.value.toFixed(2)}</td>
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
