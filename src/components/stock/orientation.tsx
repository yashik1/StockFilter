import { Check, TriangleAlert } from "lucide-react";
import { Card, Metric } from "@/components/ui";
import type { BusinessSummary } from "@/lib/scoring/business";
import type { Highlights } from "@/lib/scoring/highlights";

/**
 * What the company does, before any ratio appears.
 *
 * A debt figure is meaningless until you know whether you are reading about a
 * bank or a shoemaker, and the page used to open with the SEC's own wording —
 * "Electronic Computers" — which helps nobody.
 */
export function WhatItDoes({ summary }: { summary: BusinessSummary }) {
  return (
    <Card className="p-6">
      <p className="eyebrow">What this company does</p>
      <p className="font-display mt-2 text-xl leading-snug sm:text-2xl">
        {summary.sentence}
      </p>

      <dl className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-4 border-t border-border pt-4 sm:grid-cols-3">
        {summary.scale.map((s) => (
          <Metric key={s.label} label={s.label} value={s.value} hint={s.hint} />
        ))}
      </dl>
    </Card>
  );
}

/**
 * Two columns: what the filings show going well, and what is worth watching.
 *
 * Not labelled bull and bear. Those describe positions on where a price is
 * heading, and nothing here forecasts prices. Each line carries the figure it
 * came from, so a reader can check the claim rather than take it on trust.
 */
export function StrengthsAndRisks({ highlights }: { highlights: Highlights }) {
  if (highlights.thin) return null;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
      <Column
        tone="good"
        title="What's working"
        empty="Nothing in the filings stands out as a clear strength."
        items={highlights.working}
      />
      <Column
        tone="watch"
        title="What to watch"
        empty="Nothing in the filings stands out as a concern."
        items={highlights.watch}
      />
    </div>
  );
}

function Column({
  tone,
  title,
  items,
  empty,
}: {
  tone: "good" | "watch";
  title: string;
  items: Highlights["working"];
  empty: string;
}) {
  const good = tone === "good";
  const Icon = good ? Check : TriangleAlert;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-5 py-3.5">
        <span
          aria-hidden
          className={`flex size-6 items-center justify-center rounded-full ${
            good ? "bg-good-soft text-good-fg" : "bg-fair-soft text-fair-fg"
          }`}
        >
          <Icon className="size-3.5" />
        </span>
        {/*
          h2, matching every other card title on the page.

          This is a card header in the same role as the ones CardHeader
          renders, and it sat directly under the page's h1 as an h3 — a level
          skipped, which is a gap for anyone moving through the page by
          heading rather than by eye. The h3s further down are correctly
          nested beneath "The five questions".
        */}
        <h2 className="text-[0.9375rem] font-semibold tracking-tight">{title}</h2>
      </div>

      {items.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item, i) => (
            <li key={i} className="px-5 py-3.5">
              <p className="text-[0.9375rem] leading-relaxed text-muted-strong">
                {item.text}
              </p>
              {/* The figure behind the sentence, so the claim is checkable
                  rather than something to take on trust. */}
              <p className="tnum mt-1.5 text-xs text-faint">{item.evidence}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
