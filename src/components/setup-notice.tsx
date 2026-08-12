import { Card } from "@/components/ui";
import type { ScreenStatus } from "@/lib/screener";

interface Step {
  title: string;
  body: string;
  code?: string;
}

/**
 * Explains why the screener has nothing to show, and what to do about it.
 *
 * Each database failure gets its own instructions. Telling someone to re-run an
 * ingest when the tables do not exist just sends them round a loop, so the
 * causes are kept distinct all the way from the driver error to this copy.
 */
export function SetupNotice({
  status,
  detail,
}: {
  status: Exclude<ScreenStatus, "ok">;
  detail?: string;
}) {
  const { heading, intro, steps } = content(status);

  return (
    <Card className="p-6">
      <h2 className="text-base font-semibold">{heading}</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted">{intro}</p>

      {detail && (
        <p className="mt-3 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-muted-strong">
          {detail}
        </p>
      )}

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

      <p className="mt-5 border-t border-border pt-4 text-sm text-muted">
        Individual stock pages need none of this — try{" "}
        <a href="/stock/AAPL" className="text-accent underline">
          /stock/AAPL
        </a>{" "}
        right now.
      </p>
    </Card>
  );
}

function content(status: Exclude<ScreenStatus, "ok">): {
  heading: string;
  intro: string;
  steps: Step[];
} {
  switch (status) {
    case "no-database":
      return {
        heading: "The screener needs a database",
        intro:
          "Screening compares hundreds of companies at once, so scores are computed ahead of time and stored.",
        steps: [
          {
            title: "Create a Postgres database",
            body: "Railway: New → Database → PostgreSQL. Or Neon, which stays free at this size.",
          },
          {
            title: "Point the app at it",
            body:
              "On Railway, add this to the app service's Variables tab — the reference syntax keeps traffic on the internal network. Locally, put the public connection string in .env.local.",
            code: "DATABASE_URL = ${{Postgres.DATABASE_URL}}",
          },
          { title: "Create the tables", body: "Runs the committed SQL schema.", code: "npm run db:migrate" },
          { title: "Load the companies", body: "Fetches filings from SEC EDGAR and computes scores.", code: "npm run ingest -- --limit 25" },
        ],
      };

    case "no-tables":
      return {
        heading: "The tables have not been created yet",
        intro:
          "The database is connected, but the schema is missing — so there is nowhere for the ingest to write. Running the ingest first will not help.",
        steps: [
          {
            title: "Create the tables",
            body:
              "Use db:migrate rather than db:push. db:push needs drizzle-kit, which is a dev dependency and is pruned when NODE_ENV=production, so it fails in a deployed container.",
            code: "npm run db:migrate",
          },
          {
            title: "Then load the companies",
            body: "Start small to confirm it works before running the full universe.",
            code: "npm run ingest -- --limit 25",
          },
          {
            title: "Running on Railway?",
            body: "Execute both inside the container so it uses the internal network.",
            code: "railway ssh -s StockFilter -- npm run db:migrate",
          },
        ],
      };

    case "connection-error":
      return {
        heading: "Could not reach the database",
        intro:
          "DATABASE_URL is set, but connecting to it failed. The most common cause is an internal-only hostname being used from outside the provider's network.",
        steps: [
          {
            title: "Check which hostname you are using",
            body:
              "A host ending in .railway.internal only resolves inside Railway. From your laptop, Vercel, or GitHub Actions you need the public one: Postgres service → Settings → Networking → Public Access, then use DATABASE_PUBLIC_URL.",
          },
          {
            title: "Confirm the credentials",
            body: "Copy the connection string again from the provider — passwords change when a database is recreated.",
          },
          {
            title: "Verify it connects",
            body: "This prints the host it is talking to and creates the tables if it can reach them.",
            code: "npm run db:migrate",
          },
        ],
      };

    case "empty":
      return {
        heading: "No companies loaded yet",
        intro:
          "The database is connected and the tables exist — they just have no rows in them yet.",
        steps: [
          {
            title: "Load a small batch first",
            body: "About 25 companies, roughly a minute. Confirms the whole pipeline works.",
            code: "npm run ingest -- --limit 25",
          },
          {
            title: "Then the full universe",
            body: "Around 700 US and Canadian companies. Takes several minutes.",
            code: "npm run ingest",
          },
          {
            title: "Running on Railway?",
            body: "Run it inside the container so it uses the internal network.",
            code: "railway ssh -s StockFilter -- npm run ingest -- --limit 25",
          },
        ],
      };
  }
}
