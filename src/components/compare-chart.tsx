"use client";

import {
  ColorType,
  createChart,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Bar, Timeframe } from "@/lib/providers/types";
import { cn } from "@/lib/utils";

/** Distinguishable in both themes and for the common colour vision deficiencies. */
const SERIES_COLORS = ["#2563eb", "#d97706", "#0d9488", "#c026d3"];

const RANGES: { label: string; days: number; timeframe: Timeframe }[] = [
  { label: "1M", days: 30, timeframe: "1Day" },
  { label: "6M", days: 182, timeframe: "1Day" },
  { label: "1Y", days: 365, timeframe: "1Day" },
  { label: "5Y", days: 365 * 5, timeframe: "1Week" },
];

interface Series {
  symbol: string;
  bars: Bar[];
}

function cssVar(name: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/**
 * Relative performance of several symbols on one axis.
 *
 * Prices are rebased so each series starts at 0%, because absolute prices are
 * not comparable — a $600 share moving $6 and a $60 share moving $6 are very
 * different events, and plotting them together would imply otherwise.
 */
export function CompareChart({ symbols }: { symbols: string[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRefs = useRef<ISeriesApi<"Line">[]>([]);

  const [rangeLabel, setRangeLabel] = useState("1Y");
  const [series, setSeries] = useState<Series[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);

  const range = RANGES.find((r) => r.label === rangeLabel) ?? RANGES[2];
  const key = symbols.join(",");

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    (async () => {
      setStatus("loading");
      setMessage(null);

      try {
        const loaded = await Promise.all(
          symbols.map(async (symbol) => {
            const res = await fetch(
              `/api/bars?symbol=${encodeURIComponent(symbol)}&timeframe=${range.timeframe}&days=${range.days}`,
              { signal: controller.signal },
            );
            const json = await res.json();
            // Surface any reported failure, not just a missing key — an invalid
            // key or an exhausted quota otherwise looks like "no data exists".
            if (json.error) throw new Error(json.message ?? json.error);
            return { symbol, bars: (json.bars ?? []) as Bar[] };
          }),
        );

        if (cancelled) return;
        const withData = loaded.filter((s) => s.bars.length > 1);
        setSeries(withData);
        setStatus(withData.length === 0 ? "empty" : "ready");
      } catch (err) {
        if (cancelled || (err as Error).name === "AbortError") return;
        setStatus("error");
        setMessage((err as Error).message ?? "Could not load price data.");
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [key, range.days, range.timeframe, symbols]);

  const buildChart = useCallback(() => {
    if (!containerRef.current) return;
    chartRef.current?.remove();

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
      timeScale: { borderColor: cssVar("--border", "#e2e8f0") },
      crosshair: { mode: 1 },
      localization: {
        priceFormatter: (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`,
      },
      autoSize: true,
    });

    seriesRefs.current = series.map((s, i) =>
      chart.addSeries(LineSeries, {
        color: SERIES_COLORS[i % SERIES_COLORS.length],
        lineWidth: 2,
        title: s.symbol,
        priceFormat: { type: "custom", formatter: (v: number) => `${v.toFixed(1)}%` },
      }),
    );

    chartRef.current = chart;
  }, [series]);

  useEffect(() => {
    buildChart();
    return () => {
      chartRef.current?.remove();
      chartRef.current = null;
      seriesRefs.current = [];
    };
  }, [buildChart]);

  useEffect(() => {
    const observer = new MutationObserver(buildChart);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, [buildChart]);

  useEffect(() => {
    if (seriesRefs.current.length !== series.length) return;

    series.forEach((s, i) => {
      const base = s.bars[0]?.close;
      if (!base) return;
      seriesRefs.current[i]?.setData(
        s.bars.map((b) => ({
          time: b.time as UTCTimestamp,
          // Percentage change from the first bar in the window.
          value: ((b.close - base) / base) * 100,
        })),
      );
    });

    chartRef.current?.timeScale().fitContent();
  }, [series]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Date range" className="flex rounded-lg border border-border bg-surface p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.label}
              type="button"
              aria-pressed={rangeLabel === r.label}
              onClick={() => setRangeLabel(r.label)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                rangeLabel === r.label ? "bg-accent text-accent-fg" : "text-muted hover:text-foreground",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>

        <ul className="flex flex-wrap items-center gap-3">
          {series.map((s, i) => (
            <li key={s.symbol} className="flex items-center gap-1.5 text-xs font-medium">
              <span
                aria-hidden
                className="size-2.5 rounded-full"
                style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }}
              />
              {s.symbol}
              {(() => {
                const base = s.bars[0]?.close;
                const last = s.bars[s.bars.length - 1]?.close;
                if (!base || !last) return null;
                const pct = ((last - base) / base) * 100;
                return (
                  <span className={cn("tnum", pct >= 0 ? "text-up" : "text-down")}>
                    {pct >= 0 ? "+" : ""}
                    {pct.toFixed(1)}%
                  </span>
                );
              })()}
            </li>
          ))}
        </ul>
      </div>

      <div className="relative h-[360px] w-full">
        <div ref={containerRef} className="absolute inset-0" />
        {status !== "ready" && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface/60">
            <p className="max-w-sm px-6 text-center text-sm text-muted">
              {status === "loading" && "Loading price history…"}
              {status === "empty" && "No price history available for these symbols."}
              {status === "error" && (message ?? "Could not load price data.")}
            </p>
          </div>
        )}
      </div>

      <p className="text-xs text-muted">
        Each line shows percentage change from the start of the window, so symbols with very
        different share prices can be compared directly.
      </p>
    </div>
  );
}
