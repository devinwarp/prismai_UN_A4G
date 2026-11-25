"use client";

import { tr } from "@/lib/un/i18n/dict";
import type { Dashboard, Policy } from "@/lib/un/model";
import { useLang } from "./Lang";
import CountUp from "./CountUp";
import { Term } from "./Gloss";
import { TargetTrack, monthsLeft } from "./charts";
import { deadlineNote } from "./Deadline";
import { fill as fmt, ltr } from "./labels";

/**
 * The headline: how much is running, how much is provably compliant, how far that is from the target.
 * One band. Phone: stacked, the numbers large. One-screen desktop: three zones in a row
 * (the two percentages | the story and the two progress tracks | the four figures).
 * Deployed and compliant are always shown side by side and never merged.
 */
export default function HeadlineBand({ d, policy, noTarget, asOf, story }: { d: Dashboard; policy: Policy; noTarget: boolean; asOf: string; story: string }) {
  const lang = useLang();
  const months = monthsLeft(asOf, policy.deadline);
  const met = d.gap === 0 && d.total > 0;
  const perMonth = months && months > 0 ? d.gap / months : null;
  const stuck = d.deployed - d.compliant;
  const kpis = [
    [tr(lang, "ua.tp.k.gap", "Gap to target"), String(d.gap), met ? tr(lang, "ua.tp.s.none", "nothing left to deploy") : tr(lang, "ua.tp.s.left", "use cases still to deploy")],
    [tr(lang, "ua.tp.k.time", "Time left"), months === null ? "-" : months < 1 ? tr(lang, "ua.tp.lt1", "<1 mo") : fmt(tr(lang, "ua.tp.mo", "{n} mo"), { n: Math.round(months) }), policy.deadline ? fmt(tr(lang, "ua.tp.until", "until {d}"), { d: ltr(policy.deadline) }) : tr(lang, "ua.tp.nodl", "no deadline set")],
    [tr(lang, "ua.tp.k.pace", "Pace needed"), perMonth === null ? "-" : met ? "0" : perMonth < 0.1 ? "<0.1" : perMonth.toFixed(1), tr(lang, "ua.tp.s.pace", "deployments a month")],
    [tr(lang, "ua.tp.k.stuck", "Deployed, not compliant"), String(stuck), stuck ? tr(lang, "ua.tp.s.stuck", "deployed but failing attestation") : tr(lang, "ua.tp.s.nofail", "none failing")],
  ];
  const stat = (label: string, term: "deployed" | "compliant", value: number, count: number, id: string) => (
    <div>
      <p className="text-base font-medium text-ink-soft sm:text-lg desk:text-sm"><Term id={term}>{label}</Term></p>
      <p className="font-display text-7xl leading-none font-semibold tabular-nums sm:text-8xl desk:text-5xl" aria-hidden><CountUp value={value} id={id} />%</p>
      <p className="mt-2 text-base text-ink-soft sm:text-lg desk:mt-1 desk:text-xs">{count} {tr(lang, "hl.of", "of")} {d.total} {tr(lang, "hl.uc", "use cases")}</p>
    </div>
  );
  return (
    <section id="progress" aria-labelledby="headline-pair" data-tour="headline" className="scroll-mt-4 rounded-2xl border-2 border-ink bg-card p-5 sm:p-8 desk:px-5 desk:py-3.5 short:py-2.5">
      <h2 id="headline-pair" className="sr-only">
        {fmt(tr(lang, "ua.hl.sr", "Deployed {a} percent, compliant {b} percent, target {c} percent"), { a: d.deployedPct, b: d.compliantPct, c: d.targetPercent })}
      </h2>
      <div className="grid gap-7 desk:grid-cols-[17rem_minmax(0,1fr)_24rem] desk:items-center desk:gap-6">
        <div className="grid grid-cols-2 gap-6 desk:gap-4">
          {stat(tr(lang, "hl.deployed", "Deployed"), "deployed", d.deployedPct, d.deployed, "dep")}
          {stat(tr(lang, "hl.compliant", "Compliant"), "compliant", d.compliantPct, d.compliant, "cmp")}
        </div>

        <div className="min-w-0">
          <p className="font-display max-w-[44ch] text-2xl leading-snug font-medium sm:text-3xl desk:text-lg desk:leading-snug short:text-base">{story}</p>
          {noTarget ? (
            <p className="mt-3 text-base font-medium desk:mt-2 desk:text-sm">{tr(lang, "ua.pg.notarget", "No framework target is recorded for this country yet.")}</p>
          ) : (
            <>
              <div className="mt-5 grid gap-4 desk:mt-2.5 desk:grid-cols-2 desk:gap-5">
                <TargetTrack label={tr(lang, "hl.deployed", "Deployed")} value={d.deployed} total={d.total} target={d.targetCount} fill="var(--color-lit)" note={`${d.deployed}/${d.total} · ${d.deployedPct}%`} />
                <TargetTrack label={tr(lang, "ua.tp.ca", "Compliant & aligned")} value={d.compliant} total={d.total} target={d.targetCount} fill="var(--color-v-sup)" note={`${d.compliant}/${d.total} · ${d.compliantPct}%`} />
              </div>
              <p className="mt-3 flex items-start gap-2 text-sm font-medium desk:mt-2 desk:text-xs">
                <span aria-hidden className="mt-0.5 inline-block h-3 w-0.5 shrink-0 bg-ink" />
                <span>
                  {tr(lang, "hl.target", "Target")}: {d.targetPercent}% {tr(lang, "hl.deployed_l", "deployed")}{deadlineNote(lang, policy)} ({d.targetCount} {tr(lang, "hl.of", "of")} {d.total}).{" "}
                  <span className={`whitespace-nowrap ${met ? "text-lit-deep" : "text-ember"}`}><span aria-hidden>{met ? "✓" : "▲"}</span> {d.gap === 0 && d.total > 0 ? tr(lang, "hl.met", "Target met.") : `${tr(lang, "hl.gap", "Gap")}: ${d.gap}.`}</span>
                  {/* the explanation stays on a phone and for a screen reader; on the one-screen desktop it would only add a line */}
                  <span className="mt-1 block font-mono text-[11px] font-normal text-ink-soft desk:sr-only">{fmt(tr(lang, "ua.tp.line", "Target line: {n} use cases ({p}%). Compliance is reported beside deployment, never merged into it."), { n: d.targetCount, p: d.targetPercent })}</span>
                </span>
              </p>
            </>
          )}
        </div>

        {!noTarget && (
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4 desk:grid-cols-2">
            {kpis.map(([k, v, s]) => (
              <div key={k} className="min-w-0 bg-card px-4 py-3 desk:px-3 desk:py-1.5 short:py-1">
                <dt className="truncate font-mono text-[10px] tracking-widest text-ink-soft uppercase" title={k}>{k}</dt>
                {/* one line on the one-screen desktop: the figure, then its unit */}
                <div className="desk:flex desk:items-baseline desk:gap-2">
                  <dd className="font-display mt-1 text-2xl font-medium tabular-nums desk:mt-0 desk:text-xl"><bdi dir="ltr">{v}</bdi></dd>
                  <dd className="min-w-0 text-xs text-ink-soft desk:truncate desk:text-[11px]" title={s}>{s}</dd>
                </div>
              </div>
            ))}
          </dl>
        )}
      </div>
    </section>
  );
}
