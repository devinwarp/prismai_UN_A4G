"use client";

import Link from "next/link";
import { DIR, tr, trN } from "@/lib/un/i18n/dict";
import { REASON_EN, type ReasonCode, type StageId } from "@/lib/un/journey";
import type { FixTarget, NextStep } from "@/lib/un/next-step";
import { STAGE_EN, stageHref, useStoredLang } from "../../_components/JourneyBar";

const sub = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));

/** What is blocking this use case and where to fix it, on top of every use-case page. Derived by nextStep() from the release gate and
 * the journey. Every button is a link to the page that fixes it; that page enforces who may act. */
export default function NextStepCard({ id, step, readOnly }: { id: string; step: NextStep; readOnly: boolean }) {
  const lang = useStoredLang();
  const base = `/admin/federal/use-cases/${id}`;
  const stage = (s: StageId) => tr(lang, `jb.stage.${s}`, STAGE_EN[s]);
  const why = (r: ReasonCode | null) => (r ? tr(lang, `jb.r.${r}`, REASON_EN[r]) : "");
  const fix = (t: FixTarget, n: number) =>
    sub(
      t === "sop" ? tr(lang, "ns.fix.sop", "Fix on SOP intake ({n})")
      : t === "targets" ? tr(lang, "ns.fix.targets", "Fix on Process targets ({n})")
      : t === "tests" ? tr(lang, "ns.fix.tests", "Fix on Tests and parameters ({n})")
      : tr(lang, "ns.fix.pilot", "Fix on Pilot ({n})"),
      { n },
    );
  const tone = step.kind === "blocked" || step.kind === "stopped" ? "border-s-fail" : "border-line";
  const btn = "inline-flex items-center rounded-xl border border-line bg-paper px-3 py-1.5 text-sm font-medium text-ink hover:border-ink focus-visible:outline-2 focus-visible:outline-lit";
  return (
    <section dir={DIR[lang]} aria-label={tr(lang, "ns.h", "Next step")} data-testid="next-step" className={`mx-auto mt-3 max-w-6xl rounded-2xl border-2 bg-card p-4 sm:px-6 ${tone}`}>
      <p className="text-xs uppercase tracking-wide text-ink-soft">{tr(lang, "ns.h", "Next step")}</p>
      {step.kind === "blocked" && (
        <>
          <p role="status" className="mt-1 font-display text-lg font-medium">
            {sub(trN(lang, "ns.blocked", "Release blocked: fix {n} things", step.total, "Release blocked: fix 1 thing"), { n: step.total })}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {step.groups.map((g) => <Link key={g.target} href={`${base}/${g.target}`} className={btn}>{fix(g.target, g.count)}</Link>)}
            {step.more > 0 && <span className="text-sm text-ink-soft">{sub(tr(lang, "ns.more", "+ {n} more"), { n: step.more })}</span>}
          </div>
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer underline underline-offset-4">{sub(tr(lang, "ns.list", "Show what is blocking ({n})"), { n: step.total })}</summary>
            <ul className="mt-1 list-disc ps-5 text-ink-soft">{step.messages.map((m, i) => <li key={i}>{m}</li>)}</ul>
          </details>
          {step.approvedBeforeGate && <p className="mt-2 text-sm text-ink-soft">{tr(lang, "ns.before", "Approved before the current release gate; the pilot has to be met again before the next change.")}</p>}
        </>
      )}
      {step.kind === "waiting" && (
        <>
          <p role="status" className="mt-1 font-display text-lg font-medium">{sub(tr(lang, "ns.waiting", "Waiting: {stage}"), { stage: stage(step.stage) })}</p>
          <p className="mt-1 text-sm text-ink-soft">{why(step.reason)}</p>
          <div className="mt-2"><Link href={stageHref(base, step.stage)} className={btn}>{tr(lang, "ns.open", "Open")}</Link></div>
        </>
      )}
      {step.kind === "stopped" && (
        <>
          <p role="status" className="mt-1 font-display text-lg font-medium">{sub(tr(lang, "ns.stopped", "Stopped: {reason}"), { reason: why(step.reason) || stage(step.stage) })}</p>
          <div className="mt-2"><Link href={stageHref(base, step.stage)} className={btn}>{tr(lang, "ns.open", "Open")}</Link></div>
        </>
      )}
      {step.kind === "ready" && (
        <>
          <p role="status" className="mt-1 font-display text-lg font-medium">{tr(lang, "ns.ready", "Ready: the pilot is met")}</p>
          {step.signed && (
            <p className="mt-1 text-sm text-ink-soft">
              {sub(tr(lang, "ns.ready.signed", "Last signed verdict: {verdict}, {by}, {at}"), { verdict: step.signed.verdict, by: step.signed.by ?? "-", at: step.signed.at?.slice(0, 10) ?? "-" })}
            </p>
          )}
        </>
      )}
      {readOnly && <p className="mt-2 text-sm text-ink-soft">{tr(lang, "ns.readonly", "You have read-only access; a process owner or admin makes these changes.")}</p>}
    </section>
  );
}
