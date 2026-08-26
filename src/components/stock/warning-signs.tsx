import { TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui";
import type { Warning } from "@/lib/scoring/warnings";
import { cn } from "@/lib/utils";

/**
 * The things on this page a reader should not miss.
 *
 * Placed high, above the charts and the five questions, because the person
 * who most needs it is the person least likely to scroll — somebody who
 * arrived with a ticker from a video or a group chat and wants to know
 * whether the company is real before anything else.
 *
 * Renders nothing at all when there is nothing to report. An empty
 * "Warning signs" card would be worse than no card: a reader would take the
 * absence of items as a verdict, when in fact most companies most of the time
 * simply have not filed anything that belongs here.
 *
 * Every line is a filing or a published model, stated and sourced. None of
 * them says what to do — the app describes, it does not advise.
 */
export function WarningSigns({ warnings }: { warnings: Warning[] }) {
  if (warnings.length === 0) return null;

  const severe = warnings.some((w) => w.level === "severe");

  return (
    <Card className={cn("overflow-hidden", severe ? "border-poor" : "border-fair")}>
      <div
        className={cn(
          "flex items-center gap-2 border-b px-5 py-3.5",
          severe ? "border-poor bg-poor-soft" : "border-border bg-fair-soft",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "flex size-6 items-center justify-center rounded-full",
            severe ? "text-poor-fg" : "text-fair-fg",
          )}
        >
          <TriangleAlert className="size-4" />
        </span>
        <h2 className="text-[0.9375rem] font-semibold tracking-tight">
          {warnings.length === 1 ? "One thing worth knowing first" : "Things worth knowing first"}
        </h2>
      </div>

      <ul className="divide-y divide-border">
        {warnings.map((w, i) => (
          <li key={i} className="px-5 py-3.5">
            <p className="text-[0.9375rem] leading-relaxed text-muted-strong">{w.text}</p>
            <p className="tnum mt-1.5 text-xs text-faint">
              {w.evidence}
              {w.url && (
                <>
                  {" · "}
                  <a
                    className="underline hover:text-foreground"
                    href={w.url}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    Read the filing
                  </a>
                </>
              )}
            </p>
          </li>
        ))}
      </ul>

      <p className="border-t border-border px-5 py-3 text-xs leading-relaxed text-faint">
        {/* The register the whole app holds to, restated where it matters most:
            this is the one block a reader is most likely to read as a
            recommendation. */}
        These are things the company filed or that a published model flagged — not
        predictions, and not a reason on their own to buy or sell anything.
      </p>
    </Card>
  );
}
