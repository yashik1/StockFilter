"use client";

import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  createChart,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Bar, Timeframe } from "@/lib/providers/types";
import { cn } from "@/lib/utils";
import { useTimeZone } from "@/components/local-time";

type ChartStyle = "candles" | "line" | "area";

/** Ranges offered per timeframe, in days. */
const RANGES: { label: string; days: number; timeframe: Timeframe }[] = [
  { label: "1D", days: 1, timeframe: "1Min" },
  { label: "5D", days: 5, timeframe: "5Min" },
  { label: "1M", days: 30, timeframe: "15Min" },
  { label: "6M", days: 182, timeframe: "1Hour" },
  { label: "1Y", days: 365, timeframe: "1Day" },
  { label: "5Y", days: 365 * 5, timeframe: "1Day" },
  { label: "Max", days: 365 * 20, timeframe: "1Week" },
];

const TIMEFRAMES: { value: Timeframe; label: string }[] = [
  { value: "1Min", label: "1m" },
  { value: "5Min", label: "5m" },
  { value: "15Min", label: "15m" },
  { value: "1Hour", label: "1h" },
  { value: "1Day", label: "1D" },
  { value: "1Week", label: "1W" },
];

/** Longest window each timeframe can serve, mirroring the API's caps. */
const MAX_DAYS: Record<Timeframe, number> = {
  "1Min": 7,
  "5Min": 30,
  "15Min": 60,
  "1Hour": 365,
  "1Day": 365 * 10,
  "1Week": 365 * 25,
};

/**
 * Formats an axis tick in the reader's own timezone.
 *
 * The series carries UTC epoch seconds, which the library renders as UTC — so a
 * US market opening at 9:30 Eastern appeared as 14:30 with nothing to say why.
 * Only the display is shifted; the underlying timestamps stay UTC.
 */
function localTick(time: number, intraday: boolean): string {
  const date = new Date(time * 1000);
  return intraday
    ? new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date)
    : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

/** Full local date and time, for the crosshair readout. */
function localCrosshair(time: number, intraday: boolean): string {
  const date = new Date(time * 1000);
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    ...(intraday ? { timeStyle: "short" as const } : {}),
  }).format(date);
}

function cssVar(name: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

export function PriceChart({ symbol }: { symbol: string }) {
  const zone = useTimeZone();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const priceSeriesRef = useRef<ISeriesApi<"Candlestick" | "Line" | "Area"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  const [rangeLabel, setRangeLabel] = useState("1Y");
  const [timeframe, setTimeframe] = useState<Timeframe>("1Day");
  const [style, setStyle] = useState<ChartStyle>("candles");
  const [bars, setBars] = useState<Bar[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);

  const range = RANGES.find((r) => r.label === rangeLabel) ?? RANGES[4];

  // ---- data ----
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    (async () => {
      setStatus("loading");
      setMessage(null);

      // A range longer than the timeframe can serve is clamped rather than
      // silently returning a partial window.
      const days = Math.min(range.days, MAX_DAYS[timeframe]);

      try {
        const res = await fetch(
          `/api/bars?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}&days=${days}`,
          { signal: controller.signal },
        );
        const json = await res.json();
        if (cancelled) return;

        // Any reported failure is shown verbatim. Collapsing an invalid key or
        // an exhausted quota into "no data" hides the only useful information.
        if (json.error) {
          setStatus("error");
          setMessage(json.message ?? json.error);
          return;
        }
        const next: Bar[] = json.bars ?? [];
        setBars(next);
        setStatus(next.length === 0 ? "empty" : "ready");
      } catch (err) {
        if (cancelled || (err as Error).name === "AbortError") return;
        setStatus("error");
        setMessage("Could not load price data.");
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [symbol, timeframe, range.days]);

  // ---- chart lifecycle ----
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
      timeScale: {
        borderColor: cssVar("--border", "#e2e8f0"),
        // Intraday needs the clock; daily and weekly do not.
        timeVisible: timeframe !== "1Day" && timeframe !== "1Week",
        secondsVisible: false,
        // Rendered in the reader's zone rather than UTC, which is what the
        // library would otherwise show for these timestamps.
        tickMarkFormatter: (time: number) =>
          localTick(time, timeframe !== "1Day" && timeframe !== "1Week"),
      },
      localization: {
        timeFormatter: (time: number) =>
          localCrosshair(time, timeframe !== "1Day" && timeframe !== "1Week"),
      },
      crosshair: { mode: 1 },
      autoSize: true,
    });

    const up = cssVar("--up", "#059669");
    const down = cssVar("--down", "#dc2626");
    const accent = cssVar("--accent", "#2563eb");

    if (style === "candles") {
      priceSeriesRef.current = chart.addSeries(CandlestickSeries, {
        upColor: up,
        downColor: down,
        borderUpColor: up,
        borderDownColor: down,
        wickUpColor: up,
        wickDownColor: down,
      });
    } else if (style === "line") {
      priceSeriesRef.current = chart.addSeries(LineSeries, {
        color: accent,
        lineWidth: 2,
      });
    } else {
      priceSeriesRef.current = chart.addSeries(AreaSeries, {
        lineColor: accent,
        topColor: `${accent}55`,
        bottomColor: `${accent}05`,
        lineWidth: 2,
      });
    }

    volumeSeriesRef.current = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    // Pin volume to the bottom fifth so it never obscures price.
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    chartRef.current = chart;
  }, [style, timeframe]);

  useEffect(() => {
    buildChart();
    return () => {
      chartRef.current?.remove();
      chartRef.current = null;
      priceSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, [buildChart]);

  // Rebuild on theme change so chart colours follow the palette.
  useEffect(() => {
    const observer = new MutationObserver(buildChart);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, [buildChart]);

  // ---- render data ----
  useEffect(() => {
    const price = priceSeriesRef.current;
    const volume = volumeSeriesRef.current;
    if (!price || !volume || bars.length === 0) return;

    if (style === "candles") {
      price.setData(
        bars.map((b) => ({
          time: b.time as UTCTimestamp,
          open: b.open,
          high: b.high,
          low: b.low,
          close: b.close,
        })),
      );
    } else {
      price.setData(
        bars.map((b) => ({ time: b.time as UTCTimestamp, value: b.close })),
      );
    }

    const up = cssVar("--up", "#059669");
    const down = cssVar("--down", "#dc2626");
    volume.setData(
      bars.map((b) => ({
        time: b.time as Time,
        value: b.volume,
        color: `${b.close >= b.open ? up : down}40`,
      })),
    );

    chartRef.current?.timeScale().fitContent();
  }, [bars, style]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Range presets */}
        <div
          role="group"
          aria-label="Date range"
          className="flex rounded-lg border border-border bg-surface p-0.5"
        >
          {RANGES.map((r) => (
            <button
              key={r.label}
              type="button"
              aria-pressed={rangeLabel === r.label}
              onClick={() => {
                setRangeLabel(r.label);
                setTimeframe(r.timeframe);
              }}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                rangeLabel === r.label
                  ? "bg-accent text-accent-fg"
                  : "text-muted hover:text-foreground",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* Explicit timeframe control — the day/hour/minute filter */}
        <div
          role="group"
          aria-label="Candle interval"
          className="flex rounded-lg border border-border bg-surface p-0.5"
        >
          {TIMEFRAMES.map((t) => (
            <button
              key={t.value}
              type="button"
              aria-pressed={timeframe === t.value}
              onClick={() => setTimeframe(t.value)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                timeframe === t.value
                  ? "bg-surface-2 text-foreground"
                  : "text-muted hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div
          role="group"
          aria-label="Chart style"
          className="ml-auto flex rounded-lg border border-border bg-surface p-0.5"
        >
          {(["candles", "line", "area"] as ChartStyle[]).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={style === s}
              onClick={() => setStyle(s)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors",
                style === s ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground",
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="relative h-[420px] w-full">
        <div ref={containerRef} className="absolute inset-0" />

        {status !== "ready" && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface/60 backdrop-blur-[1px]">
            <p className="max-w-sm px-6 text-center text-sm text-muted">
              {status === "loading" && "Loading price history…"}
              {status === "empty" &&
                `No ${timeframe} price data available for ${symbol} in this range.`}
              {status === "error" && (message ?? "Could not load price data.")}
            </p>
          </div>
        )}
      </div>

      {bars.length > 0 && (
        <p className="text-xs text-muted">
          {bars.length.toLocaleString()} bars · {timeframe} interval
          {zone && ` · times shown in ${zone}`}
        </p>
      )}
    </div>
  );
}
