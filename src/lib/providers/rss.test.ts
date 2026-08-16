import { describe, expect, it } from "vitest";
import { rssItems } from "./yahoo";

/**
 * Reading Yahoo's RSS feed without an XML dependency.
 *
 * The feed is a fixed, narrow shape, so a parser library would cost more than
 * it saves — but that only holds if the hand-rolled reader survives what the
 * format actually allows: CDATA, escaped entities, and items missing fields.
 * These use the shapes the live feed returns.
 */
describe("rss parsing", () => {
  const feed = `<?xml version="1.0"?>
    <rss version="2.0"><channel>
      <title>Yahoo! Finance: AMAT News</title>
      <item>
        <title>Applied Materials trades below its high</title>
        <link>https://finance.yahoo.com/news/one</link>
        <pubDate>Wed, 13 Aug 2026 14:30:00 +0000</pubDate>
        <guid isPermaLink="false">one</guid>
        <description>Revenue at a record.</description>
      </item>
      <item>
        <title><![CDATA[Q2 deep dive: AI demand & packaging]]></title>
        <link>https://finance.yahoo.com/news/two</link>
        <pubDate>Tue, 12 Aug 2026 09:00:00 +0000</pubDate>
      </item>
    </channel></rss>`;

  it("reads each item", () => {
    const items = rssItems(feed);
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe("Applied Materials trades below its high");
    expect(items[0].link).toBe("https://finance.yahoo.com/news/one");
    expect(items[0].guid).toBe("one");
  });

  it("unwraps CDATA, which Yahoo uses for any headline with punctuation", () => {
    expect(rssItems(feed)[1].title).toBe("Q2 deep dive: AI demand & packaging");
  });

  it("decodes escaped entities without double-decoding", () => {
    const xml = `<rss><item>
      <title>Profit &amp;gt; expectations &amp; &quot;guidance raised&quot;</title>
      <link>https://example.com/a</link>
    </item></rss>`;

    // &amp;gt; is a literal "&gt;" in the source text, not a greater-than sign.
    // Decoding the ampersand first would wrongly turn it into one.
    expect(rssItems(xml)[0].title).toBe('Profit &gt; expectations & "guidance raised"');
  });

  it("skips an item with no title or no link rather than inventing one", () => {
    const xml = `<rss>
      <item><title>No link here</title></item>
      <item><link>https://example.com/b</link></item>
      <item><title>Complete</title><link>https://example.com/c</link></item>
    </rss>`;

    const items = rssItems(xml);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Complete");
  });

  it("returns nothing for an empty feed or for markup that is not a feed", () => {
    for (const xml of ["", "<rss><channel></channel></rss>", "<html><body>404</body></html>"]) {
      expect(rssItems(xml)).toEqual([]);
    }
  });
});
