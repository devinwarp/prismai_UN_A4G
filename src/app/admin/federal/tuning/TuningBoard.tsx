"use client";

import type { TuningState } from "@/lib/un/tuning-service";
import QuestionsPanel from "./QuestionsPanel";
import SettingsPanel from "./SettingsPanel";
import SkillsPanel from "./SkillsPanel";
import TasksPanel from "./TasksPanel";
import VersionsPanel from "./VersionsPanel";
import { useT } from "./useTuning";

export interface Profile { name: string; base: string; active: { version: number; lines: string[] } }

const NAV: [string, string, string][] = [["questions", "tn.nav.q", "Questions"], ["settings", "tn.nav.s", "Settings"], ["skills", "tn.nav.k", "Instructions"], ["tasks", "tn.nav.t", "Task evals"], ["versions", "tn.nav.v", "Versions"]];

export default function TuningBoard({ state, profiles, canEdit }: { state: TuningState; profiles: Profile[]; canEdit: boolean }) {
  const { t, tv } = useT();
  return (
    <>
      <p className="mt-4 max-w-[68ch] rounded-xl border border-line p-4 text-sm">
        <strong>{t("tn.honest.h", "What “tuning” means here.")}</strong>{" "}
        {t("tn.honest.b", "Editing instructions, rules and settings. No model weights are trained. Each change is a version, recorded in a hash-chained log, that a person approves before the agent uses it.")}
      </p>
      <details className="mt-3 max-w-[68ch] text-sm">
        <summary className="cursor-pointer font-medium">{t("tn.code.h", "What stays in code and cannot be tuned")}</summary>
        <ul className="mt-2 list-disc ps-5 text-ink-soft">
          <li>{t("tn.code.exits", "The two exits of the loop: a citation the loop itself checked, or the required outside-information request. There is no third ending.")}</li>
          <li>{t("tn.code.cite", "The citation check: a sentence must share terms with the question, at least one of them rare in the SOP, and a name the SOP never mentions cannot be answered.")}</li>
          <li>{t("tn.code.auth", "The agent's authority: which tasks a job profile may do, and that it refuses the rest and sends them to their owner.")}</li>
          <li>{t("tn.code.floors", "The floors and ranges of every setting, enforced when a version is proposed and again when it is approved.")}</li>
        </ul>
      </details>
      {!canEdit && <p className="mt-3 text-sm text-ink-soft">{t("tn.readonly", "Read only. Only an administrator can run, propose or approve.")}</p>}
      <p className="mt-4 text-sm" role="status">
        {tv("tn.status", "Agent uses settings v{v}. Chain {c}.", { v: state.retrieval.version, c: state.chain.ok ? t("tn.chain.ok", "verified") : t("tn.chain.bad", "BROKEN") })}
      </p>
      <nav aria-label={t("tn.nav", "On this page")} className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {NAV.map(([id, k, en]) => <a key={id} href={`#${id}`} className="underline">{t(k, en)}</a>)}
      </nav>
      <QuestionsPanel state={state} canEdit={canEdit} />
      <SettingsPanel key={state.retrieval.version} active={state.retrieval.config} version={state.retrieval.version} canEdit={canEdit} />
      <SkillsPanel profiles={profiles} canEdit={canEdit} />
      <TasksPanel state={state} canEdit={canEdit} />
      <VersionsPanel state={state} canEdit={canEdit} />
    </>
  );
}
