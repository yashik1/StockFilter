"use client";

import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Bar, CorporateEvent, Timeframe } from "@/lib/providers/types";
import { placeEvents } from "@/lib/chart-markers";
import { daysSinceStartOfYear, resolveDays, type RangeDays } from "@/lib/ranges";
import { cn } from "@/lib/utils";
import { useTimeZone } from "@/components/local-time";

type ChartStyle = "candles" | "line" | "area";

/**
 * Ranges offered per timeframe, in days.
 *
 * Year-to-date sits between the six-month and one-year windows, which is where
 * it falls for most of the year and where a reader looks for it. Its length is
 * a function rather than a constant because the calendar decides it.
 */
const RANGES: { label: string; days: RangeDays; timeframe: Timeframe }[] = [
  { label: "1D", days: 1, timeframe: "1Min" },
  { label: "5D", days: 5, timeframe: "5Min" },
  { label: "1M", days: 30, timeframe: "15Min" },
  { label: "6M", days: 182, timeframe: "1Hour" },
  { label: "YTD", days: daysSinceStartOfYear, timeframe: "1Day" },
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
 * Converts any of lightweight-charts' time representations into a Date.
 *
 * `Time` is a union: epoch seconds, a "YYYY-MM-DD" string, or a
 * `{ year, month, day }` object, and the library picks between them by series
 * type — daily and weekly data commonly arrives as the object form. Assuming a
 * number produced an invalid Date, which made Intl throw and took the whole
 * chart down with it.
 */
function toDate(time: unknown): Date | null {
  if (typeof time === "number") return new Date(time * 1000);

  if (typeof time === "string") {
    // "YYYY-MM-DD" is parsed as UTC midnight, matching how the library treats it.
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

/**
 * Formats an axis tick in the reader's own timezone.
 *
 * The series carries UTC epoch seconds, which the library renders as UTC — so a
 * US market opening at 9:30 Eastern appeared as 14:30 with nothing to say why.
 * Only the display is shifted; the underlying timestamps stay UTC.
 */
function localTick(time: unknown, intraday: boolean): string {
  const date = toDate(time);
  // An unrecognised shape returns empty rather than throwing: a missing tick
  // label is a blemish, an exception takes the whole chart down.
  if (!date) return "";

  return intraday
    ? new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date)
    : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

/** Full local date and time, for the crosshair readout. */
function localCrosshair(time: unknown, intraday: boolean): string {
  const date = toDate(time);
  if (!date) return "";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    ...(intraday ? { timeStyle: "short" as const } : {}),
  }).format(date);
}

/**
 * Turns events into markers the chart can draw.
 *
 * Placement lives in chart-markers.ts and is shared with its tests; this maps
 * the result onto the library's shapes and the theme's colours.
 */
function buildMarkers(events: CorporateEvent[], bars: Bar[]): SeriesMarker<Time>[] {
  const style = {
    dividend: { color: cssVar("--up", "#059669"), shape: "circle" as const },
    split: { color: cssVar("--accent", "#a35d00"), shape: "arrowUp" as const },
    earnings: { color: cssVar("--muted-strong", "#6b7280"), shape: "square" as const },
  };

  return placeEvents(events, bars).map((e) => ({
    time: e.time as Time,
    position: "belowBar" as const,
    color: style[e.kind].color,
    shape: style[e.kind].shape,
    text: e.label,
    id: e.id,
  }));
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
  const [events, setEvents] = useState<CorporateEvent[]>([]);
  const [showEvents, setShowEvents] = useState(true);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);

  // Found by label rather than by index, so inserting a range cannot silently
  // change which one is the fallback.
  const range =
    RANGES.find((r) => r.label === rangeLabel) ??
    RANGES.find((r) => r.label === "1Y")!;

  // ---- data ----
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    (async () => {
      setStatus("loading");
      setMessage(null);

      // A range longer than the timeframe can serve is clamped rather than
      // silently returning a partial window.
      const days = Math.min(resolveDays(range.days), MAX_DAYS[timeframe]);

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

  // Fetched separately from the bars so that losing the annotation never costs
  // the chart itself.
  useEffect(() => {
    let cancelled = false;
    const days = resolveDays(range.days);

    (async () => {
      try {
        const res = await fetch(`/api/events?symbol=${encodeURIComponent(symbol)}&days=${days}`);
        const json = await res.json();
        if (!cancelled) setEvents((json.events ?? []) as CorporateEvent[]);
      } catch {
        if (!cancelled) setEvents([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [symbol, range.days]);

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
        tickMarkFormatter: (time: unknown) =>
          localTick(time, timeframe !== "1Day" && timeframe !== "1Week"),
      },
      localization: {
        timeFormatter: (time: unknown) =>
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
      // Bound to the series that was just removed; a stale handle would write
      // markers to a chart that no longer exists.
      markersRef.current = null;
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

    // Markers are attached to the price series rather than drawn separately, so
    // they stay put through zooming and panning.
    const markers = (markersRef.current ??= createSeriesMarkers(price, []));
    markers.setMarkers(showEvents ? buildMarkers(events, bars) : []);

    chartRef.current?.timeScale().fitContent();
  }, [bars, style, events, showEvents]);

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

        {/*
          Off is a real choice: on a five-year daily chart a marker every
          quarter plus one every dividend crowds the line it is annotating.
        */}
        <button
          type="button"
          aria-pressed={showEvents}
          onClick={() => setShowEvents((v) => !v)}
          disabled={events.length === 0}
          className={cn(
            "ml-auto rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
            events.length === 0
              ? "cursor-not-allowed border-border text-faint"
              : showEvents
                ? "border-accent bg-accent-soft text-accent"
                : "border-border text-muted hover:text-foreground",
          )}
          title={
            events.length === 0
              ? "No dividends, splits or results dates in this window"
              : "Show dividends, splits and results dates"
          }
        >
          Events
        </button>

        <div
          role="group"
          aria-label="Chart style"
          className="flex rounded-lg border border-border bg-surface p-0.5"
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

      {/*
        A key for the markers. Shapes and colours mean nothing on their own, and
        the whole reason for marking a split is that a reader would otherwise
        misread the drop — leaving them to guess what a triangle means would
        reproduce the problem in a different form.
      */}
      {showEvents && events.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
          {(
            [
              ["dividend", "Dividend paid", "bg-up"],
              ["split", "Share split", "bg-accent"],
              ["earnings", "Results published", "bg-muted-strong"],
            ] as const
          )
            .filter(([kind]) => events.some((e) => e.kind === kind))
            .map(([kind, label, colour]) => (
              <span key={kind} className="flex items-center gap-1.5">
                <span aria-hidden className={cn("size-2 rounded-full", colour)} />
                {label}
              </span>
            ))}
        </div>
      )}

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
