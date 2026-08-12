import { NextResponse } from "next/server";
import { getProvider } from "@/lib/providers";
import { eodhd, twelveData } from "@/lib/providers";
import type { Timeframe } from "@/lib/providers/types";

const VALID: Timeframe[] = ["1Min", "5Min", "15Min", "1Hour", "1Day", "1Week"];

/**
 * How far back each timeframe may look.
 *
 * Minute bars are capped well below the provider's 7-year history because a
 * year of 1-minute data is ~100k points — far more than a chart can draw and
 * enough to blow the response size. Longer horizons use coarser buckets.
 */
const MAX_DAYS: Record<Timeframe, number> = {
  "1Min": 7,
  "5Min": 30,
  "15Min": 60,
  "1Hour": 365,
  "1Day": 365 * 10,
  "1Week": 365 * 25,
};

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const symbol = params.get("symbol")?.toUpperCase();
  const timeframe = (params.get("timeframe") ?? "1Day") as Timeframe;
  const requestedDays = Number(params.get("days") ?? 0);

  if (!symbol) {
    return NextResponse.json({ error: "symbol is required" }, { status: 400 });
  }
  if (!VALID.includes(timeframe)) {
    return NextResponse.json(
      { error: `timeframe must be one of ${VALID.join(", ")}` },
      { status: 400 },
    );
  }

  if (!twelveData.isConfigured() && !eodhd.isConfigured()) {
    return NextResponse.json(
      {
        bars: [],
        error: "not-configured",
        message:
          "Price charts need a Twelve Data key. Get a free one at twelvedata.com " +
          "(email signup, no brokerage account) and set TWELVEDATA_API_KEY.",
      },
      { status: 200 },
    );
  }

  const days = Math.min(requestedDays > 0 ? requestedDays : MAX_DAYS[timeframe], MAX_DAYS[timeframe]);
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);

  try {
    const bars = await getProvider().getBars(symbol, timeframe, from, to);
    return NextResponse.json(
      { bars, timeframe, symbol },
      {
        headers: {
          "Cache-Control": `public, s-maxage=${timeframe === "1Min" ? 60 : 300}, stale-while-revalidate=600`,
        },
      },
    );
  } catch (err) {
    return NextResponse.json(
      { bars: [], error: err instanceof Error ? err.message : "Failed to load bars" },
      { status: 502 },
    );
  }
}
