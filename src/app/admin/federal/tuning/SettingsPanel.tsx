"use client";

import { useState } from "react";
import { pickConfig, RANGES, ROUTE_KINDS, type ReactConfig } from "@/lib/un/react-config";
import { btnGhost, btnPrimary, field } from "../_components/ui";
import { useAct, useT } from "./useTuning";

const NAME_EN: Record<keyof typeof RANGES, string> = {
  minOverlap: "Shared terms needed",
  overlapShare: "Share of the question's terms",
  maxNeed: "Most terms ever required",
  commonShare: "Common-term cut-off",
  maxSteps: "Steps before going outside",
};
const WHY_EN: Record<keyof typeof RANGES, string> = {
  minOverlap: "A sentence must share at least this many distinct terms with the question. One shared word is not support, so two is the floor.",
  overlapShare: "The share of the question's terms a sentence must share (0.4 is 40%). Below 30% a passing mention would count.",
  maxNeed: "However long the question, no more than this many shared terms are required.",
  commonShare: "A term found in more than this share of the SOP's passages says what the SOP is about, not what a passage answers, so it does not count as support.",
  maxSteps: "The loop gives up and goes outside after this many steps. The default plan needs up to five.",
};
const KIND_EN: Record<(typeof ROUTE_KINDS)[number], string> = { "required-documents": "Required documents", fees: "Fees", "decision-rule": "Decision rules" };
const terms = (s: string) => s.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);

/** The draft is local; "Propose" scores it against the version in use and records it for a person to decide. */
export default function SettingsPanel({ active, version, canEdit }: { active: ReactConfig; version: number; canEdit: boolean }) {
  const { t, tv } = useT();
  const { busy, error, act } = useAct();
  const [d, setD] = useState<ReactConfig>(() => pickConfig(active));
  const [summary, setSummary] = useState("");
  const [rev, setRev] = useState(0); // remounts the uncontrolled text inputs when rows change
  const changed = JSON.stringify(d) !== JSON.stringify(active);
  const num = (k: keyof typeof RANGES, v: string) => setD({ ...d, [k]: Number(v) });
  return (
    <section id="settings" aria-labelledby="h-settings" className="mt-12">
      <h2 id="h-settings" className="font-display text-2xl font-medium">{t("tn.s.title", "Settings, glossary and routing")}</h2>
      <p className="mt-2 max-w-[68ch] text-sm text-ink-soft">{tv("tn.s.lede", "These steer how the agent searches the SOP. You are editing a draft of settings v{v}. Nothing changes for the agent until you propose the draft and a person approves it.", { v: version })}</p>

      <h3 className="mt-6 text-base font-medium">{t("tn.s.numbers", "Thresholds")}</h3>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {(Object.keys(RANGES) as (keyof typeof RANGES)[]).map((k) => {
          const r = RANGES[k];
          return (
            <div key={k} className="text-sm">
              <label htmlFor={`set-${k}`} className="font-medium">{t(`tn.set.${k}`, NAME_EN[k])}</label>
              <input id={`set-${k}`} type="number" className={field} dir="ltr" min={r.min} max={r.max} step={r.step} value={d[k]} onChange={(e) => num(k, e.target.value)} disabled={!canEdit} aria-describedby={`why-${k}`} />
              <p id={`why-${k}`} className="mt-1 text-xs text-ink-soft">{tv("tn.s.range", "Safe range {min} to {max}.", { min: r.min, max: r.max })} {t(`tn.why.${k}`, WHY_EN[k])}</p>
            </div>
          );
        })}
      </div>

      <h3 className="mt-8 text-base font-medium">{t("tn.g.title", "Glossary")}</h3>
      <p className="mt-1 max-w-[68ch] text-sm text-ink-soft">{t("tn.g.lede", "When the first search finds nothing, the question is rewritten in the SOP's own words. Each row replaces any of the words on the left (separated by commas) with the words on the right. Lower-case letters, spaces and hyphens only.")}</p>
      <ul className="mt-3 space-y-2">
        {d.glossary.map((g, i) => (
          <li key={`${rev}-${i}`} className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <label className="text-xs text-ink-soft">{t("tn.g.from", "Question says")}
              <input className={field} dir="ltr" defaultValue={g.from.join(", ")} onChange={(e) => setD({ ...d, glossary: d.glossary.map((x, j) => (j === i ? { ...x, from: terms(e.target.value) } : x)) })} disabled={!canEdit} />
            </label>
            <label className="text-xs text-ink-soft">{t("tn.g.to", "SOP says")}
              <input className={field} dir="ltr" defaultValue={g.to} onChange={(e) => setD({ ...d, glossary: d.glossary.map((x, j) => (j === i ? { ...x, to: e.target.value.trim().toLowerCase() } : x)) })} disabled={!canEdit} />
            </label>
            <button type="button" className={btnGhost} disabled={!canEdit} onClick={() => { setD({ ...d, glossary: d.glossary.filter((_, j) => j !== i) }); setRev(rev + 1); }} aria-label={tv("tn.g.remove", "Remove the row for {w}", { w: g.to })}>{t("tn.remove", "Remove")}</button>
          </li>
        ))}
      </ul>
      <button type="button" className={`${btnGhost} mt-3`} disabled={!canEdit} onClick={() => { setD({ ...d, glossary: [...d.glossary, { from: ["word"], to: "word" }] }); setRev(rev + 1); }}>{t("tn.g.add", "Add a row")}</button>

      <h3 className="mt-8 text-base font-medium">{t("tn.r.title", "Routing")}</h3>
      <p className="mt-1 max-w-[68ch] text-sm text-ink-soft">{t("tn.r.lede", "On the second search, a question containing one of these words is narrowed to one kind of passage. The first kind that matches wins.")}</p>
      <div className="mt-3 grid gap-3">
        {ROUTE_KINDS.map((kind) => (
          <label key={`${rev}-${kind}`} className="text-sm">{t(`tn.kind.${kind}`, KIND_EN[kind])}
            <input className={field} dir="ltr" defaultValue={(d.routes.find((r) => r.kind === kind)?.terms ?? []).join(", ")} onChange={(e) => setD({ ...d, routes: [...d.routes.filter((r) => r.kind !== kind), { kind, terms: terms(e.target.value) }].sort((a, b) => ROUTE_KINDS.indexOf(a.kind) - ROUTE_KINDS.indexOf(b.kind)) })} disabled={!canEdit} />
          </label>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap items-end gap-3">
        <label className="min-w-[16rem] flex-1 text-sm">{t("tn.s.summary", "What did you change, and why?")}
          <input className={field} value={summary} maxLength={300} onChange={(e) => setSummary(e.target.value)} disabled={!canEdit} />
        </label>
        <button type="button" className={btnPrimary} disabled={!canEdit || !changed || !!busy} onClick={() => act("propose", { op: "propose", target: "retrieval", value: d, summary })}>{busy === "propose" ? t("tn.scoring", "Scoring…") : t("tn.s.propose", "Propose this version")}</button>
        <button type="button" className={btnGhost} disabled={!changed} onClick={() => { setD(pickConfig(active)); setRev(rev + 1); }}>{t("tn.s.discard", "Discard the draft")}</button>
      </div>
      {error && <p role="alert" className="mt-2 text-sm" style={{ color: "var(--color-v-nogo)" }}>{error}</p>}
      <p className="mt-2 text-xs text-ink-soft">{t("tn.s.scoring", "Proposing runs every question and every per-task eval twice, under the version in use and under the draft, and records both scores.")}</p>
    </section>
  );
}
