import type { ReactNode } from "react";
import type { GateStatus } from "@/lib/un/policy";
import { T } from "./Lang";

// Shared building blocks for the federal screens. Server-safe (no hooks).

export const card = "rounded-2xl border border-line bg-card p-5 sm:p-6";
export const field =
  "mt-1 block w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-soft focus:border-lit focus:outline-none focus-visible:outline-2 focus-visible:outline-lit";
export const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
export const btnGhost =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-paper px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-ink-soft disabled:cursor-not-allowed disabled:opacity-50";

export { VERDICT_META, verdictLabel } from "./labels";
export { VerdictBadge } from "./VerdictBadge";

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
      className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[11px] max-w-full flex-wrap"
      style={{
        borderColor: `color-mix(in srgb, ${m.color} 50%, transparent)`,
        background: `color-mix(in srgb, ${m.color} 11%, transparent)`,
      }}
    >
      <span aria-hidden style={{ color: m.color }}>{m.glyph}</span>
      <span className="text-ink"><T k={`gate.${gate}`} en={gate.replaceAll("_", " ")} /></span>
      <span className="text-ink-soft">· <T k={`status.${status}`} en={m.label} /></span>
    </span>
  );
}

/** Small-caps mono label + serif title, with an optional lede. */
export function Section({
  id, eyebrow, title, lede, aside, children,
}: { id?: string; eyebrow: ReactNode; title: ReactNode; lede?: ReactNode; aside?: ReactNode; children: ReactNode }) {
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
export function DataTableAlt({ caption, head, rows, floating = false }: { caption: string; head: string[]; rows: (string | number)[][]; /** One-screen desktop: the control sits in the corner of its chart cell (which must be `relative`) and the table opens over the page, taking no height. */ floating?: boolean }) {
  return (
    <details className={`mt-3 text-xs text-ink-soft ${floating ? "desk:static desk:mt-0" : ""}`}>
      <summary className={`w-fit cursor-pointer rounded underline underline-offset-2 ${floating ? "desk:absolute desk:end-0 desk:top-0 desk:text-[11px]" : ""}`}><T k="ua.viewtable" en="View as table" /></summary>
      <div className={`relative mt-2 overflow-x-auto ${floating ? "desk:absolute desk:end-0 desk:top-6 desk:z-20 desk:mt-0 desk:w-72 desk:rounded-lg desk:border desk:border-line desk:bg-card desk:p-3 desk:shadow-lg" : ""}`}>
        <table className="w-full text-start tabular-nums">
          <caption className="sr-only">{caption}</caption>
          <thead><tr>{head.map((h) => <th key={h} scope="col" className="py-1 pe-4 font-mono text-[10px] font-normal uppercase">{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-line">
                {r.map((c, j) => (j === 0 ? <th key={j} scope="row" className="py-1 pe-4 font-normal text-ink">{c}</th> : <td key={j} className="py-1 pe-4">{c}</td>))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** Props for a horizontally scrolling wrapper: focusable so a keyboard user can scroll it (WCAG 2.1.1, axe
 * scrollable-region-focusable), named by the table caption. A spread because jsx-a11y's no-noninteractive-tabindex
 * does not know about scroll regions. */
/** Just the focus part, for a scroller that already has its own role and name (an ol with aria-label). */
export const scrollFocus = { tabIndex: 0 };
export const scrollRegion = (captionId: string) => ({ role: "region", tabIndex: 0, "aria-labelledby": captionId });
