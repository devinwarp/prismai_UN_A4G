"use client";

import type { Verdict } from "@/lib/un/model";
import { T, useLang } from "./Lang";
import { VERDICT_META, verdictHint, verdictLabel } from "./labels";
import { tr } from "@/lib/un/i18n/dict";

/** Glyph + text, tinted: colour is never the only signal. */
export function VerdictBadge({ verdict, size = "sm" }: { verdict: Verdict | null; size?: "sm" | "lg" }) {
  const lang = useLang();
  const m = verdict ? VERDICT_META[verdict] : null;
  const pad = size === "lg" ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-[11px]";
  return (
    <span
      title={verdict ? verdictHint(lang, verdict) : tr(lang, "ua.vh.none", "Not assessed yet")}
      className={`inline-flex items-center gap-1.5 rounded-full border font-mono tracking-wide whitespace-nowrap ${pad}`}
      style={{
        borderColor: m ? `color-mix(in srgb, ${m.color} 55%, transparent)` : "var(--color-line)",
        background: m ? `color-mix(in srgb, ${m.color} 13%, transparent)` : "transparent",
      }}
    >
      <span aria-hidden style={{ color: m?.color ?? "var(--color-ink-soft)" }}>{m?.glyph ?? "–"}</span>
      <span className={m ? "text-ink" : "text-ink-soft"}><T k={`verdict.${verdict ?? "NONE"}`} en={verdictLabel(verdict)} /></span>
    </span>
  );
}
