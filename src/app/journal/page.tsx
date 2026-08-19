import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui";
import { Paywall } from "@/components/billing/paywall";
import { NewEntryForm, DeleteEntryButton } from "@/components/journal/journal-form";
import { LocalTime } from "@/components/local-time";
import { getEntitlement } from "@/lib/billing/entitlement";
import { listEntries } from "@/lib/journal/actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Trade journal",
  description: "Your own record of what you did and why.",
  // Somebody's private notes should never be indexed.
  robots: { index: false, follow: false },
};

const KIND_LABEL: Record<string, string> = {
  note: "Note",
  buy: "Bought",
  sell: "Sold",
  watch: "Watching",
};

export default async function JournalPage() {
  const entitlement = await getEntitlement();
  // listEntries re-checks entitlement itself and returns nothing without it,
  // so this cannot expose anything even if the branch below were wrong.
  const entries = entitlement.subscribed ? await listEntries() : [];

  return (
    <div className="space-y-5">
      <header className="pt-1">
        <p className="eyebrow">Your record</p>
        <h1 className="font-display mt-2 text-4xl sm:text-5xl">Trade journal</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-muted">
          What you did and, more usefully, why you thought it was a good idea at the time.
          The reasoning is the part worth having — a price chart can tell you what happened,
          but only you can record what you were thinking.
        </p>
      </header>

      {!entitlement.subscribed ? (
        <Paywall
          entitlement={entitlement}
          feature="Trade journal"
          description="Keep your own notes on what you bought, sold or decided to watch — and what you expected at the time."
          returnTo="/journal"
        />
      ) : (
        <>
          <Card>
            <CardHeader
              title="New entry"
              subtitle="Only you can see this. Nothing here is shared or analysed."
            />
            <NewEntryForm />
          </Card>

          <Card>
            <CardHeader
              title="Your entries"
              subtitle={entries.length === 1 ? "1 entry" : `${entries.length} entries`}
            />
            {entries.length === 0 ? (
              <EmptyState
                title="Nothing written yet"
                description="Add your first entry above. The ones worth writing are the decisions you might second-guess later."
              />
            ) : (
              <ul className="divide-y divide-border">
                {entries.map((entry) => (
                  <li key={entry.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-[0.9375rem] font-semibold">{entry.title}</span>
                      {entry.symbol && (
                        <Link
                          href={`/stock/${encodeURIComponent(entry.symbol)}`}
                          className="text-xs font-bold tracking-tight text-accent hover:underline"
                        >
                          {entry.symbol}
                        </Link>
                      )}
                      <Badge>{KIND_LABEL[entry.kind] ?? entry.kind}</Badge>
                      {entry.conviction != null && (
                        <span className="text-xs text-muted">
                          conviction {entry.conviction}/5
                        </span>
                      )}
                      <span className="ml-auto text-xs text-faint">
                        <LocalTime value={`${entry.entryDate}T00:00:00Z`} mode="date" />
                      </span>
                    </div>

                    {entry.body && (
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-strong">
                        {entry.body}
                      </p>
                    )}

                    <div className="mt-2">
                      <DeleteEntryButton id={entry.id} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
