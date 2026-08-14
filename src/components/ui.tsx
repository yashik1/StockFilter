import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Rating } from "@/lib/scoring/types";

export function Card({
  children,
  className,
  as: Tag = "div",
  interactive,
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article";
  interactive?: boolean;
}) {
  return (
    <Tag
      className={cn(
        "rounded-[var(--radius)] border border-border bg-surface shadow-[var(--shadow-sm)]",
        interactive &&
          "transition-all hover:border-border-strong hover:shadow-[var(--shadow)]",
        className,
      )}
    >
      {children}
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
        "tnum inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset",
        RATING_STYLES[rating],
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
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
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
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
