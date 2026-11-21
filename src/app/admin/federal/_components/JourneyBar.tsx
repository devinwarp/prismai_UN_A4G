"use client";

import Link from "next/link";
import { useSearchParams, useSelectedLayoutSegment } from "next/navigation";
import { useEffect, useState } from "react";
import { DIR, tr, type Lang } from "@/lib/un/i18n/dict";
import { GROUPS, STAGE_IDS, REASON_EN, type Journey, type JourneyStage, type StageId, type StageState } from "@/lib/un/journey";
import { T, TV, useLang } from "./Lang";

// The journey bar: nine stages in five groups, along the top of every use-case page. It is a
// layout, so it sits outside each page's LangShell and follows the language through localStorage
// plus the "prism-un-lang" event that LangShell fires. Views are always open (every stage is a link);
// what a person still has to do is spelled out in words under the stage. State is a glyph AND text.

const STATE_EN: Record<StageState, string> = { done: "Done", needs_you: "Needs you", not_yet: "Not yet", stopped: "Stopped" };
const GLYPH: Record<StageState, string> = { done: "✓", needs_you: "!", not_yet: "–", stopped: "✕" };
const COLOR: Record<StageState, string> = { done: "var(--color-v-auto)", needs_you: "var(--color-v-esc)", not_yet: "var(--color-ink-soft)", stopped: "var(--color-v-nogo)" };
const STAGE_EN: Record<StageId, string> = { sop: "SOP intake", gates: "Risk and gates", verdict: "Verdict", tests: "Tests and parameters", pilot: "Pilot and verdict", evals: "Pilot evals", tuning: "Tuning", approval: "Approval", production: "Production" };
const GROUP_EN = { define: "Define", assess: "Assess", pilot: "Pilot", approve: "Approve", run: "Run" } as const;
const GIVE_EN: Record<StageId, string> = {
  sop: "The SOP's steps become job profiles, you choose which to automate, and each agent gets its skill file.",
  gates: "The risk flags and the gates that apply to this use case, with a person accepting them.",
  verdict: "A five-level verdict produced by the rules and signed by a person, kept in a hash-chained log.",
  tests: "Tests derived from each job profile's skill, and the thresholds the pilot is judged against, both approved by a person.",
  pilot: "The approved tests run on the real agent: accuracy, refusals, client-facing scenarios, SOP controls and goal alignment.",
  evals: "Each case puts the agent's output beside the expected output, with the calls Sijil rejected.",
  tuning: "Changes to the agent's rules measured on tuning cases, while held-out cases stay sealed for approval.",
  approval: "A person's signature on an agent version that meets the approval bar.",
  production: "Monitoring with the same evals, and the agent taken down if Sijil rejects a call.",
};
const SEGMENT: Record<string, StageId> = { sop: "sop", tests: "tests", pilot: "pilot", evals: "evals", tuning: "tuning", production: "production" };

const PATH: Record<StageId, string> = { sop: "/sop", gates: "/sop?stage=gates#risk", verdict: "", tests: "/tests", pilot: "/pilot", evals: "/evals", tuning: "/tuning", approval: "/tuning?stage=approval", production: "/production" };
export const stageHref = (base: string, id: StageId): string => base + PATH[id];

export function useStoredLang(): Lang {
  const [lang, setLang] = useState<Lang>("en");
  useEffect(() => {
    const read = () => {
      try { setLang(localStorage.getItem("prism-un-lang") === "ar" ? "ar" : "en"); } catch {}
    };
    read();
    window.addEventListener("prism-un-lang", read);
    window.addEventListener("storage", read);
    return () => { window.removeEventListener("prism-un-lang", read); window.removeEventListener("storage", read); };
  }, []);
  return lang;
}

function Node({ s, lang, href, selected }: { s: JourneyStage; lang: Lang; href: string; selected: boolean }) {
  const name = tr(lang, `jb.stage.${s.id}`, STAGE_EN[s.id]);
  const state = tr(lang, `jb.state.${s.state}`, STATE_EN[s.state]);
  return (
    <li>
      <Link
        href={href}
        aria-current={selected ? "step" : undefined}
        className={`flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-paper-deep focus-visible:outline-2 focus-visible:outline-lit ${selected ? "bg-paper-deep ring-2 ring-ink" : ""}`}
      >
        <span
          aria-hidden
          className={`mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold ${s.state === "not_yet" ? "border-dashed" : ""}`}
          style={{ borderColor: COLOR[s.state], color: COLOR[s.state] }}
        >
          {GLYPH[s.state]}
        </span>
        <span className="min-w-0 text-sm">
          <span className="block font-medium">{s.n}. {name}</span>
          <span className="block text-xs">
            <span className="sr-only">: </span>{state}
          </span>
          {s.reason && <span className="block text-xs text-ink-soft">{tr(lang, `jb.r.${s.reason}`, REASON_EN[s.reason])}</span>}
        </span>
      </Link>
    </li>
  );
}

export default function JourneyBar({ base, journey }: { base: string; journey: Journey }) {
  const lang = useStoredLang();
  const seg = useSelectedLayoutSegment();
  const q = useSearchParams().get("stage");
  const sel: StageId = (STAGE_IDS as readonly string[]).includes(q ?? "") ? (q as StageId) : SEGMENT[seg ?? ""] ?? "verdict";
  const selected = journey.stages.find((s) => s.id === sel)!;
  return (
    <div dir={DIR[lang]} lang={lang} className="border-b border-line bg-paper/60">
      <nav aria-label={tr(lang, "jb.label", "Journey from SOP to production")} className="mx-auto max-w-6xl px-4 py-3 sm:px-6">
        <p className="text-xs text-ink-soft">
          <TVLang lang={lang} k="jb.counter" en="{d} of 9 stages done, {w} waiting for someone" v={{ d: journey.done, w: journey.waiting }} />
        </p>
        <ol className="mt-2 grid gap-x-3 gap-y-3 sm:grid-cols-2 lg:grid-cols-[2fr_2fr_3fr_1fr_1fr]">
          {GROUPS.map((g) => (
            <li key={g}>
              <p className="border-b border-line pb-1 font-mono text-[11px] tracking-wide text-ink-soft uppercase">{tr(lang, `jb.group.${g}`, GROUP_EN[g])}</p>
              <ol className="mt-1 grid gap-0.5">
                {journey.stages.filter((s) => s.group === g).map((s) => <Node key={s.id} s={s} lang={lang} href={stageHref(base, s.id)} selected={s.id === sel} />)}
              </ol>
            </li>
          ))}
        </ol>
        {selected.state === "not_yet" && (
          <section aria-label={tr(lang, "jb.give.title", "What this stage will give you")} className="mt-3 max-w-[68ch] rounded-xl border border-dashed border-line p-3 text-sm">
            <p className="font-medium">{tr(lang, "jb.give.title", "What this stage will give you")}: {tr(lang, `jb.stage.${selected.id}`, STAGE_EN[selected.id])}</p>
            <p className="mt-1 text-ink-soft">{tr(lang, `jb.give.${selected.id}`, GIVE_EN[selected.id])}</p>
          </section>
        )}
      </nav>
    </div>
  );
}

const TVLang = ({ lang, k, en, v }: { lang: Lang; k: string; en: string; v: Record<string, string | number> }) => <>{tr(lang, k, en).replace(/\{(\w+)\}/g, (_, n: string) => String(v[n] ?? ""))}</>;

/** One line for lists: nine glyphs, how many are done, and what comes next. Used inside a LangShell. */
export function JourneyLine({ journey }: { journey: Journey }) {
  const lang = useLang();
  const next = journey.stages.find((s) => s.id === journey.next);
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 text-xs">
      <ol aria-label="Journey" className="inline-flex gap-0.5">
        {journey.stages.map((s) => (
          <li key={s.id} className="inline-flex size-4 items-center justify-center rounded-full border text-[9px] font-semibold" style={{ borderColor: COLOR[s.state], color: COLOR[s.state], borderStyle: s.state === "not_yet" ? "dashed" : "solid" }}>
            <span aria-hidden>{GLYPH[s.state]}</span>
            <span className="sr-only"><T k={`jb.stage.${s.id}`} en={STAGE_EN[s.id]} />: <T k={`jb.state.${s.state}`} en={STATE_EN[s.state]} /></span>
          </li>
        ))}
      </ol>
      <span className="text-ink-soft"><TV k="jb.compact" en="Journey: {d} of 9" v={{ d: journey.done }} />{" · "}{next ? <TV k="jb.compact.next" en="Next: {s}" v={{ s: tr(lang, `jb.stage.${next.id}`, STAGE_EN[next.id]) }} /> : <T k="jb.compact.none" en="Nothing waiting" />}</span>
    </span>
  );
}
