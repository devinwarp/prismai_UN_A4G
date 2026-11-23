import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getUserAndProfile } from "@/lib/auth";
import { replayReviews } from "@/lib/un/goal-judge";
import { loadTargetLog } from "@/lib/un/target-store";
import { checksOf, replayTargets } from "@/lib/un/targets";
import { isUuid } from "@/lib/un/model";
import { loadPilots, loadReviewLog } from "@/lib/un/pilot-store";
import { loadAttachedSop } from "@/lib/un/profiles-store";
import { loadUseCase } from "@/lib/un/sijil-store";
import { loadSop } from "@/lib/un/sop-kb";
import { assembleDrill, type Drill } from "@/lib/un/test-drilldown";
import { loadTestLog } from "@/lib/un/test-set-store";
import { replayTestSet } from "@/lib/un/test-sets";
import { loadParamLog } from "@/lib/un/verdict-param-store";
import { paramsHash, replayParams } from "@/lib/un/verdict-params";
import LangShell, { T, TV } from "../../../../_components/Lang";
import { card, scrollFocus } from "../../../../_components/ui";

export const metadata: Metadata = { title: "One test of a pilot", robots: { index: false, follow: false } };
// Reads the signed-in person and the databases: never prerendered.
export const dynamic = "force-dynamic";

const Yn = ({ v }: { v: boolean | null }) => (v === null ? <>–</> : v ? <T k="dd.yes" en="yes" /> : <T k="dd.no" en="no" />);
const Lines = ({ lines }: { lines: { id: string; text: string | null; note?: ReactNode }[] }) => (
  <ul className="mt-2 space-y-2 text-sm">
    {lines.map((l) => (
      <li key={l.id}><span className="font-mono text-xs">{l.id}</span>{l.note ? <span className="text-xs text-ink-soft"> · {l.note}</span> : null}
        <p className="mt-0.5 whitespace-pre-wrap text-ink-soft">{l.text ?? <T k="dd.nochunk" en="This line is not in the SOP knowledge base." />}</p></li>
    ))}
  </ul>
);

/** Read-only: anyone signed in who may see the use case (the same as the pilot GET routes). */
export default async function TestDrillPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ profile?: string; pilot?: string; test?: string }> }) {
  const [{ id }, q] = await Promise.all([params, searchParams]);
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect(`/login?next=/admin/federal/use-cases/${id}/pilot`);
  if (!profile?.org_id) redirect("/login");
  if (!isUuid(id)) notFound();
  const uc = await loadUseCase(profile.org_id, id);
  if (!uc || !q.profile || !q.pilot || !q.test) notFound();
  const back = `/admin/federal/use-cases/${id}/pilot?profile=${encodeURIComponent(q.profile)}`;

  const pilot = (await loadPilots(profile.org_id, id, q.profile, true)).find((p) => p.id === q.pilot);
  if (!pilot) notFound();
  const [rlog, tlog, plog, sopId] = await Promise.all([loadReviewLog(profile.org_id, id, q.profile), loadTestLog(profile.org_id, id, q.profile), loadParamLog(profile.org_id, id, q.profile), loadAttachedSop(profile.org_id, id)]);
  const tset = replayTestSet(tlog);
  const pstate = replayParams(plog);
  // the checks the use case has now (its approved process targets): only used for a review recorded before checks were kept
  const checksNow = checksOf(replayTargets(await loadTargetLog(profile.org_id, id).catch(() => [])).approved?.targets ?? []);
  const d = assembleDrill({
    testId: q.test,
    pilot: { id: pilot.id, at: pilot.at, actor: pilot.actor, reps: pilot.reps, plan: pilot.plan, test_set_hash: pilot.report.test_set_hash, params_hash: pilot.report.params_hash },
    runs: pilot.run_records,
    review: replayReviews(rlog).reviews[pilot.basis?.pilot_id ?? pilot.id] ?? null,
    goalsNow: checksNow,
    blueprints: tset.blueprints,
    chunks: sopId ? loadSop(sopId).chunks : [],
    current: { test_set_hash: tset.approved?.hash ?? null, params_hash: pstate.approved ? paramsHash(pstate.approved.params) : null },
  });

  return (
    <LangShell>
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <p className="font-mono text-xs tracking-[0.25em] text-ink-soft uppercase"><T k="dd.eyebrow" en="One test of a pilot" /></p>
        <h1 className="font-display mt-2 break-all text-2xl font-medium tracking-tight sm:text-3xl">{q.test}</h1>
        <p className="mt-3"><Link className="text-sm underline" href={back}><T k="dd.back" en="Back to the pilot" /></Link></p>
        {d.ok ? <Chain d={d} /> : <section className={`${card} mt-6`}><p className="text-sm font-medium" role="alert">{d.error}</p></section>}
      </main>
    </LangShell>
  );
}

function Chain({ d }: { d: Drill }) {
  const a = d.assessment;
  return (
    <>
      <section className={`${card} mt-6`} aria-labelledby="dd-goals">
        <h2 id="dd-goals" className="font-display text-xl font-medium"><T k="dd.goals" en="1. The goals it was judged against" /></h2>
        <p className="mt-1 font-mono text-[11px] text-ink-soft"><T k="dd.goalset" en="goal set" /> {d.goal_set.hash.slice(0, 12)}</p>
        {!a.judgment && a.status === "not_judged" && <p className="mt-2 text-sm"><T k="dd.notjudged" en="No goal review exists for this pilot yet; the current wording is shown." /></p>}
        {a.status !== "not_judged" && !d.goal_set.recorded && <p className="mt-2 text-sm font-medium"><T k="dd.oldreview" en="Goal wording was not recorded for this older review; the current wording is shown." /></p>}
        <ul className="mt-2 space-y-1 text-sm">{d.goal_set.goals.map((g) => <li key={g.id}><span className="font-mono text-xs">{g.id}</span> · {g.text} <span className="text-xs text-ink-soft">({g.criterion})</span></li>)}</ul>
      </section>

      <section className={`${card} mt-6`} aria-labelledby="dd-sop">
        <h2 id="dd-sop" className="font-display text-xl font-medium"><T k="dd.sop" en="2. SOP lines" /></h2>
        <p className="mt-2 text-sm font-medium"><T k="dd.from" en="The test comes from" /></p>
        {d.sop.source.length ? <Lines lines={d.sop.source} /> : <p className="mt-1 text-sm text-ink-soft"><T k="dd.nosource" en="No SOP line: a standard test that does not depend on the SOP." /></p>}
        <p className="mt-4 text-sm font-medium"><T k="dd.cited" en="The agent cited" /></p>
        {d.sop.cited.length ? <Lines lines={d.sop.cited.map((l) => ({ ...l, note: l.in_source ? undefined : <T k="dd.notsrc" en="not among the lines the test comes from" /> }))} /> : <p className="mt-1 text-sm text-ink-soft"><T k="dd.nocite" en="The agent cited nothing (or the stored output was cut before its citations)." /></p>}
      </section>

      <section className={`${card} mt-6`} aria-labelledby="dd-test">
        <h2 id="dd-test" className="font-display text-xl font-medium"><T k="dd.test" en="3. The test" /></h2>
        {!d.test.found && <p className="mt-2 text-sm"><T k="dd.nobp" en="This test is not in the current test set (retired or changed since the pilot)." /></p>}
        <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[10rem_1fr]">
          <dt className="text-ink-soft"><T k="dd.bp" en="Blueprint" /></dt><dd className="font-mono text-xs">{d.test.blueprint_id}{d.test.title ? <span className="font-sans text-sm"> · {d.test.title}</span> : null}</dd>
          <dt className="text-ink-soft"><T k="dd.family" en="Family and task" /></dt><dd>{d.test.family} · {d.test.task ?? "–"}</dd>
          <dt className="text-ink-soft"><T k="dd.case" en="Case run" /></dt><dd className="font-mono text-xs">{d.test.case_id}</dd>
          <dt className="text-ink-soft"><T k="dd.bound" en="Bound to cases" /></dt><dd className="font-mono text-xs">{d.test.bound_cases.join(", ") || "–"}</dd>
        </dl>
        <p className="mt-3 text-sm font-medium"><T k="dd.expects" en="What it expects" /></p>
        <ul className="mt-1 list-disc ps-5 text-sm">{d.test.expect.map((e) => <li key={e}>{e}</li>)}</ul>
      </section>

      <section className={`${card} mt-6`} aria-labelledby="dd-out">
        <h2 id="dd-out" className="font-display text-xl font-medium"><TV k="dd.out" en="4. What the agent produced ({n} repetitions)" v={{ n: d.reps.length }} /></h2>
        {d.reps.map((r) => (
          <div key={r.rep} className="mt-3 border-t border-line pt-3 text-sm">
            <p className="font-medium"><TV k="dd.rep" en="Repetition {rep}" v={{ rep: r.rep }} /> <span className="text-xs font-normal text-ink-soft">· <T k="dd.latency" en="latency" /> {r.latency_ms ?? "–"} ms · <T k="dd.digest" en="answer digest" /> <span className="font-mono">{r.answer}</span></span></p>
            {r.parsed ? (
              <>
                <p className="mt-1">ok: <Yn v={r.parsed.ok} /> · refused: {JSON.stringify(r.parsed.refused)} · escalate: {JSON.stringify(r.parsed.escalate)}</p>
                {r.parsed.citations.length > 0 && <p className="mt-1 font-mono text-xs">{r.parsed.citations.join(", ")}</p>}
                <div className="mt-2 max-h-72 overflow-auto rounded-lg border border-line p-2" role="region" {...scrollFocus} aria-label={`output ${r.rep}`}>
                  <pre className="font-mono text-xs whitespace-pre-wrap">{typeof r.parsed.output === "string" ? r.parsed.output : JSON.stringify(r.parsed.output, null, 2)}</pre>
                </div>
                {r.parsed.truncated && <p className="mt-1 text-xs text-ink-soft"><T k="dd.cut" en="The stored output is cut at 900 characters; what follows the cut is unknown." /></p>}
              </>
            ) : <p className="mt-1 text-ink-soft"><T k="dd.nosummary" en="No output was stored for this run." /></p>}
          </div>
        ))}
      </section>

      <section className={`${card} mt-6`} aria-labelledby="dd-as">
        <h2 id="dd-as" className="font-display text-xl font-medium"><T k="dd.assess" en="5. How it was assessed" /></h2>
        <p className="mt-2 text-sm font-medium"><T k="dd.det" en="Deterministic result" /></p>
        <div className="mt-1 overflow-x-auto" role="region" {...scrollFocus} aria-label="Deterministic result">
          <table className="w-full text-sm">
            <thead><tr className="text-ink-soft">
              <th className="py-1 pe-3 text-start font-normal"><T k="dd.th.rep" en="Rep" /></th>
              <th className="py-1 pe-3 text-start font-normal"><T k="dd.th.passed" en="Passed" /></th>
              <th className="py-1 pe-3 text-start font-normal"><T k="dd.th.controls" en="Controls held" /></th>
              <th className="py-1 pe-3 text-start font-normal"><T k="dd.th.refused" en="Refused / refusal expected" /></th>
              <th className="py-1 pe-3 text-start font-normal"><T k="dd.th.halluc" en="Hallucinated" /></th>
              <th className="py-1 pe-3 text-start font-normal"><T k="dd.th.logged" en="Logged" /></th>
              <th className="py-1 text-start font-normal"><T k="dd.th.client" en="Client-facing: compliant, disclosed, promotion-free" /></th>
            </tr></thead>
            <tbody>
              {d.reps.map((r) => (
                <tr key={r.rep} className="border-t border-line align-top">
                  <td className="py-1 pe-3 tabular-nums">{r.rep}</td>
                  <td className="py-1 pe-3"><Yn v={r.det.passed} /></td>
                  <td className="py-1 pe-3"><Yn v={r.det.controls_ok} /></td>
                  <td className="py-1 pe-3"><Yn v={r.det.refused} /> / <Yn v={r.det.refusal_expected} /></td>
                  <td className="py-1 pe-3"><Yn v={r.det.hallucinated} /></td>
                  <td className="py-1 pe-3"><Yn v={r.det.logged} /></td>
                  <td className="py-1">{r.det.client_facing ? <><Yn v={r.det.compliance_ok} />, <Yn v={r.det.disclosed} />, <Yn v={r.det.promotion_free} /></> : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-sm font-medium"><T k="dd.model" en="The model's judgment per goal" /> {a.model && <span className="font-mono text-[11px] font-normal text-ink-soft">{a.model}</span>}</p>
        {a.judgment ? (
          <>
            <p className="mt-1 text-sm"><T k="dd.overall" en="Overall" />: {a.judgment.met === null ? <T k="gr.unjudged" en="Not judged" /> : a.judgment.met ? <T k="gr.met" en="Met" /> : <T k="gr.notmet" en="Not met" />} <span className="text-ink-soft">· {a.judgment.reason}</span></p>
            <ul className="mt-1 space-y-1 text-sm">{a.judgment.goals.map((g) => <li key={g.id}><span className="font-mono text-xs">{g.id}</span> · {g.met ? <T k="gr.met" en="Met" /> : <T k="gr.notmet" en="Not met" />} <span className="text-ink-soft">· {g.reason}</span></li>)}</ul>
          </>
        ) : <p className="mt-1 text-sm text-ink-soft">{a.status === "not_judged" ? <T k="dd.notjudged2" en="Goals have not been judged for this pilot." /> : <T k="dd.nojudg" en="The model's review has no judgment for this test." />}</p>}

        <p className="mt-4 text-sm font-medium"><T k="dd.person" en="The person's approval" /></p>
        {a.approval ? (
          <p className="mt-1 text-sm"><T k="dd.approvedby" en="Approved by" /> {a.approval.approver} ({a.approval.approver_source}) · {a.approval.at.slice(0, 10)} · <span className="font-mono text-xs">{a.approval.hash.slice(0, 12)}</span>
            <span className="block">{a.override ? <><T k="dd.override" en="Overridden" />: {a.override.met ? <T k="gr.met" en="Met" /> : <T k="gr.notmet" en="Not met" />} <span className="text-ink-soft">· {a.override.reason}</span></> : <T k="gr.kept" en="Kept" />}</span></p>
        ) : <p className="mt-1 text-sm text-ink-soft"><T k="dd.unapproved" en="Not approved: nothing counts yet." /></p>}
        <p className="mt-2 text-sm"><T k="dd.effective" en="Judgment in force" />: {a.effective === null ? <T k="dd.notmeasured" en="not measured" /> : a.effective ? <T k="gr.met" en="Met" /> : <T k="gr.notmet" en="Not met" />}</p>
      </section>

      <section className={`${card} mt-6`} aria-labelledby="dd-hash">
        <h2 id="dd-hash" className="font-display text-xl font-medium"><T k="dd.ran" en="6. What the pilot ran under" /></h2>
        <p className="mt-2 text-sm"><T k="dd.testset" en="test set" /> <span className="font-mono text-xs">{d.hashes.test_set.slice(0, 12)}</span> · <T k="dd.unchanged" en="still the approved set" />: <Yn v={d.hashes.test_set_unchanged} /></p>
        <p className="mt-1 text-sm"><T k="dd.params" en="verdict parameters" /> <span className="font-mono text-xs">{d.hashes.params.slice(0, 12)}</span> · <T k="dd.unchanged2" en="still the approved parameters" />: <Yn v={d.hashes.params_unchanged} /></p>
      </section>
    </>
  );
}
