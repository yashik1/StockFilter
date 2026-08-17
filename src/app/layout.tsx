import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Inter, JetBrains_Mono, Newsreader } from "next/font/google";
import "./globals.css";
import { BoltMark } from "@/components/waveform";
import { SearchBox } from "@/components/search-box";
import { ThemeToggle } from "@/components/theme-toggle";

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
const serif = Newsreader({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
});

const sans = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const mono = JetBrains_Mono({
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
    { media: "(prefers-color-scheme: light)", color: "#f7f7fb" },
    { media: "(prefers-color-scheme: dark)", color: "#08070f" },
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
  { href: "/backtest", label: "Backtest" },
  { href: "/learn", label: "Learn" },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
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
        <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
          <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
            <Link
              href="/"
              className="flex shrink-0 items-center gap-2.5 text-[0.9375rem] font-bold tracking-tight"
            >
              <BoltMark />
              <span>StockFilter</span>
            </Link>

            <nav className="order-3 flex w-full gap-1 sm:order-none sm:w-auto">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-lg px-3 py-1.5 text-sm text-muted-strong transition-colors hover:bg-surface-2 hover:text-foreground"
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="ml-auto flex items-center gap-2">
              <SearchBox className="w-44 sm:w-72" />
              <ThemeToggle />
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>

        <footer className="mt-8 border-t border-border bg-surface">
          <div className="mx-auto w-full max-w-7xl px-4 py-6 text-xs text-muted">
            {/*
              Prominent and unconditional. This tool describes what filings say;
              it does not evaluate anyone's circumstances and must never be read
              as a recommendation to buy or sell.
            */}
            <p className="font-medium text-muted-strong">
              Educational information only — not investment advice.
            </p>
            <p className="mt-1 max-w-3xl">
              StockFilter summarises public regulatory filings and computes well-known
              academic financial scores. It does not know your circumstances, does not
              recommend buying or selling anything, and may contain errors or stale data.
              Always check the linked source filings and speak to a licensed adviser
              before making financial decisions.
            </p>
            <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
              <Link href="/terms" className="underline hover:text-foreground">
                Terms &amp; privacy
              </Link>
              <Link href="/learn" className="underline hover:text-foreground">
                How the scores work
              </Link>
              <a
                className="underline hover:text-foreground"
                href="https://github.com/yashik1/StockFilter"
                target="_blank"
                rel="noreferrer noopener"
              >
                Source code
              </a>
            </p>

            <p className="mt-3">
              Fundamentals and filings from{" "}
              <a
                className="underline hover:text-foreground"
                href="https://www.sec.gov/search-filings/edgar-application-programming-interfaces"
                target="_blank"
                rel="noreferrer noopener"
              >
                SEC EDGAR
              </a>
              . Prices from Twelve Data. News from Finnhub.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
