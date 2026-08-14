import { NextResponse } from "next/server";
import { getProvider } from "@/lib/providers";

/**
 * Symbol search.
 *
 * Explicitly dynamic and uncached. It previously exported `revalidate = 3600`,
 * which asks Next to cache the handler's response — wrong for a route whose
 * whole output depends on a query string, and a way for one empty or failed
 * result to be served for an hour afterwards. The upstream calls do their own
 * caching, which is the right layer for it.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 1) return NextResponse.json({ results: [] });

  try {
    const results = await getProvider().searchSymbols(query, 8);
    return NextResponse.json(
      { results },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    // Previously this returned an empty list, which made every failure look
    // identical to "no company matched" — the single most confusing outcome,
    // because there is nothing to act on. The reason is now reported.
    const message = err instanceof Error ? err.message : "Search failed";
    return NextResponse.json(
      { results: [], error: "search-failed", message },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }
}
