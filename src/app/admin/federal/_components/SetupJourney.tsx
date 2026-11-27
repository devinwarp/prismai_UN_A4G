"use client";

import Link from "next/link";
import { countryHref } from "@/lib/un/country-context";
import { setupProgress, type SetupStepId } from "@/lib/un/setup-progress";
import { tr } from "@/lib/un/i18n/dict";
import { useLang } from "./Lang";
import { SetupBar, StateIcon } from "./SetupSection";
import { btnPrimary } from "./ui";

/** An entity on the dashboard's setup strip: whether its goals carry measures, and how many of its use cases have an approved set of process targets. */
export type SetupEntity = { name: string; hasGoals: boolean; goalsReady: boolean; targetsApproved: number };

/** The five setup steps and how far the chosen entity has got. The inputs themselves are on the setup page: each step here links to its section. */
export default function SetupJourney({ country, countryReady, policyReady = true, governanceAppointed = true, entities, entity, selectEntity, canEdit, cases, attached }: {
  country: string;
  countryReady: boolean;
  /** the country has a policy target (the UAE always does) */
  policyReady?: boolean;
  /** a country with entities needs a governance admin: until one is appointed the country step is not done */
  governanceAppointed?: boolean;
  entities: SetupEntity[];
  entity: SetupEntity | undefined;
  selectEntity: (name: string) => void;
  canEdit: boolean;
  cases: number;
  attached: number;
}) {
  const lang = useLang();
  const progress = setupProgress({
    countryReady, policyReady, governanceAppointed, goalsReady: !!entity?.goalsReady, cases,
    targetsApproved: entity?.targetsApproved ?? 0, targetsProposed: 0, attached,
  });
  const href = (id: SetupStepId) => countryHref(`/admin/federal/setup?step=${id}#step-${id}`, country, entity?.name);
  const counts: Partial<Record<SetupStepId, string>> = {};
  for (const s of progress.steps) if (s.count && cases) counts[s.id] = `${s.count.done}/${s.count.of}`;
  return (
    <section aria-labelledby="setup-heading" id="setup-journey" data-tour="setup" className={`min-w-0 rounded-xl border bg-card px-4 py-3 desk:col-span-2 desk:px-3 desk:py-2 ${progress.done === progress.steps.length ? "border-lit" : "border-line"}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 id="setup-heading" className="font-display text-xl font-medium desk:text-lg">{tr(lang, "setup.title", "Setup journey")}</h2>
          {progress.done === progress.steps.length && <span className="inline-flex items-center gap-1.5 text-sm font-medium text-lit-deep"><StateIcon state="done" />{tr(lang, "su.complete", "Setup complete")}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {entities.length > 0 && <label className="flex min-w-0 flex-wrap items-center gap-2 text-xs font-medium">
            {tr(lang, "setup.entity", "Journey entity")}
            <select value={entity?.name ?? ""} onChange={(event) => selectEntity(event.target.value)} className="max-w-full min-w-0 rounded-md border border-line bg-paper px-2 py-1.5 desk:py-1">
              {!entity && <option value="" disabled>{tr(lang, "setup.choose_entity", "Choose an entity")}</option>}
              {entities.map(({ name }) => <option key={name}>{name}</option>)}
            </select>
          </label>}
          {canEdit && <Link className={`${btnPrimary} desk:py-1`} href={progress.next ? href(progress.next) : countryHref("/admin/federal/setup", country, entity?.name)}>
            {progress.next ? tr(lang, "su.continue", "Continue setup") : tr(lang, "su.review", "Review setup")} <span aria-hidden className="rtl:rotate-180">→</span>
          </Link>}
        </div>
      </div>
      <div className="mt-2"><SetupBar progress={progress} counts={counts} hrefFor={href} dense /></div>
    </section>
  );
}
