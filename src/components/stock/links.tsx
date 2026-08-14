import Link from "next/link";
import { ExternalLink, FileText } from "lucide-react";
import type { Filing, NewsItem } from "@/lib/providers/types";
import type { StockPageData } from "@/lib/stock-data";
import { Card, CardHeader, EmptyState } from "@/components/ui";
import { LocalTime } from "@/components/local-time";

/** Plain-English label for each filing type, so the form codes mean something. */
const FORM_LABELS: Record<string, string> = {
  "10-K": "Annual report",
  "10-Q": "Quarterly report",
  "8-K": "Major event announcement",
  "20-F": "Annual report (foreign company)",
  "40-F": "Annual report (Canadian company)",
  "6-K": "Interim update (foreign company)",
  "DEF 14A": "Shareholder voting information",
  "S-1": "Share registration",
};

function formLabel(form: string): string {
  const base = form.replace(/\/A$/, "");
  const label = FORM_LABELS[base] ?? "Filing";
  return form.endsWith("/A") ? `${label} (amended)` : label;
}

export function FilingsList({ filings }: { filings: Filing[] }) {
  return (
    <Card>
      <CardHeader
        title="Official filings"
        subtitle="Straight from SEC EDGAR — the original source for every figure above"
      />
      {filings.length === 0 ? (
        <EmptyState
          title="No filings found"
          description="This company has no recent filings indexed on EDGAR."
        />
      ) : (
        <ul className="divide-y divide-border">
          {filings.map((f, i) => (
            <li key={`${f.form}-${f.filedAt}-${i}`}>
              <a
                href={f.url}
                target="_blank"
                rel="noreferrer noopener"
                className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2"
              >
                <FileText aria-hidden className="size-4 shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {formLabel(f.form)}{" "}
                    <span className="font-normal text-muted">({f.form})</span>
                  </p>
                  <p className="text-xs text-muted">
                    Filed {f.filedAt}
                    {f.periodOfReport && ` · covers period ending ${f.periodOfReport}`}
                  </p>
                </div>
                <ExternalLink aria-hidden className="size-3.5 shrink-0 text-muted" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function NewsList({
  news,
  symbol,
  status = { state: "ok", message: null },
}: {
  news: NewsItem[];
  symbol: string;
  status?: StockPageData["newsStatus"];
}) {
  // Telling a reader who has already set a key to go and set a key sends them
  // to fix something that is not broken. Each case gets its own wording, and
  // the quiet one — a company simply not in the news this month — is stated as
  // the unremarkable thing it is rather than dressed up as a setup problem.
  const empty =
    status.state === "not-configured"
      ? {
          title: "News needs a key",
          description:
            "Headlines come from Finnhub. A free key is an email signup — set FINNHUB_API_KEY to turn this on. Everything else on this page works without one.",
        }
      : status.state === "failed"
        ? {
            title: "News could not be loaded",
            description: `${status.message ?? "The news provider did not respond."} Every other figure on this page comes from SEC EDGAR and is unaffected.`,
          }
        : {
            title: "Nothing in the last 30 days",
            description: `No articles have been published about ${symbol} in the past month. Its filings are listed alongside, and they are the more reliable record anyway.`,
          };

  return (
    <Card>
      <CardHeader title="Recent news" subtitle="Coverage from the last 30 days" />
      {news.length === 0 ? (
        <EmptyState title={empty.title} description={empty.description} />
      ) : (
        <ul className="divide-y divide-border">
          {news.map((n) => (
            <li key={n.id}>
              <a
                href={n.url}
                target="_blank"
                rel="noreferrer noopener"
                className="block px-5 py-3 transition-colors hover:bg-surface-2"
              >
                <p className="text-sm font-medium leading-snug">{n.headline}</p>
                <p className="mt-1 text-xs text-muted">
                  {n.source} · <LocalTime value={n.publishedAt} mode="relative" />
                </p>
              </a>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function PeersList({ peers }: { peers: string[] }) {
  if (peers.length === 0) return null;
  return (
    <Card>
      <CardHeader title="Similar companies" subtitle="Others in the same industry" />
      <div className="flex flex-wrap gap-2 p-5">
        {peers.map((p) => (
          <Link
            key={p}
            href={`/stock/${encodeURIComponent(p)}`}
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:border-accent hover:text-accent"
          >
            {p}
          </Link>
        ))}
      </div>
    </Card>
  );
}

/** External research destinations, for anyone who wants to go deeper. */
export function ResearchLinks({
  symbol,
  cik,
  website,
}: {
  symbol: string;
  cik: string | null;
  website: string | null;
}) {
  const links = [
    website && { label: "Company website", href: website },
    cik && {
      label: "All EDGAR filings",
      href: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=&dateb=&owner=include&count=40`,
    },
    {
      label: "EDGAR full-text search",
      href: `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(symbol)}%22`,
    },
    { label: "Yahoo Finance", href: `https://finance.yahoo.com/quote/${symbol}` },
    { label: "Google Finance", href: `https://www.google.com/finance/quote/${symbol}:NASDAQ` },
    {
      label: "Earnings call transcripts",
      href: `https://www.google.com/search?q=${encodeURIComponent(`${symbol} earnings call transcript`)}`,
    },
  ].filter(Boolean) as { label: string; href: string }[];

  return (
    <Card>
      <CardHeader title="Dig deeper" subtitle="Primary sources and further research" />
      <ul className="divide-y divide-border">
        {links.map((l) => (
          <li key={l.label}>
            <a
              href={l.href}
              target="_blank"
              rel="noreferrer noopener"
              className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm transition-colors hover:bg-surface-2"
            >
              <span>{l.label}</span>
              <ExternalLink aria-hidden className="size-3.5 shrink-0 text-muted" />
            </a>
          </li>
        ))}
      </ul>
    </Card>
  );
}
