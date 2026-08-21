import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Barlow, Barlow_Condensed } from "next/font/google";
import "./globals.css";
import { SieveMark } from "@/components/waveform";
import { NavTabs } from "@/components/nav-tabs";
import { SearchBox } from "@/components/search-box";
import { ThemeToggle } from "@/components/theme-toggle";
import { SessionProvider } from "next-auth/react";
import { auth } from "@/lib/auth";
import { AccountMenu } from "@/components/auth/account-menu";

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
  title: {
    default: "StockFilter — Company financials in plain English",
    template: "%s · StockFilter",
  },
  description: DESCRIPTION,
  applicationName: "StockFilter",
  // Shared links previously previewed as a bare URL with no title or summary.
  openGraph: {
    type: "website",
    siteName: "StockFilter",
    title: "StockFilter — Company financials in plain English",
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary",
    title: "StockFilter — Company financials in plain English",
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
    { media: "(prefers-color-scheme: light)", color: "#f2f2f3" },
    { media: "(prefers-color-scheme: dark)", color: "#14191e" },
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
];

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Read once here rather than per page: the header needs it on every route,
  // and this is a JWT session so it costs no database round trip.
  const session = await auth().catch(() => null);

  return (
    <html
      lang="en"
      className={`${sans.variable} ${serif.variable} ${mono.variable} h-full antialiased`}
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
        <header className="sticky top-0 z-30 border-b border-border bg-[color-mix(in_srgb,var(--background)_92%,transparent)] backdrop-blur-[8px]">
          <div className="mx-auto grid w-full max-w-[1360px] grid-cols-[auto_minmax(0,1fr)] items-center gap-x-5 gap-y-3 px-7 py-2.5 lg:grid-cols-[auto_minmax(0,1fr)_minmax(180px,320px)]">
            <Link
              href="/"
              className="flex shrink-0 items-center gap-2.5 text-foreground"
            >
              {/* The mark sits in its own hairline tile — the smallest framed
                  object in the system, and the same shape as every card. */}
              <span className="flex size-7 shrink-0 items-center justify-center border border-border text-accent">
                <SieveMark />
              </span>
              <span className="font-display text-[1.1875rem] leading-none font-semibold tracking-[-0.01em]">
                StockFilter
              </span>
            </Link>

            <NavTabs items={NAV} />

            <div className="col-span-2 grid grid-cols-[minmax(0,1fr)_auto_34px] items-center gap-2 lg:col-span-1">
              <SearchBox className="w-full" />
              <AccountMenu email={session?.user?.email ?? null} name={session?.user?.name ?? null} />
              <ThemeToggle />
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1360px] flex-1 px-7 py-8">{children}</main>

        {/*
          Three columns that collapse on their own.

          The disclaimer keeps column one and stays verbatim and unconditional
          — it is the one thing on the page that must never be conditional on
          state, a breakpoint, or a reader having scrolled. The links move into
          named groups beside it rather than running as a sentence, which is
          what let them read as an afterthought before.
        */}
        <footer className="mt-10 border-t border-border bg-[color-mix(in_srgb,var(--foreground)_4%,transparent)]">
          <div className="mx-auto grid w-full max-w-[1360px] grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-8 px-7 pt-[26px] pb-[34px]">
            <div>
              <p className="font-display text-sm font-semibold text-foreground">
                Educational information only — not investment advice.
              </p>
              <p className="mt-1.5 max-w-[62ch] text-[0.78125rem] leading-relaxed text-muted">
                StockFilter summarises public regulatory filings and computes well-known
                academic financial scores. It does not know your circumstances, does not
                recommend buying or selling anything, and may contain errors or stale data.
                Always check the linked source filings and speak to a licensed adviser
                before making financial decisions.
              </p>
            </div>

            <div>
              <p className="eyebrow mb-2">Product</p>
              <p className="grid gap-1 text-[0.8125rem]">
                <Link href="/screen" className="text-muted hover:text-accent">Screener</Link>
                <Link href="/markets" className="text-muted hover:text-accent">Markets</Link>
                <Link href="/backtest" className="text-muted hover:text-accent">Backtest</Link>
                <Link href="/journal" className="text-muted hover:text-accent">Journal</Link>
              </p>
            </div>

            <div>
              <p className="eyebrow mb-2">Sources</p>
              <p className="grid gap-1 text-[0.8125rem]">
                <a
                  className="text-muted hover:text-accent"
                  href="https://www.sec.gov/search-filings/edgar-application-programming-interfaces"
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  SEC EDGAR
                </a>
                <Link href="/learn" className="text-muted hover:text-accent">How the scores work</Link>
                <Link href="/terms" className="text-muted hover:text-accent">Terms &amp; privacy</Link>
                <a
                  className="text-muted hover:text-accent"
                  href="https://github.com/yashik1/StockFilter"
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Source code
                </a>
              </p>
            </div>
          </div>
        </footer>
        </SessionProvider>
      </body>
    </html>
  );
}
