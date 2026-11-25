"use client";

import Link from "next/link";
import { useRef, type ReactNode } from "react";
import { countryHref } from "@/lib/un/country-context";
import { tr } from "@/lib/un/i18n/dict";
import ImportCsv from "./ImportCsv";
import { useLang } from "./Lang";
import { fill } from "./labels";
import { btnGhost } from "./ui";
import SopIntake, { type SopIntakeRow } from "./SopIntake";

export type SetupEntity = { name: string; hasGoals: boolean; goalsReady: boolean };

export default function SetupJourney({ country, countryReady, entities, entity, selectEntity, canEdit, cases, attached, existingIds, review, sopRows }: {
  country: string;
  countryReady: boolean;
  entities: SetupEntity[];
  entity: SetupEntity | undefined;
  selectEntity: (name: string) => void;
  canEdit: boolean;
  cases: number;
  attached: number;
  existingIds: string[];
  review: (missingSops: boolean) => void;
  sopRows: SopIntakeRow[];
}) {
  const lang = useLang();
  const dialog = useRef<HTMLDialogElement>(null);
  const goalsReady = !!entity?.goalsReady;
  const completed = [countryReady, goalsReady, cases > 0, cases > 0 && attached === cases];
  const next = completed.indexOf(false);
  const addEntityHref = countryHref("/admin/federal/goals?add=1#manage", country);
  const goalsHref = entity ? countryHref("/admin/federal/goals", country, entity.name) : addEntityHref;
  const actionClass = "inline-flex text-xs font-medium underline decoration-line underline-offset-4 hover:decoration-ink";
  const useCaseAction = <button type="button" className={actionClass} onClick={() => review(false)}>{tr(lang, "setup.review_cases", "Review use cases")}</button>;
  const importAction = canEdit && entity && <button type="button" className={actionClass} onClick={() => dialog.current?.showModal()}>
    {cases ? tr(lang, "setup.upload_more", "Upload more") : tr(lang, "setup.upload", "Upload use cases")}
  </button>;
  const steps: { title: string; detail: string; action?: ReactNode; blocker: string }[] = [
    {
      title: tr(lang, "setup.country", "Country setup"),
      detail: countryReady ? tr(lang, "setup.country_ready", "Rules and policy sources are ready.") : tr(lang, "setup.country_needed", "Set up the rules and policy knowledge base."),
      action: <Link className={actionClass} href={countryHref(canEdit ? "/admin/federal/country#manage" : "/admin/federal/country", country)}>{tr(lang, "setup.open_country", "Open country setup")}</Link>,
      blocker: tr(lang, "setup.block_country", "Waiting for country setup."),
    },
    {
      title: tr(lang, "setup.goals", "Entity goals and targets"),
      detail: goalsReady ? tr(lang, "setup.goals_ready", "Service goals have measurable targets.")
        : entity ? tr(lang, "setup.goals_needed", "Record a measurement and target for each goal.")
          : entities.length ? tr(lang, "setup.choose", "Choose an entity to see its progress.")
            : tr(lang, "setup.entity_needed", "Register an entity with measured service goals."),
      action: <><Link className={actionClass} href={goalsHref}>{!canEdit || goalsReady ? tr(lang, "setup.open_goals", "Review entity goals")
        : entity?.hasGoals ? tr(lang, "en.goals.missing_targets", "Add missing targets")
          : entity ? tr(lang, "en.goals.backfill", "Add goals and targets")
            : tr(lang, "en.add.h", "Add an entity")}</Link>
        {canEdit && entity && <Link className={actionClass} href={addEntityHref}>{tr(lang, "en.add.h", "Add an entity")}</Link>}</>,
      blocker: tr(lang, "setup.block_goals", "Waiting for measured entity goals."),
    },
    {
      title: tr(lang, "setup.upload", "Upload use cases"),
      detail: cases ? fill(tr(lang, "setup.case_count", "{n} registered"), { n: cases }) : tr(lang, "setup.cases_needed", "Add the entity’s use cases from a CSV."),
      action: <>{cases > 0 && useCaseAction}{importAction}</>,
      blocker: tr(lang, "setup.block_cases", "Waiting for use cases."),
    },
    {
      title: tr(lang, "intake.title", "SOP intake"),
      detail: fill(tr(lang, "setup.sop_count", "{a} of {n} SOPs attached"), { a: attached, n: cases }),
      action: <><SopIntake key={entity?.name} country={country} entity={entity?.name} rows={sopRows} canEdit={canEdit} /><button type="button" className={actionClass} onClick={() => review(attached < cases)}>
        {attached < cases ? tr(lang, "setup.review_missing", "Review missing SOPs") : tr(lang, "setup.review_sops", "Review SOPs")}
      </button></>,
      blocker: "",
    },
  ];
  return (
    <section aria-labelledby="setup-heading" id="setup-journey" className="min-w-0 rounded-xl border border-line bg-card px-4 py-3 desk:col-span-2 desk:px-3 desk:py-2">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 id="setup-heading" className="font-display text-xl font-medium desk:text-lg">{tr(lang, "setup.title", "Setup journey")}</h2>
        {entities.length > 0 && <label className="flex min-w-0 flex-wrap items-center gap-2 text-xs font-medium">
          {tr(lang, "setup.entity", "Journey entity")}
          <select value={entity?.name ?? ""} onChange={(event) => selectEntity(event.target.value)} className="max-w-full min-w-0 rounded-md border border-line bg-paper px-2 py-1.5 desk:py-1">
            {!entity && <option value="" disabled>{tr(lang, "setup.choose_entity", "Choose an entity")}</option>}
            {entities.map(({ name }) => <option key={name}>{name}</option>)}
          </select>
        </label>}
      </div>
      <ol className="mt-2 grid gap-2 md:grid-cols-4 md:gap-5">
        {steps.map((step, index) => {
          const current = index === next;
          const blocked = next !== -1 && index > next;
          return (
            <li key={step.title} aria-current={current ? "step" : undefined} className={`relative min-w-0 rounded-lg border px-2.5 py-2 ${current ? "border-lit bg-lit-soft/40" : "border-line bg-paper"}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                <h3 className="text-sm font-medium">{step.title}</h3>
                <span className={`text-xs ${current ? "font-medium text-lit-deep" : "text-ink-soft"}`}>{blocked ? tr(lang, "setup.blocked", "Blocked") : current ? tr(lang, "setup.next", "Next") : tr(lang, "setup.ready", "Ready")}</span>
              </div>
              <p className="mt-0.5 text-xs text-ink-soft">{blocked ? steps[next].blocker : step.detail}</p>
              {!blocked && <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">{step.action}</div>}
              {index < steps.length - 1 && <span aria-hidden="true" className="absolute top-1/2 hidden -translate-y-1/2 text-xs text-ink-soft md:-end-4 md:block rtl:rotate-180">→</span>}
            </li>
          );
        })}
      </ol>
      {canEdit && entity && <dialog ref={dialog} aria-labelledby="setup-import-title" className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-[44rem] rounded-xl border border-line bg-card p-4 text-ink backdrop:bg-ink/40">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="setup-import-title" className="font-display text-xl font-medium">{tr(lang, "setup.upload", "Upload use cases")}</h2>
            <p className="mt-1 text-sm text-ink-soft">{entity.name}</p>
          </div>
          <button type="button" className={btnGhost} onClick={() => dialog.current?.close()}>{tr(lang, "hdr.setup.close", "Close")}</button>
        </div>
        <ImportCsv key={entity.name} existingIds={existingIds} scope={{ country, entity: entity.name }} />
      </dialog>}
    </section>
  );
}
