/**
 * The Voltage signature mark.
 *
 * A waveform belongs to both halves of this product's world — the electrical
 * metaphor in the theme's name, and the price chart that is the subject's own
 * instrument. It carries the violet-to-cyan gradient so that gradient stays a
 * signature rather than becoming wallpaper across the interface.
 *
 * Decorative only, so it is hidden from assistive technology.
 */
export function Waveform({ className }: { className?: string }) {
  const path =
    "M0 52 L120 52 L150 40 L190 58 L240 30 L300 44 L360 22 L430 48 L500 36 " +
    "L570 54 L640 26 L700 42 L780 18 L860 38 L940 24 L1020 34 L1100 14 L1200 26";

  return (
    <svg
      className={className}
      viewBox="0 0 1200 72"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="voltage-trace-gradient" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--accent)" />
          <stop offset="100%" stopColor="var(--accent-2)" />
        </linearGradient>
      </defs>

      {/* A static ghost keeps the shape present before the trace finishes, and
          for anyone who has asked for reduced motion. */}
      <path
        d={path}
        fill="none"
        stroke="var(--border-strong)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.45"
      />
      <path
        className="wave-trace"
        d={path}
        fill="none"
        stroke="url(#voltage-trace-gradient)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The wordmark's mark: a sieve.
 *
 * Four rules narrowing to one, with a single drop falling through — what the
 * product does, drawn rather than described. No gradient and no fill: it is a
 * stroked technical object like everything else in the system, which is also
 * what lets it survive being printed, reversed on a dark tile, or shown at
 * 16px in a browser tab, where the old gradient bolt turned to mud.
 *
 * Inherits `currentColor`, so the caller decides whether it is accent on the
 * canvas or the canvas reversed out of an accent tile.
 */
export function SieveMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={className ?? "size-[18px]"}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      focusable="false"
    >
      <path d="M3 5h18M6 11h12M10 17h4M12 17v4" />
    </svg>
  );
}
