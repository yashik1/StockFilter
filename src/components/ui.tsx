import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Rating } from "@/lib/scoring/types";

export function Card({
  children,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article";
}) {
  return (
    <Tag
      className={cn(
        "rounded-[var(--radius)] border border-border bg-surface shadow-[var(--shadow)]",
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
    <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

const RATING_STYLES: Record<Rating, string> = {
  good: "bg-good-soft text-good-fg border-good/30",
  fair: "bg-fair-soft text-fair-fg border-fair/30",
  poor: "bg-poor-soft text-poor-fg border-poor/30",
  unknown: "bg-unknown-soft text-unknown-fg border-unknown/30",
};

/**
 * Rating labels always carry text, never colour alone — the wording is what
 * conveys the meaning to anyone who cannot distinguish the hues.
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
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        RATING_STYLES[rating],
        className,
      )}
    >
      <span
        aria-hidden
        className="size-1.5 rounded-full bg-current opacity-70"
      />
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
    neutral: "bg-surface-2 text-muted-strong border-border",
    accent: "bg-accent-soft text-accent border-accent/30",
    good: "bg-good-soft text-good-fg border-good/30",
    fair: "bg-fair-soft text-fair-fg border-fair/30",
    poor: "bg-poor-soft text-poor-fg border-poor/30",
  };
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

/**
 * A metric with an always-available plain-language explanation.
 *
 * The hint is exposed as a `title` and as visually hidden text so it reaches
 * screen readers and keyboard users, not just people who can hover.
 */
export function Metric({
  label,
  value,
  hint,
  emphasis,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasis?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt
        className="flex items-center gap-1 text-xs text-muted"
        title={hint}
      >
        <span className="truncate">{label}</span>
        {hint && (
          <>
            <span aria-hidden className="cursor-help text-muted/60">
              ⓘ
            </span>
            <span className="sr-only">{hint}</span>
          </>
        )}
      </dt>
      <dd
        className={cn(
          "tnum mt-0.5 font-semibold",
          emphasis ? "text-lg" : "text-sm",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-md text-sm text-muted">{description}</p>
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
      className={cn(
        "tnum font-medium",
        positive ? "text-up" : "text-down",
        className,
      )}
    >
      {positive ? "+" : "−"}
      {value != null ? Math.abs(value).toFixed(2) : ""}
      {value != null && percent != null ? " " : ""}
      {percent != null ? `(${Math.abs(percent * 100).toFixed(2)}%)` : ""}
    </span>
  );
}
