import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getUserAndProfile } from "@/lib/auth";
import { evalSetFor } from "@/lib/un/evalset";
import { isUuid } from "@/lib/un/model";
import { loadUseCase } from "@/lib/un/sijil-store";
import { approvalState, configOf, verifyChain } from "@/lib/un/tuning";
import { loadLog } from "@/lib/un/tuning-store";
import { POLICY, replay, type ProdStatus, type WatchEntry } from "@/lib/un/watchdog";
import { loadWatch } from "@/lib/un/watchdog-store";
import { RuleSentence } from "../../../_components/EvalText";
import LangShell, { T, TV } from "../../../_components/Lang";
import { card } from "../../../_components/ui";
import { ProductionControls, ReinstateForm } from "./ProductionControls";

export const metadata: Metadata = { title: "Production monitoring", robots: { index: false, follow: false } };

const DUBAI = { timeZone: "Asia/Dubai" } as const;
const num = (v: unknown) => (typeof v === "number" ? v : 0);
const str = (v: unknown) => (typeof v === "string" ? v : "");
const list = (v: unknown) => (Array.isArray(v) ? (v as unknown[]) : []);

const STATUS: Record<ProdStatus, { glyph: string; en: string; color: string }> = {
  active: { glyph: "●", en: "Active", color: "var(--color-v-auto)" },
  warned: { glyph: "▲", en: "Warned", color: "var(--color-v-esc)" },
  suspended: { glyph: "✕", en: "Suspended: taken down", color: "var(--color-v-nogo)" },
  probation: { glyph: "◐", en: "On probation", color: "var(--color-v-sup)" },
};
const REASON_EN: Record<string, string> = { sijil_rejection: "Sijil rejected calls", repeated_probe_failures: "Probes failed again", probe_failures: "Probes failed" };
const KIND_EN: Record<WatchEntry["kind"], string> = { deployed: "Deployed", window: "Monitoring window", warning: "Warning", suspension: "Suspended", reinstatement: "Reinstated", recovery: "Recovered" };

function Detail({ reason, rejected }: { reason: string; rejected: number }) {
  if (reason === "sijil_rejection") return <TV k="pr.d.sijil_rejection" en="Sijil rejected {r} call(s)" v={{ r: rejected }} />;
  if (reason === "repeated_probe_failures") return <T k="pr.d.repeated_probe_failures" en="Probes failed again (after a warning or on probation)" />;
  return <T k="pr.d.probe_failures" en="Probes failed, but Sijil rejected no call" />;
}

function Entry({ e }: { e: WatchEntry }) {
  const p = e.payload;
  const probes = (p.probes ?? {}) as { n?: number; correct?: number };
  const sijil = (p.sijil ?? {}) as { calls?: number; rejected?: number };
  const cases = list(p.cases) as { case_id: string; verdict: string; rejected: string[] }[];
  const bad = cases.filter((c) => c.verdict !== "correct");
  const rej = cases.flatMap((c) => c.rejected.map((r) => `${c.case_id} ${r.replace(":", " (")}${r.includes(":") ? ")" : ""}`));
  return (
    <li className="rounded-2xl border border-line bg-card p-4" style={e.kind === "suspension" ? { borderColor: "var(--color-v-nogo)" } : undefined}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-mono text-[11px] tracking-wide text-ink-soft uppercase">#{e.seq} · <T k={`pr.k.${e.kind}`} en={KIND_EN[e.kind]} /></p>
        <p className="text-xs text-ink-soft tabular-nums">{new Date(e.at).toLocaleString("en-GB", DUBAI)} · {e.actor}</p>
      </div>
      <div className="mt-2 text-sm">
        {e.kind === "deployed" && <TV k="pr.deployed" en="Agent v{v} went into production. Linked to the tuning log (head {hash})." v={{ v: num(p.version), hash: str(p.tuning_head_hash).slice(0, 12) }} />}
        {e.kind === "window" && (
          <>
            <p>
              <TV k="pr.window.text" en="Window {no} on agent v{v}: probes {k} of {n} correct, Sijil rejected {r} of {c} calls." v={{ no: num(p.window_no), v: num(p.config_version), k: num(probes.correct), n: num(probes.n), r: num(sijil.rejected), c: num(sijil.calls) }} />{" "}
              <strong>{p.clean ? <T k="pr.window.clean" en="Clean." /> : <T k="pr.window.notclean" en="Not clean." />}</strong>
            </p>
            {typeof p.drift === "string" && p.drift && <RuleSentence k="pr.window.drift" en="Simulated regression: the rule “{rule}” was dropped." rule={p.drift as never} />}
            {bad.length > 0 && <p className="mt-1 text-xs text-ink-soft"><TV k="pr.window.failed" en="Cases not correct: {ids}" v={{ ids: bad.map((c) => c.case_id).join(", ") }} /></p>}
            {rej.length > 0 && <p className="mt-1 text-xs" style={{ color: "var(--color-v-nogo)" }} dir="ltr"><TV k="pr.window.rejected" en="Sijil rejected: {items}" v={{ items: rej.join(", ") }} /></p>}
          </>
        )}
        {e.kind === "warning" && <><p className="font-medium"><Detail reason={str(p.reason)} rejected={num(p.rejected)} /></p><TV k="pr.warning.text" en="Warning. Penalty {p}." v={{ p: num(p.penalty) }} /></>}
        {e.kind === "suspension" && <><p className="font-medium"><Detail reason={str(p.reason)} rejected={num(p.rejected)} /></p><TV k="pr.suspension.text" en="Suspended and taken down. Penalty {p} (including {x} for a repeat). Rollback target: agent v{v}." v={{ p: num(p.penalty), x: num(p.repeat_extra), v: num(p.rollback_to) }} /></>}
        {e.kind === "reinstatement" && (
          <TV k="pr.reinstatement.text" en="{signer} reinstated the agent: rolled back to v{v}, re-test {k} of {n} correct, Sijil rejected {r} of {c}. Comment: “{comment}”" v={{ signer: str(p.signer), v: num(p.rolled_back_to), k: num((p.retest as { correct?: number })?.correct), n: num((p.retest as { n?: number })?.n), r: num((p.retest as { rejected?: number })?.rejected), c: num((p.retest as { calls?: number })?.calls), comment: str(p.comment) }} />
        )}
        {e.kind === "recovery" && (p.from === "probation" ? <T k="pr.recovery.probation" en="Probation complete: the agent is active again." /> : <T k="pr.recovery.warned" en="Recovered: a clean window cleared the warning." />)}
      </div>
      <code className="mt-2 block text-xs text-ink-soft">{e.hash.slice(0, 16)}…</code>
    </li>
  );
}

export default async function ProductionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect(`/login?next=/admin/federal/use-cases/${id}/production`);
  if (!profile?.org_id) redirect("/login");
  if (!isUuid(id)) notFound();
  const uc = await loadUseCase(profile.org_id, id);
  if (!uc) notFound();
  const [tuning, watch] = await Promise.all([
    loadLog(profile.org_id, id),
    loadWatch(profile.org_id, id),
  ]);
  const hasSet = evalSetFor(uc.ext_id).length > 0;
  const s = replay(watch);
  const certified = configOf(tuning);
  const approved = approvalState(tuning) === "approved";
  const chain = verifyChain(watch);
  const canEdit = profile.role === "admin";
  const st = STATUS[s.status];

  return (
    <div>
      <LangShell>
        <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
          <p className="font-mono text-xs tracking-[0.25em] text-ink-soft uppercase">
            <Link href={`/admin/federal/use-cases/${id}`} className="underline underline-offset-4">{uc.ext_id}</Link> · <T k="pr.eyebrow" en="Production monitoring" />
          </p>
          <h1 className="font-display mt-2 text-3xl font-medium tracking-tight sm:text-4xl">{uc.title}</h1>
          <p className="mt-2 text-sm text-ink-soft"><T k="pr.intro" en="After a person approves an agent version, the same evals keep running as monitoring windows, with Sijil's call and reject counts beside them. Behaviour that Sijil rejects is penalised and the agent is taken down. It returns only after a rollback to the last certified version, a passing re-test and a person's decision, and then on probation." /></p>
          <p className="mt-2 rounded-lg border border-line px-3 py-2 text-sm font-medium">
            <T k="ev.sim" en="Simulated demo data: the agent, its outputs and the Sijil gate are all simulated, and the entity is fictitious. No model produced these outputs." /> <T k="pr.sim" en="Simulated: the serving agent, its drift and the Sijil gate are simulated." />
          </p>
          <p className="mt-3 text-sm">
            <Link href={`/admin/federal/use-cases/${id}/tuning`} className="underline underline-offset-4"><T k="ev.link.tuning" en="Tuning and approval" /></Link>
          </p>

          {!hasSet ? (
            <p className="mt-8 text-sm text-ink-soft"><TV k="ev.nocases" en="No eval set exists for {uc} yet. Eval sets are defined for UC01 and UC02." v={{ uc: uc.ext_id }} /></p>
          ) : (
            <>
              {canEdit && (
                <div className="mt-6">
                  <ProductionControls useCaseId={id} deployed={s.deployed} serving={s.serving} canDeploy={approved} rules={certified?.rules ?? []} />
                </div>
              )}

              <section className={`${card} mt-6`} aria-label="Production status" style={s.deployed ? { borderColor: st.color } : undefined}>
                <h2 className="text-lg font-semibold"><T k="pr.status.title" en="Production status" /></h2>
                {!s.deployed ? (
                  <p className="mt-1 text-sm text-ink-soft"><T k="pr.nodeploy" en="Not in production. An agent version must be approved first." /></p>
                ) : (
                  <>
                    <p className="mt-2 text-2xl font-medium" style={{ color: st.color }}><span aria-hidden>{st.glyph}</span> <T k={`pr.s.${s.status}`} en={st.en} /></p>
                    <p className="mt-1 text-sm">{s.serving ? <T k="pr.serving.yes" en="Serving citizens" /> : <strong><T k="pr.serving.no" en="Taken down" /></strong>}</p>
                    {s.last_reason && s.status !== "active" && <p className="mt-1 text-sm text-ink-soft"><TV k="pr.reason" en="Reason: {reason}" v={{ reason: "" }} /> <T k={`pr.r.${s.last_reason}`} en={REASON_EN[s.last_reason] ?? s.last_reason.replace(/_/g, " ")} /></p>}
                    <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                      <div><dt className="text-ink-soft"><T k="pr.trust" en="Trust score" /></dt><dd className="text-2xl font-medium tabular-nums">{s.trust}<span className="text-sm text-ink-soft"> / {POLICY.start_trust}</span></dd></div>
                      <div><dt className="text-ink-soft"><T k="pr.strikes" en="Strikes" /></dt><dd className="text-2xl font-medium tabular-nums">{s.strikes}</dd></div>
                      <div><dt className="text-ink-soft"><T k="pr.windows" en="Monitoring windows" /></dt><dd className="text-2xl font-medium tabular-nums">{s.windows}</dd></div>
                      <div><dt className="text-ink-soft"><T k="pr.cert" en="Certified version" /></dt><dd className="text-2xl font-medium tabular-nums">v{s.certified_version}</dd></div>
                    </dl>
                  </>
                )}
              </section>

              {s.deployed && s.status === "suspended" && canEdit && (
                <section className={`${card} mt-4`} aria-label="Reinstate">
                  <h2 className="text-lg font-semibold"><T k="pr.re.title" en="Bring the agent back" /></h2>
                  <p className="mt-1 mb-3 text-sm text-ink-soft"><TV k="pr.re.text" en="The agent is taken down. Reinstating rolls it back to certified version {v}, re-tests it, and puts it on probation: {n} clean windows are needed, and any failure suspends it again with a larger penalty." v={{ v: s.certified_version ?? 0, n: POLICY.probation_windows }} /></p>
                  <ReinstateForm useCaseId={id} />
                </section>
              )}

              <section className="mt-8" aria-label="Production log">
                <h2 className="text-lg font-semibold"><T k="pr.h.log" en="Production log" /></h2>
                <p className="mt-1 text-sm text-ink-soft">
                  {watch.length === 0 ? <T k="pr.nolog" en="No entries yet." /> : chain.ok ? <TV k="tu.chain.ok" en="✓ Log chain verified: {n} entries, intact." v={{ n: watch.length }} /> : <TV k="tu.chain.bad" en="✕ Log chain broken at entry {seq}: {reason}" v={{ seq: chain.broken_seq, reason: chain.reason }} />}
                </p>
                <ol className="mt-3 space-y-3">
                  {[...watch].reverse().map((e) => <Entry key={e.seq} e={e} />)}
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
