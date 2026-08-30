import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Section, SectionNav, currentSection, type StockSection } from "./section-nav";

/**
 * The jump links along the top of a stock page.
 *
 * Two things are worth pinning. The first is which section counts as the one
 * being read, which is a rule about measurements and lives in a pure function
 * precisely so it can be checked here — the preview browser this was built in
 * could neither dispatch scroll events nor run an IntersectionObserver, so
 * inside an effect it would have been untestable.
 *
 * The second is that the bar never offers a link to a section that is not on
 * the page. Half these panels hide themselves, and a chip that scrolls nowhere
 * is worse than a missing chip: it looks broken rather than absent.
 */

/** Section tops as getBoundingClientRect would report them, in page order. */
const tops = (...pairs: [string, number][]) => pairs.map(([id, top]) => ({ id, top }));

describe("which section is being read", () => {
  /*
    Sticky bars sit above the content, so a heading is "reached" once it passes
    under them, not when it reaches the top of the window.
  */
  it("picks the last section that has passed under the sticky bars", () => {
    const measured = tops(["health", -400], ["price", -120], ["dividend", 300]);
    expect(currentSection(measured)).toBe("price");
  });

  /*
    The bug this rule was shipped with, and the reason the line is set from
    where a jump parks a section rather than from the bottom of the bars.

    `scroll-mt-28` leaves a jumped-to heading sitting 112px down. With the line
    drawn at the bars' 93px, that heading was below it, failed to qualify, and
    the bar went on highlighting the section above — clicking "Key figures" lit
    "Five questions".
  */
  it("marks the section a reader has just jumped to", () => {
    const JUMPED_TO = 112;
    const measured = tops(["questions", -800], ["key-figures", JUMPED_TO], ["dividend", 900]);

    expect(currentSection(measured)).toBe("key-figures");
  });

  it("tolerates a jump landing on a subpixel boundary", () => {
    const measured = tops(["questions", -800], ["key-figures", 112.5]);
    expect(currentSection(measured)).toBe("key-figures");
  });

  it("keeps a section current for as long as you are inside it", () => {
    // A tall section whose top is far above: still the one being read.
    expect(currentSection(tops(["health", -2000], ["price", 900]))).toBe("health");
  });

  it("holds the first section while the page is still at the top", () => {
    expect(currentSection(tops(["health", 400], ["price", 1200]))).toBe("health");
  });

  // A heading one pixel below the line has not been reached; one pixel above
  // it has. The line sits just past where a jump parks a section, so it is
  // always comfortably clear of the bars themselves.
  it("moves on the moment a heading crosses the line", () => {
    expect(currentSection(tops(["health", -10], ["price", 117]))).toBe("health");
    expect(currentSection(tops(["health", -10], ["price", 116]))).toBe("price");
  });

  /*
    The line must never sit so low that a section is marked current while it
    is still hidden behind the bars, which end at 93px.
  */
  it("never marks a section that is still behind the sticky bars", () => {
    expect(currentSection(tops(["health", -10], ["price", 93]))).toBe("price");
    expect(currentSection(tops(["health", -10], ["price", 200]))).toBe("health");
  });

  /*
    The last section is usually too short to push its own top above the line,
    so without the bottom-of-page case it could never become current — you
    reach the end of the page and the bar still points somewhere else, with no
    scroll left to correct it.
  */
  it("marks the last section once the page bottoms out", () => {
    const measured = tops(["health", -3000], ["price", -900], ["sources", 700]);

    expect(currentSection(measured, false)).toBe("price");
    expect(currentSection(measured, true)).toBe("sources");
  });

  it("has no answer when there are no sections to measure", () => {
    expect(currentSection([])).toBeNull();
    expect(currentSection([], true)).toBeNull();
  });
});

describe("the bar itself", () => {
  const sections: StockSection[] = [
    { id: "health", label: "Health" },
    { id: "price", label: "Price" },
    { id: "sources", label: "Sources" },
  ];

  const render = (s: StockSection[]) => renderToStaticMarkup(<SectionNav sections={s} />);

  it("renders a link per section, pointing at its anchor", () => {
    const html = render(sections);

    expect(html).toContain('href="#health"');
    expect(html).toContain('href="#price"');
    expect(html).toContain("Sources");
  });

  /*
    Plain anchors, not buttons with scroll handlers. They work before the
    JavaScript loads, they can be opened in a new tab or copied, and each one
    gives the section a shareable URL. Script only adds the highlight.
  */
  it("uses real links so it works without JavaScript", () => {
    const html = render(sections);

    expect(html).not.toContain("<button");
    expect((html.match(/<a /g) ?? []).length).toBe(3);
  });

  it("is a labelled navigation landmark", () => {
    expect(render(sections)).toContain('aria-label="Sections of this page"');
  });

  // One link is not a navigation aid, it is a stray button.
  it("renders nothing when there is nowhere to go", () => {
    expect(render([])).toBe("");
    expect(render([{ id: "health", label: "Health" }])).toBe("");
  });
});

describe("anchoring a panel", () => {
  it("carries the id and clears the sticky bars when jumped to", () => {
    const html = renderToStaticMarkup(
      <Section id="dividend">
        <p>content</p>
      </Section>,
    );

    expect(html).toContain('id="dividend"');
    expect(html).toContain("scroll-mt-28");
  });

  /*
    Several panels decide for themselves that they have nothing to say and
    render nothing at all. An anchor wrapper around one of those would be an
    empty box still collecting a gap from the page's `space-y`, leaving a hole
    where a section used to be.
  */
  it("hides itself when the panel it wraps renders nothing", () => {
    const html = renderToStaticMarkup(<Section id="dividend">{null}</Section>);

    expect(html).toContain("empty:hidden");
    // Genuinely empty, with no stray markers — otherwise :empty never matches.
    expect(html).toMatch(/<div id="dividend" class="[^"]*"><\/div>/);
  });
});
