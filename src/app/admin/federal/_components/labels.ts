import type { Verdict } from "@/lib/un/model";
import { tr, type Lang } from "@/lib/un/i18n/dict";

// Plain (server-safe) metadata and label helpers for the federal screens.

export const VERDICT_META: Record<Verdict, { glyph: string; color: string; hint: string }> = {
  GO_AUTONOMOUS: { glyph: "●", color: "var(--color-v-auto)", hint: "Cleared to run without per-action sign-off" },
  GO_SUPERVISED: { glyph: "◐", color: "var(--color-v-sup)", hint: "Cleared with a person approving outputs" },
  ASSISTANT_ONLY: { glyph: "○", color: "var(--color-v-asst)", hint: "Drafts only; a person acts" },
  NO_GO: { glyph: "✕", color: "var(--color-v-nogo)", hint: "A hard gate failed" },
  ESCALATE: { glyph: "▲", color: "var(--color-v-esc)", hint: "Evidence missing; needs a decision" },
};

export const verdictLabel = (v: Verdict | null) => (v ? v.replace("_", " ") : "No verdict");

/** Reader-facing verdict name (Arabic name in Arabic mode, never the machine code). */
export const verdictName = (lang: Lang, v: Verdict | null) => tr(lang, `verdict.${v ?? "NONE"}`, verdictLabel(v));
/** Hint keys: ua.vh.<CODE> */
export const verdictHint = (lang: Lang, v: Verdict) => tr(lang, `ua.vh.${v}`, VERDICT_META[v].hint);
/** Stage keys: ua.stage.<stage> */
export const stageLabel = (lang: Lang, s: string) => tr(lang, `ua.stage.${s}`, s);
/** Quadrant keys: ua.quad.<internal_agents|internal_rag|external_agents|external_rag> */
export const quadLabel = (lang: Lang, q: string) => tr(lang, `ua.quad.${q.toLowerCase().replace(/ /g, "_")}`, q);

/** Fill {name} placeholders. */
export const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, n: string) => String(v[n] ?? ""));
/** Isolate a number, id or date so it keeps its order inside Arabic text (use as a string, for attributes and templates). */
export const ltr = (x: string | number) => `⁦${x}⁩`;
