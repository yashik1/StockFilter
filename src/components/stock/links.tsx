import Link from "next/link";
import { ExternalLink, FileText } from "lucide-react";
import type { Filing, NewsItem } from "@/lib/providers/types";
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

export function NewsList({ news, symbol }: { news: NewsItem[]; symbol: string }) {
  return (
    <Card>
      <CardHeader title="Recent news" subtitle="Coverage from the last 30 days" />
      {news.length === 0 ? (
        <EmptyState
          title="No news available"
          description={`No recent articles for ${symbol}. News needs a free Finnhub API key — set FINNHUB_API_KEY to enable it.`}
        />
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
