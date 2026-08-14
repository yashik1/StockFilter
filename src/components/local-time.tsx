"use client";

import { useEffect, useState } from "react";

/**
 * Renders a timestamp in the reader's own timezone.
 *
 * Server components format dates using the server's clock, which on a hosting
 * platform is UTC — so a reader in Vancouver saw times shifted by seven or eight
 * hours with nothing to indicate it. Formatting has to happen in the browser,
 * because only the browser knows where the reader is.
 *
 * The server still renders a value rather than a blank, so the layout does not
 * shift and the text is present without JavaScript. `suppressHydrationWarning`
 * covers the deliberate mismatch: the two renders differ by design, since the
 * server cannot know the reader's zone.
 */
export function LocalTime({
  value,
  mode = "datetime",
  showZone = false,
  className,
}: {
  /** ISO string or epoch milliseconds. */
  value: string | number | Date;
  mode?: "datetime" | "date" | "time" | "relative";
  /** Appends the zone abbreviation, e.g. "PDT". */
  showZone?: boolean;
  className?: string;
}) {
  // Kept as a primitive so the effect below has a stable dependency — a Date
  // object would be a new reference on every render.
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // Deferred rather than set synchronously, which React flags as a cascading
    // render. Only the browser knows the reader's timezone, so the switch to
    // local formatting can only happen after mount.
    const id = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(id);
  }, []);

  if (Number.isNaN(ms)) return null;

  const date = new Date(ms);
  const text = mounted ? localFormat(date, mode, showZone) : serverFormat(date, mode);

  return (
    <time dateTime={date.toISOString()} className={className} suppressHydrationWarning>
      {text}
    </time>
  );
}

/**
 * The server's best effort: UTC, explicitly labelled.
 *
 * Labelling it matters — an unmarked time silently in the wrong zone is worse
 * than one that says which zone it is, and this is what a reader without
 * JavaScript keeps.
 */
function serverFormat(date: Date, mode: string): string {
  if (Number.isNaN(date.getTime())) return "";
  const iso = date.toISOString();

  switch (mode) {
    case "date":
      return iso.slice(0, 10);
    case "time":
      return `${iso.slice(11, 16)} UTC`;
    case "relative":
      return iso.slice(0, 10);
    default:
      return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
  }
}

function localFormat(date: Date, mode: string, showZone: boolean): string {
  if (Number.isNaN(date.getTime())) return "";

  if (mode === "relative") return relative(date);

  const options: Intl.DateTimeFormatOptions =
    mode === "date"
      ? { dateStyle: "medium" }
      : mode === "time"
        ? { timeStyle: "short" }
        : { dateStyle: "medium", timeStyle: "short" };

  if (showZone) options.timeZoneName = "short";

  // `undefined` locale means the browser's own formatting conventions, so a
  // reader in Toronto and one in Berlin each see their usual order.
  return new Intl.DateTimeFormat(undefined, options).format(date);
}

/** "3 hours ago" — clearer than a clock time for something that just happened. */
function relative(date: Date): string {
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const abs = Math.abs(seconds);

  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["second", 60],
    ["minute", 3600],
    ["hour", 86400],
    ["day", 604800],
    ["week", 2629800],
    ["month", 31557600],
  ];

  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  let divisor = 1;

  for (const [unit, limit] of units) {
    if (abs < limit) return rtf.format(Math.round(seconds / divisor), unit);
    divisor = limit;
  }
  return rtf.format(Math.round(seconds / 31557600), "year");
}

/**
 * The reader's timezone name, for labelling a chart axis.
 * Returns null during server render, where it cannot be known.
 */
export function useTimeZone(): string | null {
  const [zone, setZone] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(() => {
      try {
        setZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
      } catch {
        // Very old engines lack the resolved-options API; the label is simply
        // omitted rather than guessed.
      }
    }, 0);
    return () => clearTimeout(id);
  }, []);

  return zone;
}
