import type { ReactNode } from "react";
import type { Verdict } from "@/lib/un/model";
import type { GateStatus } from "@/lib/un/policy";

// Shared building blocks for the federal screens. Server-safe (no hooks).

export const card = "rounded-2xl border border-line bg-card p-5 sm:p-6";
export const field =
  "mt-1 block w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-soft focus:border-lit focus:outline-none focus-visible:outline-2 focus-visible:outline-lit";
export const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
export const btnGhost =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-paper px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-ink-soft disabled:cursor-not-allowed disabled:opacity-50";

export const VERDICT_META: Record<Verdict, { glyph: string; color: string; hint: string }> = {
  GO_AUTONOMOUS: { glyph: "●", color: "var(--color-v-auto)", hint: "Cleared to run without per-action sign-off" },
  GO_SUPERVISED: { glyph: "◐", color: "var(--color-v-sup)", hint: "Cleared with a person approving outputs" },
  ASSISTANT_ONLY: { glyph: "○", color: "var(--color-v-asst)", hint: "Drafts only; a person acts" },
  NO_GO: { glyph: "✕", color: "var(--color-v-nogo)", hint: "A hard gate failed" },
  ESCALATE: { glyph: "▲", color: "var(--color-v-esc)", hint: "Evidence missing; needs a decision" },
};

export const verdictLabel = (v: Verdict | null) => (v ? v.replace("_", " ") : "No verdict");

/** Glyph + text, tinted: colour is never the only signal. */
export function VerdictBadge({ verdict, size = "sm" }: { verdict: Verdict | null; size?: "sm" | "lg" }) {
  const m = verdict ? VERDICT_META[verdict] : null;
  const pad = size === "lg" ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-[11px]";
  return (
    <span
      title={m?.hint ?? "Not assessed yet"}
      className={`inline-flex items-center gap-1.5 rounded-full border font-mono tracking-wide whitespace-nowrap ${pad}`}
      style={{
        borderColor: m ? `color-mix(in srgb, ${m.color} 55%, transparent)` : "var(--color-line)",
        background: m ? `color-mix(in srgb, ${m.color} 13%, transparent)` : "transparent",
      }}
    >
      <span aria-hidden style={{ color: m?.color ?? "var(--color-ink-soft)" }}>{m?.glyph ?? "–"}</span>
      <span className={m ? "text-ink" : "text-ink-soft"}>{verdictLabel(verdict)}</span>
    </span>
  );
}

export const STATUS_META: Record<GateStatus, { glyph: string; color: string; label: string }> = {
  pass: { glyph: "✓", color: "var(--color-s-pass)", label: "pass" },
  fail: { glyph: "✕", color: "var(--color-s-fail)", label: "fail" },
  fix_declared: { glyph: "↻", color: "var(--color-s-fix)", label: "fix declared" },
  unknown: { glyph: "?", color: "var(--color-s-unknown)", label: "no evidence" },
};

export function GateChip({ gate, status }: { gate: string; status: GateStatus }) {
  const m = STATUS_META[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[11px] whitespace-nowrap"
      style={{
        borderColor: `color-mix(in srgb, ${m.color} 50%, transparent)`,
        background: `color-mix(in srgb, ${m.color} 11%, transparent)`,
      }}
    >
      <span aria-hidden style={{ color: m.color }}>{m.glyph}</span>
      <span className="text-ink">{gate.replaceAll("_", " ")}</span>
      <span className="text-ink-soft">· {m.label}</span>
    </span>
  );
}

/** Small-caps mono label + serif title, with an optional lede. */
export function Section({
  id, eyebrow, title, lede, aside, children,
}: { id?: string; eyebrow: string; title: string; lede?: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id ? `${id}-h` : undefined} id={id} className="scroll-mt-6">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-line pb-3">
        <div className="min-w-0">
          <p className="font-mono text-[11px] tracking-[0.22em] text-ink-soft uppercase">{eyebrow}</p>
          <h2 id={id ? `${id}-h` : undefined} className="font-display mt-1 text-2xl font-medium tracking-tight">{title}</h2>
        </div>
        {aside}
      </header>
      {lede && <p className="mt-3 max-w-[68ch] text-sm leading-relaxed text-ink-soft">{lede}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function Field({
  label, hint, error, children,
}: { label: string; hint?: string; error?: string | null; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {error ? (
        <span role="alert" className="mt-1 block text-xs text-ember">✕ {error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-ink-soft">{hint}</span>
      ) : null}
    </label>
  );
}

/** Screen-reader / no-JS-chart alternative: a real table, visually hidden unless opened. */
export function DataTableAlt({ caption, head, rows }: { caption: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <details className="mt-3 text-xs text-ink-soft">
      <summary className="w-fit cursor-pointer rounded underline underline-offset-2">View as table</summary>
      <div className="relative mt-2 overflow-x-auto">
        <table className="w-full text-left tabular-nums">
          <caption className="sr-only">{caption}</caption>
          <thead><tr>{head.map((h) => <th key={h} scope="col" className="py-1 pr-4 font-mono text-[10px] font-normal uppercase">{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-line">
                {r.map((c, j) => (j === 0 ? <th key={j} scope="row" className="py-1 pr-4 font-normal text-ink">{c}</th> : <td key={j} className="py-1 pr-4">{c}</td>))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
