import type { ReactElement } from "react";

/**
 * The shared look of every share card.
 *
 * Committed to the dark palette rather than following a theme. An Open Graph
 * image is a fixed asset baked once and served to Facebook, X and Discord —
 * there is no viewer preference to read, so a single deliberate look beats a
 * guess at one.
 *
 * No custom font is loaded. next/og renders through Satori, which needs the
 * font bytes at render time, and the app's faces are downloaded into the
 * build by next/font rather than left on disk at a stable path — so fetching
 * them here would add a network dependency to an asset that must never fail.
 * The identity survives without them: the hairline frame, the square corners
 * and the palette are what make these cards recognisable as this app.
 */

/** The dark theme's tokens, resolved. Satori cannot evaluate color-mix(). */
export const OG = {
  background: "#14191e",
  surface: "#1b2228",
  foreground: "#e7eaec",
  muted: "#a4acb2",
  faint: "#8d949a",
  accent: "#8db0d1",
  good: "#5fae92",
  fair: "#8d949a",
  poor: "#d97b8a",
  /** --border at 20% of the foreground, flattened against the canvas. */
  border: "#3c4348",
} as const;

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

/**
 * The frame every card sits in: full-bleed canvas, one inset hairline, and
 * corner brackets in the same geometry the app draws on every Card.
 */
export function Frame({ children }: { children: ReactElement }) {
  const arm = 34;
  const inset = 40;

  const corner = (
    top: boolean,
    left: boolean,
  ): ReactElement => (
    <div
      key={`${top}-${left}`}
      style={{
        position: "absolute",
        display: "flex",
        [top ? "top" : "bottom"]: inset - 1,
        [left ? "left" : "right"]: inset - 1,
        width: arm,
        height: arm,
        [top ? "borderTop" : "borderBottom"]: `2px solid ${OG.accent}`,
        [left ? "borderLeft" : "borderRight"]: `2px solid ${OG.accent}`,
      }}
    />
  );

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        backgroundColor: OG.background,
        color: OG.foreground,
        fontFamily: "sans-serif",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: inset,
          left: inset,
          right: inset,
          bottom: inset,
          border: `1px solid ${OG.border}`,
          display: "flex",
        }}
      />
      {corner(true, true)}
      {corner(true, false)}
      {corner(false, true)}
      {corner(false, false)}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          padding: 88,
          justifyContent: "space-between",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** The small uppercase label the app uses above every heading. */
export function Eyebrow({ children }: { children: string }) {
  return (
    <div
      style={{
        display: "flex",
        fontSize: 21,
        letterSpacing: 3,
        textTransform: "uppercase",
        color: OG.faint,
        fontWeight: 600,
      }}
    >
      {children}
    </div>
  );
}

/**
 * The disclaimer, on every card.
 *
 * A share card travels further than the page it came from and is often the
 * only part anyone reads, so the one line that must never be conditional
 * appears here too.
 */
export function Disclaimer() {
  return (
    <div
      style={{
        display: "flex",
        fontSize: 20,
        color: OG.faint,
      }}
    >
      Educational information only — not investment advice.
    </div>
  );
}
