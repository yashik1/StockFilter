"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useState } from "react";
import { money, percent } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface TrendSeries {
  key: string;
  label: string;
  data: { year: number; value: number }[];
  /** `money` formats absolute figures; `percent` formats ratios. */
  format: "money" | "percent";
  kind: "bar" | "line";
}

/**
 * Multi-year fundamentals trends.
 *
 * `lightweight-charts` handles the price series but only draws financial time
 * series, so Recharts covers these categorical year-over-year views.
 */
export function FundamentalsChart({
  series,
  currency = "USD",
}: {
  series: TrendSeries[];
  /** The filer's own reporting currency. */
  currency?: string;
}) {
  const available = series.filter((s) => s.data.length > 1);
  const [activeKey, setActiveKey] = useState(available[0]?.key);

  if (available.length === 0) {
    return (
      <p className="px-5 py-8 text-center text-sm text-muted">
        Not enough reported history to chart trends for this company.
      </p>
    );
  }

  const active = available.find((s) => s.key === activeKey) ?? available[0];
  const fmt = (v: number) => (active.format === "money" ? money(v, currency) : percent(v));

  return (
    <div className="p-5">
      <div className="mb-4 flex flex-wrap gap-1.5">
        {available.map((s) => (
          <button
            key={s.key}
            type="button"
            aria-pressed={s.key === active.key}
            onClick={() => setActiveKey(s.key)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
              s.key === active.key
                ? "border-accent bg-accent-soft text-accent"
                : "border-border text-muted hover:text-foreground",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {active.kind === "bar" ? (
            <BarChart data={active.data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="year"
                tick={{ fontSize: 12, fill: "var(--muted)" }}
                axisLine={{ stroke: "var(--border)" }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={fmt}
                tick={{ fontSize: 11, fill: "var(--muted)" }}
                axisLine={false}
                tickLine={false}
                width={64}
              />
              <Tooltip
                cursor={{ fill: "var(--surface-2)" }}
                contentStyle={tooltipStyle}
                formatter={(v) => [fmt(Number(v)), active.label]}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {/* Losses render in the negative colour rather than as an
                    indistinguishable bar below the axis. */}
                {active.data.map((d) => (
                  <Cell
                    key={d.year}
                    fill={d.value >= 0 ? "var(--accent)" : "var(--poor)"}
                  />
                ))}
              </Bar>
            </BarChart>
          ) : (
            <LineChart data={active.data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="year"
                tick={{ fontSize: 12, fill: "var(--muted)" }}
                axisLine={{ stroke: "var(--border)" }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={fmt}
                tick={{ fontSize: 11, fill: "var(--muted)" }}
                axisLine={false}
                tickLine={false}
                width={64}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v) => [fmt(Number(v)), active.label]}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="var(--accent)"
                strokeWidth={2}
                dot={{ r: 3, fill: "var(--accent)" }}
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

const tooltipStyle = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--foreground)",
};
