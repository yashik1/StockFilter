import { fieldValue } from "../fundamentals/normalize";
import type { NormalizedFundamentals } from "../fundamentals/types";
import { money, percent } from "../format";
import { div } from "./math";

/**
 * A plain-English answer to "what does this company actually do?".
 *
 * Someone new to this needs the business before the ratios — a debt figure
 * means nothing until you know whether you are looking at a bank or a
 * shoemaker. The page previously opened with "Electronic Computers", which is
 * the SEC's own wording and no help at all.
 *
 * The description is translated from the SIC code the company files under, not
 * invented. That matters: nothing here claims Apple sells iPhones, because no
 * data source in this app says so, and a confident guess about a company's
 * products is exactly the kind of thing a beginner would take at face value.
 * What it says instead is what the regulator classifies the company as, in
 * words a person actually uses.
 */

/** SIC ranges translated into what the business does, in plain words. */
const BUSINESS: { from: number; to: number; does: string }[] = [
  { from: 100, to: 999, does: "grows crops or raises livestock" },
  { from: 1000, to: 1099, does: "mines metal ores" },
  { from: 1200, to: 1299, does: "mines coal" },
  { from: 1310, to: 1339, does: "drills for oil and natural gas" },
  { from: 1381, to: 1389, does: "provides services to oil and gas drillers" },
  { from: 1400, to: 1499, does: "quarries stone, sand and minerals" },
  { from: 1500, to: 1799, does: "builds and constructs buildings" },
  { from: 2000, to: 2099, does: "makes food and drink" },
  { from: 2100, to: 2199, does: "makes tobacco products" },
  { from: 2200, to: 2299, does: "makes fabric and textiles" },
  { from: 2300, to: 2399, does: "makes clothing" },
  { from: 2400, to: 2499, does: "makes wood and timber products" },
  { from: 2500, to: 2599, does: "makes furniture" },
  { from: 2600, to: 2699, does: "makes paper and packaging" },
  { from: 2700, to: 2799, does: "publishes and prints" },
  { from: 2800, to: 2829, does: "makes industrial chemicals" },
  { from: 2830, to: 2836, does: "develops and makes medicines" },
  { from: 2840, to: 2844, does: "makes soap, cleaning and personal care products" },
  { from: 2850, to: 2899, does: "makes paints, coatings and speciality chemicals" },
  { from: 2900, to: 2999, does: "refines oil into fuel and related products" },
  { from: 3000, to: 3099, does: "makes rubber and plastic products" },
  { from: 3200, to: 3299, does: "makes glass, cement and building materials" },
  { from: 3300, to: 3399, does: "produces steel and other metals" },
  { from: 3400, to: 3499, does: "makes metal parts and products" },
  { from: 3500, to: 3569, does: "makes industrial machinery and equipment" },
  { from: 3570, to: 3579, does: "makes computers and computing hardware" },
  { from: 3580, to: 3599, does: "makes commercial and industrial machines" },
  { from: 3600, to: 3659, does: "makes electrical equipment" },
  { from: 3660, to: 3669, does: "makes communications equipment" },
  { from: 3670, to: 3679, does: "designs and makes computer chips" },
  { from: 3700, to: 3710, does: "makes vehicles and transport equipment" },
  { from: 3711, to: 3716, does: "makes cars and vehicle parts" },
  { from: 3720, to: 3729, does: "makes aircraft and aerospace equipment" },
  { from: 3730, to: 3739, does: "builds ships and boats" },
  { from: 3800, to: 3839, does: "makes measuring and control instruments" },
  { from: 3840, to: 3851, does: "makes medical devices and equipment" },
  { from: 3900, to: 3999, does: "makes consumer goods such as jewellery, toys and sporting goods" },
  { from: 4000, to: 4099, does: "runs railways and local transport" },
  { from: 4200, to: 4299, does: "moves freight by road and runs warehouses" },
  { from: 4400, to: 4499, does: "ships freight by sea" },
  { from: 4500, to: 4599, does: "runs airlines" },
  { from: 4600, to: 4699, does: "operates pipelines" },
  { from: 4700, to: 4799, does: "arranges transport and travel" },
  { from: 4800, to: 4829, does: "runs telephone and communications networks" },
  { from: 4830, to: 4849, does: "broadcasts television and radio" },
  { from: 4900, to: 4949, does: "supplies electricity, gas or water" },
  { from: 4950, to: 4999, does: "handles waste and environmental services" },
  { from: 5000, to: 5199, does: "distributes goods wholesale to other businesses" },
  { from: 5200, to: 5299, does: "sells building and garden supplies" },
  { from: 5300, to: 5399, does: "runs general merchandise and department stores" },
  { from: 5400, to: 5499, does: "runs grocery stores" },
  { from: 5500, to: 5599, does: "sells cars and fuel" },
  { from: 5600, to: 5699, does: "sells clothing and accessories" },
  { from: 5700, to: 5799, does: "sells furniture and home goods" },
  { from: 5800, to: 5819, does: "runs restaurants and bars" },
  { from: 5900, to: 5999, does: "runs retail stores" },
  { from: 6000, to: 6099, does: "takes deposits and lends money" },
  { from: 6100, to: 6199, does: "lends money and provides credit" },
  { from: 6200, to: 6299, does: "trades securities and runs financial markets" },
  { from: 6300, to: 6399, does: "sells insurance" },
  { from: 6500, to: 6599, does: "owns and manages property" },
  { from: 6700, to: 6797, does: "invests in and manages other businesses" },
  { from: 6798, to: 6798, does: "owns income-producing property as a REIT" },
  { from: 7000, to: 7099, does: "runs hotels and places to stay" },
  { from: 7200, to: 7299, does: "provides personal services" },
  { from: 7300, to: 7369, does: "provides business and staffing services" },
  { from: 7370, to: 7379, does: "makes and sells software and computing services" },
  { from: 7380, to: 7399, does: "provides business support services" },
  { from: 7500, to: 7699, does: "repairs and services vehicles and equipment" },
  { from: 7800, to: 7849, does: "makes and distributes film and video" },
  { from: 7900, to: 7999, does: "provides entertainment and recreation" },
  { from: 8000, to: 8099, does: "provides healthcare and runs medical facilities" },
  { from: 8200, to: 8299, does: "provides education" },
  { from: 8300, to: 8399, does: "provides social services" },
  { from: 8700, to: 8799, does: "provides engineering, research and consulting services" },
];

/** Translates a SIC code into what the company does. Null when unmapped. */
export function businessFromSic(sic: string | number | null | undefined): string | null {
  if (sic == null) return null;
  const code = typeof sic === "number" ? sic : Number(String(sic).trim());
  if (!Number.isFinite(code) || code <= 0) return null;

  return BUSINESS.find((b) => code >= b.from && code <= b.to)?.does ?? null;
}

export interface BusinessSummary {
  /** One sentence on what the company does and how big it is. */
  sentence: string;
  /** Supporting figures, already formatted. */
  scale: { label: string; value: string; hint: string }[];
}

/**
 * Builds the opening paragraph of a company page.
 *
 * Everything here is either the company's own regulatory classification or a
 * figure from its filings. Nothing is inferred about products, strategy or
 * prospects.
 */
export function buildBusinessSummary(
  name: string,
  sicCode: string | null | undefined,
  fundamentals: NormalizedFundamentals | null,
  currency = "USD",
): BusinessSummary | null {
  const does = businessFromSic(sicCode);
  const latest = fundamentals?.annual[0];

  const revenue = fieldValue(latest, "revenue");
  const netIncome = fieldValue(latest, "netIncome");
  const margin = div(netIncome, revenue);

  if (!does && revenue == null) return null;

  const short = shortName(name);
  const parts: string[] = [];

  if (does) {
    parts.push(`${short} ${does}.`);
  }

  if (revenue != null) {
    const size = describeScale(revenue);
    parts.push(
      `It took in ${money(revenue, currency)} last year${size ? `, which makes it ${size}` : ""}.`,
    );
  }

  if (margin != null && revenue != null) {
    const cents = Math.round(Math.abs(margin) * 100);
    parts.push(
      margin >= 0
        ? `Of every dollar it sells, about ${cents} cents is left as profit.`
        : `It spends more than it earns — losing about ${cents} cents on every dollar of sales.`,
    );
  }

  return {
    sentence: parts.join(" "),
    scale: [
      {
        label: "Yearly sales",
        value: money(revenue, currency),
        hint: "Everything customers paid it over the year, before any costs.",
      },
      {
        label: "Yearly profit",
        value: money(netIncome, currency),
        hint: "What was left after every cost, wage, interest payment and tax bill.",
      },
      {
        label: "Kept per dollar",
        value: margin == null ? "—" : percent(margin),
        hint: "Of every dollar of sales, the share that ends up as profit.",
      },
    ],
  };
}

/** Puts revenue on a human scale, since billions are hard to picture. */
function describeScale(revenue: number): string | null {
  if (revenue >= 2e11) return "one of the largest companies in the world";
  if (revenue >= 5e10) return "a very large company";
  if (revenue >= 1e10) return "a large company";
  if (revenue >= 1e9) return "a mid-sized company";
  if (revenue >= 1e8) return "a smaller company";
  return "a small company";
}

/** Trims legal suffixes so a generated sentence reads naturally. */
function shortName(name: string): string {
  return (
    name
      .replace(
        /\b(inc|corp|corporation|company|co|ltd|limited|plc|holdings|group|sa|nv|ag)\b\.?/gi,
        "",
      )
      .replace(/[,.]\s*$/g, "")
      .trim() || name
  );
}
