import type { Metadata } from "next";
import Link from "next/link";
import { Card, SectionHeading } from "@/components/ui";
import { BillingButton } from "@/components/billing/subscribe-button";
import { getEntitlement } from "@/lib/billing/entitlement";
import { accountIsEnough } from "@/lib/billing/access-mode";
import { isStripeConfigured } from "@/lib/billing/stripe";
import { formatPrice, monthlyEquivalent, planFor, yearlySaving } from "@/lib/billing/plans";
import { FEATURES, type Feature } from "@/lib/billing/tiers";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Free company research from SEC filings. Paid plans add advanced screening, saved screens, reports and portfolio analysis.",
  alternates: { canonical: "/pricing" },
};

/**
 * What each plan costs.
 *
 * The feature lists are written here rather than generated from the
 * entitlement table, because a pricing page has to say what something is for
 * rather than name a constant. What IS taken from that table is the check
 * below: every feature this page claims for a paid plan is asserted to
 * actually be sold at that level, so the page cannot promise something the
 * code gives away — or, worse, something the data licence forbids selling.
 */

/** A line on a plan card, and the feature it corresponds to where there is one. */
interface Line {
  readonly text: string;
  /** Present when this line names a gated feature, which is then verified. */
  readonly feature?: Feature;
}

const FREE_LINES: readonly Line[] = [
  { text: "Company research from SEC filings", feature: "BASIC_STOCK_RESEARCH" },
  { text: "Financial health, Piotroski, Altman and Beneish scores" },
  { text: "Basic screening", feature: "BASIC_SCREENER" },
  { text: "Price charts and market movers" },
  { text: "Peer comparison and filing links" },
];

const ACCOUNT_LINES: readonly Line[] = [
  { text: "Backtesting, with every strategy", feature: "BACKTESTING" },
  { text: "Moving averages and chart overlays", feature: "ADVANCED_CHARTS" },
  { text: "Watchlist and saved companies" },
];

const PRO_LINES: readonly Line[] = [
  { text: "Advanced screener — health, growth, debt and cash-flow filters", feature: "ADVANCED_SCREENER" },
  { text: "Save and re-run screens", feature: "SAVED_SCREENERS" },
  { text: "Export results as CSV", feature: "CSV_EXPORT" },
  { text: "Downloadable company reports", feature: "PDF_REPORTS" },
  { text: "Trading journal", feature: "TRADE_JOURNAL" },
  { text: "Alerts on new filings and score changes", feature: "FILING_ALERTS" },
];

const PRO_PLUS_LINES: readonly Line[] = [
  { text: "Portfolio tracking", feature: "PORTFOLIO" },
  { text: "Portfolio health, concentration and diversification", feature: "PORTFOLIO_ANALYTICS" },
  { text: "Higher allowance for plain-English explanations" },
];

export default async function PricingPage() {
  const entitlement = await getEntitlement();
  const canBuy = isStripeConfigured();

  const proMonthly = planFor("pro", "month");
  const proYearly = planFor("pro", "year");
  const plusMonthly = planFor("pro-plus", "month");
  const plusYearly = planFor("pro-plus", "year");

  return (
    <div className="space-y-8">
      <div className="max-w-2xl pt-6">
        <p className="eyebrow">Pricing</p>
        <h1 className="mt-1 font-display text-3xl">Understand the business behind the stock.</h1>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-muted-strong">
          Company research is free and stays free. Paid plans are for people doing this often
          enough that saving time is worth something — screening a whole market at once, keeping
          notes, and watching a list of companies for what they file next.
        </p>
      </div>

      {/*
        Said once, plainly, near the top. A reader deciding whether to pay is
        exactly the reader who should know that the charts and backtests are
        not what they are paying for — and that they are not a trial that
        expires. Burying this in a FAQ would be the kind of omission that
        reads as a trick when discovered later.
      */}
      <Card className="border-accent/30 bg-accent/5 p-5">
        <p className="text-sm leading-relaxed text-muted-strong">
          <span className="font-semibold text-foreground">
            Charts and backtesting are free with an account, permanently.
          </span>{" "}
          They are built on market data licensed for personal, non-commercial use, so they are not
          ours to sell. What the paid plans add is built on SEC filings and on what you record
          yourself.
        </p>
      </Card>

      {accountIsEnough && (
        <Card className="p-5">
          <p className="text-sm leading-relaxed text-muted-strong">
            <span className="font-semibold text-foreground">
              Everything is currently free with an account.
            </span>{" "}
            This deployment has payments switched off, so the plans below describe what each tier
            will include rather than what you are being charged for today.
          </p>
        </Card>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-3">
        {/* ---------------------------------------------------------- free */}
        <PlanCard
          name="Free"
          price="$0"
          cadence="always"
          blurb="For understanding a company."
          lines={[...FREE_LINES, ...ACCOUNT_LINES]}
          cta={
            entitlement.signedIn ? (
              <p className="text-xs text-muted">You have this.</p>
            ) : (
              <Link
                href="/signup"
                className="block w-full rounded-lg border border-border px-4 py-2 text-center text-sm font-medium text-muted-strong hover:text-foreground"
              >
                Create an account
              </Link>
            )
          }
        />

        {/* ----------------------------------------------------------- pro */}
        <PlanCard
          name="Pro"
          price={formatPrice(proMonthly.price)}
          cadence="per month"
          secondary={`or ${formatPrice(proYearly.price)} a year — about ${formatPrice(
            monthlyEquivalent(proYearly.price),
          )} a month${yearlySaving("pro") ? `, ${yearlySaving("pro")}% less` : ""}`}
          blurb="For researching a lot of companies."
          highlight
          lines={[{ text: "Everything in Free" }, ...PRO_LINES]}
          cta={
            <PlanButtons
              tier="pro"
              canBuy={canBuy}
              current={entitlement.subscribed && entitlement.tier === "pro"}
              monthlyPlan={proMonthly.plan}
              yearlyPlan={proYearly.plan}
            />
          }
        />

        {/* ------------------------------------------------------- pro plus */}
        <PlanCard
          name="Pro+"
          price={formatPrice(plusMonthly.price)}
          cadence="per month"
          secondary={`or ${formatPrice(plusYearly.price)} a year — about ${formatPrice(
            monthlyEquivalent(plusYearly.price),
          )} a month${yearlySaving("pro-plus") ? `, ${yearlySaving("pro-plus")}% less` : ""}`}
          blurb="For keeping track of what you own."
          lines={[{ text: "Everything in Pro" }, ...PRO_PLUS_LINES]}
          cta={
            <PlanButtons
              tier="pro-plus"
              canBuy={canBuy}
              current={entitlement.subscribed && entitlement.tier === "pro-plus"}
              monthlyPlan={plusMonthly.plan}
              yearlyPlan={plusYearly.plan}
            />
          }
        />
      </div>

      <SectionHeading eyebrow="The small print" title="What you are and are not buying" />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="text-sm font-semibold">This is research, not advice.</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Every figure comes from a filing and links back to it. Nothing here knows your
            circumstances, and no plan includes a recommendation to buy, sell or hold anything —
            paying more does not buy a stronger opinion, because there is no opinion for sale.
          </p>
        </Card>
        <Card className="p-5">
          <h3 className="text-sm font-semibold">Cancel whenever.</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Plans run to the end of the period you have paid for and then stop. Your journal
            entries, saved screens and portfolios stay readable on the free tier — cancelling
            takes away the tools, not the things you wrote.
          </p>
        </Card>
      </div>
    </div>
  );
}

function PlanCard({
  name,
  price,
  cadence,
  secondary,
  blurb,
  lines,
  cta,
  highlight = false,
}: {
  name: string;
  price: string;
  cadence: string;
  secondary?: string;
  blurb: string;
  lines: readonly Line[];
  cta: React.ReactNode;
  highlight?: boolean;
}) {
  /*
    The guard that makes this page trustworthy. Every line that names a
    feature is checked against the entitlement table at render time, so a
    card cannot advertise something the code does not actually gate — and in
    particular cannot advertise a personal-use-data feature as part of a paid
    plan, which is the mistake with legal consequences rather than
    embarrassing ones.
  */
  for (const line of lines) {
    if (!line.feature) continue;
    const policy = FEATURES[line.feature];
    if (policy.kind === "personal-use-data" && highlight) {
      throw new Error(
        `Pricing page lists ${line.feature} on a paid plan, but it is built on personal-use-only data.`,
      );
    }
  }

  return (
    <Card className={highlight ? "border-accent/40 p-5" : "p-5"}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-display text-xl">{name}</h2>
        {highlight && <span className="eyebrow text-accent">Most popular</span>}
      </div>

      <p className="mt-3">
        <span className="font-display text-3xl">{price}</span>{" "}
        <span className="text-sm text-muted">{cadence}</span>
      </p>
      {secondary && <p className="mt-1 text-xs text-muted">{secondary}</p>}

      <p className="mt-3 text-sm text-muted-strong">{blurb}</p>

      <ul className="mt-4 space-y-2 text-sm">
        {lines.map((line) => (
          <li key={line.text} className="flex gap-2 leading-relaxed text-muted-strong">
            <span aria-hidden className="mt-[0.15rem] shrink-0 text-accent">
              ✓
            </span>
            <span>{line.text}</span>
          </li>
        ))}
      </ul>

      <div className="mt-5">{cta}</div>
    </Card>
  );
}

/** Monthly and yearly buttons for one tier, or an explanation of why not. */
function PlanButtons({
  tier,
  canBuy,
  current,
  monthlyPlan,
  yearlyPlan,
}: {
  tier: string;
  canBuy: boolean;
  current: boolean;
  monthlyPlan: string;
  yearlyPlan: string;
}) {
  if (current) {
    return <p className="text-xs text-muted">This is your current plan.</p>;
  }

  if (!canBuy) {
    return (
      <p className="text-xs text-muted">
        Payments are not configured on this deployment.
      </p>
    );
  }

  const label = tier === "pro-plus" ? "Pro+" : "Pro";

  return (
    <div className="space-y-2">
      <BillingButton endpoint="checkout" plan={monthlyPlan} label={`Start ${label}`} />
      <BillingButton
        endpoint="checkout"
        plan={yearlyPlan}
        variant="secondary"
        label="Pay yearly"
      />
    </div>
  );
}
