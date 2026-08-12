import { Card } from "@/components/ui";

/**
 * Shown wherever a feature needs setup that has not been done yet.
 *
 * The screener depends on a populated database, and there is no way to fake
 * that, so the empty state explains exactly which command to run rather than
 * showing a blank table.
 */
export function SetupNotice({ status }: { status: "no-database" | "empty" }) {
  const steps =
    status === "no-database"
      ? [
          {
            title: "Create a Postgres database",
            body: "On railway.com: New → Database → PostgreSQL. Copy the connection string it gives you.",
          },
          {
            title: "Add it to your environment",
            body: "Put it in .env.local as DATABASE_URL (locally), and in your Vercel project settings for the deployed site.",
            code: 'DATABASE_URL="postgresql://…"',
          },
          {
            title: "Create the tables",
            body: "Pushes the schema to your new database.",
            code: "npm run db:push",
          },
          {
            title: "Load the companies",
            body: "Fetches filings from SEC EDGAR and computes scores. Takes a few minutes for the full universe.",
            code: "npm run ingest",
          },
        ]
      : [
          {
            title: "Load the companies",
            body: "The database is connected but empty. This fetches filings from SEC EDGAR and computes every score.",
            code: "npm run ingest",
          },
          {
            title: "Try a smaller batch first",
            body: "If you just want to see it working, start with 25 companies.",
            code: "npm run ingest -- --limit 25",
          },
        ];

  return (
    <Card className="p-6">
      <h2 className="text-base font-semibold">
        {status === "no-database"
          ? "The screener needs a database"
          : "No companies loaded yet"}
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Screening compares hundreds of companies at once, so scores are computed ahead of
        time and stored. Individual stock pages work without any of this — try{" "}
        <a href="/stock/AAPL" className="text-accent underline">
          /stock/AAPL
        </a>{" "}
        right now.
      </p>

      <ol className="mt-5 space-y-4">
        {steps.map((step, i) => (
          <li key={step.title} className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium">{step.title}</p>
              <p className="mt-0.5 text-sm text-muted">{step.body}</p>
              {step.code && (
                <pre className="scroll-x mt-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs">
                  <code>{step.code}</code>
                </pre>
              )}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
