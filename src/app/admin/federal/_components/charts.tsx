import { useState } from "react";
import Pop from "./Pop";
import { VERDICTS, QUADRANTS, type Dashboard, type Tally, type UnUseCaseState, type Verdict } from "@/lib/un/model";
import { tr } from "@/lib/un/i18n/dict";
import { useLang } from "./Lang";
import { DataTableAlt, scrollFocus, scrollRegion } from "./ui";
import { VERDICT_META, fill as fmt, ltr, quadLabel, stageLabel, verdictName } from "./labels";

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

/** Months from asOf to the deadline (fractional, never negative). */
export function monthsLeft(asOf: string, deadline: string | null): number | null {
  if (!deadline) return null;
  const ms = Date.parse(deadline) - Date.parse(asOf);
  return Math.max(0, ms / (1000 * 60 * 60 * 24 * 30.4375));
}

/** One horizontal progress track with the target marked on it. */
export function TargetTrack({
  label, value, total, target, fill, note,
}: { label: string; value: number; total: number; target: number | null; fill: string; note: string }) {
  const lang = useLang();
  const w = pct(value, total);
  const t = total && target !== null ? (target / total) * 100 : null;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium">{label}</span>
        <bdi dir="ltr" className="font-mono text-xs text-ink-soft tabular-nums">{note}</bdi>
      </div>
      <div
        {...(total ? {
          role: "meter",
          "aria-label": label,
          "aria-valuemin": 0,
          "aria-valuemax": total,
          "aria-valuenow": value,
          "aria-valuetext": target === null ? note : fmt(tr(lang, "ua.tp.vt", "{v} of {t} use cases; target {g}"), { v: value, t: total, g: target }),
        } : { "aria-hidden": true })}
        className="relative mt-2 h-4 overflow-visible rounded-full bg-paper-deep desk:mt-1.5 desk:h-3"
      >
        <div className="bar-grow absolute inset-y-0 start-0 rounded-full" style={{ width: `${w}%`, background: fill }} />
        {t !== null && <div aria-hidden className="absolute -top-1.5 -bottom-1.5 w-0.5 bg-ink" style={{ insetInlineStart: `calc(${t}% - 1px)` }} />}
      </div>
    </div>
  );
}

/** Headline: progress toward the federal target, gap and the pace it implies. */
export function TargetProgress({ d, deadline, deadlineNote, asOf }: { d: Dashboard; deadline: string | null; deadlineNote: string; asOf: string }) {
  const lang = useLang();
  const months = monthsLeft(asOf, deadline);
  const met = d.gap === 0 && d.total > 0;
  const perMonth = months && months > 0 ? d.gap / months : null;
  const stuck = d.deployed - d.compliant;
  return (
    <div className="rounded-2xl border border-line bg-card p-5 sm:p-7">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] lg:gap-12">
        <div>
          <p className="font-mono text-[11px] tracking-[0.22em] text-ink-soft uppercase">{tr(lang, "ua.tp.toward", "Deployed toward target")}</p>
          <p className="font-display mt-2 flex items-baseline gap-2 tabular-nums">
            <span className="text-6xl leading-none font-medium sm:text-7xl">{d.deployed}</span>
            <span className="text-2xl text-ink-soft">{fmt(tr(lang, "ua.tp.of", "of {n}"), { n: d.targetCount })}</span>
          </p>
          <p className="mt-3 text-sm text-ink-soft">
            {fmt(tr(lang, "ua.tp.share", "{p}% of {t} use cases"), { p: d.targetPercent, t: d.total })}{deadlineNote}
          </p>
          <p className={`mt-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium ${met ? "border-lit/50 bg-lit-soft/60 text-lit-deep" : "border-ember/50 text-ember"}`}>
            <span aria-hidden>{met ? "✓" : "▲"}</span>
            {met ? tr(lang, "ua.tp.met", "Target met") : fmt(tr(lang, "ua.tp.gap", "Gap: {g} to deploy"), { g: d.gap })}
          </p>
        </div>

        <div className="flex flex-col justify-center gap-6">
          <TargetTrack
            label={tr(lang, "hl.deployed", "Deployed")}
            value={d.deployed}
            total={d.total}
            target={d.targetCount}
            fill="var(--color-lit)"
            note={`${d.deployed}/${d.total} · ${d.deployedPct}%`}
          />
          <TargetTrack
            label={tr(lang, "ua.tp.ca", "Compliant & aligned")}
            value={d.compliant}
            total={d.total}
            target={d.targetCount}
            fill="var(--color-v-sup)"
            note={`${d.compliant}/${d.total} · ${d.compliantPct}%`}
          />
          <p className="flex items-center gap-2 font-mono text-[11px] text-ink-soft">
            <span aria-hidden className="inline-block h-3 w-0.5 shrink-0 bg-ink" /> {fmt(tr(lang, "ua.tp.line", "Target line: {n} use cases ({p}%). Compliance is reported beside deployment, never merged into it."), { n: d.targetCount, p: d.targetPercent })}
          </p>
        </div>
      </div>

      <dl className="mt-7 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
        {[
          [tr(lang, "ua.tp.k.gap", "Gap to target"), String(d.gap), met ? tr(lang, "ua.tp.s.none", "nothing left to deploy") : tr(lang, "ua.tp.s.left", "use cases still to deploy")],
          [tr(lang, "ua.tp.k.time", "Time left"), months === null ? "-" : months < 1 ? tr(lang, "ua.tp.lt1", "<1 mo") : fmt(tr(lang, "ua.tp.mo", "{n} mo"), { n: Math.round(months) }), deadline ? fmt(tr(lang, "ua.tp.until", "until {d}"), { d: ltr(deadline) }) : tr(lang, "ua.tp.nodl", "no deadline set")],
          [tr(lang, "ua.tp.k.pace", "Pace needed"), perMonth === null ? "-" : met ? "0" : perMonth < 0.1 ? "<0.1" : perMonth.toFixed(1), tr(lang, "ua.tp.s.pace", "deployments a month")],
          [tr(lang, "ua.tp.k.stuck", "Deployed, not compliant"), String(stuck), stuck ? tr(lang, "ua.tp.s.stuck", "deployed but failing attestation") : tr(lang, "ua.tp.s.nofail", "none failing")],
        ].map(([k, v, s]) => (
          <div key={k} className="bg-card px-4 py-3">
            <dt className="font-mono text-[10px] tracking-widest text-ink-soft uppercase">{k}</dt>
            <dd className="font-display mt-1 text-2xl font-medium tabular-nums"><bdi dir="ltr">{v}</bdi></dd>
            <dd className="text-xs text-ink-soft">{s}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export type VerdictFilter = Verdict | "NONE";

const UNASSESSED_MARK = { glyph: "–", color: "var(--color-ink-soft)" };

/** Stacked bar of verdicts across the portfolio; the legend filters the table. */
export function VerdictMix({
  useCases, active, onSelect,
}: { useCases: UnUseCaseState[]; active: VerdictFilter | "all"; onSelect: (v: VerdictFilter | "all") => void }) {
  const lang = useLang();
  const counts = VERDICTS.map((v) => ({ key: v as VerdictFilter, n: useCases.filter((u) => u.verdict === v).length }));
  const none = useCases.filter((u) => !u.verdict).length;
  const all = [...counts, { key: "NONE" as VerdictFilter, n: none }];
  const total = useCases.length || 1;
  const color = (k: VerdictFilter) => (k === "NONE" ? "var(--color-line)" : VERDICT_META[k].color);
  return (
    <div>
      <div role={useCases.length ? "group" : undefined} aria-hidden={useCases.length ? undefined : true} aria-label={useCases.length ? `${tr(lang, "ua.mix.label", "Verdict mix")}: ${all.filter((a) => a.n).map((a) => `${a.n} ${a.key === "NONE" ? tr(lang, "ua.mix.notyet", "not yet assessed") : verdictName(lang, a.key)}`).join(lang === "ar" ? "، " : ", ")}` : undefined} className="flex h-9 gap-0.5 overflow-hidden rounded-lg bg-paper-deep desk:h-6">
        {all.filter((a) => a.n).map((a) => (
          <button
            key={a.key}
            type="button"
            onClick={() => onSelect(active === a.key ? "all" : a.key)}
            aria-pressed={active === a.key}
            title={`${a.key === "NONE" ? tr(lang, "ua.mix.notyet2", "Not yet assessed") : verdictName(lang, a.key)}: ${a.n}`}
            className="flex min-w-6 items-center justify-center font-mono text-xs font-medium first:rounded-s-lg last:rounded-e-lg aria-pressed:outline-2 aria-pressed:outline-offset-1 aria-pressed:outline-ink"
            style={{ width: `${(a.n / total) * 100}%`, background: color(a.key), color: a.key === "NONE" ? "var(--color-ink)" : ["ASSISTANT_ONLY", "ESCALATE"].includes(a.key) ? "var(--color-v-on-light)" : "var(--color-v-on-dark)" }}
          >
            <span aria-hidden>{a.key === "NONE" ? "" : VERDICT_META[a.key].glyph}</span>
            <span className="ms-1 tabular-nums">{a.n}</span>
          </button>
        ))}
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3 desk:mt-2 desk:grid-cols-2 desk:gap-x-3 desk:gap-y-0 desk:text-xs">
        {all.map((a) => {
          const mark = a.key === "NONE" ? UNASSESSED_MARK : VERDICT_META[a.key];
          return (
            <li key={a.key}>
              <button
                type="button"
                disabled={useCases.length === 0}
                onClick={() => onSelect(active === a.key ? "all" : a.key)}
                aria-pressed={active === a.key}
                className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-start hover:bg-paper-deep aria-pressed:bg-paper-deep desk:py-px desk:leading-4"
              >
                <span aria-hidden className="w-3 shrink-0 text-center" style={{ color: mark.color }}>{mark.glyph}</span>
                <span className="min-w-0 flex-1 break-words">{a.key === "NONE" ? tr(lang, "ua.mix.none", "Not assessed") : verdictName(lang, a.key)}</span>
                <span className="font-mono text-xs text-ink-soft tabular-nums">{a.n}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <DataTableAlt floating caption={tr(lang, "ua.mix.cap", "Verdict counts")} head={[tr(lang, "ua.col.verdict", "Verdict"), tr(lang, "ua.col.ucs", "Use cases")]} rows={all.map((a) => [a.key === "NONE" ? tr(lang, "ua.mix.none", "Not assessed") : verdictName(lang, a.key), a.n])} />
    </div>
  );
}

/** Lifecycle pipeline: where use cases sit between intake and deployed. */
export function StagePipeline({ byStage }: { byStage: Dashboard["byStage"] }) {
  const lang = useLang();
  const max = Math.max(1, ...byStage.map((s) => s.count));
  return (
    <div>
      <div {...scrollRegion("portfolio-stages")} className="overflow-x-auto">
        <ol className="grid grid-cols-[repeat(7,minmax(max-content,1fr))] items-end gap-1.5">
          {byStage.map((s) => (
            <li key={s.stage} className="flex flex-col items-center gap-1.5 desk:gap-1">
              <span className="font-mono text-xs tabular-nums">{s.count}</span>
              <span aria-hidden className="bar-grow block w-full rounded-t-md bg-lit [height:var(--h)] desk:[height:var(--hd)] short:[height:var(--hs)]" style={{ ["--h" as string]: `${Math.max(3, (s.count / max) * 72)}px`, ["--hd" as string]: `${Math.max(3, (s.count / max) * 30)}px`, ["--hs" as string]: `${Math.max(3, (s.count / max) * 18)}px`, opacity: s.count ? 1 : 0.25, transformOrigin: "bottom" }} />
              <span className="w-full border-t border-line px-0.5 pt-1 text-center font-mono text-[10px] whitespace-nowrap text-ink-soft uppercase">{stageLabel(lang, s.stage)}</span>
            </li>
          ))}
        </ol>
      </div>
      <DataTableAlt floating caption={tr(lang, "ua.stage.cap", "Use cases by lifecycle stage")} head={[tr(lang, "ua.col.stage", "Stage"), tr(lang, "ua.col.ucs", "Use cases")]} rows={byStage.map((s) => [stageLabel(lang, s.stage), s.count])} />
    </div>
  );
}

/** Ranked bars: deployed (green) and compliant (blue) against each group's total. Sorted by deployed share so laggards sit at the bottom. */
export function TallyList({
  rows, active, onSelect, limit = 6, noun, expanded, onToggle,
}: { rows: Tally[]; active?: string; onSelect?: (k: string) => void; limit?: number; noun: "entities" | "quadrants"; expanded: boolean; onToggle: () => void }) {
  const lang = useLang();
  const nounT = noun === "entities" ? tr(lang, "ua.noun.entities", "entities") : tr(lang, "ua.noun.quadrants", "quadrants");
  const label = (k: string) => (noun === "quadrants" ? quadLabel(lang, k) : k);
  const sorted = [...rows].sort((a, b) => b.deployed / (b.total || 1) - a.deployed / (a.total || 1) || b.total - a.total || a.key.localeCompare(b.key));
  const maxTotal = Math.max(1, ...rows.map((r) => r.total));
  const shown = expanded ? sorted : sorted.slice(0, limit);
  return (
    <div>
      <ul className="space-y-1">
        {shown.map((r) => {
          const Row = onSelect ? "button" : "div";
          return (
            <li key={r.key}>
              <Row
                {...(onSelect ? { type: "button" as const, onClick: () => onSelect(active === r.key ? "" : r.key), "aria-pressed": active === r.key } : {})}
                className={`block w-full rounded-lg px-2 py-1.5 text-start ${onSelect ? "hover:bg-paper-deep aria-pressed:bg-paper-deep" : ""}`}
              >
                <span className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 break-words">{label(r.key)}</span>
                  <span className="shrink-0 font-mono text-xs text-ink-soft tabular-nums">
                    {fmt(tr(lang, "ua.tally.row", "{d}/{t} deployed · {c} compliant"), { d: r.deployed, t: r.total, c: r.compliant })}
                  </span>
                </span>
                <span className="relative mt-1.5 block h-2.5 rounded-full bg-paper-deep" style={{ width: `${(r.total / maxTotal) * 100}%`, minWidth: "3rem" }}>
                  <span className="bar-grow absolute inset-y-0 start-0 rounded-full" style={{ width: `${pct(r.deployed, r.total)}%`, background: "var(--color-lit)" }} />
                  <span className="bar-grow absolute inset-y-0 start-0 rounded-full" style={{ width: `${pct(r.compliant, r.total)}%`, background: "var(--color-v-sup)" }} />
                </span>
              </Row>
            </li>
          );
        })}
      </ul>
      {sorted.length > limit && (
        <button type="button" onClick={onToggle} aria-expanded={expanded} className="mt-2 rounded px-2 py-1 text-xs font-medium underline underline-offset-2">
          {expanded ? tr(lang, "ua.tally.fewer", "Show fewer") : fmt(tr(lang, "ua.tally.all", "Show all {n} {noun}"), { n: sorted.length, noun: nounT })}
        </button>
      )}
      <DataTableAlt caption={fmt(tr(lang, "ua.tally.cap", "Deployment by {noun}"), { noun: nounT })} head={[tr(lang, "ua.col.name", "Name"), tr(lang, "ua.col.total", "Total"), tr(lang, "hl.deployed", "Deployed"), tr(lang, "hl.compliant", "Compliant")]} rows={sorted.map((r) => [label(r.key), r.total, r.deployed, r.compliant])} />
    </div>
  );
}

/** Quadrant x verdict counts: where in the matrix each verdict lands. With `tallies`, each row also says how many of its use cases are deployed and compliant. */
export function QuadrantVerdictMatrix({ useCases, tallies = [] }: { useCases: UnUseCaseState[]; tallies?: Tally[] }) {
  const lang = useLang();
  const cell = (q: string, v: Verdict | null) => useCases.filter((u) => u.quadrant === q && (u.verdict ?? null) === v).length;
  const cols = ([...VERDICTS, null] as const).map((verdict) => ({
    verdict,
    label: verdict ? verdictName(lang, verdict) : tr(lang, "ua.mix.none", "Not assessed"),
    ...(verdict ? VERDICT_META[verdict] : UNASSESSED_MARK),
  }));
  const max = Math.max(1, ...QUADRANTS.flatMap((q) => cols.map(({ verdict }) => cell(q, verdict))));
  return (
    <div {...scrollRegion("qvm-cap")} className="min-w-0 overflow-x-auto">
      <table className="w-full min-w-max border-separate border-spacing-0.5 text-sm">
        <caption id="qvm-cap" className="sr-only">{tr(lang, "ua.qvm.cap", "Number of use cases per quadrant and verdict")}</caption>
        <thead>
          <tr>
            <th scope="col" className="text-start font-mono text-[10px] font-normal whitespace-nowrap text-ink-soft uppercase">{tr(lang, "ua.col.quad", "Quadrant")}</th>
            {cols.map(({ verdict, label, glyph, color }) => (
              <th key={verdict ?? "none"} scope="col" className="w-[9%] min-w-7 px-1 pb-1 text-center whitespace-nowrap" title={label}>
                <span aria-hidden style={{ color }}>{glyph}</span>
                <span className="sr-only">{label}</span>
              </th>
            ))}
            <th scope="col" className="ps-2 text-end font-mono text-[10px] font-normal whitespace-nowrap text-ink-soft uppercase">{tr(lang, "ua.col.total", "Total")}</th>
          </tr>
        </thead>
        <tbody>
          {QUADRANTS.map((q) => {
            const t = tallies.find((x) => x.key === q);
            return (
            <tr key={q}>
              <th scope="row" className="py-1 pe-3 text-start font-normal whitespace-nowrap desk:py-0 desk:pe-2 desk:text-xs desk:leading-4">
                {quadLabel(lang, q)}
                {t && <span className="hidden font-mono text-[10px] leading-3 text-ink-soft desk:block" title={fmt(tr(lang, "ua.tally.row", "{d}/{t} deployed · {c} compliant"), { d: t.deployed, t: t.total, c: t.compliant })}><bdi dir="ltr">{t.deployed}/{t.total}</bdi> · <bdi dir="ltr">{t.compliant}</bdi> ✓</span>}
              </th>
              {cols.map(({ verdict, color }) => {
                const n = cell(q, verdict);
                return (
                  <td
                    key={verdict ?? "none"}
                    className="h-10 rounded-md text-center font-mono text-sm tabular-nums desk:h-6 desk:text-xs"
                    style={{ background: n ? `color-mix(in srgb, ${color} ${15 + (n / max) * 55}%, transparent)` : "var(--color-paper-deep)", color: n ? "var(--color-ink)" : "var(--color-ink-soft)" }}
                  >
                    {n || "·"}
                  </td>
                );
              })}
              <td className="ps-2 text-end font-mono text-xs text-ink-soft tabular-nums">{useCases.filter((u) => u.quadrant === q).length}</td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

type EntitySort = "far" | "behind" | "name" | "size";
const share = (r: Tally) => r.deployed / (r.total || 1);
const SORTS: Record<EntitySort, (a: Tally, b: Tally) => number> = {
  far: (a, b) => share(b) - share(a) || b.total - a.total || a.key.localeCompare(b.key),
  behind: (a, b) => share(a) - share(b) || b.total - a.total || a.key.localeCompare(b.key),
  name: (a, b) => a.key.localeCompare(b.key),
  size: (a, b) => b.total - a.total || a.key.localeCompare(b.key),
};
/** Up to this many entities, every one is a chip. More than that: the leaders are chips and the rest are one tap away in a directory. */
const CHIP_LIMIT = 6;
const CHIPS_SHOWN = 4;

function EntityChip({ r, active, onSelect }: { r: Tally; active: string; onSelect: (k: string) => void }) {
  const lang = useLang();
  return (
    <button
      type="button"
      onClick={() => onSelect(active === r.key ? "" : r.key)}
      aria-pressed={active === r.key}
      title={`${r.key}: ${fmt(tr(lang, "ua.tally.row", "{d}/{t} deployed · {c} compliant"), { d: r.deployed, t: r.total, c: r.compliant })}`}
      className="block w-full rounded-lg border border-line bg-paper px-2.5 py-1.5 text-start hover:border-ink-soft aria-pressed:border-ink aria-pressed:bg-paper-deep"
    >
      <span dir="auto" className="block truncate text-xs font-medium">{r.key}</span>
      <span className="mt-1 block font-mono text-[10px] text-ink-soft tabular-nums"><bdi dir="ltr">{r.deployed}/{r.total}</bdi> · <bdi dir="ltr">{r.compliant}</bdi> ✓</span>
      <span className="relative mt-1 block h-1.5 rounded-full bg-paper-deep" aria-hidden>
        <span className="bar-grow absolute inset-y-0 start-0 rounded-full" style={{ width: `${pct(r.deployed, r.total)}%`, background: "var(--color-lit)" }} />
        <span className="bar-grow absolute inset-y-0 start-0 rounded-full" style={{ width: `${pct(r.compliant, r.total)}%`, background: "var(--color-v-sup)" }} />
      </span>
    </button>
  );
}

/** Every entity, searchable and sortable; a row filters the register. Opens from the "Show all" tile. */
function EntityDirectory({ rows, active, onSelect }: { rows: Tally[]; active: string; onSelect: (k: string) => void }) {
  const lang = useLang();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<EntitySort>("far");
  const needle = q.trim().toLowerCase();
  const list = rows.filter((r) => !needle || r.key.toLowerCase().includes(needle)).sort(SORTS[sort]);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} aria-label={tr(lang, "ua.f.search", "Search")} placeholder={tr(lang, "ua.f.search", "Search")} className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-3 py-1.5 text-sm text-ink placeholder:text-ink-soft focus:border-lit focus:outline-none focus-visible:outline-2 focus-visible:outline-lit" />
        <select value={sort} onChange={(e) => setSort(e.target.value as EntitySort)} aria-label={tr(lang, "dash.sort", "Sort")} className="rounded-lg border border-line bg-paper px-2 py-1.5 text-sm text-ink">
          <option value="far">{tr(lang, "dash.sort.far", "Furthest along")}</option>
          <option value="behind">{tr(lang, "dash.sort.behind", "Furthest behind")}</option>
          <option value="name">{tr(lang, "dash.sort.name", "Name")}</option>
          <option value="size">{tr(lang, "dash.sort.size", "Most use cases")}</option>
        </select>
      </div>
      <ul className="mt-3 max-h-80 divide-y divide-line overflow-y-auto rounded-lg border border-line">
        {list.map((r) => (
          <li key={r.key}>
            <button type="button" onClick={() => onSelect(active === r.key ? "" : r.key)} aria-pressed={active === r.key} className="block w-full px-3 py-2 text-start hover:bg-paper-deep aria-pressed:bg-paper-deep">
              <span className="flex items-baseline justify-between gap-3">
                <span dir="auto" className="min-w-0 truncate text-sm">{active === r.key && <span aria-hidden>● </span>}{r.key}</span>
                <span className="shrink-0 font-mono text-[11px] text-ink-soft tabular-nums"><bdi dir="ltr">{r.deployed}/{r.total}</bdi> · <bdi dir="ltr">{r.compliant}</bdi> ✓</span>
              </span>
              <span className="relative mt-1.5 block h-1.5 rounded-full bg-paper-deep" aria-hidden>
                <span className="absolute inset-y-0 start-0 rounded-full" style={{ width: `${pct(r.deployed, r.total)}%`, background: "var(--color-lit)" }} />
                <span className="absolute inset-y-0 start-0 rounded-full" style={{ width: `${pct(r.compliant, r.total)}%`, background: "var(--color-v-sup)" }} />
              </span>
            </button>
          </li>
        ))}
        {!list.length && <li className="px-3 py-4 text-center text-sm text-ink-soft">{tr(lang, "dash.noentity", "No entity matches.")}</li>}
      </ul>
    </div>
  );
}

/** Entities as filter chips: name, deployed (green) and compliant (blue) bars against its own total. One tap filters the register.
 * Up to six, every entity is a chip. Beyond that the four furthest along are chips (plus the one filtered to, so the filter is never hidden)
 * and a "Show all N entities" tile opens a directory, so thirty entities cost the same height as five. */
export function EntityStrip({
  rows, active, onSelect,
}: { rows: Tally[]; active: string; onSelect: (k: string) => void }) {
  const lang = useLang();
  const sorted = [...rows].sort(SORTS.far);
  const nounT = tr(lang, "ua.noun.entities", "entities");
  const many = sorted.length > CHIP_LIMIT;
  const chips = many ? sorted.slice(0, CHIPS_SHOWN) : sorted;
  const pinned = many && active && !chips.some((r) => r.key === active) ? sorted.find((r) => r.key === active) : undefined;
  const li = "min-w-0 desk:min-w-40 desk:flex-1 desk:basis-40";
  return (
    <div className="relative">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 desk:mb-1.5 desk:pe-28">
        <h3 className="text-base font-medium desk:text-sm">{tr(lang, "pf.q.entity", "Which entities are furthest along?")}</h3>
        <p className="flex gap-x-3 font-mono text-[11px] text-ink-soft">
          <span><span aria-hidden className="me-1 inline-block h-2 w-2 rounded-full bg-lit" />{tr(lang, "hl.deployed_l", "deployed")}</span>
          <span><span aria-hidden className="me-1 inline-block h-2 w-2 rounded-full" style={{ background: "var(--color-v-sup)" }} />{tr(lang, "ua.legend.compliant", "compliant")}</span>
        </p>
      </div>
      <ul {...scrollFocus} aria-label={tr(lang, "pf.q.entity", "Which entities are furthest along?")} className="flex flex-wrap gap-2 desk:flex-nowrap desk:overflow-x-auto desk:pb-1">
        {!chips.length && <li className="w-full rounded-lg border border-line bg-paper-deep px-2.5 py-2 text-xs text-ink-soft">{tr(lang, "ua.pg.empty.ent", "No entities with visible use cases")}</li>}
        {chips.map((r) => <li key={r.key} className={li}><EntityChip r={r} active={active} onSelect={onSelect} /></li>)}
        {pinned && <li key={pinned.key} className={li}><EntityChip r={pinned} active={active} onSelect={onSelect} /></li>}
        {many && (
          <li className={li}>
            <Pop
              buttonClass="flex h-full min-h-14 w-full items-center justify-between gap-2 rounded-lg border border-dashed border-ink-soft bg-paper px-2.5 py-1.5 text-start text-xs font-medium hover:border-ink hover:bg-paper-deep"
              panelClass="w-[min(28rem,calc(100vw-2rem))]"
              label={<><span>{fmt(tr(lang, "ua.tally.all", "Show all {n} {noun}"), { n: sorted.length, noun: nounT })}</span><span aria-hidden className="text-ink-soft">▾</span></>}
            >
              <EntityDirectory rows={rows} active={active} onSelect={onSelect} />
            </Pop>
          </li>
        )}
      </ul>
      {!many && sorted.length > 0 && <DataTableAlt floating caption={fmt(tr(lang, "ua.tally.cap", "Deployment by {noun}"), { noun: nounT })} head={[tr(lang, "ua.col.name", "Name"), tr(lang, "ua.col.total", "Total"), tr(lang, "hl.deployed", "Deployed"), tr(lang, "hl.compliant", "Compliant")]} rows={sorted.map((r) => [r.key, r.total, r.deployed, r.compliant])} />}
    </div>
  );
}
