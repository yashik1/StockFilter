import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NewsList } from "./stock/links";

/**
 * What the news panel says when it has nothing to show.
 *
 * It used to say the same thing in every case: "News needs a free Finnhub API
 * key". Someone who had already set one was sent to fix something that was not
 * broken, and a genuinely quiet month was reported as a configuration fault.
 */
const render = (status: Parameters<typeof NewsList>[0]["status"]) =>
  renderToStaticMarkup(<NewsList news={[]} symbol="AMAT" status={status} />);

describe("empty news panel", () => {
  it("asks for a key only when there is no key", () => {
    const html = render({ state: "not-configured", message: "Finnhub is not configured" });
    expect(html).toContain("FINNHUB_API_KEY");
  });

  it("does not blame configuration when the key works and the month was quiet", () => {
    const html = render({ state: "ok", message: null });

    expect(html).not.toContain("FINNHUB_API_KEY");
    expect(html).not.toMatch(/needs a (free )?(Finnhub )?(API )?key/i);
    expect(html).toContain("AMAT");
  });

  it("reports a provider failure in the provider's own words", () => {
    const html = render({
      state: "failed",
      message: "Finnhub rejected the API key.",
    });

    expect(html).toContain("Finnhub rejected the API key.");
    // A news outage says nothing about the filings the rest of the page is
    // built from, and the reader should not be left wondering.
    expect(html).toContain("SEC EDGAR");
  });

  it("defaults to the quiet wording when no status is supplied", () => {
    const html = renderToStaticMarkup(<NewsList news={[]} symbol="AMAT" />);
    expect(html).not.toContain("FINNHUB_API_KEY");
  });
});
