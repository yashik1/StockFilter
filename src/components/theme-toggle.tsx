"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "light" | "dark";

/**
 * Theme toggle.
 *
 * The initial theme is applied by an inline script in the document head before
 * paint (see layout.tsx), so this component only has to reflect and update it —
 * reading it here would cause a flash of the wrong theme on load.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    // Deferred to a microtask so the state update does not run synchronously
    // inside the effect, which React flags as a cascading render.
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const current = document.documentElement.dataset.theme as Theme | undefined;
      setTheme(
        current ??
          (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      // Private browsing can block storage; the toggle still works for this page.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      className="inline-flex h-[34px] w-[34px] items-center justify-center border border-border bg-transparent text-muted-strong transition-colors hover:border-accent hover:text-accent"
    >
      {/* Render nothing until mounted so the icon cannot contradict the theme. */}
      {theme === "dark" ? (
        <Sun className="size-4" />
      ) : theme === "light" ? (
        <Moon className="size-4" />
      ) : null}
    </button>
  );
}
