"use client";

import { countryHref } from "@/lib/un/country-context";

import Link, { useLinkStatus } from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { LangBar, T, TV, useLang } from "./_components/Lang";
import WorkIcon from "./_components/WorkIcon";
import type { Automation } from "@/lib/un/automation";
import { tr } from "@/lib/un/i18n/dict";
import { StartHere, Tour, TourButton, type StartStep, type TourStep } from "./_components/Coach";
import { JourneyLine } from "./_components/JourneyBar";
import type { Journey } from "@/lib/un/journey";
import { EntityStrip, QuadrantVerdictMatrix, StagePipeline, VerdictMix, type VerdictFilter } from "./_components/charts";
import { VerdictBadge, btnPrimary, field } from "./_components/ui";
import { fill, ltr, quadLabel, stageLabel, verdictHint, verdictName, VERDICT_META } from "./_components/labels";
import HeadlineBand from "./_components/HeadlineBand";
import SetupJourney, { type SetupEntity } from "./_components/SetupJourney";
import type { SopIntakeRow } from "./_components/SopIntake";
import Pop from "./_components/Pop";
import { RerunControl, type RerunUi } from "./_components/RerunButton";
import { RISK_FIELDS, type RiskField } from "@/lib/un/hitl";
import { STAGES, VERDICTS, type Dashboard, type Policy, type UnUseCaseState, type Verdict } from "@/lib/un/model";

const GO = [
  { href: "/admin/federal/tuning", k: "go.tune", en: "Tune the agent", hint: "Edit glossary, settings and rules as versions a person approves." },
  { href: "/admin/federal/scenarios", k: "go.scen", en: "Run a scenario", hint: "Watch evidence arrive, a decision form, a person sign." },
  { href: "/admin/federal/compare", k: "go.cmp", en: "Compare jurisdictions", hint: "Same processes, three rule sets. What changes?" },
  { href: "/admin/federal/kb", k: "go.kb", en: "Search the sources", hint: "Every claim cites a passage. Find it here." },
  { href: "/admin/federal/gates", k: "go.gates", en: "Gates and rule sets", hint: "The checks every verdict rests on, per rule set and per use case." },
  { href: "/admin/federal/outside", k: "go.outside", en: "Answer outside requests", hint: "Questions the SOP cannot answer wait here for a person." },
  { href: "/admin/federal/gaps", k: "go.gaps", en: "Read the gaps", hint: "Where today's rules fall short of agentic AI." },
];

// Phone and short windows only: the one-screen desktop has no page to jump around in.
const NAV: [string, string][] = [
  ["progress", "Progress"],
  ["portfolio", "Portfolio"],
  ["use-cases", "Use cases"],
];

const START: StartStep[] = [
  { n: 1, k: "start.1", en: "Run the staged scenario S1", hintK: "start.1h", hint: "Release evidence step by step and watch the decision change.", href: "/admin/federal/scenarios" },
  { n: 2, k: "start.2", en: "Sign it and try to tamper with the logbook", hintK: "start.2h", hint: "A person signs the decision. Then edit a copy and see the break caught.", href: "/admin/federal/scenarios" },
  { n: 3, k: "start.3", en: "Compare jurisdictions", hintK: "start.3h", hint: "Same processes under UAE, EU and Singapore rules: what changes?", href: "/admin/federal/compare" },
];
const TOUR: TourStep[] = [
  { target: "header", k: "tour.dash.header", title: "Country, re-run and people", body: "The country switch changes which country's rules and entities this dashboard shows. An admin can re-run the process at any time, and the people icon opens roles and approvers." },
  { target: "headline", k: "tour.dash.headline", title: "The story in one glance", body: "How much is running, how much is aligned, and how far that is from the federal target." },
  { target: "setup", k: "tour.dash.setup", title: "The setup journey", body: "Pick an entity and follow its steps in order: goals, SOPs, rules and a first decision. This is where an entity is configured; nothing else needs setting up elsewhere." },
  { target: "entry", k: "tour.dash.entry", title: "Where to go next", body: "Run a scenario to see a decision made, compare rule sets, search the sources, or read the gaps." },
  { target: "mix", k: "tour.dash.mix", title: "Which decisions were reached?", body: "Select a bar to filter the register. Colour is always paired with a symbol and a word." },
  { target: "stages", k: "tour.dash.stages", title: "Where each use case is in its life", body: "From idea to deployed. Stage is set by the engine, not by hand, so this count can be trusted." },
  { target: "entities", k: "tour.dash.entities", title: "Which entities are furthest along", body: "One card per entity with its deployed and aligned counts. Select a card to see only that entity." },
  { target: "filters", k: "tour.dash.filters", title: "Find a use case", body: "Search, or filter by entity, verdict and stage. Clear filters returns to the full register." },
  { target: "risk", k: "tour.dash.risk", title: "Risk levels and AI disclosure", body: "Client-facing, rights or fees, and irreversible are Yes/No switches in the register. People with permission can change them and save; each change is logged. AI disclosure is a rule on every use case that cannot be removed." },
  { target: "register", k: "tour.dash.register", title: "The register", body: "Every use case with its SOP, risk levels, stage, verdict, journey and alignment. The verdict comes only from a signed scenario run. Alignment is assumed for every use case until the Sijil attestation is integrated." },
  { target: "vkey", k: "tour.dash.vkey", title: "Reading a verdict", body: "The key explains each verdict in words, so a colour or symbol is never the only signal." },
];

const toolBtn = "inline-flex items-center justify-center gap-1.5 rounded-xl border border-line bg-paper px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:border-ink-soft desk:py-1.5";
const RISK_LABELS = {
  client_facing: ["risk.client", "Client-facing"],
  affects_rights: ["risk.rights", "Rights or fees"],
  irreversible: ["risk.irrev", "Irreversible"],
} as const;

function SopLinkStatus() {
  const { pending } = useLinkStatus();
  return (
    <span role="status" className={pending ? "block text-xs font-normal text-ink-soft" : "sr-only"}>
      {pending && <T k="pf.sop.opening" en="Opening SOP…" />}
    </span>
  );
}

export default function FederalPanel({
  lead, emptyState, policy, dashboard: d, useCases, canEdit, editableRisks, asOf, gatesAdded = {}, journeys = {}, work = {}, governanceAppointed = true, sops, intakeSummaries, rerun = {}, noTarget = false, countryId, hasLicenceDemo, canCompare, showFederalTools, countryReady, setupEntities, initialEntity,
}: {
  /** The rerun icon of each use case, by id (see page.tsx). */
  rerun?: Record<string, RerunUi>;
  /** The active country (the Policy form saves the UAE target on the organisation, any other country's in the country log). */
  countryId: string;
  hasLicenceDemo: boolean;
  canCompare: boolean;
  showFederalTools: boolean;
  countryReady: boolean;
  /** a country with entities needs a governance admin before its targets and test sets can be approved */
  governanceAppointed?: boolean;
  setupEntities: SetupEntity[];
  initialEntity: string;
  /** The page title and its one-line summary, drawn by the server page; sits at the left of the toolbar. */
  lead: ReactNode;
  /** Register guidance when there are no visible use cases in the active country. */
  emptyState?: ReactNode;
  /** The active country has no framework target recorded: the target, its progress and the policy form are not shown. */
  noTarget?: boolean;
  /** Gates each use case adds beyond its rule set, by ext id (gates.ts). */
  gatesAdded?: Record<string, number>;
  policy: Policy;
  dashboard: Dashboard;
  useCases: UnUseCaseState[];
  sops: Record<string, { id: string; sample: boolean }>;
  intakeSummaries: Record<string, SopIntakeRow["sop"]>;
  canEdit: boolean;
  editableRisks: string[];
  asOf: string;
  journeys?: Record<string, Journey>;
  /** Who is doing the work on each use case: people, an agent being set up, or an agent in production. */
  work?: Record<string, Automation>;
}) {
  const lang = useLang();
  const router = useRouter();
  const [risks, setRisks] = useState<Record<string, Partial<Record<RiskField, boolean>>>>({});
  const [riskSaving, setRiskSaving] = useState(false);
  const [riskResult, setRiskResult] = useState<{ text: string; error: boolean } | null>(null);
  const allowedRisks = new Set(editableRisks);
  const riskChanges = useCases.flatMap((uc) => {
    if (!risks[uc.id] || !allowedRisks.has(uc.id)) return [];
    const patch = Object.fromEntries(RISK_FIELDS.flatMap((key) => risks[uc.id][key] !== undefined && risks[uc.id][key] !== !!uc[key] ? [[key, risks[uc.id][key]]] : []));
    return Object.keys(patch).length ? [{ id: uc.id, code: uc.ext_id, patch }] : [];
  });
  const editRisk = (id: string, field: RiskField, checked: boolean) => {
    setRiskResult(null);
    setRisks((drafts) => ({ ...drafts, [id]: { ...drafts[id], [field]: checked } }));
  };
  async function saveRisks() {
    setRiskSaving(true);
    setRiskResult(null);
    const errors: string[] = [];
    const saved = new Set<string>();
    for (const row of riskChanges) {
      try {
        const res = await fetch(`/api/admin/un/use-cases/${row.id}/risk`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(row.patch) });
        const result = await res.json().catch(() => ({})) as { error?: string; audited?: boolean };
        if (!res.ok) throw new Error(result.error ?? tr(lang, "gt.failed", "The request failed."));
        saved.add(row.id);
        if (result.audited === false) errors.push(`${row.code} · ${tr(lang, "risk.audit_failed", "Saved, but the audit entry could not be written.")}`);
      } catch (error) {
        errors.push(`${row.code} · ${error instanceof Error ? error.message : tr(lang, "gt.failed", "The request failed.")}`);
      }
    }
    setRisks((drafts) => Object.fromEntries(Object.entries(drafts).filter(([id]) => !saved.has(id))));
    setRiskResult(errors.length ? { text: errors.join("\n"), error: true } : { text: tr(lang, "risk.saved", "Risk changes saved."), error: false });
    setRiskSaving(false);
    router.refresh();
  }
  const [tour, setTour] = useState(false);

  const [q, setQ] = useState("");
  const [entity, setEntity] = useState(initialEntity);
  const [missingSops, setMissingSops] = useState(false);
  const [verdict, setVerdict] = useState<VerdictFilter | "all">("all");
  const [stage, setStage] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return useCases.filter(
      (u) =>
        (!needle || `${u.ext_id} ${u.title} ${u.entity}`.toLowerCase().includes(needle)) &&
        (!entity || u.entity === entity) &&
        (!missingSops || !sops[u.id] || sops[u.id].sample) &&
        (!stage || u.stage === stage) &&
        (verdict === "all" || (verdict === "NONE" ? !u.verdict : u.verdict === verdict)),
    );
  }, [useCases, q, entity, verdict, stage, missingSops, sops]);
  const filtering = Boolean(q || entity || stage || missingSops || verdict !== "all");
  const setupEntity = setupEntities.find((entry) => entry.name === entity) ?? setupEntities[0];
  const entityChoices = showFederalTools ? setupEntities.map((entry) => entry.name) : d.byEntity.map((entry) => entry.key);
  const setupCases = useCases.filter((uc) => uc.entity === setupEntity?.name);
  const changeEntity = (name: string) => {
    setEntity(name);
    const url = new URL(window.location.href);
    if (name) url.searchParams.set("entity", name);
    else url.searchParams.delete("entity");
    window.history.replaceState(null, "", url);
  };
  const resetCaseFilters = () => { setQ(""); setStage(""); setVerdict("all"); setMissingSops(false); };
  const clear = () => { resetCaseFilters(); changeEntity(""); };
  const reviewSetup = (onlyMissing: boolean) => {
    resetCaseFilters();
    changeEntity(setupEntity?.name ?? "");
    setMissingSops(onlyMissing);
    const heading = document.getElementById("register-h");
    heading?.focus({ preventScroll: true });
    document.getElementById("use-cases")?.scrollIntoView({ block: "nearest" });
  };
  // On a phone the register is further down the page, so a pick scrolls to it; on the one-screen desktop it is already in view (and scrolling would shift the fixed layout).
  const pick = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    if (!window.matchMedia("(min-width: 80rem) and (min-height: 37.5rem)").matches) document.getElementById("use-cases")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const noVerdicts = d.total > 0 && useCases.every((u) => !u.verdict);
  const unproven = d.deployed - d.aligned;
  const story = noTarget
    ? tr(lang, "ua.pg.notarget", "No framework target is recorded for this country yet.")
    : noVerdicts
      ? tr(lang, "story.none", `None of the ${d.total} use cases has a decision yet. The target needs ${d.targetCount} deployed.`).replace("{n}", String(d.total)).replace("{t}", String(d.targetCount))
      : d.gap === 0
        ? tr(lang, "story.met", "The federal target is met.")
        : unproven > 0
          ? tr(lang, "story.unproven", `${d.deployed} use cases are running, but only ${d.aligned} are aligned. ${d.gap} more must be cleared to reach the target.`).replace("{a}", String(d.deployed)).replace("{b}", String(d.aligned)).replace("{g}", String(d.gap))
          : tr(lang, "story.gap", `${d.deployed} of ${d.targetCount} needed use cases are cleared to run.`).replace("{a}", String(d.deployed)).replace("{t}", String(d.targetCount));

  const hasStagedScenarios = showFederalTools && countryId === "UAE";
  const startSteps = START.filter((step) => step.k !== "start.3" || canCompare);
  const scopedHref = (href: string) => countryHref(href, countryId);
  const goLinks = (cols: string) => (
    <nav aria-label={tr(lang, "go.label", "Where to go")} className={`grid gap-x-8 gap-y-4 ${cols}`}>
      {GO.filter((g) => showFederalTools && (g.k === "go.cmp" ? canCompare : g.k === "go.tune" ? hasLicenceDemo : g.k !== "go.scen" || hasStagedScenarios)).map((g) => (
        <Link key={g.href} href={scopedHref(g.href)} className="group block">
          <p className="text-base font-medium underline decoration-line underline-offset-4 group-hover:decoration-ink">{tr(lang, g.k, g.en)} <span aria-hidden className="inline-block rtl:rotate-180">→</span></p>
          <p className="mt-0.5 text-sm text-ink-soft">{tr(lang, `${g.k}.h`, g.hint)}</p>
        </Link>
      ))}
    </nav>
  );
  const th = "font-normal px-2 desk:px-2";

  return (
    <div className={`mt-6 flex flex-col gap-10 desk:mt-0 desk:grid desk:min-h-0 desk:flex-1 desk:grid-cols-[clamp(24rem,28%,32rem)_minmax(0,1fr)] desk:gap-3 short:gap-2 ${showFederalTools ? "desk:grid-rows-[auto_auto_auto_minmax(0,1fr)]" : "desk:grid-rows-[auto_auto_minmax(0,1fr)]"}`}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 desk:col-span-2 desk:flex-nowrap desk:items-center">
        <div className="min-w-0">{lead}</div>
        <div className="flex flex-wrap items-center gap-2 desk:shrink-0 desk:flex-nowrap">
          {hasStagedScenarios && <Link href={scopedHref("/admin/federal/scenarios")} className={emptyState ? toolBtn : `${btnPrimary} desk:py-1.5`}>{noVerdicts ? tr(lang, "hl.cta_first", "Run scenario S1: see a decision made") : tr(lang, "hl.cta", "Run a staged scenario")} <span aria-hidden className="rtl:rotate-180">→</span></Link>}
          {showFederalTools && <Pop
            dataTour="entry"
            buttonClass={`${toolBtn} nodesk:hidden`}
            panelClass="w-[min(44rem,calc(100vw-2rem))]"
            label={<>{tr(lang, "go.label", "Where to go")} <span aria-hidden className="text-ink-soft">▾</span></>}
          >
            {goLinks("grid-cols-2")}
            {hasStagedScenarios && <div className="mt-4 border-t border-line pt-3">
              <button type="button" onClick={(e) => { e.currentTarget.closest<HTMLElement>("[popover]")?.hidePopover(); setTour(true); }} className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium hover:border-ink-soft">{tr(lang, "start.tour", "Take the tour")}</button>
            </div>}
          </Pop>}
          <LangBar />
        </div>
      </div>
      <nav aria-label={tr(lang, "ua.nav.aria", "On this page")} className="-mx-1 flex flex-wrap gap-1 text-sm desk:hidden">
        {NAV.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="rounded-full border border-line px-3 py-1 hover:border-ink-soft hover:bg-paper-deep"><T k={`nav.${id}`} en={label} /></a>
        ))}
        <span className="ms-auto"><TourButton onClick={() => setTour(true)} /></span>
      </nav>

      <div className="desk:col-span-2"><HeadlineBand d={d} policy={policy} noTarget={noTarget} asOf={asOf} story={story} /></div>

      {showFederalTools && <SetupJourney country={countryId} countryReady={countryReady} governanceAppointed={governanceAppointed} entities={setupEntities} entity={setupEntity}
        selectEntity={changeEntity} canEdit={canEdit} cases={setupCases.length} attached={setupCases.filter((uc) => sops[uc.id] && !sops[uc.id].sample).length}
        existingIds={setupCases.map((uc) => uc.ext_id)} review={reviewSetup}
        sopRows={setupCases.map((uc) => ({ id: uc.id, code: uc.ext_id, title: uc.title, frozen: uc.stage === "deployed", sop: intakeSummaries[uc.id] }))} />}

      <div className="flex flex-col gap-10 desk:hidden">
        {hasStagedScenarios && <StartHere steps={startSteps.map((step) => ({ ...step, href: scopedHref(step.href!) }))} onTour={() => setTour(true)} />}
        {showFederalTools && <div data-tour="entry" className="border-y border-line py-5">{goLinks("sm:grid-cols-2 lg:grid-cols-5")}</div>}
      </div>

      {/* The portfolio: how the decisions, the lifecycle and the four kinds of use case are spread. */}
      <section
        id="portfolio"
        aria-labelledby="portfolio-h"
        className="scroll-mt-4 rounded-2xl border border-line bg-card p-5 desk:flex desk:min-h-0 desk:flex-col desk:gap-2 desk:overflow-y-auto desk:p-3.5"
      >
        <h2 id="portfolio-h" className="font-display text-2xl font-medium tracking-tight desk:sr-only">{tr(lang, "pf.title", "Where do the use cases stand?")}</h2>
        <p className="mt-1 max-w-[68ch] text-sm leading-relaxed text-ink-soft desk:sr-only">{tr(lang, "pf.lede", "Select a bar, legend item or entity to filter the use-case table below.")}</p>
        <div data-tour="mix" className="relative mt-6 desk:mt-0">
          <h3 className="mb-3 text-base font-medium desk:mb-1.5 desk:pe-[4.75rem] desk:text-sm">{tr(lang, "pf.q.mix", "Which decisions have been reached?")}</h3>
          <VerdictMix useCases={useCases} active={verdict} onSelect={pick(setVerdict)} />
        </div>
        <div data-tour="stages" className="relative mt-8 desk:mt-0 desk:border-t desk:border-line desk:pt-2">
          <h3 id="portfolio-stages" className="mb-3 text-base font-medium desk:mb-1.5 desk:pe-[4.75rem] desk:text-sm">{tr(lang, "pf.q.stage", "Where in its life is each one?")}</h3>
          <StagePipeline byStage={d.byStage} />
        </div>
        <div className="mt-8 desk:mt-0 desk:border-t desk:border-line desk:pt-2">
          <h3 className="mb-3 text-base font-medium desk:mb-1.5 desk:text-sm">{tr(lang, "pf.q.qv", "Which kinds got which decision?")}</h3>
          <QuadrantVerdictMatrix useCases={useCases} tallies={d.byQuadrant} />
        </div>
      </section>

      {/* The register: entity filter chips, search and filters, then the table, which scrolls inside its own panel. */}
      <section
        id="use-cases"
        aria-labelledby="register-h"
        className="scroll-mt-4 desk:flex desk:min-h-0 desk:flex-col desk:gap-2.5"
      >
        <EntityStrip rows={d.byEntity} active={entity} onSelect={pick(changeEntity)} />

        <div data-tour="filters" className="mt-6 flex flex-wrap items-end gap-x-3 gap-y-2 desk:mt-0 desk:items-center desk:gap-x-2.5">
          <h2 id="register-h" tabIndex={-1} className="font-display me-auto text-2xl font-medium tracking-tight whitespace-nowrap desk:text-lg">
            {fill(tr(lang, "ua.reg.title", "Use cases ({n})"), { n: filtering ? fill(tr(lang, "ua.reg.nofm", "{a} of {b}"), { a: filtered.length, b: useCases.length }) : useCases.length })}
          </h2>
          <label className="min-w-48 flex-1 text-xs desk:flex desk:max-w-64 desk:flex-none desk:items-center desk:gap-1.5">
            <span className="font-medium desk:sr-only">{tr(lang, "ua.f.search", "Search")}</span>
            <input type="search" disabled={!d.total} value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr(lang, "ua.f.ph", "ID, title or entity")} className={`${field} desk:mt-0 desk:w-36 desk:py-1 desk:text-xs`} />
          </label>
          <label className="text-xs desk:flex desk:items-center desk:gap-1.5">
            <span className="font-medium">{tr(lang, "ua.f.entity", "Entity")}</span>
            <select disabled={!entityChoices.length} value={entity} onChange={(e) => changeEntity(e.target.value)} className={`${field} desk:mt-0 desk:w-28 desk:py-1 desk:text-xs`}>
              <option value="">{tr(lang, "ua.f.allent", "All entities")}</option>
              {entityChoices.map((name) => <option key={name}>{name}</option>)}
            </select>
          </label>
          <label className="text-xs desk:flex desk:items-center desk:gap-1.5">
            <span className="font-medium">{tr(lang, "ua.col.verdict", "Verdict")}</span>
            <select disabled={!d.total} value={verdict} onChange={(e) => setVerdict(e.target.value as VerdictFilter | "all")} className={`${field} desk:mt-0 desk:w-24 desk:px-2 desk:py-1 desk:text-xs`}>
              <option value="all">{tr(lang, "ua.f.anyv", "Any verdict")}</option>
              {VERDICTS.map((v) => <option key={v} value={v}>{lang === "ar" ? verdictName(lang, v) : v}</option>)}
              <option value="NONE">{tr(lang, "ua.mix.none", "Not assessed")}</option>
            </select>
          </label>
          <label className="text-xs desk:flex desk:items-center desk:gap-1.5">
            <span className="font-medium">{tr(lang, "ua.col.stage", "Stage")}</span>
            <select disabled={!d.total} value={stage} onChange={(e) => setStage(e.target.value)} className={`${field} desk:mt-0 desk:w-24 desk:px-2 desk:py-1 desk:text-xs`}>
              <option value="">{tr(lang, "ua.f.anystage", "Any stage")}</option>
              {STAGES.map((s) => <option key={s} value={s}>{stageLabel(lang, s)}</option>)}
            </select>
          </label>
          {missingSops && <span className="rounded border border-line px-2 py-1 text-xs">{tr(lang, "setup.missing_filter", "Missing SOPs only")}</span>}
          {filtering && <button type="button" onClick={clear} className="mb-1.5 text-xs font-medium whitespace-nowrap underline underline-offset-2 desk:mb-0">{tr(lang, "ua.f.clear", "Clear filters")}</button>}
          {/* One screen: the verdict key and the rule note open from this button, so the table keeps its height. */}
          <div className="hidden desk:block">
            <Pop
              dataTour="vkey"
              buttonClass="rounded-md border border-line bg-paper px-2.5 py-1 font-mono text-[11px] hover:border-ink-soft"
              panelClass="w-[min(34rem,calc(100vw-2rem))]"
              label={tr(lang, "dash.verdictkey", "Verdict key")}
            >
              <ul className="space-y-2 text-sm">
                {VERDICTS.map((v: Verdict) => (
                  <li key={v} className="flex gap-2">
                    <span aria-hidden className="w-4 shrink-0 text-center" style={{ color: VERDICT_META[v].color }}>{VERDICT_META[v].glyph}</span>
                    <span><span className="font-mono text-xs">{lang === "ar" ? verdictName(lang, v) : v.replace("_", " ")}</span> <span className="text-ink-soft">{verdictHint(lang, v)}</span></span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 border-t border-line pt-3 text-sm text-ink-soft">{tr(lang, "ua.reg.lede", "Stage and verdict are read from the database and cannot be edited here. The verdict comes only from a signed scenario run. Alignment is assumed for every use case until the Sijil attestation is integrated.")}</p>
            </Pop>
          </div>
        </div>
        <div data-tour="risk" className="mt-2 flex flex-wrap items-center gap-2 text-xs desk:mt-0">
          <p className="text-ink-soft">{tr(lang, "risk.disclosure", "AI disclosure is required for internal and external outputs.")}</p>
          {riskChanges.length > 0 && <button type="button" className={`${btnPrimary} py-1 text-xs`} disabled={riskSaving} onClick={() => void saveRisks()}>
            {riskSaving ? tr(lang, "ua.saving", "Saving…") : tr(lang, "risk.save", "Save risk changes")}
          </button>}
          {riskResult && <p role={riskResult.error ? "alert" : "status"} className={`whitespace-pre-line ${riskResult.error ? "text-ember" : "text-lit-deep"}`}>{riskResult.text}</p>}
        </div>
        <p className="mt-3 max-w-[68ch] text-sm leading-relaxed text-ink-soft desk:hidden">{tr(lang, "ua.reg.lede", "Stage and verdict are read from the database and cannot be edited here. The verdict comes only from a signed scenario run. Alignment is assumed for every use case until the Sijil attestation is integrated.")}</p>

        {noVerdicts && (
          <p className="mt-4 max-w-[68ch] rounded-xl border border-dashed border-line p-3 text-sm text-ink-soft desk:mt-0 desk:max-w-none desk:px-2.5 desk:py-1 desk:text-xs">
            {tr(lang, "reg.none", "No use case has a decision yet. A decision appears only after a scenario run is signed by a person.")}{" "}
            {hasStagedScenarios && <Link href={scopedHref("/admin/federal/scenarios")} className="font-medium text-ink underline underline-offset-2">{tr(lang, "reg.none_cta", "Run one now")}</Link>}
          </p>
        )}
        <div data-tour="register" className="relative mt-4 max-h-[34rem] overflow-auto rounded-2xl border border-line bg-card desk:mt-0 desk:max-h-none desk:min-h-0 desk:flex-1">
          <table className="w-full min-w-[60rem] text-sm desk:min-w-[57rem] desk:text-[13px]">
            <caption className="sr-only">{tr(lang, "ua.reg.cap", "Use cases with stage, verdict and alignment")}</caption>
            <thead className="sticky top-0 z-10 bg-card text-start font-mono text-[11px] tracking-wide text-ink-soft uppercase shadow-[0_1px_0_var(--color-line)]">
              <tr>
                <th scope="col" className="px-4 py-3 font-normal desk:ps-3 desk:py-2">{tr(lang, "ua.col.id", "ID")}</th>
                <th scope="col" className={th}>{tr(lang, "ua.col.uc", "Use case")}</th>
                <th scope="col" className={th}>{tr(lang, "ua.col.sop", "SOP")}</th>
                <th scope="col" className={th}>{tr(lang, "ua.col.quad", "Quadrant")}</th>
                {RISK_FIELDS.map((field) => <th key={field} scope="col" className={`${th} whitespace-nowrap text-center`}>{tr(lang, RISK_LABELS[field][0], RISK_LABELS[field][1])}</th>)}
                <th scope="col" className={th}>{tr(lang, "ua.col.stage", "Stage")}</th>
                <th scope="col" className={`${th} min-w-[7.5rem]`}>{tr(lang, "wk.col", "Work by")}</th>
                <th scope="col" className={th}>{tr(lang, "ua.col.verdict", "Verdict")}</th>
                <th scope="col" className={th}><T k="jb.col" en="Journey" /></th>
                <th scope="col" className="px-2 text-center font-normal">{tr(lang, "hl.compliant", "Aligned")}</th>
                <th scope="col" className="px-2 pe-4 text-center font-normal desk:pe-3">{tr(lang, "rr.col", "Rerun")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => {
                const sop = sops[u.id];
                const sopPath = `/admin/federal/use-cases/${u.id}/sop`;
                return (
                <tr key={u.id} className="border-t border-line align-middle hover:bg-paper-deep/50">
                  <td className="px-4 py-2.5 font-mono text-xs whitespace-nowrap desk:ps-3 desk:py-1.5"><bdi dir="ltr">{u.ext_id}</bdi></td>
                  <td className="max-w-44 px-2 py-2.5 sm:max-w-80 desk:max-w-64 desk:py-1.5">
                    <Link href={`/admin/federal/use-cases/${u.id}`} className="font-medium underline decoration-line underline-offset-2 hover:decoration-ink">{u.title}</Link>
                    <span className="block text-xs text-ink-soft">{u.entity}</span>
                  </td>
                  <td className="max-w-28 px-2">
                    {sop && !(missingSops && sop.sample && canEdit && u.stage !== "deployed") ? (
                      <Link href={scopedHref("/admin/federal/sop/" + u.id)} className="font-medium break-words underline decoration-line underline-offset-2 hover:decoration-ink">
                        <bdi dir="ltr">{sop.id}</bdi>
                        {sop.sample && <span className="block text-xs text-ink-soft">{tr(lang, "ua.reg.sop.sample", "Sample")}</span>}
                        <SopLinkStatus />
                      </Link>
                    ) : canEdit && u.stage !== "deployed" ? (
                      <Link href={`${sopPath}#sop-setup`} className="inline-flex min-h-8 items-center rounded-md bg-ink px-2.5 py-1 text-xs font-medium whitespace-nowrap text-paper transition-opacity hover:opacity-90">
                        {tr(lang, "ua.reg.sop.start", "Start here")}<bdi dir="ltr" className="sr-only"> {u.ext_id}</bdi>
                      </Link>
                    ) : <span className="text-xs text-ink-soft">{tr(lang, "ua.reg.sop.none", "No SOP")}</span>}
                  </td>
                  <td className="px-2 whitespace-nowrap">
                    {quadLabel(lang, u.quadrant)}
                  </td>
                  {RISK_FIELDS.map((field) => {
                    const checked = risks[u.id]?.[field] ?? !!u[field];
                    const value = checked ? tr(lang, "risk.yes", "Yes") : tr(lang, "risk.no", "No");
                    return <td key={field} className="px-2 text-center text-xs">
                      {allowedRisks.has(u.id) ? <button type="button" role="switch" aria-checked={checked}
                        aria-label={`${u.ext_id} ${tr(lang, RISK_LABELS[field][0], RISK_LABELS[field][1])}`} disabled={riskSaving}
                        onClick={() => editRisk(u.id, field, !checked)}
                        className={`min-w-11 rounded-full border px-2 py-1 ${checked ? "border-lit bg-lit-soft text-lit-deep" : "border-line bg-paper text-ink-soft"}`}>{value}</button> : value}
                    </td>;
                  })}
                  <td className="px-2">
                    <span className="inline-flex items-center rounded-md border border-line px-2 py-0.5 font-mono text-[11px]">{stageLabel(lang, u.stage)}</span>
                  </td>
                  <td className="min-w-[7.5rem] px-2"><WorkIcon kind={work[u.id] ?? "human"} compact /></td>
                  <td className="px-2">
                    <VerdictBadge verdict={u.verdict} />
                    {(gatesAdded[u.ext_id] ?? 0) > 0 && (
                      <span className="mt-1 block font-mono text-[11px] text-ink-soft desk:mt-0.5" title={tr(lang, "gt.added.h", "Judged under more gates than the shipped rule set; read older figures with care.")}>
                        <span aria-hidden>+ </span><TV k="gt.added" en="{n} gates added" one="1 gate added" v={{ n: gatesAdded[u.ext_id] }} />
                      </span>
                    )}
                  </td>
                  <td className="px-2 whitespace-nowrap">{journeys[u.id] ? <JourneyLine journey={journeys[u.id]} compact /> : null}</td>
                  <td className="px-2 text-center">
                    <span aria-label={fill(tr(lang, "ua.row.compl", "Aligned {id}: {yn}"), { id: ltr(u.ext_id), yn: u.compliant ? tr(lang, "ua.yes", "yes") : tr(lang, "ua.no", "no") })} title={tr(lang, "ua.row.compl.h", "Assumed until the Sijil attestation is integrated")}>{u.compliant ? "✓" : "–"}</span>
                  </td>
                  <td className="px-2 pe-4 text-center desk:pe-3">{rerun[u.id] ? <RerunControl ucId={u.id} ext={u.ext_id} ui={rerun[u.id]} /> : null}</td>
                </tr>
                );
              })}
              {!filtered.length && !emptyState && (
                <tr><td colSpan={12} className="px-4 py-10 text-center text-ink-soft">
                  {useCases.length ? <>{noVerdicts && !filtering ? null : <>{tr(lang, "ua.reg.nomatch", "No use case matches.")} <button type="button" onClick={clear} className="font-medium underline">{tr(lang, "ua.f.clear", "Clear filters")}</button></>}</> : <>{tr(lang, "ua.reg.empty", "No use cases yet. Import a CSV below (a sample is in")} <bdi dir="ltr">data/un-use-cases.csv</bdi>{tr(lang, "ua.reg.empty2", ").")}</>}
                </td></tr>
              )}
            </tbody>
          </table>
          {emptyState}
        </div>

        {/* Verdict key: written out on a phone (the button for it sits in the filter row on the one-screen desktop). */}
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-ink-soft desk:hidden">
          {VERDICTS.map((v) => <span key={v}><span aria-hidden style={{ color: VERDICT_META[v].color }}>{VERDICT_META[v].glyph}</span> {lang === "ar" ? verdictName(lang, v) : v.replace("_", " ")}: {verdictHint(lang, v)}</span>)}
        </p>
      </section>
      <Tour steps={TOUR} open={tour} onClose={() => setTour(false)} />
    </div>
  );
}
