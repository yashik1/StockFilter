# StockFilter

Understand any company's finances without reading a balance sheet.

StockFilter reads official regulatory filings and answers five questions in plain
English — is it profitable, is it growing, is it drowning in debt, is it cheap, are
there accounting red flags — and links every figure back to the filing it came from.

> **Educational information only — not investment advice.** This tool describes what
> public filings say. It does not know your circumstances and never recommends buying
> or selling anything.

---

## What it does

- **Plain-English verdicts.** Instead of a debt-to-equity ratio: *"For every $1 it owes,
  it owns $1.80 in assets."*
- **Established scoring models.** Piotroski F-Score, Altman Z-Score and Beneish M-Score,
  applied only where they are valid (see [Honest scoring](#honest-scoring)).
- **Price charts** filterable by minute, 5/15 minutes, hour, day and week.
- **A screener** that filters hundreds of companies on financial health, not just price.
- **Every source linked** — 10-K, 10-Q, 8-K and 40-F filings straight from SEC EDGAR.

Coverage is US companies plus Canadian companies cross-listed on US exchanges.

---

## Quick start

```bash
npm install
npm run dev
```

Open <http://localhost:3000> and search for a ticker. **No API keys are required** —
SEC EDGAR needs none, so fundamentals, scores and filings work immediately.

To enable the optional extras, copy `.env.example` to `.env.local` and fill in what you
want:

| Feature | Needs | Cost |
| --- | --- | --- |
| Fundamentals, scores, filings | nothing | free |
| Price charts and quotes | `TWELVEDATA_API_KEY` | free |
| Price fallback when rate limited | `TIINGO_API_KEY` | free |
| News, logos, peers | `FINNHUB_API_KEY` | free |
| Screener and rankings | `DATABASE_URL` | free tier |
| Worldwide coverage | `EODHD_API_KEY` | ~$100/mo |

### Enabling the screener

The screener compares hundreds of companies at once, so scores are precomputed and
stored rather than fetched live.

```bash
# 1. Provision Postgres (railway.com -> New -> Database -> PostgreSQL)
#    and put the connection string in .env.local as DATABASE_URL

# 2. Create the tables
npm run db:push

# 3. Load companies and compute scores (try a small batch first)
npm run ingest -- --limit 25
npm run ingest
```

---

## Honest scoring

The models this tool uses were fitted on particular kinds of companies, and applying
them everywhere produces confident nonsense. StockFilter would rather show nothing than
show a wrong number:

- **Altman Z and Beneish M are suppressed for banks and insurers.** Their balance sheets
  have no working capital and are leveraged by design, which those models misread as
  distress. The UI says so explicitly instead of leaving a blank.
- **Piotroski signals that cannot be evaluated are skipped, not failed.** A bank that
  cannot report a current ratio is scored out of 6, not penalised out of 9.
- **Altman variants are chosen to match the company.** The original five-factor model for
  manufacturers, the four-factor Z″ for everyone else, and the book-value Z′ when no
  market capitalisation is available.
- **Valuation is excluded from the health score.** An expensive share price says nothing
  about whether the business underneath is sound, so it is scored separately.
- **Missing data stays missing.** Nothing defaults to zero, because a zero silently
  corrupts every ratio built on top of it.

---

## Architecture

Every data source sits behind one `MarketDataProvider` interface
(`src/lib/providers/types.ts`), so the data layer can be swapped without touching pages.

The free stack composes three sources, each doing what it does best at no cost:

| Source | Supplies | Why |
| --- | --- | --- |
| **SEC EDGAR** | fundamentals, filings, SIC codes | Authoritative, no API key, no daily cap |
| **Twelve Data** | OHLCV bars, quotes | Free tier serves the full intraday range; key is an email signup, no brokerage account |
| **Finnhub** | news, logos, peers, quote fallback | Free tier covers these; its `/quote` allows 60/min (candles are paywalled) |
| **Tiingo** | daily/weekly price fallback | Free tier counts usage per hour, not per minute, so it survives a Twelve Data burst |

Free-plan caveats worth knowing for price data: Twelve Data allows 800 credits/day
and 8/minute (a chart view costs one credit), 1-minute history begins 2020-02-10,
and prices carry a short delay — so quotes are labelled delayed rather than live
unless you set `TWELVEDATA_REALTIME=true` on a paid plan.

Setting `EODHD_API_KEY` alone switches the entire app to worldwide coverage — 60+
exchanges, 150,000+ tickers — with no other change. Its payload maps onto the same
canonical model, so the scoring engine cannot tell the two apart.

### XBRL normalization

Turning raw filings into comparable numbers needs several guards, each verified against
live SEC data and covered by tests:

- **Two taxonomies.** US filers report `us-gaap`; foreign private issuers, including
  Canadian 40-F filers such as Royal Bank, report `ifrs-full`. Both map to one schema.
- **Concept migration.** Filers change tags over time — Shopify tagged revenue as
  `RevenueFromContractWithCustomerExcludingAssessedTax` through FY2023 and `Revenues`
  from FY2024 — so concepts resolve per year, not once per company.
- **Derived liabilities.** Many filers never tag total liabilities, so it is computed as
  `assets − equity`. (`LiabilitiesAndStockholdersEquity` is deliberately *not* used: it
  is the balance sheet total, and reading it as debt roughly doubles the figure.)
- **Filing errors.** Royal Bank's FY2020 40-F reports zero shares outstanding, which
  would make every per-share figure `Infinity`.

### Scheduling

The nightly refresh runs on **GitHub Actions** (`.github/workflows/ingest.yml`). Vercel
Hobby crons fire only once a day *and* their functions time out well before several
hundred companies finish; Actions has neither limit. The Vercel cron
(`/api/cron/refresh`) remains as a fallback that refreshes the stalest slice each day.

---

## Deploying

**Vercel** (app): import the repo, then add `DATABASE_URL`, `CRON_SECRET`,
`SEC_USER_AGENT` and any optional keys in project settings.

**Railway** (database): New → Database → PostgreSQL, copy the connection string into
Vercel and into your GitHub repo secrets so the nightly ingest can reach it.

For the scheduled refresh, add the same secrets under **Settings → Secrets → Actions**.

---

## Development

```bash
npm test          # 49 tests, incl. fixtures for us-gaap, ifrs-full and derived fields
npm run typecheck
npm run build
npm run build:fixtures   # refresh test fixtures from live SEC data
```

Test fixtures cover three real companies chosen to exercise every branch: **AAPL**
(us-gaap, classified balance sheet), **RY** (ifrs-full, unclassified bank balance sheet)
and **SHOP** (us-gaap, untagged liabilities, mid-history concept switch).

---

## Data sources

Fundamentals and filings from [SEC EDGAR](https://www.sec.gov/search-filings/edgar-application-programming-interfaces).
Prices from [Twelve Data](https://twelvedata.com). News from [Finnhub](https://finnhub.io).
Optional worldwide data from [EODHD](https://eodhd.com).

SEC EDGAR requires a `User-Agent` header identifying you with a contact address — set
`SEC_USER_AGENT` before deploying.
