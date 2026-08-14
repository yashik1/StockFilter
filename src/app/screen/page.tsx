import type { Metadata } from "next";
import Link from "next/link";
import { SetupNotice } from "@/components/setup-notice";
import { Badge, Card, EmptyState, MeterBar, NotReported, RatingBadge } from "@/components/ui";
import { money, multiple, percent } from "@/lib/format";
import type { Rating } from "@/lib/scoring/types";
import {
  PRESETS,
  runScreen,
  SORTS,
  type PresetKey,
  type ScreenRow,
  type SortKey,
} from "@/lib/screener";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Screener — filter companies by financial health",
  description:
    "Filter hundreds of US and Canadian companies by financial health, valuation, growth and debt.",
};

const SECTORS = [
  { value: "", label: "All sectors" },
  { value: "manufacturing", label: "Manufacturing" },
  { value: "financial", label: "Financial" },
  { value: "real-estate", label: "Real estate" },
  { value: "other", label: "Services & other" },
];

const COUNTRIES = [
  { value: "", label: "US & Canada" },
  { value: "US", label: "US only" },
  { value: "CA", label: "Canada only" },
];

function healthRating(score: number | null): Rating {
  if (score == null) return "unknown";
  if (score >= 7.5) return "good";
  if (score >= 5) return "fair";
  return "poor";
}

export default async function ScreenPage({ searchParams }: PageProps<"/screen">) {
  const params = await searchParams;

  const get = (key: string): string | undefined => {
    const v = params[key];
    return Array.isArray(v) ? v[0] : v;
  };
  const numeric = (key: string): number | undefined => {
    const v = Number(get(key));
    return Number.isFinite(v) ? v : undefined;
  };

  const preset = get("preset") as PresetKey | undefined;
  const sort = (get("sort") as SortKey | undefined) ?? "health";

  const filters = {
    preset: preset && preset in PRESETS ? preset : undefined,
    sector: get("sector") || undefined,
    country: get("country") || undefined,
    minHealth: numeric("minHealth"),
    maxPe: numeric("maxPe"),
    minFScore: numeric("minFScore"),
    minMarketCap: numeric("minMarketCap"),
    minGrowth: numeric("minGrowth"),
    sort: sort in SORTS ? sort : ("health" as SortKey),
  };

  const result = await runScreen(filters);

  return (
    <div className="space-y-5">
      <header className="pt-1">
        <p className="eyebrow">Find companies</p>
        <h1 className="font-display mt-2 text-4xl sm:text-5xl">Screener</h1>
        <p className="mt-1.5 text-sm text-muted">
          Filter by how the finances actually look — not just by price.
        </p>
      </header>

      {/* Preset screens: the entry point for anyone who does not know which
          ratio they want to filter on. */}
      <section aria-labelledby="presets-heading">
        <h2 id="presets-heading" className="sr-only">
          Quick screens
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(Object.keys(PRESETS) as PresetKey[]).map((key) => {
            const active = filters.preset === key;
            return (
              <Link
                key={key}
                href={active ? "/screen" : `/screen?preset=${key}`}
                className={`rounded-[var(--radius)] border p-4 shadow-[var(--shadow-sm)] transition-all ${
                  active
                    ? "border-accent bg-accent-soft ring-1 ring-accent/20"
                    : "border-border bg-surface hover:border-border-strong hover:shadow-[var(--shadow)]"
                }`}
              >
                <p className={`text-sm font-semibold ${active ? "text-accent" : ""}`}>
                  {PRESETS[key].label}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  {PRESETS[key].description}
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Custom filters. A plain GET form keeps every screen shareable as a URL
          and working without JavaScript. */}
      <Card>
        <form method="get" className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          {filters.preset && <input type="hidden" name="preset" value={filters.preset} />}

          <Field label="Sector" name="sector" value={filters.sector} options={SECTORS} />
          <Field label="Listing" name="country" value={filters.country} options={COUNTRIES} />

          <NumberField
            label="Min health score"
            name="minHealth"
            value={filters.minHealth}
            placeholder="0–10"
            step="0.5"
            hint="Composite of profitability, growth, debt and accounting quality."
          />
          <NumberField
            label="Max P/E"
            name="maxPe"
            value={filters.maxPe}
            placeholder="e.g. 20"
            hint="Price paid per dollar of annual profit. Lower is cheaper."
          />
          <NumberField
            label="Min F-Score"
            name="minFScore"
            value={filters.minFScore}
            placeholder="0–9"
            hint="Piotroski score. 7 or more indicates improving fundamentals."
          />
          <NumberField
            label="Min revenue growth"
            name="minGrowth"
            value={filters.minGrowth}
            placeholder="0.15 = 15%"
            step="0.05"
            hint="Year-over-year sales growth, as a decimal."
          />
          <NumberField
            label="Min market value"
            name="minMarketCap"
            value={filters.minMarketCap}
            placeholder="e.g. 1000000000"
            hint="Total value of all shares, in dollars."
          />

          <div>
            <label htmlFor="sort" className="text-xs text-muted">
              Sort by
            </label>
            <select
              id="sort"
              name="sort"
              defaultValue={filters.sort}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            >
              {(Object.keys(SORTS) as SortKey[]).map((k) => (
                <option key={k} value={k}>
                  {SORTS[k].label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
            <button
              type="submit"
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90"
            >
              Apply filters
            </button>
            <Link
              href="/screen"
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-strong transition-colors hover:bg-surface-2"
            >
              Reset
            </Link>
          </div>
        </form>
      </Card>

      {/* Results */}
      {result.status !== "ok" ? (
        <SetupNotice status={result.status} detail={result.detail} />
      ) : (
        <Card>
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <p className="text-sm text-muted">
              {result.total} {result.total === 1 ? "company" : "companies"}
              {filters.preset && ` · ${PRESETS[filters.preset].label}`}
            </p>
          </div>
          <ResultsTable rows={result.rows} />
        </Card>
      )}

      {result.status === "ok" && result.rows.length === 0 && (
        <Card>
          {result.missingData ? (
            // This preset can never match until the data it needs exists, so
            // saying "no companies match" would send people to adjust filters
            // that were never the problem.
            <EmptyState
              title="This screen needs price data"
              description={`"${filters.preset ? PRESETS[filters.preset].label : "This screen"}" needs ${result.missingData.needs}. No company in the database has that yet, because no price source was configured when the data was loaded. Add a free TWELVEDATA_API_KEY or FINNHUB_API_KEY, then run the ingest again — every other screen works without it.`}
              action={
                <Link
                  href="/screen?preset=healthy"
                  className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg"
                >
                  Try &ldquo;Financially healthy&rdquo; instead
                </Link>
              }
            />
          ) : (
            <EmptyState
              title="No companies match these filters"
              description="Every filter applied, but nothing cleared them all. Try relaxing a threshold, or reset and start from a preset."
              action={
                <Link
                  href="/screen"
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium"
                >
                  Reset filters
                </Link>
              }
            />
          )}
        </Card>
      )}
    </div>
  );
}

function ResultsTable({ rows }: { rows: ScreenRow[] }) {
  return (
    <div className="scroll-x">
      <table className="w-full min-w-[52rem] text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-2/50 text-left text-xs text-muted">
            <th scope="col" className="px-5 py-2.5 font-medium">Company</th>
            <th scope="col" className="px-3 py-2 font-medium">Health</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Market value</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">P/E</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Growth</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Margin</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">F-Score</th>
            <th scope="col" className="px-3 py-2 font-medium">Flags</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.symbol} className="transition-colors hover:bg-surface-2">
              <td className="px-5 py-3">
                <Link
                  href={`/stock/${encodeURIComponent(r.symbol)}`}
                  className="block transition-colors hover:text-accent"
                >
                  <span className="text-[0.9375rem] font-bold tracking-tight">{r.symbol}</span>
                  {r.country === "CA" && (
                    <span className="ml-1.5 text-[10px] text-muted">CA</span>
                  )}
                  <span className="block max-w-[16rem] truncate text-xs text-muted">
                    {r.name}
                  </span>
                </Link>
              </td>
              <td className="px-3 py-3">
                <div className="flex w-28 flex-col gap-1.5">
                  <RatingBadge
                    rating={healthRating(r.healthScore)}
                    label={r.healthScore != null ? `${r.healthScore.toFixed(1)}/10` : "no data"}
                  />
                  <MeterBar
                    value={r.healthScore}
                    max={10}
                    rating={healthRating(r.healthScore)}
                    label={`Health ${r.healthScore ?? "unknown"} out of 10`}
                  />
                </div>
              </td>
              <td className="tnum px-3 py-3 text-right">{money(r.marketCap)}</td>
              <td className="tnum px-3 py-3 text-right">{multiple(r.peRatio)}</td>
              <td className="tnum px-3 py-3 text-right">{percent(r.revenueGrowth)}</td>
              <td className="tnum px-3 py-3 text-right">{percent(r.netMargin)}</td>
              <td className="tnum px-3 py-3 text-right">
                {r.fScore != null ? `${r.fScore}/${r.fScoreMax ?? 9}` : <NotReported />}
              </td>
              <td className="px-3 py-3">
                <div className="flex flex-wrap gap-1">
                  {r.zZone === "distress" && <Badge tone="poor">Distress risk</Badge>}
                  {r.mFlagged && <Badge tone="poor">Accounting</Badge>}
                  {r.sectorKind === "financial" && <Badge>Bank</Badge>}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Field({
  label,
  name,
  value,
  options,
}: {
  label: string;
  name: string;
  value?: string;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label htmlFor={name} className="text-xs text-muted">
        {label}
      </label>
      <select
        id={name}
        name={name}
        defaultValue={value ?? ""}
        className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function NumberField({
  label,
  name,
  value,
  placeholder,
  step,
  hint,
}: {
  label: string;
  name: string;
  value?: number;
  placeholder?: string;
  step?: string;
  hint?: string;
}) {
  return (
    <div>
      <label htmlFor={name} className="flex items-center gap-1 text-xs text-muted" title={hint}>
        {label}
        {hint && (
          <>
            <span aria-hidden className="cursor-help opacity-60">ⓘ</span>
            <span className="sr-only">{hint}</span>
          </>
        )}
      </label>
      <input
        id={name}
        name={name}
        type="number"
        step={step}
        inputMode="decimal"
        defaultValue={value ?? ""}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm placeholder:text-muted/60"
      />
    </div>
  );
}
