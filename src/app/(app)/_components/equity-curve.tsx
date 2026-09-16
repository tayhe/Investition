"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatCurrency } from "@/lib/utils";

interface EquityCurveProps {
  data: { date: string; value: number }[];
  currency?: string;
  height?: number;
}

export function EquityCurve({ data, currency = "USD", height = 300 }: EquityCurveProps) {
  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-muted border border-default rounded-xl"
        style={{ height }}
      >
        暂无数据
      </div>
    );
  }

  const firstValue = data[0].value;
  const lastValue = data[data.length - 1].value;
  const isPositive = lastValue >= firstValue;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="5%"
              stopColor={isPositive ? "#16a34a" : "#dc2626"}
              stopOpacity={0.3}
            />
            <stop
              offset="95%"
              stopColor={isPositive ? "#16a34a" : "#dc2626"}
              stopOpacity={0}
            />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          dataKey="date"
          stroke="var(--muted-foreground)"
          fontSize={12}
          tickLine={false}
        />
        <YAxis
          stroke="var(--muted-foreground)"
          fontSize={12}
          tickLine={false}
          tickFormatter={(v) => formatCurrency(v, currency)}
        />
        <Tooltip
          contentStyle={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
          }}
          formatter={(value) => [formatCurrency(Number(value), currency), "资产"]}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={isPositive ? "#16a34a" : "#dc2626"}
          fillOpacity={1}
          fill="url(#colorValue)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
