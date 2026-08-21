import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Rating } from "@/lib/scoring/types";

/**
 * A registration mark — the `+` at the corner of a framed object.
 *
 * Drawn from two 1px rules rather than a glyph so it stays exactly one device
 * pixel at any zoom, and sits half outside the frame so the corner reads as a
 * drawing's crop mark rather than as decoration inside a box.
 */
function Corner({ pos }: { pos: "tl" | "tr" | "bl" | "br" }) {
  const place = {
    tl: "-top-[6px] -left-[6px]",
    tr: "-top-[6px] -right-[6px]",
    bl: "-bottom-[6px] -left-[6px]",
    br: "-bottom-[6px] -right-[6px]",
  }[pos];

  return (
    <span
      aria-hidden
      className={cn("pointer-events-none absolute size-[11px] text-border-strong", place)}
    >
      <span className="absolute left-[5px] top-0 h-full w-px bg-current" />
      <span className="absolute top-[5px] left-0 h-px w-full bg-current" />
    </span>
  );
}

/**
 * Every framed object in the interface.
 *
 * A line drawing rather than a raised surface: square, transparent, one
 * hairline rule, and four registration marks. The marks live here rather than
 * at each call site so no page can forget them and none can add a fifth — the
 * frame is the system's single most repeated shape, and it has to be identical
 * everywhere or the whole language stops reading as drawn.
 *
 * `overflow-visible` is not incidental. The marks sit outside the border, so a
 * card that clips its overflow would shave them off at exactly the corners
 * they exist to mark.
 */
export function Card({
  children,
  className,
  as: Tag = "div",
  interactive,
  marks = true,
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article";
  interactive?: boolean;
  /** Off only where a frame is nested inside another frame's marks. */
  marks?: boolean;
}) {
  return (
    <Tag
      className={cn(
        "relative overflow-visible border border-border bg-transparent",
        interactive && "transition-colors hover:border-accent",
        className,
      )}
    >
      {children}
      {marks && (
        <>
          <Corner pos="tl" />
          <Corner pos="tr" />
          <Corner pos="bl" />
          <Corner pos="br" />
        </>
      )}
    </Tag>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-3.5">
      <div className="min-w-0">
        <h2 className="text-[0.9375rem] font-semibold leading-tight tracking-tight">
          {title}
        </h2>
        {subtitle && <p className="mt-1 text-xs leading-relaxed text-muted">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** Section heading used between cards, with an optional trailing action. */
export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  // ReactNode rather than string: a description can carry an inline element,
  // such as a timestamp that has to be formatted in the reader's own timezone.
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
        <h2 className="font-display text-xl">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

const RATING_STYLES: Record<Rating, string> = {
  good: "bg-good-soft text-good-fg ring-good/25",
  fair: "bg-fair-soft text-fair-fg ring-fair/25",
  poor: "bg-poor-soft text-poor-fg ring-poor/25",
  unknown: "bg-unknown-soft text-unknown-fg ring-unknown/25",
};

/**
 * Rating labels always carry words, never colour alone — the text is what
 * conveys meaning to anyone who cannot separate the hues.
 */
const RATING_LABELS: Record<Rating, string> = {
  good: "Good",
  fair: "Mixed",
  poor: "Weak",
  unknown: "No data",
};

export function RatingBadge({
  rating,
  label,
  className,
}: {
  rating: Rating;
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "tnum inline-flex shrink-0 items-center gap-1.5 px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
        RATING_STYLES[rating],
        className,
      )}
    >
      <span aria-hidden className="size-1.5 bg-current" />
      {label ?? RATING_LABELS[rating]}
    </span>
  );
}

export function Badge({
  children,
  tone = "neutral",
  title,
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "good" | "fair" | "poor";
  title?: string;
}) {
  const tones = {
    neutral: "bg-surface-2 text-muted-strong ring-border",
    accent: "bg-accent-soft text-accent ring-accent/20",
    good: "bg-good-soft text-good-fg ring-good/25",
    fair: "bg-fair-soft text-fair-fg ring-fair/25",
    poor: "bg-poor-soft text-poor-fg ring-poor/25",
  };
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

/**
 * A labelled figure with an always-available plain-language explanation.
 *
 * The hint is exposed as `title` and as visually hidden text so it reaches
 * screen readers and keyboard users, not only people who can hover.
 */
export function Metric({
  label,
  value,
  hint,
  size = "md",
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  size?: "sm" | "md" | "lg";
  tone?: "up" | "down" | "muted";
}) {
  const sizes = {
    sm: "text-[0.8125rem]",
    md: "text-[0.9375rem]",
    lg: "text-xl",
  };
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1 text-xs text-muted" title={hint}>
        <span className="truncate">{label}</span>
        {hint && (
          <>
            <span aria-hidden className="cursor-help text-faint">
              ⓘ
            </span>
            <span className="sr-only">{hint}</span>
          </>
        )}
      </dt>
      <dd
        className={cn(
          "tnum mt-1 font-semibold",
          sizes[size],
          tone === "up" && "text-up",
          tone === "down" && "text-down",
          tone === "muted" && "text-muted",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * Horizontal magnitude bar.
 *
 * Gives a number a visual length so a column of figures can be scanned by shape
 * rather than read one at a time.
 */
export function MeterBar({
  value,
  max = 1,
  rating = "unknown",
  className,
  label,
}: {
  value: number | null;
  max?: number;
  rating?: Rating;
  className?: string;
  label?: string;
}) {
  const pct = value == null ? 0 : Math.max(0, Math.min(1, value / max)) * 100;
  const fills: Record<Rating, string> = {
    good: "bg-good",
    fair: "bg-fair",
    poor: "bg-poor",
    unknown: "bg-unknown",
  };

  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-3", className)}
      role="img"
      aria-label={label ?? (value == null ? "No data" : `${Math.round(pct)} percent`)}
    >
      <div
        className={cn("h-full rounded-full transition-all", fills[rating])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      {icon && <div className="mb-1 text-faint">{icon}</div>}
      <p className="text-sm font-semibold">{title}</p>
      <p className="max-w-md text-sm leading-relaxed text-muted">{description}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Coloured price change, with the sign always spelled out in the text. */
export function Change({
  value,
  percent,
  className,
}: {
  value: number | null;
  percent: number | null;
  className?: string;
}) {
  if (value == null && percent == null) {
    return <span className={cn("text-muted", className)}>—</span>;
  }
  const positive = (value ?? percent ?? 0) >= 0;
  return (
    <span
      className={cn("tnum font-semibold", positive ? "text-up" : "text-down", className)}
    >
      {positive ? "▲" : "▼"}{" "}
      {value != null ? Math.abs(value).toFixed(2) : ""}
      {value != null && percent != null ? " " : ""}
      {percent != null ? `(${Math.abs(percent * 100).toFixed(2)}%)` : ""}
    </span>
  );
}

/**
 * Placeholder for a figure that genuinely is not available.
 *
 * A bare dash reads as a broken page. This says "not reported" quietly, and
 * carries the reason when there is one.
 */
export function NotReported({ reason }: { reason?: string }) {
  return (
    <span className="text-xs text-faint" title={reason}>
      not reported
      {reason && <span className="sr-only"> — {reason}</span>}
    </span>
  );
}
