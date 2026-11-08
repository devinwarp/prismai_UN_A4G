"use client";

import { useSyncExternalStore } from "react";

type ThemeId = "pine" | "ink";

const THEMES: { id: ThemeId; label: string; paper: string; lit: string }[] = [
  { id: "pine", label: "Paper + pine", paper: "#f6f4ec", lit: "#2f6242" },
  { id: "ink", label: "Ink + lit glow", paper: "#151311", lit: "#e59b3f" },
];

const THEME_IDS = new Set<string>(THEMES.map((t) => t.id));

function subscribe(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}

function getSnapshot(): ThemeId {
  const t = document.documentElement.dataset.theme;
  return t && THEME_IDS.has(t) ? (t as ThemeId) : "pine";
}

const getServerSnapshot = (): ThemeId => "pine";

function applyTheme(id: ThemeId) {
  document.documentElement.dataset.theme = id;
  try {
    localStorage.setItem("prism-theme", id);
  } catch {
    // private mode — theme still applies for the session
  }
}

/**
 * Palette picker. `floating` (default) renders fixed in the bottom corner;
 * `inline` renders just the swatch group for embedding in headers. The
 * active theme is applied by an inline script in the document head before
 * paint; this component observes the attribute so it stays in sync.
 */
export default function ThemeSwitcher({
  variant = "floating",
}: {
  variant?: "floating" | "inline";
}) {
  const active = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const swatches = (
    <div
      role="radiogroup"
      aria-label="Color theme"
      className="flex items-center gap-2 rounded-full border border-line bg-card/80 px-2.5 py-2 shadow-sm backdrop-blur"
    >
      {THEMES.map((t) => (
        <button
          key={t.id}
          role="radio"
          aria-checked={active === t.id}
          aria-label={t.label}
          title={t.label}
          onClick={() => applyTheme(t.id)}
          className={[
            "h-5 w-5 rounded-full transition-transform hover:scale-110",
            active === t.id ? "ring-2 ring-lit ring-offset-2 ring-offset-card" : "",
          ].join(" ")}
          style={{
            background: `linear-gradient(135deg, ${t.paper} 0%, ${t.paper} 50%, ${t.lit} 50%, ${t.lit} 100%)`,
            border: "1px solid var(--color-line)",
          }}
        />
      ))}
    </div>
  );

  if (variant === "inline") return swatches;

  return (
    <div className="safe-bottom fixed right-4 bottom-4 z-40">{swatches}</div>
  );
}
