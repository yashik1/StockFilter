import { NextResponse } from "next/server";
import { getProvider } from "@/lib/providers";

export const revalidate = 3600;

/** Symbol search, backed by the SEC ticker map (or EODHD when configured). */
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 1) return NextResponse.json({ results: [] });

  try {
    const results = await getProvider().searchSymbols(query, 8);
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
