"use client";

import {
  ColorType,
  createChart,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useRef } from "react";
import type { InvestmentPoint } from "@/lib/backtest/single-stock";

/**
 * Converts any of lightweight-charts' time representations into a Date.
 * Mirrors the same helper in price-chart.tsx and compare-chart.tsx — daily
 * data can arrive as an epoch number, a date string, or a `{year,month,day}`
 * object depending on the library's own internal path, and assuming a number
 * throughout produced an invalid Date that took a chart down entirely.
 */
function toDate(time: unknown): Date | null {
  if (typeof time === "number") return new Date(time * 1000);
  if (typeof time === "string") {
    const parsed = Date.parse(time.length === 10 ? `${time}T00:00:00Z` : time);
    return Number.isNaN(parsed) ? null : new Date(parsed);
  }
  if (time && typeof time === "object") {
    const d = time as { year?: number; month?: number; day?: number };
    if (d.year != null && d.month != null && d.day != null) {
      return new Date(Date.UTC(d.year, d.month - 1, d.day));
    }
  }
  return null;
}

function localTick(time: unknown): string {
  const date = toDate(time);
  if (!date) return "";
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short" }).format(date);
}

function localCrosshair(time: unknown): string {
  const date = toDate(time);
  return date ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date) : "";
}

function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

interface Line {
  label: string;
  series: InvestmentPoint[];
}

/**
 * Two dollar-value lines over time: the holding and its benchmark.
 *
 * Both series were built from the same starting amount by `simulateInvestment`,
 * so unlike the price-comparison chart elsewhere in this app, no rebasing to a
 * percentage is needed — the lines are already on the same footing and the
 * gap between them at any point is a real dollar amount, which is closer to
 * how a reader actually thinks about "how did my money do".
 */
export function EquityChart({ target, benchmark }: { target: Line; benchmark: Line | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: cssVar("--muted", "#64748b"),
        fontFamily: "inherit",
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: cssVar("--border", "#e2e8f0") },
        horzLines: { color: cssVar("--border", "#e2e8f0") },
      },
      rightPriceScale: { borderColor: cssVar("--border", "#e2e8f0") },
      timeScale: {
        borderColor: cssVar("--border", "#e2e8f0"),
        tickMarkFormatter: (time: unknown) => localTick(time),
      },
      crosshair: { mode: 1 },
      localization: {
        priceFormatter: (v: number) =>
          `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
        timeFormatter: (time: unknown) => localCrosshair(time),
      },
      autoSize: true,
    });

    const targetSeries = chart.addSeries(LineSeries, {
      color: cssVar("--series-1", "#2563eb"),
      lineWidth: 2,
      title: target.label,
      priceLineVisible: false,
    });
    targetSeries.setData(
      target.series.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
    );

    let benchSeries: ISeriesApi<"Line"> | null = null;
    if (benchmark) {
      benchSeries = chart.addSeries(LineSeries, {
        color: cssVar("--series-2", "#d97706"),
        lineWidth: 2,
        title: benchmark.label,
        priceLineVisible: false,
      });
      benchSeries.setData(
        benchmark.series.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
      );
    }

    chart.timeScale().fitContent();
    chartRef.current = chart;

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [target, benchmark]);

  return <div ref={containerRef} className="h-[380px] w-full" />;
}
