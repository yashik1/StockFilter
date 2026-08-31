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
    under them, not when it reaches the top of the window. `line` is where the
    caller says that boundary currently is — this function has no opinion of
    its own about it, on purpose. See the next block for why.
  */
  it("picks the last section that has passed under the sticky bars", () => {
    const measured = tops(["health", -400], ["price", -120], ["dividend", 300]);
    expect(currentSection(measured, 116)).toBe("price");
  });

  it("keeps a section current for as long as you are inside it", () => {
    // A tall section whose top is far above: still the one being read.
    expect(currentSection(tops(["health", -2000], ["price", 900]), 116)).toBe("health");
  });

  it("holds the first section while the page is still at the top", () => {
    expect(currentSection(tops(["health", 400], ["price", 1200]), 116)).toBe("health");
  });

  // A heading one pixel below the line has not been reached; one pixel above
  // it has.
  it("moves on the moment a heading crosses the line", () => {
    expect(currentSection(tops(["health", -10], ["price", 117]), 116)).toBe("health");
    expect(currentSection(tops(["health", -10], ["price", 116]), 116)).toBe("price");
  });

  /*
    The last section is usually too short to push its own top above the line,
    so without the bottom-of-page case it could never become current — you
    reach the end of the page and the bar still points somewhere else, with no
    scroll left to correct it.
  */
  it("marks the last section once the page bottoms out", () => {
    const measured = tops(["health", -3000], ["price", -900], ["sources", 700]);

    expect(currentSection(measured, 116, false)).toBe("price");
    expect(currentSection(measured, 116, true)).toBe("sources");
  });

  it("has no answer when there are no sections to measure", () => {
    expect(currentSection([], 116)).toBeNull();
    expect(currentSection([], 116, true)).toBeNull();
  });

  /*
    Why the line is a parameter and not a constant baked into this function.

    A version of this file once hardcoded the line, sized for the site
    header's ordinary single-row height. On a phone that header wraps its
    third column onto a second row and ends up noticeably taller — so a
    section that has genuinely cleared the real, on-screen chrome could still
    sit above a line that was set too low, and the bar would go on marking the
    section before it instead. That is a lag, not a crash: nothing throws,
    the highlight is just late, for exactly as long as the gap between the
    guessed line and the real one.

    Below, the same measured position answers two different ways depending on
    where the caller says the chrome ends — which is the whole fix. The
    component itself now measures the real header on every render rather than
    assuming a height for it; this is what makes that measurement matter.
  */
  it("lags behind when the caller under-reports where the chrome ends", () => {
    const measured = tops(["health", -400], ["price", 100]);

    // Too small — sized for a header shorter than the real one. The section
    // has genuinely cleared the screen but the bar has not caught up yet.
    expect(currentSection(measured, 96)).toBe("health");
    // The real, measured line, on a phone with the taller header: caught up.
    expect(currentSection(measured, 120)).toBe("price");
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

  /*
    The pre-measurement fallback. Before the header-measuring effect has run
    at all — the very first frame, and the only state a reader with
    JavaScript disabled ever sees — the bar has to sit somewhere sane rather
    than at the top of the window.
  */
  it("carries a sane sticky offset before anything has been measured", () => {
    expect(render(sections)).toMatch(/class="[^"]*\btop-14\b[^"]*"/);
  });

  // One link is not a navigation aid, it is a stray button.
  it("renders nothing when there is nowhere to go", () => {
    expect(render([])).toBe("");
    expect(render([{ id: "health", label: "Health" }])).toBe("");
  });
});

describe("anchoring a panel", () => {
  it("carries the id", () => {
    const html = renderToStaticMarkup(
      <Section id="dividend">
        <p>content</p>
      </Section>,
    );

    expect(html).toContain('id="dividend"');
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

  /*
    No `scroll-mt` class on the wrapper. Space for the sticky bars above a
    jumped-to heading is reserved once, globally, by `scroll-padding-top` —
    kept in sync with the site's actual chrome height by SectionNav's own
    effect — rather than repeated per section. A per-section copy of that
    number is what drifted out of sync with the rest of the page once already.
  */
  it("does not repeat the scroll offset on every section", () => {
    const html = renderToStaticMarkup(
      <Section id="dividend">
        <p>content</p>
      </Section>,
    );

    expect(html).not.toContain("scroll-mt");
  });
});
