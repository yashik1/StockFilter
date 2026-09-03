import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Barlow, Barlow_Condensed } from "next/font/google";
import "./globals.css";
import { SieveMark } from "@/components/waveform";
import { MobileNav, NavTabs } from "@/components/nav-tabs";
import { SearchBox } from "@/components/search-box";
import { ThemeToggle } from "@/components/theme-toggle";
import { SessionProvider } from "next-auth/react";
import { auth } from "@/lib/auth";
import { AccountMenu } from "@/components/auth/account-menu";
import { UpsellRail } from "@/components/billing/upsell-rail";
import { accountIsEnough } from "@/lib/billing/access-mode";
import { getEntitlement } from "@/lib/billing/entitlement";
import { siteUrl } from "@/lib/site-url";

/**
 * Three faces, each with one job.
 *
 * A warm serif carries headlines, which is what gives a financial publication
 * its authority — the product is read, not operated, so the type is most of the
 * interface. A crisp sans handles running text. Figures, tickers and
 * percentages sit in a mono with tabular numerals, so columns align and a
 * price cannot jitter as it updates.
 *
 * Self-hosted by next/font: no third-party request on page load, and no chance
 * of a silent fallback if a CDN is unreachable.
 */
/*
  Two faces where there were three.

  The variable names are deliberately unchanged. `--font-serif` no longer
  carries a serif — it carries the condensed face — because the name marks a
  role (headlines) rather than a classification, and every `.font-display` in
  the app keeps working untouched. `--font-mono` is the same story: figures
  need tabular digits, not a monospaced face, and Barlow provides them, so
  `.tnum` keeps its contract while the numerals stop looking like code.
*/
const serif = Barlow_Condensed({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["400", "600"],
  display: "swap",
});

const sans = Barlow({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

const mono = Barlow({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

const DESCRIPTION =
  "Understand any company's financial health without reading a balance sheet. " +
  "Plain-English answers, sourced directly from regulatory filings.";

export const metadata: Metadata = {
  /*
    Required for share cards to work at all.

    Open Graph images must be absolute URLs; without a metadataBase Next
    emits them relative, and every social crawler drops a relative og:image
    silently. Taken from configuration rather than the request Host — see
    src/lib/site-url.ts.
  */
  metadataBase: new URL(siteUrl()),
  title: {
    default: "MarketMiner — Company financials in plain English",
    template: "%s · MarketMiner",
  },
  description: DESCRIPTION,
  applicationName: "MarketMiner",
  // Shared links previously previewed as a bare URL with no title or summary.
  openGraph: {
    type: "website",
    siteName: "MarketMiner",
    title: "MarketMiner — Company financials in plain English",
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary",
    title: "MarketMiner — Company financials in plain English",
    description: DESCRIPTION,
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Matches the canvas token in each theme, so the mobile browser chrome does
  // not sit on a colour the page never uses.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f6fb" },
    { media: "(prefers-color-scheme: dark)", color: "#090a10" },
  ],
};

/**
 * Applies the stored theme before first paint. Without this the page renders in
 * the system theme and then snaps to the saved one.
 */
const THEME_SCRIPT = `
try {
  var t = localStorage.getItem('theme');
  if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t;
} catch (e) {}
`;

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/screen", label: "Screener" },
  { href: "/compare", label: "Compare" },
  { href: "/markets", label: "Markets" },
  { href: "/backtest", label: "Backtest" },
  { href: "/journal", label: "Journal" },
  { href: "/learn", label: "Learn" },
  { href: "/pricing", label: "Pricing" },
];

/**
 * A footer link.
 *
 * `block` plus vertical padding rather than a bare inline link, so the target
 * clears the 24px minimum. As inline text at 13px these were 20px tall and
 * 4px apart — fine with a mouse and genuinely fiddly with a thumb, which is
 * where most of this footer gets read.
 */
const FOOTER_LINK = "block py-1 text-muted transition-colors hover:text-accent";

/*
  The shell's width, and why it is two figures rather than one.

  Header, main and footer all share this, so the logo, the first column of a
  table and the footer's first heading sit on one vertical line. Three separate
  max-widths cannot align at every viewport size, and the misalignment shows up
  precisely on the wide screens the rail exists for.

  1416 = 1360 of content + the 28 of padding either side: exactly what the
  layout was before the rail, so every screen below the breakpoint is unchanged
  to the pixel. 1672 = that content, 24 of gap and the 288 the rail occupies.

  Two caps rather than one because a single wide cap leaves the content hugging
  the left with a growing strip of nothing to its right at every width between
  the two — which is the complaint this change set out to fix, moved rather than
  solved. Capping at 1416 until the rail actually appears means the leftover is
  either zero or occupied, never merely empty.

  The content column keeps its own 1360 cap throughout. Letting it grow into the
  full shell would be the easy way to fill a wide screen and the wrong one:
  running prose past about 100 characters a line is measurably harder to read,
  and this app is mostly prose about companies.
*/
const SHELL = "mx-auto w-full max-w-[1416px] px-7 min-[1700px]:max-w-[1672px]";

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Read once here rather than per page: the header needs it on every route,
  // and this is a JWT session so it costs no database round trip.
  const session = await auth().catch(() => null);

  /*
    Whether the rail has anything to say to this visitor.

    While `accountIsEnough` is set, a signed-in reader already has everything
    the paid tiers will hold, so there is nothing to offer them and the rail
    stays off — the question is answered from the session alone, with no
    database round trip added to every page in the app. When that flag flips,
    the real subscription state is what decides, and only then does this cost
    a query.
  */
  const signedIn = Boolean(session?.user?.id);
  const showUpsell = accountIsEnough
    ? !signedIn
    : !(await getEntitlement().catch(() => null))?.subscribed;

  return (
    <html
      lang="en"
      // Smooth scrolling so a jump link on the stock page reads as movement
      // through one document rather than a cut to somewhere unrelated. Guarded
      // by motion-safe, because for a reader who gets motion sick a long
      // animated scroll is exactly the thing they turned that setting off for.
      className={`${sans.variable} ${serif.variable} ${mono.variable} h-full antialiased motion-safe:scroll-smooth`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col font-sans">
        <SessionProvider session={session}>
        {/*
          Three explicit columns rather than a wrapping flex row.

          The old header let a fixed-width right-hand group sit in a flex-wrap
          row, so below roughly 1050px it overflowed and the whole document
          scrolled sideways. `minmax(0, 1fr)` on the middle column is the part
          that matters: a bare `1fr` is `minmax(auto, 1fr)`, which refuses to
          shrink below its content and pushes the overflow outward instead.

          The right-hand band is its own grid with every control the same
          height, so search, account and theme read as one ruled row rather
          than three objects of different sizes that happen to be adjacent.
        */}
        {/*
          The id is load-bearing, not decorative: the stock page's section
          strip measures this element's real rendered height at runtime so it
          can sit directly below it. That height is not a constant — the third
          column force-wraps onto its own row below `lg`, so this header is
          taller on a phone than on a desktop, and a hardcoded offset for the
          strip was wrong on exactly the breakpoint where it wraps.
        */}
        <header
          id="site-header"
          className="sticky top-0 z-30 border-b border-border bg-[color-mix(in_srgb,var(--background)_88%,transparent)] shadow-sm backdrop-blur-[10px]"
        >
          <div className={`${SHELL} grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-5 gap-y-3 py-2.5 lg:grid-cols-[auto_minmax(0,1fr)_minmax(180px,320px)] xl:grid-cols-[auto_minmax(0,1fr)_minmax(180px,400px)]`}>
            <Link
              href="/"
              className="flex shrink-0 items-center gap-2.5 text-foreground"
            >
              {/* The mark sits in a filled, rounded tile carrying the gold
                  spot colour — the one place in the chrome that isn't the
                  primary indigo, so the mark still reads as a mark. */}
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent-bright text-accent-fg shadow-sm">
                <SieveMark className="size-[18px] text-accent-2-bright" />
              </span>
              <span className="font-display text-[1.1875rem] leading-none font-semibold tracking-[-0.01em]">
                Market<span className="text-accent">Miner</span>
              </span>
            </Link>

            {/* min-w-0 for the same reason the header's own comment gives for
                the columns around it: a grid item's default min-width is its
                content, and without this the mobile panel's own layout could
                push the track wider than the column meant to hold it. */}
            <div className="min-w-0 justify-self-start">
              <NavTabs items={NAV} />
              <MobileNav items={NAV} />
            </div>

            <div className="col-span-2 grid grid-cols-[minmax(0,1fr)_auto_34px] items-center gap-2 lg:col-span-1">
              <SearchBox className="w-full" />
              <AccountMenu email={session?.user?.email ?? null} name={session?.user?.name ?? null} />
              <ThemeToggle />
            </div>
          </div>
        </header>

        {/*
          The content column and the rail, as one row.

          `flex-1` on the wrapper keeps the footer pinned to the bottom on a
          short page, which is what `flex-1` on <main> used to do. The rail is
          `shrink-0` and hidden until there is genuinely room for it, so on
          every narrower screen this collapses to exactly what it was before:
          one centred column, nothing reflowed.
        */}
        <div className={`${SHELL} flex flex-1 gap-6`}>
          <main className="w-full max-w-[1360px] flex-1 py-8">{children}</main>

          {/* The same 1700 the shell widens at, and it has to stay in step: the
              rail appearing before the shell has room for it would take its
              288px straight out of the content column. */}
          <div className="hidden w-72 shrink-0 py-8 min-[1700px]:block">
            <UpsellRail show={showUpsell} />
          </div>
        </div>

        {/*
          Three columns that collapse on their own.

          The disclaimer keeps column one and stays verbatim and unconditional
          — it is the one thing on the page that must never be conditional on
          state, a breakpoint, or a reader having scrolled. The links move into
          named groups beside it rather than running as a sentence, which is
          what let them read as an afterthought before.
        */}
        <footer className="mt-10 border-t border-border bg-[color-mix(in_srgb,var(--foreground)_4%,transparent)]">
          <div className={`${SHELL} grid grid-cols-[repeat(auto-fit,minmax(min(100%,210px),1fr))] gap-8 pt-[26px] pb-[34px]`}>
            <div>
              <p className="font-display text-sm font-semibold text-foreground">
                Educational information only — not investment advice.
              </p>
              <p className="mt-1.5 max-w-[62ch] text-[0.78125rem] leading-relaxed text-muted">
                MarketMiner summarises public regulatory filings and computes well-known
                academic financial scores. It does not know your circumstances, does not
                recommend buying or selling anything, and may contain errors or stale data.
                Always check the linked source filings and speak to a licensed adviser
                before making financial decisions.
              </p>
            </div>

            <div>
              <p className="eyebrow mb-2">Product</p>
              <ul className="grid list-none gap-0.5 text-[0.8125rem]">
                <li><Link href="/screen" className={FOOTER_LINK}>Screener</Link></li>
                <li><Link href="/markets" className={FOOTER_LINK}>Markets</Link></li>
                <li><Link href="/backtest" className={FOOTER_LINK}>Backtest</Link></li>
                <li><Link href="/journal" className={FOOTER_LINK}>Journal</Link></li>
              </ul>
            </div>

            <div>
              <p className="eyebrow mb-2">Sources</p>
              <ul className="grid list-none gap-0.5 text-[0.8125rem]">
                <li>
                  <a
                    className={FOOTER_LINK}
                    href="https://www.sec.gov/search-filings/edgar-application-programming-interfaces"
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    SEC EDGAR
                  </a>
                </li>
                <li><Link href="/learn" className={FOOTER_LINK}>How the scores work</Link></li>
                <li><Link href="/terms" className={FOOTER_LINK}>Terms &amp; privacy</Link></li>
                <li>
                  <a
                    className={FOOTER_LINK}
                    href="https://github.com/yashik1/StockFilter"
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    Source code
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </footer>
        </SessionProvider>
      </body>
    </html>
  );
}
