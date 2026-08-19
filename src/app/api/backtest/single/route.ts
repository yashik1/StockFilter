import { NextResponse } from "next/server";
import { DEFAULT_BENCHMARK, runSingleStockBacktest } from "@/lib/backtest/run";

export const dynamic = "force-dynamic";

/**
 * "What if I had invested $X in this stock on this date?" — against a
 * benchmark by default, so a return is read next to the market rather than
 * in isolation.
 */
/*
  Open, like the page it serves.

  This route used to return 402, matching a paywall the page no longer has.
  What is paid is the moving averages drawn over the result, which are computed
  in the browser from this very series — so gating the series would withhold
  nothing and break the free page instead. The screener backtest next door
  stays gated at its route, because there the expensive work and the paid
  answer are the same thing.
*/
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const symbol = params.get("symbol")?.toUpperCase();
  const startParam = params.get("start");
  const amount = Number(params.get("amount") ?? 10_000);
  const reinvest = params.get("reinvest") !== "false";
  const benchmarkParam = params.get("benchmark");
  const benchmark = benchmarkParam === "" || benchmarkParam === "none" ? null : (benchmarkParam ?? DEFAULT_BENCHMARK);

  if (!symbol) {
    return NextResponse.json({ error: "symbol is required" }, { status: 400 });
  }
  if (!startParam || Number.isNaN(Date.parse(startParam))) {
    return NextResponse.json({ error: "start must be a valid date" }, { status: 400 });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
  }

  try {
    const backtest = await runSingleStockBacktest(
      symbol,
      new Date(startParam),
      amount,
      reinvest,
      benchmark,
    );
    return NextResponse.json(backtest, {
      headers: { "Cache-Control": "public, max-age=3600" },
    });
  } catch (err) {
    // Matches the shape runSingleStockBacktest itself returns — the page
    // reads run.result and run.benchmark unconditionally, and a bare
    // {error} here would have nothing for either to destructure.
    return NextResponse.json(
      {
        symbol,
        source: null,
        result: { error: err instanceof Error ? err.message : "Could not run the backtest." },
        splits: [],
        benchmark: null,
        dividendDataAvailable: false,
      },
      { status: 200 },
    );
  }
}
