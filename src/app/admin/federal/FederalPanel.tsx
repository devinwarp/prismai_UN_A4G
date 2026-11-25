"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { LangBar, T, TV, useLang } from "./_components/Lang";
import { tr } from "@/lib/un/i18n/dict";
import { StartHere, Tour, TourButton, type StartStep, type TourStep } from "./_components/Coach";
import { JourneyLine } from "./_components/JourneyBar";
import type { Journey } from "@/lib/un/journey";
import { EntityStrip, QuadrantVerdictMatrix, StagePipeline, VerdictMix, type VerdictFilter } from "./_components/charts";
import { VerdictBadge, btnPrimary, field } from "./_components/ui";
import { fill, ltr, quadLabel, stageLabel, verdictHint, verdictName, VERDICT_META } from "./_components/labels";
import HeadlineBand from "./_components/HeadlineBand";
import ConfigDrawer from "./_components/ConfigDrawer";
import Pop from "./_components/Pop";
import { RerunControl, type RerunUi } from "./_components/RerunButton";
import type { HitlConfig } from "@/lib/un/hitl";
import { STAGES, VERDICTS, type Dashboard, type Policy, type UnUseCaseState, type Verdict } from "@/lib/un/model";

const GO = [
  { href: "/admin/federal/sop", k: "go.sop", en: "Start from a procedure", hint: "Read a SOP, see what could be automated and what it risks." },
  { href: "/admin/federal/tuning", k: "go.tune", en: "Tune the agent", hint: "Edit glossary, settings and rules as versions a person approves." },
  { href: "/admin/federal/scenarios", k: "go.scen", en: "Run a scenario", hint: "Watch evidence arrive, a decision form, a person sign." },
  { href: "/admin/federal/compare", k: "go.cmp", en: "Compare jurisdictions", hint: "Same processes, three rule sets. What changes?" },
  { href: "/admin/federal/kb", k: "go.kb", en: "Search the sources", hint: "Every claim cites a passage. Find it here." },
  { href: "/admin/federal/gates", k: "go.gates", en: "Gates and rule sets", hint: "The checks every verdict rests on, per rule set and per use case." },
  { href: "/admin/federal/country", k: "go.country", en: "Country and knowledge base", hint: "Switch country, add a policy, add a company and its SOP." },
  { href: "/admin/federal/outside", k: "go.outside", en: "Answer outside requests", hint: "Questions the SOP cannot answer wait here for a person." },
  { href: "/admin/federal/goals", k: "go.goals", en: "Entity goals and targets", hint: "What each entity wants, and what each use case commits to deliver." },
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
  { target: "headline", k: "tour.dash.headline", title: "The story in one glance", body: "How much is running, how much is provably compliant, and how far that is from the federal target." },
  { target: "entry", k: "tour.dash.entry", title: "Where to go next", body: "Run a scenario to see a decision made, compare rule sets, search the sources, or read the gaps." },
  { target: "mix", k: "tour.dash.mix", title: "Which decisions were reached?", body: "Select a bar to filter the register below. Colour is always paired with a symbol and a word." },
];

const toolBtn = "inline-flex items-center justify-center gap-1.5 rounded-xl border border-line bg-paper px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:border-ink-soft desk:py-1.5";

export default function FederalPanel({
  lead, policy, dashboard: d, useCases, canEdit, hitl, asOf, gatesAdded = {}, journeys = {}, rerun = {}, noTarget = false, countryId,
}: {
  /** The rerun icon of each use case, by id (see page.tsx). */
  rerun?: Record<string, RerunUi>;
  /** The active country (the Policy form saves the UAE target on the organisation, any other country's in the country log). */
  countryId: string;
  /** The page title and its one-line summary, drawn by the server page; sits at the left of the toolbar. */
  lead: ReactNode;
  /** The active country has no framework target recorded: the target, its progress and the policy form are not shown. */
  noTarget?: boolean;
  /** Gates each use case adds beyond its rule set, by ext id (gates.ts). */
  gatesAdded?: Record<string, number>;
  policy: Policy;
  dashboard: Dashboard;
  useCases: UnUseCaseState[];
  canEdit: boolean;
  hitl: HitlConfig;
  asOf: string;
  journeys?: Record<string, Journey>;
}) {
  const lang = useLang();
  const [tour, setTour] = useState(false);

  const [q, setQ] = useState("");
  const [entity, setEntity] = useState("");
  const [verdict, setVerdict] = useState<VerdictFilter | "all">("all");
  const [stage, setStage] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return useCases.filter(
      (u) =>
        (!needle || `${u.ext_id} ${u.title} ${u.entity}`.toLowerCase().includes(needle)) &&
        (!entity || u.entity === entity) &&
        (!stage || u.stage === stage) &&
        (verdict === "all" || (verdict === "NONE" ? !u.verdict : u.verdict === verdict)),
    );
  }, [useCases, q, entity, verdict, stage]);
  const filtering = Boolean(q || entity || stage || verdict !== "all");
  const clear = () => { setQ(""); setEntity(""); setStage(""); setVerdict("all"); };
  // On a phone the register is further down the page, so a pick scrolls to it; on the one-screen desktop it is already in view (and scrolling would shift the fixed layout).
  const pick = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    if (!window.matchMedia("(min-width: 80rem) and (min-height: 37.5rem)").matches) document.getElementById("use-cases")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const noVerdicts = d.total > 0 && useCases.every((u) => !u.verdict);
  const unproven = d.deployed - d.compliant;
  const story = noVerdicts
    ? tr(lang, "story.none", `None of the ${d.total} use cases has a decision yet. The target needs ${d.targetCount} deployed.`).replace("{n}", String(d.total)).replace("{t}", String(d.targetCount))
    : d.gap === 0
      ? tr(lang, "story.met", "The federal target is met.")
      : unproven > 0
        ? tr(lang, "story.unproven", `${d.deployed} use cases are running, but only ${d.compliant} are proven compliant. ${d.gap} more must be cleared to reach the target.`).replace("{a}", String(d.deployed)).replace("{b}", String(d.compliant)).replace("{g}", String(d.gap))
        : tr(lang, "story.gap", `${d.deployed} of ${d.targetCount} needed use cases are cleared to run.`).replace("{a}", String(d.deployed)).replace("{t}", String(d.targetCount));

  const goLinks = (cols: string) => (
    <nav aria-label={tr(lang, "go.label", "Where to go")} className={`grid gap-x-8 gap-y-4 ${cols}`}>
      {GO.map((g) => (
        <Link key={g.href} href={g.href} className="group block">
          <p className="text-base font-medium underline decoration-line underline-offset-4 group-hover:decoration-ink">{tr(lang, g.k, g.en)} <span aria-hidden className="inline-block rtl:rotate-180">→</span></p>
          <p className="mt-0.5 text-sm text-ink-soft">{tr(lang, `${g.k}.h`, g.hint)}</p>
        </Link>
      ))}
    </nav>
  );
  const th = "font-normal px-2 desk:px-2";

  return (
    <div className="mt-6 flex flex-col gap-10 desk:mt-0 desk:grid desk:min-h-0 desk:flex-1 desk:grid-cols-[22rem_minmax(0,1fr)] desk:grid-rows-[auto_auto_minmax(0,1fr)] desk:gap-3 short:gap-2">
      {/* Toolbar: title and summary at the start; the actions at the end. */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 desk:col-span-2 desk:flex-nowrap desk:items-center">
        <div className="min-w-0">{lead}</div>
        <div className="flex flex-wrap items-center gap-2 desk:shrink-0 desk:flex-nowrap">
          <Link href="/admin/federal/scenarios" className={`${btnPrimary} desk:py-1.5`}>{noVerdicts ? tr(lang, "hl.cta_first", "Run scenario S1: see a decision made") : tr(lang, "hl.cta", "Run a staged scenario")} <span aria-hidden className="rtl:rotate-180">→</span></Link>
          <Pop
            dataTour="entry"
            buttonClass={`${toolBtn} nodesk:hidden`}
            panelClass="w-[min(44rem,calc(100vw-2rem))]"
            label={<>{tr(lang, "go.label", "Where to go")} <span aria-hidden className="text-ink-soft">▾</span></>}
          >
            {goLinks("grid-cols-2")}
            <div className="mt-4 border-t border-line pt-3">
              <p className="font-display text-lg font-medium">{tr(lang, "start.title", "Start here: three steps, about two minutes")}</p>
              <ol className="mt-2 grid grid-cols-3 gap-4">
                {START.map((s) => (
                  <li key={s.n} className="flex gap-2.5">
                    <span aria-hidden className="font-display text-3xl leading-none text-lit tabular-nums">{s.n}</span>
                    <div className="min-w-0">
                      <Link href={s.href!} className="text-sm font-medium underline decoration-line underline-offset-4 hover:decoration-ink">{tr(lang, s.k, s.en)} →</Link>
                      <p className="mt-0.5 text-xs text-ink-soft">{tr(lang, s.hintK, s.hint)}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <button type="button" onClick={(e) => { e.currentTarget.closest<HTMLElement>("[popover]")?.hidePopover(); setTour(true); }} className="mt-3 rounded-lg border border-line px-3 py-1.5 text-sm font-medium hover:border-ink-soft">{tr(lang, "start.tour", "Take the tour")}</button>
            </div>
          </Pop>
          <ConfigDrawer key={countryId} policy={policy} canEdit={canEdit} noTarget={noTarget} countryId={countryId} hitl={hitl} useCases={useCases} entities={d.byEntity.map((t) => t.key)} buttonClass={toolBtn} />
          <LangBar />
        </div>
      </div>

      <nav aria-label={tr(lang, "ua.nav.aria", "On this page")} className="-mx-1 flex flex-wrap gap-1 text-sm desk:hidden">
        {NAV.filter(([id]) => !(noTarget && id === "progress")).map(([id, label]) => (
          <a key={id} href={`#${id}`} className="rounded-full border border-line px-3 py-1 hover:border-ink-soft hover:bg-paper-deep"><T k={`nav.${id}`} en={label} /></a>
        ))}
        <span className="ms-auto"><TourButton onClick={() => setTour(true)} /></span>
      </nav>

      <div className="desk:col-span-2"><HeadlineBand d={d} policy={policy} noTarget={noTarget} asOf={asOf} story={story} /></div>

      <div className="flex flex-col gap-10 desk:hidden">
        <StartHere steps={START} onTour={() => setTour(true)} />
        <div data-tour="entry" className="border-y border-line py-5">{goLinks("sm:grid-cols-2 lg:grid-cols-5")}</div>
      </div>

      {/* The portfolio: how the decisions, the lifecycle and the four kinds of use case are spread. */}
      <section
        id="portfolio"
        aria-labelledby="portfolio-h"
        className="scroll-mt-4 rounded-2xl border border-line bg-card p-5 desk:flex desk:min-h-0 desk:flex-col desk:gap-2.5 desk:overflow-y-auto desk:p-3.5"
      >
        <h2 id="portfolio-h" className="font-display text-2xl font-medium tracking-tight desk:sr-only">{tr(lang, "pf.title", "Where do the use cases stand?")}</h2>
        <p className="mt-1 max-w-[68ch] text-sm leading-relaxed text-ink-soft desk:sr-only">{tr(lang, "pf.lede", "Select a bar, legend item or entity to filter the use-case table below.")}</p>
        <div data-tour="mix" className="relative mt-6 desk:mt-0">
          <h3 className="mb-3 text-base font-medium desk:mb-1.5 desk:pe-[4.75rem] desk:text-sm">{tr(lang, "pf.q.mix", "Which decisions have been reached?")}</h3>
          <VerdictMix useCases={useCases} active={verdict} onSelect={pick(setVerdict)} />
        </div>
        <div className="relative mt-8 desk:mt-0 desk:border-t desk:border-line desk:pt-2.5">
          <h3 className="mb-3 text-base font-medium desk:mb-1.5 desk:pe-[4.75rem] desk:text-sm">{tr(lang, "pf.q.stage", "Where in its life is each one?")}</h3>
          <StagePipeline byStage={d.byStage} />
        </div>
        <div className="mt-8 desk:mt-0 desk:border-t desk:border-line desk:pt-2.5">
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
        <EntityStrip rows={d.byEntity} active={entity} onSelect={pick(setEntity)} />

        <div className="mt-6 flex flex-wrap items-end gap-x-3 gap-y-2 desk:mt-0 desk:items-center desk:gap-x-2.5">
          <h2 id="register-h" className="font-display me-auto text-2xl font-medium tracking-tight whitespace-nowrap desk:text-lg">
            {fill(tr(lang, "ua.reg.title", "Use cases ({n})"), { n: filtering ? fill(tr(lang, "ua.reg.nofm", "{a} of {b}"), { a: filtered.length, b: useCases.length }) : useCases.length })}
          </h2>
          <label className="min-w-48 flex-1 text-xs desk:flex desk:max-w-64 desk:flex-none desk:items-center desk:gap-1.5">
            <span className="font-medium desk:sr-only">{tr(lang, "ua.f.search", "Search")}</span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr(lang, "ua.f.ph", "ID, title or entity")} className={`${field} desk:mt-0 desk:w-36 desk:py-1 desk:text-xs`} />
          </label>
          <label className="text-xs desk:flex desk:items-center desk:gap-1.5">
            <span className="font-medium">{tr(lang, "ua.f.entity", "Entity")}</span>
            <select value={entity} onChange={(e) => setEntity(e.target.value)} className={`${field} desk:mt-0 desk:w-28 desk:py-1 desk:text-xs`}>
              <option value="">{tr(lang, "ua.f.allent", "All entities")}</option>
              {d.byEntity.map((t) => <option key={t.key}>{t.key}</option>)}
            </select>
          </label>
          <label className="text-xs desk:flex desk:items-center desk:gap-1.5">
            <span className="font-medium">{tr(lang, "ua.col.verdict", "Verdict")}</span>
            <select value={verdict} onChange={(e) => setVerdict(e.target.value as VerdictFilter | "all")} className={`${field} desk:mt-0 desk:w-24 desk:px-2 desk:py-1 desk:text-xs`}>
              <option value="all">{tr(lang, "ua.f.anyv", "Any verdict")}</option>
              {VERDICTS.map((v) => <option key={v} value={v}>{lang === "ar" ? verdictName(lang, v) : v}</option>)}
              <option value="NONE">{tr(lang, "ua.mix.none", "Not assessed")}</option>
            </select>
          </label>
          <label className="text-xs desk:flex desk:items-center desk:gap-1.5">
            <span className="font-medium">{tr(lang, "ua.col.stage", "Stage")}</span>
            <select value={stage} onChange={(e) => setStage(e.target.value)} className={`${field} desk:mt-0 desk:w-24 desk:px-2 desk:py-1 desk:text-xs`}>
              <option value="">{tr(lang, "ua.f.anystage", "Any stage")}</option>
              {STAGES.map((s) => <option key={s} value={s}>{stageLabel(lang, s)}</option>)}
            </select>
          </label>
          {filtering && <button type="button" onClick={clear} className="mb-1.5 text-xs font-medium whitespace-nowrap underline underline-offset-2 desk:mb-0">{tr(lang, "ua.f.clear", "Clear filters")}</button>}
          {/* One screen: the verdict key and the rule note open from this button, so the table keeps its height. */}
          <div className="hidden desk:block">
            <Pop
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
              <p className="mt-3 border-t border-line pt-3 text-sm text-ink-soft">{tr(lang, "ua.reg.lede", "Stage, verdict and compliance are read from the database and cannot be edited here. The verdict comes only from a signed scenario run and compliance only from a passing Sijil attestation.")}</p>
            </Pop>
          </div>
        </div>
        <p className="mt-3 max-w-[68ch] text-sm leading-relaxed text-ink-soft desk:hidden">{tr(lang, "ua.reg.lede", "Stage, verdict and compliance are read from the database and cannot be edited here. The verdict comes only from a signed scenario run and compliance only from a passing Sijil attestation.")}</p>

        {noVerdicts && (
          <p className="mt-4 max-w-[68ch] rounded-xl border border-dashed border-line p-3 text-sm text-ink-soft desk:mt-0 desk:max-w-none desk:px-2.5 desk:py-1 desk:text-xs">
            {tr(lang, "reg.none", "No use case has a decision yet. A decision appears only after a scenario run is signed by a person.")}{" "}
            <Link href="/admin/federal/scenarios" className="font-medium text-ink underline underline-offset-2">{tr(lang, "reg.none_cta", "Run one now")}</Link>
          </p>
        )}
        <div className="relative mt-4 max-h-[34rem] overflow-auto rounded-2xl border border-line bg-card desk:mt-0 desk:max-h-none desk:min-h-0 desk:flex-1">
          <table className="w-full min-w-[60rem] text-sm desk:min-w-[52rem] desk:text-[13px]">
            <caption className="sr-only">{tr(lang, "ua.reg.cap", "Use cases with stage, verdict and compliance")}</caption>
            <thead className="sticky top-0 z-10 bg-card text-start font-mono text-[11px] tracking-wide text-ink-soft uppercase shadow-[0_1px_0_var(--color-line)]">
              <tr>
                <th scope="col" className="px-4 py-3 font-normal desk:ps-3 desk:py-2">{tr(lang, "ua.col.id", "ID")}</th>
                <th scope="col" className={th}>{tr(lang, "ua.col.uc", "Use case")}</th>
                <th scope="col" className={th}>{tr(lang, "ua.col.quad", "Quadrant")} / {tr(lang, "ua.col.oversight", "Oversight")}</th>
                <th scope="col" className={th}>{tr(lang, "ua.col.stage", "Stage")}</th>
                <th scope="col" className={th}>{tr(lang, "ua.col.verdict", "Verdict")}</th>
                <th scope="col" className={th}><T k="jb.col" en="Journey" /></th>
                <th scope="col" className="px-2 text-center font-normal">{tr(lang, "hl.compliant", "Compliant")}</th>
                <th scope="col" className="px-2 pe-4 text-center font-normal desk:pe-3">{tr(lang, "rr.col", "Rerun")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className="border-t border-line align-middle hover:bg-paper-deep/50">
                  <td className="px-4 py-2.5 font-mono text-xs whitespace-nowrap desk:ps-3 desk:py-1.5"><bdi dir="ltr">{u.ext_id}</bdi></td>
                  <td className="max-w-80 px-2 py-2.5 desk:max-w-64 desk:py-1.5">
                    <Link href={`/admin/federal/use-cases/${u.id}`} className="font-medium underline decoration-line underline-offset-2 hover:decoration-ink">{u.title}</Link>
                    <span className="block text-xs text-ink-soft">{u.entity}</span>
                  </td>
                  <td className="px-2 whitespace-nowrap">
                    {quadLabel(lang, u.quadrant)}
                    <span className="block text-xs text-ink-soft">{u.client_facing ? `● ${tr(lang, "ua.cf.client", "client-facing")}` : `○ ${tr(lang, "ua.cf.internal", "internal")}`}</span>
                  </td>
                  <td className="px-2">
                    <span className="inline-flex items-center rounded-md border border-line px-2 py-0.5 font-mono text-[11px]">{stageLabel(lang, u.stage)}</span>
                  </td>
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
                    <span aria-label={fill(tr(lang, "ua.row.compl", "Compliant {id}: {yn}"), { id: ltr(u.ext_id), yn: u.compliant ? tr(lang, "ua.yes", "yes") : tr(lang, "ua.no", "no") })} title={tr(lang, "ua.row.compl.h", "Set only by a passing Sijil attestation")}>{u.compliant ? "✓" : "–"}</span>
                  </td>
                  <td className="px-2 pe-4 text-center desk:pe-3">{rerun[u.id] ? <RerunControl ucId={u.id} ext={u.ext_id} ui={rerun[u.id]} /> : null}</td>
                </tr>
              ))}
              {!filtered.length && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-ink-soft">
                  {useCases.length ? <>{noVerdicts && !filtering ? null : <>{tr(lang, "ua.reg.nomatch", "No use case matches.")} <button type="button" onClick={clear} className="font-medium underline">{tr(lang, "ua.f.clear", "Clear filters")}</button></>}</> : <>{tr(lang, "ua.reg.empty", "No use cases yet. Import a CSV below (a sample is in")} <bdi dir="ltr">data/un-use-cases.csv</bdi>{tr(lang, "ua.reg.empty2", ").")}</>}
                </td></tr>
              )}
            </tbody>
          </table>
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
