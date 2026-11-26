"use client";

import { useState } from "react";
import { SKILL_LIMITS } from "@/lib/un/react-config";
import { btnGhost, btnPrimary, field } from "../_components/ui";
import { useAct, useT } from "./useTuning";

function Profile({ profile, base, active, canEdit }: { profile: string; base: string; active: { version: number; lines: string[] }; canEdit: boolean }) {
  const { t, tv } = useT();
  const { busy, error, act } = useAct();
  const [text, setText] = useState(active.lines.join("\n"));
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const changed = JSON.stringify(lines) !== JSON.stringify(active.lines);
  const tasks = [...base.matchAll(/^### (T\d{2})$/gm)].map((m) => m[1]);
  return (
    <div className="rounded-2xl border border-line bg-card p-5">
      <h3 className="text-base font-medium">{profile}</h3>
      <p className="mt-1 text-xs text-ink-soft">{tv("tn.k.tasks", "Tasks from the SOP, fixed: {t}. Rule lines in use: v{v}.", { t: tasks.join(", "), v: active.version })}</p>
      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-medium">{t("tn.k.base", "The skill as extracted from the SOP (read only)")}</summary>
        <pre className="mt-2 max-h-72 overflow-auto text-xs whitespace-pre-wrap text-ink-soft" dir="ltr">{base}</pre>
      </details>
      <label className="mt-4 block text-sm font-medium" htmlFor={`rules-${profile}`}>{t("tn.k.rules", "Tuned rule lines (one per line, appended after the SOP text)")}</label>
      <textarea id={`rules-${profile}`} className={`${field} min-h-28 font-mono text-xs`} dir="ltr" value={text} onChange={(e) => setText(e.target.value)} disabled={!canEdit} aria-describedby={`rules-note-${profile}`} />
      <p id={`rules-note-${profile}`} className="mt-1 text-xs text-ink-soft">{tv("tn.k.limits", "At most {n} lines of {c} characters. A line cannot be a heading: tasks and authority come from the SOP and stay in code.", { n: SKILL_LIMITS.lines, c: SKILL_LIMITS.length })}</p>
      <div className="mt-3 flex flex-wrap gap-3">
        <button type="button" className={btnPrimary} disabled={!canEdit || !changed || !!busy} onClick={() => act("p", { op: "propose", target: `skill:${profile}`, value: { lines }, summary: `Edited the rule lines of ${profile}` })}>{busy === "p" ? t("tn.scoring", "Scoring…") : t("tn.k.propose", "Propose these rule lines")}</button>
        <button type="button" className={btnGhost} disabled={!canEdit || !!busy} onClick={() => act("t", { op: "from_tuner", profile })}>{busy === "t" ? t("tn.scoring", "Scoring…") : t("tn.k.tuner", "Propose the rules the tuner suggests")}</button>
      </div>
      {error && <p role="alert" className="mt-2 text-sm" style={{ color: "var(--color-v-nogo)" }}>{error}</p>}
    </div>
  );
}

export default function SkillsPanel({ profiles, canEdit }: { profiles: { name: string; base: string; active: { version: number; lines: string[] } }[]; canEdit: boolean }) {
  const { t } = useT();
  return (
    <section id="skills" aria-labelledby="h-skills">
      <h2 id="h-skills" className="font-display text-2xl font-medium">{t("tn.k.title", "The agent's own instructions")}</h2>
      <p className="mt-2 max-w-[68ch] text-sm text-ink-soft">{t("tn.k.lede", "Each job profile's skill is copied from the SOP. You can add rule lines after it. Each change is a version a person approves, and it is scored by the per-task evals before and after.")}</p>
      <p className="mt-2 max-w-[68ch] rounded-xl border border-line p-3 text-sm">{t("tn.k.honest", "What these lines do today: the licence-renewal agent is a rule-based executor, not a language model, so it does not read free-text lines. Its behaviour changes through the settings above; the scores for a rule-line version will normally not move. The lines are read when a language-model reasoner is connected. The tuner's suggestions come from the simulated per-use-case optimiser.")}</p>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {profiles.map((p) => <Profile key={`${p.name}-${p.active.version}`} profile={p.name} base={p.base} active={p.active} canEdit={canEdit} />)}
      </div>
    </section>
  );
}
