import { describe, expect, it } from "vitest";
import { describeNews } from "./stock-data";
import { ProviderNotConfiguredError } from "./providers/types";

/**
 * Sorting a news failure into the right kind.
 *
 * The first version read the error's text, looking for "FINNHUB_API_KEY" to
 * spot a missing key. But the message for a *refused* key names that same
 * variable — it tells you which one to go and check — so a rejected key was
 * classified as an absent one, and the panel told an operator who had already
 * set a key to go and set it. The type carries this; the wording does not.
 */
describe("classifying a news failure", () => {
  it("treats a genuinely absent key as a setup gap", () => {
    const status = describeNews(
      new ProviderNotConfiguredError("Finnhub", ["FINNHUB_API_KEY"]),
    );
    expect(status.state).toBe("not-configured");
  });

  it("treats a refused key as a failure, even though it names the variable", () => {
    const status = describeNews(
      new Error(
        "Finnhub rejected the API key. Check FINNHUB_API_KEY is the key itself, " +
          "not the webhook secret.",
      ),
    );

    expect(status.state).toBe("failed");
    expect(status.message).toContain("rejected");
  });

  it.each([
    ["an exhausted allowance", "Finnhub's free allowance is used up for the moment."],
    ["an upstream fault", "Finnhub returned HTTP 503."],
  ])("treats %s as a failure", (_label, message) => {
    expect(describeNews(new Error(message)).state).toBe("failed");
  });

  it("reports success as success", () => {
    const status = describeNews(null);
    expect(status).toEqual({ state: "ok", message: null });
  });
});
