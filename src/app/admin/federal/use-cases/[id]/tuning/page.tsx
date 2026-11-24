import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getUserAndProfile } from "@/lib/auth";
import { permissionsFor } from "@/lib/un/permissions-server";
import { evalSetFor } from "@/lib/un/evalset";
import { approvalBlockers, effectiveGates, evidenceFor } from "@/lib/un/gates";
import { factsOf, loadGov } from "@/lib/un/gates-store";
import { loadLedger } from "@/lib/un/cost-ledger-store";
import { loadReleaseCached } from "@/lib/un/release-cached";
import { loadRun } from "@/lib/un/runs";
import { isUuid } from "@/lib/un/model";
import { loadUseCase } from "@/lib/un/sijil-store";
import type { SubjectConfig } from "@/lib/un/subject";
import { approvalState, configOf, verifyChain, type Advisory, type LogEntry, type Proposal } from "@/lib/un/tuning";
import { loadLog } from "@/lib/un/tuning-store";
import { appKbStore } from "@/lib/un/kb-store-app";
import { realAgentEvals } from "@/lib/un/tuning-service";
import { RuleSentence, RuleText } from "../../../_components/EvalText";
import LangShell, { T, TV } from "../../../_components/Lang";
import { card } from "../../../_components/ui";
import { CostPanel } from "../CostPanel";
import { ReleasePanel } from "../ReleasePanel";
import { ApproveForm, TuningControls } from "./TuningControls";

export const metadata: Metadata = { title: "Tuning and approval", robots: { index: false, follow: false } };

const DUBAI = { timeZone: "Asia/Dubai" } as const;
type Brief = { n: number; correct: number };
const num = (v: unknown) => (typeof v === "number" ? v : 0);
const brief = (v: unknown): Brief => ({ n: num((v as Brief)?.n), correct: num((v as Brief)?.correct) });
const ids = (xs: unknown) => (Array.isArray(xs) ? (xs as string[]) : []);

const KIND_EN: Record<LogEntry["kind"], string> = {
  baseline: "Baseline",
  iteration: "Tuning",
  certification: "Certification",
  holdout_burned: "Held-out cases burned",
  approval: "Decision",
};

function Entry({ e }: { e: LogEntry }) {
  const p = e.payload;
  return (
    <li className="rounded-2xl border border-line bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-mono text-[11px] tracking-wide text-ink-soft uppercase">#{e.seq} · <T k={`tu.k.${e.kind}`} en={KIND_EN[e.kind]} /></p>
        <p className="text-xs text-ink-soft tabular-nums">{new Date(e.at).toLocaleString("en-GB", DUBAI)} · {e.actor}</p>
      </div>

      {e.kind === "baseline" && (
        <p className="mt-2 text-sm">
          <TV k="tu.baseline" en="Agent v{v} as first piloted: tuning {tk} of {tn} correct, held out {hk} of {hn}, Sijil rejected {r} of {c}." v={{ v: num(p.version), tk: brief(p.tune).correct, tn: brief(p.tune).n, hk: brief(p.holdout).correct, hn: brief(p.holdout).n, r: num((p.sijil as { rejected?: number })?.rejected), c: num((p.sijil as { calls?: number })?.calls) }} />
        </p>
      )}

      {e.kind === "iteration" && (
        <div className="mt-2 text-sm">
          <p className="font-medium">
            <TV k="tu.iter" en="Agent v{a} to v{b}: tuning cases {bk} of {bn} correct before, {ak} of {an} after." v={{ a: num(p.from_version), b: num(p.to_version), bk: brief(p.tune_before).correct, bn: brief(p.tune_before).n, ak: brief(p.tune_after).correct, an: brief(p.tune_after).n }} />
          </p>
          <ul className="mt-2 space-y-2">
            {(p.proposals as Proposal[]).map((x) => (
              <li key={x.id}>
                {x.op === "add_rule" ? <RuleSentence k="tu.p.add_rule" en="Added rule: {rule}" rule={x.rule} /> : <TV k="tu.p.remove_tool" en="Removed tool “{tool}” (Sijil does not authorise it)" v={{ tool: x.tool }} />}
                <div className="text-xs text-ink-soft"><TV k="tu.p.because" en="Because of: {ids}" v={{ ids: x.because.join(", ") }} /></div>
              </li>
            ))}
          </ul>
          {(p.advisories as Advisory[]).length > 0 && (
            <ul className="mt-2 space-y-1 text-xs">
              {(p.advisories as Advisory[]).map((a, i) => (
                <li key={i}>
                  {a.area === "prompt" && a.rule ? <RuleSentence k="tu.adv.prompt" en="To look at: the rule “{rule}” is in place but failures remain on tuning cases; a person should look at its wording or enforcement." rule={a.rule} /> : a.area === "memory" ? <T k="tu.adv.memory" en="To look at: an expected fact was not stated, so check whether context is lost between steps (memory) or a skill is missing." /> : <T k="tu.adv.tool" en="To look at: a tool problem." />}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-ink-soft"><T k="tu.sealed" en="Held-out results were not used." /></p>
        </div>
      )}

      {e.kind === "certification" && (
        <div className="mt-2 text-sm">
          <p>
            <TV k="tu.cert" en="Certification of agent v{v}: held out {k} of {n} correct, Sijil rejected {r} of {c}." v={{ v: num(p.version), k: brief(p.holdout).correct, n: brief(p.holdout).n, r: num((p.sijil as { rejected?: number })?.rejected), c: num((p.sijil as { calls?: number })?.calls) }} />{" "}
            <strong>{p.met ? <T k="tu.cert.met" en="Approval bar met." /> : <T k="tu.cert.notmet" en="Approval bar not met." />}</strong>
          </p>
          <p className="mt-1 text-xs text-ink-soft"><TV k="tu.cert.lower" en="A perfect score on {n} cases supports at least {lower}% (95% confidence)." v={{ n: brief(p.holdout).n, lower: Math.round(num(p.holdout_lower) * 100) }} /></p>
        </div>
      )}

      {e.kind === "holdout_burned" && (
        <p className="mt-2 text-sm"><TV k="tu.burn" en="Held-out case(s) {burned} failed, so the optimiser may now see them. Fresh reserve case(s) {released} take their place." v={{ burned: ids(p.burned).join(", "), released: ids(p.released).join(", ") }} /></p>
      )}

      {e.kind === "approval" && (
        <div className="mt-2 text-sm">
          {p.decision === "SIGN"
            ? <TV k="tu.approval.sign" en="{signer} signed approval of agent v{v}." v={{ signer: String(p.signer), v: num(p.version) }} />
            : <TV k="tu.approval.withhold" en="{signer} withheld approval of agent v{v}." v={{ signer: String(p.signer), v: num(p.version) }} />}
          {typeof p.comment === "string" && p.comment && <p className="mt-1 text-ink-soft">“{p.comment}”</p>}
        </div>
      )}
      <code className="mt-2 block text-xs text-ink-soft">{e.hash.slice(0, 16)}…</code>
    </li>
  );
}

function Config({ cfg }: { cfg: SubjectConfig }) {
  return (
    <div className="mt-3 grid gap-4 text-sm md:grid-cols-2">
      <div>
        <p className="font-medium"><T k="tu.rules" en="Rules in place" /></p>
        {cfg.rules.length ? <ul className="mt-1 list-disc ps-5">{cfg.rules.map((r) => <li key={r}><RuleText rule={r} /></li>)}</ul> : <p className="mt-1 text-ink-soft"><T k="tu.norules" en="none" /></p>}
      </div>
      <div>
        <p className="font-medium"><T k="tu.tools" en="Tools" /></p>
        <p className="mt-1 font-mono text-xs">{cfg.tools.join(", ")}</p>
        <details className="mt-3">
          <summary className="cursor-pointer font-medium"><T k="tu.prompt" en="System prompt" /></summary>
          <pre className="mt-1 whitespace-pre-wrap text-xs text-ink-soft" dir="ltr">{cfg.system_prompt}</pre>
        </details>
      </div>
    </div>
  );
}

export default async function TuningPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect(`/login?next=/admin/federal/use-cases/${id}/tuning`);
  if (!profile?.org_id) redirect("/login");
  if (!isUuid(id)) notFound();
  const uc = await loadUseCase(profile.org_id, id);
  if (!uc) notFound();
  const [log] = await Promise.all([
    loadLog(profile.org_id, id),
  ]);
  const hasSet = evalSetFor(uc.ext_id).length > 0;
  const state = approvalState(log);
  const release = await loadReleaseCached(profile.org_id, id);
  const ledger = await loadLedger(profile.org_id, id, release.profiles);
  // the same check the approve route makes (409 otherwise): say it up front instead of offering a button that fails
  let approveBlocked: string | null = null;
  if (state === "ready") {
    const eff = effectiveGates({ ext: uc.ext_id, facts: factsOf(uc), gov: await loadGov(profile.org_id) });
    const run = uc.verdict_run_id ? await loadRun(profile.org_id, uc.verdict_run_id) : null;
    const blockers = approvalBlockers(eff, evidenceFor(eff, uc.ext_id, run?.state.state?.gates ?? {}));
    if (blockers.length) approveBlocked = `Approval needs every effective gate to pass. Not yet passing: ${blockers.map((x) => `${x.label} (${x.status})`).join("; ")}.`;
    else if (!release.ok) approveBlocked = `Approval needs a met pilot: ${release.blockers.length} thing${release.blockers.length === 1 ? "" : "s"} to fix first (see the list above).`;
  }
  const cfg = configOf(log);
  const chain = verifyChain(log);
  const perms = await permissionsFor(profile, user.id);
  const mayRun = perms.can("tuning.run", id);
  const mayApprove = perms.can("tuning.approve", id);
  const last = log[log.length - 1];
  const real = uc.ext_id === "UC02" ? await realAgentEvals({ store: appKbStore(profile.org_id) }) : null;
  const approver = last?.kind === "approval" ? String(last.payload.signer) : "";

  return (
    <div>
      <LangShell>
        <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
          <p className="font-mono text-xs tracking-[0.25em] text-ink-soft uppercase">
            <Link href={`/admin/federal/use-cases/${id}`} className="underline underline-offset-4">{uc.ext_id}</Link> · <T k="tu.eyebrow" en="Tuning and approval" />
          </p>
          <h1 className="font-display mt-2 text-3xl font-medium tracking-tight sm:text-4xl">{uc.title}</h1>
          <p className="mt-2 text-sm text-ink-soft"><T k="tu.intro" en="An optimiser agent reads the failures on the tuning cases and proposes changes to the agent's rules, prompt and tools. Each change set becomes a new agent version that is evaluated again. The held-out cases are never shown to the optimiser; they decide approval." /></p>
          <p className="mt-2 rounded-lg border border-line px-3 py-2 text-sm font-medium">
            <T k="ev.sim" en="Simulated demo data: the agent, its outputs and the Sijil gate are all simulated, and the entity is fictitious. No model produced these outputs." /> <T k="tu.sim" en="Simulated: the optimiser is rule-based and the agent it tunes is simulated." />
          </p>
          {real && (
            <section className={`${card} mt-4`} aria-label="Real agent">
              <h2 className="text-lg font-semibold"><T k="tu2.title" en="The real agent, on the same screen" /></h2>
              <p className="mt-1 text-sm">
                {real.error ? <TV k="tn.t.error" en="The agent could not open under these settings: {e}" v={{ e: real.error }} /> : <TV k="tu2.line" en="The licence-renewal agent (the code the pilot uses), under settings v{v}: {k} of {n} per-task eval cases correct, {h} of {m} of them held out." v={{ v: real.version, k: real.rows.filter((r) => r.verdict === "correct").length, n: real.rows.length, h: real.rows.filter((r) => r.split === "holdout" && r.verdict === "correct").length, m: real.rows.filter((r) => r.split === "holdout").length }} />}
              </p>
              <p className="mt-1 text-xs text-ink-soft"><T k="tu2.sim" en="Still simulated on this page: the optimiser and the subject agent in the tuning cycle below. The score above is the real agent, run live on synthetic documents with recorded OCR and keyword retrieval." /></p>
              <p className="mt-2 text-sm"><Link href="/admin/federal/tuning" className="underline underline-offset-4"><T k="tu2.link" en="Tune the real agent: glossary, settings, rules and approval" /></Link></p>
            </section>
          )}
          <p className="mt-3 text-sm">
            <Link href={`/admin/federal/use-cases/${id}/evals`} className="underline underline-offset-4"><T k="ev.link.evals" en="Pilot evals: expected against actual output" /></Link>
            {" · "}
            <Link href={`/admin/federal/use-cases/${id}/production`} className="underline underline-offset-4"><T k="pr.link" en="Production monitoring" /></Link>
          </p>

          {!hasSet ? (
            <p className="mt-8 text-sm text-ink-soft"><TV k="ev.nocases" en="No eval set exists for {uc} yet. Eval sets are defined for UC01 and UC02." v={{ uc: uc.ext_id }} /></p>
          ) : (
            <>
              {mayRun && <div className="mt-6"><TuningControls useCaseId={id} canRun={log.length > 0} state={state} canReset={profile.role === "admin"} /></div>}

              <section className={`${card} mt-6`} aria-label="Current agent">
                <h2 className="text-lg font-semibold"><T k="tu.state.title" en="Current agent" />{cfg ? <> · <TV k="tu.state.version" en="Agent version {v}" v={{ v: cfg.version }} /></> : null}</h2>
                <p className="mt-1 text-sm">
                  {state === "approved" ? <><T k="tu.state.approved" en="Approved." /> {approver}</> : state === "ready" ? <T k="tu.state.ready" en="Certified and waiting for a person's decision." /> : log.length ? <T k="tu.state.open" en="In progress: not yet certified." /> : <T k="tu.state.none" en="Not started: no tuning has run yet." />}
                </p>
                {cfg && <Config cfg={cfg} />}
              </section>

              <ReleasePanel id={id} release={release} />
              <CostPanel ledger={ledger} />

              {state === "ready" && mayApprove && (
                <section className={`${card} mt-4`} aria-label="Decision">
                  <h2 className="text-lg font-semibold"><T k="tu.approve.title" en="Decision" /></h2>
                  <p className="mt-1 mb-3 text-sm text-ink-soft"><T k="tu.approve.text" en="The agent version below met the approval bar. A person decides whether it goes forward." /></p>
                  <ApproveForm useCaseId={id} blocked={approveBlocked} />
                </section>
              )}

              <section className="mt-8" aria-label="Iteration log">
                <h2 className="text-lg font-semibold"><T k="tu.h.log" en="How the agent improved" /></h2>
                <p className="mt-1 text-sm text-ink-soft">
                  {log.length === 0 ? <T k="tu.nolog" en="No entries yet. Run a tuning cycle." /> : chain.ok ? <TV k="tu.chain.ok" en="✓ Log chain verified: {n} entries, intact." v={{ n: log.length }} /> : <TV k="tu.chain.bad" en="✕ Log chain broken at entry {seq}: {reason}" v={{ seq: chain.broken_seq, reason: chain.reason }} />}
                </p>
                <ol className="mt-3 space-y-3">
                  {log.map((e) => <Entry key={e.seq} e={e} />)}
                </ol>
              </section>
            </>
          )}
        </main>
      </LangShell>
      <div className="h-12" />
    </div>
  );
}
