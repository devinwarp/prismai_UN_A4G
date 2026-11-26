"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { RunState } from "@/lib/un/scenario";
import type { Verification } from "@/lib/un/trace";
import { GATES, type GateId, type GateStatus } from "@/lib/un/policy";
import { VERDICTS, type Verdict } from "@/lib/un/model";
import { knowledgeByAgent } from "@/lib/un/knowledge";
import { expectedCsv, expectedVsActual, matchSummary } from "@/lib/un/expected";
import { ROLES } from "@/lib/un/roles";
import type { RoleId } from "@/lib/un/policy";
import { T, useLang } from "../../_components/Lang";
import { tr, type Lang } from "@/lib/un/i18n/dict";
import { isSandboxOutcome, SANDBOX_EN, SANDBOX_KEY } from "@/lib/un/sandbox";
import Chain from "../../_components/Chain";
import { Term } from "../../_components/Gloss";
import { Tour, TourButton, type TourStep } from "../../_components/Coach";
import { Pipeline, VerdictHero } from "./RunParts";
import RunMetering from "./RunMetering";
import { GateChip, scrollRegion, Section, VerdictBadge, STATUS_META, btnGhost, btnPrimary, card, field } from "../../_components/ui";

const isVerdict = (s: string): s is Verdict => (VERDICTS as readonly string[]).includes(s);
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Asia/Dubai" });
/** Portfolio steps: "deployed 6/20 (30%), aligned 4/20 (20%), target 10, gap 4 ..." */
function dash(outcome: string) {
  const m = /deployed (\d+)\/(\d+).*?aligned (\d+)\/\d+.*?target (\d+)/.exec(outcome);
  return m ? { deployed: +m[1], total: +m[2], aligned: +m[3], target: +m[4] } : null;
}

function PortfolioBars({ outcome, lang }: { outcome: string; lang: Lang }) {
  const d = dash(outcome);
  if (!d) return null;
  const w = (n: number) => `${(n / d.total) * 100}%`;
  return (
    <div className="mt-3">
      <p className="mb-1 inline-block rounded-md border border-ember/60 px-2 py-0.5 font-mono text-[11px] font-medium text-ember">{tr(lang, SANDBOX_KEY, SANDBOX_EN)}</p>
      <div role="img" aria-label={`${tr(lang, SANDBOX_KEY, SANDBOX_EN)}. ${tr(lang, "uc.run.pf_aria", "Deployed {d} of {n}, aligned {c}, target {t}").replace("{d}", String(d.deployed)).replace("{n}", String(d.total)).replace("{c}", String(d.aligned)).replace("{t}", String(d.target))}`}>
        <div className="relative h-3 rounded-full bg-paper-deep">
          <div className="absolute inset-y-0 start-0 rounded-full bg-lit" style={{ width: w(d.deployed) }} />
          <div className="absolute inset-y-0 start-0 rounded-full" style={{ width: w(d.aligned), background: "var(--color-v-sup)" }} />
          <div aria-hidden className="absolute -top-1 -bottom-1 w-0.5 bg-ink" style={{ insetInlineStart: `calc(${w(d.target)} - 1px)` }} />
        </div>
      </div>
      <p className="mt-1 font-mono text-[11px] text-ink-soft">{tr(lang, "uc.run.pf_legend", "deployed {d} (green) · aligned {c} (blue) · target line {t} of {n}").replace("{d}", String(d.deployed)).replace("{c}", String(d.aligned)).replace("{t}", String(d.target)).replace("{n}", String(d.total))}</p>
    </div>
  );
}

const PRESETS: { id: string; label: string; summary: string; gate: GateId | ""; status: string; recipients: RoleId[] }[] = [
  { id: "leak", label: "A data leak", summary: "Personal data of citizens was sent to a third party that is not approved to hold it.", gate: "data_lawful", status: "fail", recipients: ["privacy", "security"] },
  { id: "complaint", label: "A citizen complaint", summary: "A citizen complained that the assistant quoted a fee that differs from the published fee schedule.", gate: "fee_accuracy", status: "fail", recipients: ["compliance", "frontline"] },
  { id: "regulation", label: "A new regulation", summary: "A new federal regulation now requires every citizen-facing assistant to say that it is an AI.", gate: "", status: "fail", recipients: ["policy_adviser", "compliance"] },
];

const TOUR: TourStep[] = [
  { target: "pipeline", k: "tour.run.pipeline", title: "Check, decide, sign", body: "Release evidence one step at a time. The agents check it, the policy engine decides, then a person signs." },
  { target: "verdict", k: "tour.run.verdict", title: "The decision, in words", body: "This is the current decision and the reason for it. It can change at every step." },
  { target: "editor", k: "tour.run.editor", title: "Try your own event", body: "Pick a preset such as a data leak and watch the decision move." },
  { target: "logbook", k: "tour.run.logbook", title: "A logbook nobody can quietly edit", body: "Each record locks to the previous one. Press Try to tamper with it to see a broken link." },
];

export default function RunView({
  runId, title, totalSteps, state, verification, sources, canEdit, llmAvailable, isGate,
}: {
  runId: string;
  title: string;
  totalSteps: number;
  state: RunState;
  verification: Verification;
  sources: Record<string, { title: string; url: string; sha256: string }>;
  canEdit: boolean;
  llmAvailable: boolean;
  /** A use-case (gate) scenario: it ends in a verdict a person signs. */
  isGate: boolean;
}) {
  const router = useRouter();
  const lang = useLang();
  const [tour, setTour] = useState(false);
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState<{ names: string[] } | null>(null);
  const [agent, setAgent] = useState<string>("all");
  const [llm, setLlm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  // Final human approval (I-4): the last chained record, once the run is done.
  const lastRecord = state.log[state.log.length - 1];
  const signature = lastRecord?.signature ?? null;
  const finalOutcome = state.steps[state.steps.length - 1]?.outcome ?? "";
  async function sign(decision: "SIGN" | "WITHHOLD") {
    if (decision === "WITHHOLD" && !comment.trim()) { setErr(tr(lang, "uc.run.need_comment", "Withholding approval needs a comment.")); return; }
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/admin/un/runs/${runId}/sign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, comment }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (res.ok) router.refresh();
    else setErr(data.error ?? tr(lang, "uc.run.failed", "Failed"));
  }
  const agents = [...new Set(state.log.map((r) => r.agent))];
  const rows = state.log.filter((r) => agent === "all" || r.agent === agent);
  const stepsIds = [...new Set(rows.map((r) => r.step))];

  // Gate x step matrix, cumulative: a gate keeps its last known status until new evidence moves it.
  const gateIds = [...new Set(state.steps.flatMap((s) => s.events.flatMap((e) => (e.gate ? [e.gate] : []))))] as GateId[];
  const gateAt = (g: GateId) => {
    let cur: GateStatus = "unknown";
    return state.steps.map((s) => {
      const hit = s.events.filter((e) => e.gate === g && e.status).pop();
      if (hit?.status) cur = hit.status;
      return { cur, moved: Boolean(hit) };
    });
  };
  const showGates = gateIds.length > 0;
  const know = knowledgeByAgent(state.steps);
  const expected = expectedVsActual(state.steps);
  function downloadExpected() {
    const url = URL.createObjectURL(new Blob([expectedCsv(expected)], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${state.run_id}-expected-vs-actual.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const nextLabel = state.steps.length ? <T k="run.release_next" en="Release next step" /> : <T k="run.release_first" en="Release first step" />;
  // Smart default: picking a rule ticks the agent that owns it, until the operator ticks their own.
  function pickGate(g: string) {
    setForm((f) => ({ ...f, gate: g, recipients: !touched && g ? [GATES[g as GateId].owner].filter((r): r is RoleId => r !== "coordinator") : f.recipients }));
  }
  function applyPreset(p: (typeof PRESETS)[number]) {
    setTouched(true);
    setForm((f) => ({ ...f, summary: p.summary, gate: p.gate, status: p.status, recipients: p.recipients }));
  }
  const scripted = state.steps.filter((s) => !s.adhoc);
  const slots = Array.from({ length: totalSteps }, (_, i) => scripted[i] ?? null);
  const signed = Boolean(signature);

  // Live scenario editor: one operator-written step, run through the same agents and engine.
  const agentRoles = (Object.keys(ROLES) as RoleId[]).filter((r) => r !== "coordinator");
  const [form, setForm] = useState({ summary: "", gate: "", status: "fail", expected: "", evidence: "", recipients: [] as RoleId[] });
  async function addStep() {
    setBusy(true);
    setErr(null);
    setPending({ names: form.recipients.map(roleName) });
    const res = await fetch(`/api/admin/un/runs/${runId}/adhoc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ summary: form.summary, recipients: form.recipients, llm, ...(form.gate ? { gate: form.gate, status: form.status } : {}), ...(form.expected ? { expected: form.expected } : {}), ...(form.gate && form.status === "fix_declared" && form.evidence.trim() ? { evidence: form.evidence.split(/[\s,;]+/).filter(Boolean) } : {}) }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    setPending(null);
    if (res.ok) { setForm({ ...form, summary: "" }); router.refresh(); } else setErr(data.error ?? tr(lang, "uc.run.failed", "Failed"));
  }

  // Tamper demo: the server edits a throwaway copy and runs the verifier; the stored run is never changed.
  const [tamper, setTamper] = useState<{ edited: { trace_id: string; before: string; after: string } | null; verification: Verification; named: string | null } | null>(null);
  async function tamperDemo() {
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/admin/un/runs/${runId}/export`, { method: "POST" });
    setBusy(false);
    if (res.ok) setTamper(await res.json()); else setErr(tr(lang, "uc.run.tamper_failed", "Tamper demo failed"));
  }

  async function next() {
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/admin/un/runs/${runId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ llm }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (res.ok) router.refresh();
    else setErr(data.error ?? tr(lang, "uc.run.failed", "Failed"));
  }

  const lastStep = state.steps[state.steps.length - 1];
  const prevVerdict = [...state.steps.slice(0, -1)].reverse().map((s) => s.outcome).find(isVerdict) ?? null;
  const heroVerdict = lastStep && isVerdict(lastStep.outcome) ? lastStep.outcome : null;
  const roleName = (r: RoleId) => tr(lang, `uc.role.${r}`, ROLES[r].label);
  const names = form.recipients.map(roleName);
  const gateOn = Boolean(form.gate);
  const startTour = () => setTour(true);

  const release = state.done ? (
    <p className="text-sm font-medium text-lit-deep"><span aria-hidden>✓</span> {tr(lang, "run.all_released", "All steps released")}</p>
  ) : canEdit ? (
    <>
      {llmAvailable && (
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" className="accent-[var(--color-lit)]" checked={llm} onChange={(e) => setLlm(e.target.checked)} />
          {tr(lang, "run.use_model", "Agents use the model")}
        </label>
      )}
      <button onClick={next} disabled={busy || !verification.ok} className={btnPrimary}>
        {busy ? tr(lang, "run.releasing", "Releasing…") : nextLabel}
      </button>
    </>
  ) : null;

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <Link href="/admin/federal/scenarios" className="text-sm text-ink-soft underline underline-offset-2"><span className="inline-block rtl:rotate-180">←</span> <T k="run.all_scenarios" en="All scenarios" /></Link>
          <h1 className="font-display mt-3 max-w-[30ch] text-3xl font-medium tracking-tight sm:text-4xl">{title}</h1>
          <p className="mt-2 font-mono text-xs text-ink-soft">
            <bdi dir="ltr">{state.run_id}</bdi> · {state.steps.length} / {totalSteps} {tr(lang, "run.steps_released", "steps released")}
            {" · "}<span className={verification.ok ? "text-lit-deep" : "font-medium text-ember"}><span aria-hidden>{verification.ok ? "✓" : "✕"}</span> {verification.ok ? tr(lang, "run.logbook_ok", "logbook verified") : tr(lang, "run.logbook_bad", "logbook broken")}</span>
          </p>
        </div>
        <TourButton onClick={startTour} />
      </header>

      {!verification.ok && (
        <div role="alert" className="rounded-2xl border-2 border-ember bg-paper p-5">
          <p className="text-base font-medium text-ember"><span aria-hidden>✕ </span>{tr(lang, "run.fail_head", "The logbook failed its check at record")} {(verification.brokenAt ?? 0) + 1}: {verification.reason}</p>
          <p className="mt-1 max-w-[60ch] text-sm text-ink-soft">{tr(lang, "run.fail_body", "Releasing is switched off. Nothing after the broken record can be trusted.")}</p>
        </div>
      )}

      <Pipeline released={state.steps.length} total={totalSteps} isGate={isGate} done={state.done} signed={signed} verdict={heroVerdict} signer={signature?.role ?? null} actions={release} />
      {err && <p role="alert" className="-mt-6 text-sm text-ember">✕ {err}</p>}

      {lastStep && heroVerdict && <VerdictHero step={lastStep.step} verdict={heroVerdict} prev={prevVerdict} reasons={lastStep.reasons} expectedOk={lastStep.adhoc && !lastStep.expected ? null : lastStep.match} />}
      {lastStep && !heroVerdict && (
        <section key={lastStep.step} aria-label={tr(lang, "uc.run.state", "Current state")} className="fx-fade rounded-2xl border border-line bg-card p-6">
          <p className="font-display text-2xl">{lastStep.outcome}</p>
          <PortfolioBars outcome={lastStep.outcome} lang={lang} />
        </section>
      )}
      {!lastStep && (
        <section className="rounded-2xl border border-dashed border-line p-6">
          <p className="font-display text-xl">{tr(lang, "run.empty_t", "Nothing released yet")}</p>
          <p className="mt-1 max-w-[60ch] text-sm text-ink-soft">{tr(lang, "run.empty_b", "Release the first step. Each step shows new evidence to only some of the agents, then the policy engine re-decides. You will see the decision appear here.")}</p>
        </section>
      )}

      {isGate && state.done && (
        <Section eyebrow={tr(lang, "run.final", "Final approval")} title={tr(lang, "run.signoff", "Human sign-off")} lede={<>{tr(lang, "run.signoff_l", "The agents and the policy engine propose; a person signs. The decision is written to the use case only after a Sign. Withholding leaves it without a decision.")}</>}>
          <div className={card}>
            <div className="flex flex-wrap items-center gap-3">
              {isVerdict(finalOutcome) && <VerdictBadge verdict={finalOutcome} size="lg" />}
              <p className="text-sm text-ink-soft">{tr(lang, "run.after_last", "decision after the last step")}</p>
            </div>
            {signature ? (
              <div role="status" className="fx-stamp mt-4 border-t border-line pt-3 text-sm">
                <p className={`text-base font-medium ${signature.decision === "SIGN" ? "text-lit-deep" : "text-ember"}`}>
                  <span aria-hidden>{signature.decision === "SIGN" ? "✓" : "✕"}</span>{" "}
                  {signature.decision === "SIGN" ? tr(lang, "run.signed", "Signed") : tr(lang, "run.withheld", "Approval withheld")} · {signature.role} · <bdi dir="ltr">{time(lastRecord.timestamp)}</bdi>
                </p>
                {signature.comment && <p className="mt-1 text-ink-soft">“{signature.comment}”</p>}
                <p className="mt-1 font-mono text-[11px] text-ink-soft">{tr(lang, "run.last_record", "Last record in the logbook")}: <bdi dir="ltr">{lastRecord.trace_id}</bdi> · {tr(lang, "uc.run.signer", "signer")} <bdi dir="ltr">{signature.signer_id}</bdi></p>
              </div>
            ) : canEdit ? (
              <div className="mt-4 border-t border-line pt-3">
                <label className="block text-xs">
                  <span className="font-medium">{tr(lang, "run.comment", "Comment (required to withhold)")}</span>
                  <textarea dir="auto" value={comment} onChange={(e) => setComment(e.target.value)} rows={2} maxLength={1000} className={`${field} mt-1 w-full`} />
                </label>
                <div className="mt-3 flex flex-wrap gap-3">
                  <button type="button" onClick={() => sign("SIGN")} disabled={busy || !verification.ok} className={btnPrimary}><T k="run.sign" en="Sign" /></button>
                  <button type="button" onClick={() => sign("WITHHOLD")} disabled={busy || !verification.ok} className={btnGhost}><T k="run.withhold" en="Withhold" /></button>
                </div>
              </div>
            ) : (
              <p className="mt-4 border-t border-line pt-3 text-sm text-ink-soft">{tr(lang, "run.await_sign", "Waiting for an administrator to sign.")}</p>
            )}
          </div>
        </Section>
      )}

      {isGate && canEdit && !signed && (
        <Section
          eyebrow={tr(lang, "ed.eyebrow", "Live scenario")}
          title={tr(lang, "ed.title", "Try your own event")}
          lede={tr(lang, "ed.lede", "Pick a starting point or write your own. The event goes through the same agents and policy engine and is written to the logbook like any step. It does not move the scripted steps.")}
        >
          <form data-tour="editor" className={card} onSubmit={(e) => { e.preventDefault(); void addStep(); }}>
            <p className="font-mono text-[11px] tracking-[0.2em] text-ink-soft uppercase">{tr(lang, "ed.presets", "Start from")}</p>
            <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={tr(lang, "ed.presets", "Start from")}>
              {PRESETS.map((p) => (
                <button key={p.id} type="button" onClick={() => applyPreset(p)} className="rounded-full border border-line bg-paper px-3.5 py-1.5 text-sm hover:border-ink-soft">
                  {tr(lang, `ed.p.${p.id}`, p.label)}
                </button>
              ))}
            </div>

            <ol className="mt-6 space-y-6">
              <li>
                <label className="block text-sm">
                  <span className="font-medium"><span aria-hidden className="me-2 font-mono text-xs text-ink-soft">1</span>{tr(lang, "ed.what", "What happened?")}</span>
                  <textarea dir="auto" value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} rows={2} maxLength={500} required placeholder={tr(lang, "ed.what_ph", "One plain sentence, as you would tell a colleague.")} className={`${field} mt-1 w-full`} />
                  <span className="mt-1 block text-end text-xs text-ink-soft tabular-nums">{form.summary.length} / 500</span>
                </label>
              </li>
              <li>
                <label className="block text-sm">
                  <span className="font-medium"><span aria-hidden className="me-2 font-mono text-xs text-ink-soft">2</span>{tr(lang, "ed.which", "Which rule does it test?")} <span className="font-normal text-ink-soft">({tr(lang, "ed.optional", "optional")})</span></span>
                  <select value={form.gate} onChange={(e) => pickGate(e.target.value)} className={`${field} mt-1 w-full`}>
                    <option value="">{tr(lang, "ed.nogate", "None: just give the agents context")}</option>
                    {(Object.keys(GATES) as GateId[]).map((g) => <option key={g} value={g}>{tr(lang, `gate.${g}`, GATES[g].label)}</option>)}
                  </select>
                </label>
                <fieldset disabled={!gateOn} className="mt-3 disabled:opacity-50">
                  <legend className="text-sm text-ink-soft">{tr(lang, "ed.result", "What does it do to that rule?")}</legend>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {(["fail", "pass", "fix_declared"] as const).map((s) => (
                      <label key={s} className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-lit ${form.status === s ? "border-ink bg-paper-deep" : "border-line hover:border-ink-soft"}`}>
                        <input type="radio" name="gate-status" className="sr-only" checked={form.status === s} onChange={() => setForm({ ...form, status: s })} />
                        <span aria-hidden style={{ color: STATUS_META[s].color }}>{STATUS_META[s].glyph}</span>
                        {tr(lang, `ed.s.${s}`, s === "fail" ? "Breaks it" : s === "pass" ? "Satisfies it" : "A fix is promised")}
                      </label>
                    ))}
                  </div>
                  {gateOn && form.status === "fix_declared" && (
                    <label className="mt-3 block text-sm">
                      <span className="font-medium">{tr(lang, "ed.evref", "Evidence reference for the fix")}</span>
                      <input value={form.evidence} onChange={(e) => setForm({ ...form, evidence: e.target.value })} className={`${field} mt-1 w-full font-mono`} dir="ltr" placeholder="S1-T0-audit" />
                      <span className="mt-0.5 block text-xs text-ink-soft">{tr(lang, "ed.evref_h", "An event id from this run or a knowledge-base chunk id. Without one the declaration is rejected and lifts nothing. The reference is checked to exist, not to prove the fix.")}</span>
                    </label>
                  )}
                </fieldset>
              </li>
              <li>
                <fieldset>
                  <legend className="text-sm font-medium"><span aria-hidden className="me-2 font-mono text-xs text-ink-soft">3</span>{tr(lang, "ed.who", "Who is told?")}</legend>
                  <p className="mt-0.5 text-xs text-ink-soft">{tr(lang, "ed.who_h", "Only these agents see the event. The rule's owner is ticked for you.")}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {agentRoles.map((r) => {
                      const on = form.recipients.includes(r);
                      return (
                        <label key={r} title={ROLES[r].mandate} className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-lit ${on ? "border-ink bg-paper-deep" : "border-line hover:border-ink-soft"}`}>
                          <input type="checkbox" className="sr-only" checked={on} onChange={(e) => { setTouched(true); setForm({ ...form, recipients: e.target.checked ? [...form.recipients, r] : form.recipients.filter((x) => x !== r) }); }} />
                          <span aria-hidden className="text-xs">{on ? "✓" : "+"}</span>{roleName(r)}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              </li>
            </ol>

            <details className="mt-5 text-sm">
              <summary className="w-fit cursor-pointer text-ink-soft underline underline-offset-2">{tr(lang, "ed.adv", "Advanced: score it against an expected decision")}</summary>
              <label className="mt-2 block text-xs">
                <span className="font-medium">{tr(lang, "ed.expected", "Expected decision")}</span>
                <select value={form.expected} onChange={(e) => setForm({ ...form, expected: e.target.value })} className={`${field} mt-1 w-full max-w-xs`}>
                  <option value="">{tr(lang, "ed.notscored", "Not scored")}</option>
                  {VERDICTS.map((v) => <option key={v} value={v}>{tr(lang, `verdict.${v}`, v)}</option>)}
                </select>
              </label>
            </details>

            <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-line pt-4">
              <button type="submit" disabled={busy || !verification.ok || !form.summary.trim() || !form.recipients.length} className={btnGhost}>{busy ? tr(lang, "ed.running", "Running…") : tr(lang, "ed.run", "Run this event")}</button>
              <p aria-live="polite" className={`min-w-0 flex-1 basis-64 text-sm ${busy ? "fx-pulse text-ink" : "text-ink-soft"}`}>
                {busy && pending
                  ? `${tr(lang, "ed.telling", "Telling")} ${pending.names.join(", ")}…`
                  : form.summary.trim() && names.length
                    ? `${tr(lang, "ed.preview", "Will tell")} ${names.join(", ")}${gateOn ? ` ${tr(lang, "ed.preview_g", "and mark")} “${tr(lang, `gate.${form.gate}`, GATES[form.gate as GateId].label)}” ${tr(lang, `ed.s2.${form.status}`, form.status === "fail" ? "as broken" : form.status === "pass" ? "as satisfied" : "as a promised fix")}` : ""}. ${tr(lang, "ed.preview_e", "Then the engine decides again.")}`
                    : tr(lang, "ed.need", "Write what happened and tick at least one agent.")}
              </p>
            </div>
          </form>
        </Section>
      )}

      <Section
        eyebrow={tr(lang, "log.eyebrow", "Integrity")}
        title={tr(lang, "log.title", "Tamper-proof logbook")}
        lede={<>{tr(lang, "log.lede_a", "Every step is written to a")} <Term id="logbook" />. {tr(lang, "log.lede_b", "Each record locks to the one before it, so a quiet edit to history is caught. Try it: the demo edits a throwaway copy and the checker names the record. Your real run is never changed.")}</>}
      >
        <div data-tour="logbook" className={card}>
          <Chain log={state.log} verification={verification} />
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <button type="button" onClick={tamperDemo} disabled={busy || !state.log.length} className={btnGhost}>{tr(lang, "log.tamper", "Try to tamper with it")}</button>
            <a href={`/api/admin/un/runs/${runId}/export`} download className="text-sm text-ink-soft underline underline-offset-2">{tr(lang, "log.export", "Export run (JSON)")}</a>
            <span className="text-xs text-ink-soft">{tr(lang, "log.cli", "Check an export offline with npm run verify-log.")}</span>
          </div>
          {tamper && (
            <div role="status" className="fx-fade mt-4 rounded-xl border border-dashed border-ember/60 p-4">
              <p className="font-mono text-[11px] tracking-[0.2em] text-ember uppercase">{tr(lang, "log.copy", "Throwaway copy, one record edited")}</p>
              {tamper.edited && <p className="mt-2 font-mono text-xs text-ink-soft"><bdi dir="ltr">{tamper.edited.trace_id}</bdi>: “{tamper.edited.before.slice(0, 60)}” <span className="inline-block rtl:rotate-180">→</span> “{tamper.edited.after.slice(0, 80)}”</p>}
              <div className="mt-3"><Chain log={state.log} verification={tamper.verification} /></div>
              <p className="mt-1 text-sm text-ink-soft">{tamper.named ? `${tr(lang, "log.named", "The checker named")} ${tamper.named}. ` : ""}{tr(lang, "log.real_ok", "The real logbook above is still intact: this was a copy.")}</p>
            </div>
          )}
        </div>
      </Section>

      <RunMetering metering={state.metering} />

      <Section eyebrow={tr(lang, "tl.eyebrow", "Timeline")} title={tr(lang, "tl.title", "Step by step")} lede={tr(lang, "tl.lede", "Each step releases new events to only some of the agents. The outcome is the decision the policy engine reaches from what has been shown so far.")}>
        <div {...scrollRegion("rv-prog")} className="relative overflow-x-auto pb-2">
        <ol id="rv-prog" className="flex gap-2" aria-label={tr(lang, "uc.run.progress", "Run progress")}>
          {slots.map((s, i) => (
            <li key={i} className="min-w-[8.5rem] flex-1">
              <a href={s ? `#step-${s.step}` : undefined} aria-current={s && i === state.steps.length - 1 ? "step" : undefined} className={`block rounded-xl border p-2.5 text-center ${s ? "border-line bg-card hover:border-ink-soft" : "border-dashed border-line text-ink-soft"} ${s && i === state.steps.length - 1 ? "outline-2 outline-offset-2 outline-ink" : ""}`}>
                <bdi dir="ltr" className="font-mono text-xs">{s ? s.step : `T${i}`}</bdi>
                <span className="mt-1.5 flex min-h-6 items-center justify-center">
                  {s ? (isVerdict(s.outcome) ? <VerdictBadge verdict={s.outcome} /> : <span className="font-mono text-[11px] tabular-nums" title={tr(lang, SANDBOX_KEY, SANDBOX_EN)}>{dash(s.outcome) ? `${dash(s.outcome)!.deployed}/${dash(s.outcome)!.total}` : "·"}</span>) : <span className="text-[11px]">{tr(lang, "uc.run.to_come", "to come")}</span>}
                </span>
                {s && <span className={`mt-1 block text-[11px] ${s.match ? "text-lit-deep" : "font-medium text-ember"}`}><span aria-hidden>{s.match ? "✓" : "✕"}</span> {s.match ? tr(lang, "uc.run.as_expected", "as expected") : tr(lang, "uc.run.unexpected", "unexpected")}</span>}
              </a>
            </li>
          ))}
        </ol>
        </div>

        {showGates && (
          <div {...scrollRegion("rv-gates")} className="relative mt-6 overflow-x-auto">
            <table className="w-full min-w-[28rem] border-separate border-spacing-1 text-sm">
              <caption id="rv-gates" className="mb-2 text-start font-mono text-[11px] tracking-widest text-ink-soft uppercase">{tr(lang, "uc.run.gate_after", "Gate status after each step")}</caption>
              <thead>
                <tr>
                  <th scope="col" className="text-start font-mono text-[10px] font-normal text-ink-soft uppercase">{tr(lang, "uc.run.gate", "Gate")}</th>
                  {state.steps.map((s) => <th key={s.step} scope="col" className="px-1 font-mono text-xs font-normal"><bdi dir="ltr">{s.step}</bdi></th>)}
                </tr>
              </thead>
              <tbody>
                {gateIds.map((g) => (
                  <tr key={g}>
                    <th scope="row" className="py-1 pe-3 text-start font-normal" title={GATES[g].label}>{tr(lang, `gate.${g}`, g.replaceAll("_", " "))}</th>
                    {gateAt(g).map((c, i) => {
                      const m = STATUS_META[c.cur];
                      return (
                        <td key={i} className="h-9 min-w-12 rounded-md text-center font-mono text-sm" style={{ background: `color-mix(in srgb, ${m.color} ${c.moved ? 22 : 8}%, transparent)`, outline: c.moved ? `1px solid color-mix(in srgb, ${m.color} 60%, transparent)` : undefined }} title={`${tr(lang, `status.${c.cur}`, m.label)}${c.moved ? tr(lang, "uc.run.new_ev", " (new evidence this step)") : tr(lang, "uc.run.carried", " (carried over)")}`}>
                          <span aria-hidden style={{ color: m.color }}>{m.glyph}</span>
                          <span className="sr-only">{tr(lang, `status.${c.cur}`, m.label)}{c.moved ? tr(lang, "uc.run.new_ev_sr", ", new evidence") : ""}</span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 font-mono text-[11px] text-ink-soft">{tr(lang, "uc.run.legend", "✓ pass · ✕ fail · ↻ fix declared, not re-tested · ? no evidence. Outlined cell = evidence arrived this step.")}</p>
          </div>
        )}

        {expected.length > 0 && (
          <div {...scrollRegion("rv-exp")} className="relative mt-8 overflow-x-auto">
            <table className="w-full min-w-[28rem] border-separate border-spacing-y-1 text-sm">
              <caption id="rv-exp" className="mb-2 flex flex-wrap items-center justify-between gap-3 text-start">
                <span className="font-mono text-[11px] tracking-widest text-ink-soft uppercase">{tr(lang, "uc.run.expvsact", "Expected vs actual")} · {tr(lang, "uc.run.match_sum", matchSummary(expected)).replace("{a}", String(expected.filter((r) => r.match).length)).replace("{b}", String(expected.length))}</span>
                <button type="button" onClick={downloadExpected} className="text-xs underline underline-offset-2">{tr(lang, "uc.run.csv", "Download CSV")}</button>
              </caption>
              <thead>
                <tr className="text-start font-mono text-[10px] font-normal text-ink-soft uppercase">
                  <th scope="col" className="font-normal">{tr(lang, "uc.run.col_step", "Step")}</th><th scope="col" className="font-normal">{tr(lang, "uc.run.col_expected", "Expected")}</th><th scope="col" className="font-normal">{tr(lang, "uc.run.col_actual", "Actual")}</th><th scope="col" className="font-normal">{tr(lang, "uc.run.col_match", "Match")}</th>
                </tr>
              </thead>
              <tbody>
                {expected.map((r) => (
                  <tr key={r.step}>
                    <th scope="row" className="py-1 pe-3 text-start font-mono text-xs font-normal"><bdi dir="ltr">{r.step}</bdi></th>
                    <td className="pe-3">{isVerdict(r.expected) ? <VerdictBadge verdict={r.expected} /> : <span className="text-xs">{r.expected}</span>}</td>
                    <td className="pe-3">{isVerdict(r.actual) ? <VerdictBadge verdict={r.actual} /> : <span className="text-xs">{r.actual}</span>}{isSandboxOutcome(r.actual) && <span className="block text-[11px] text-ember">{tr(lang, SANDBOX_KEY, SANDBOX_EN)}</span>}</td>
                    <td className={r.match ? "text-lit-deep" : "font-medium text-ember"}><span aria-hidden>{r.match ? "✓" : "✕"}</span> {r.match ? tr(lang, "uc.run.match", "match") : tr(lang, "uc.run.differs", "differs")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {know.length > 1 && (
          <div {...scrollRegion("rv-know")} className="relative mt-8 overflow-x-auto">
            <table className="w-full min-w-[40rem] border-separate border-spacing-1 text-sm">
              <caption id="rv-know" className="mb-2 text-start font-mono text-[11px] tracking-widest text-ink-soft uppercase">{tr(lang, "uc.run.know_cap", "What each agent knows after each step")}</caption>
              <thead>
                <tr>
                  <th scope="col" className="text-start font-mono text-[10px] font-normal text-ink-soft uppercase">{tr(lang, "uc.run.col_step", "Step")}</th>
                  {know.map((a) => <th key={a.role} scope="col" className="px-1 text-start text-xs font-medium" title={ROLES[a.role].mandate}>{roleName(a.role)}</th>)}
                </tr>
              </thead>
              <tbody>
                {state.steps.map((s, i) => (
                  <tr key={s.step} className="align-top">
                    <th scope="row" className="py-1 pe-2 text-start font-mono text-xs font-normal"><bdi dir="ltr">{s.step}</bdi></th>
                    {know.map((a) => (
                      <td key={a.role} className={`min-w-36 rounded-md border p-1.5 text-xs ${a.received[i].length ? "border-lit/50 bg-lit-soft/30" : "border-dashed border-line text-ink-soft"}`}>
                        {a.received[i].length
                          ? a.received[i].map((e) => <span key={e.id} className="mb-1 block"><bdi dir="ltr" className="font-mono text-[10px] text-ink-soft">{e.id}</bdi> {e.summary}</span>)
                          : <span>{tr(lang, "uc.run.nothing_new", "nothing new")}</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 font-mono text-[11px] text-ink-soft">{tr(lang, "uc.run.know_note", "Each event reaches only some agents. A blank cell means that agent was told nothing at that step and cannot reason about what it did not see.")}</p>
          </div>
        )}

        <ol className="mt-8 space-y-4">
          {state.steps.map((s) => (
            <li key={s.step} id={`step-${s.step}`} className={`${card} scroll-mt-6`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-mono text-sm font-medium"><bdi dir="ltr">{s.step}</bdi> <span className="font-normal text-ink-soft">· {tr(lang, "uc.run.released", "released")} <bdi dir="ltr">{time(s.released_at)}</bdi></span></p>
                <p className={`text-sm font-medium ${s.match ? "text-lit-deep" : "text-ember"}`}>
                  {s.adhoc && !s.expected ? tr(lang, "uc.run.adhoc", "ad hoc, not scored") : <><span aria-hidden>{s.match ? "✓" : "✕"}</span> {s.match ? tr(lang, "uc.run.matches_exp", "matches expected") : tr(lang, "uc.run.expected_x", "expected {v}").replace("{v}", s.expected ? tr(lang, `verdict.${s.expected}`, s.expected) : "")}</>}
                </p>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {isVerdict(s.outcome) && <VerdictBadge verdict={s.outcome} size="lg" />}
                <p className={`font-display ${isVerdict(s.outcome) ? "text-lg text-ink-soft" : "text-xl"}`}>{isVerdict(s.outcome) ? tr(lang, "uc.run.verdict_after", "verdict after this step") : s.outcome}</p>
              </div>
              {!isVerdict(s.outcome) && <PortfolioBars outcome={s.outcome} lang={lang} />}
              {s.reasons.length > 0 && (
                <ul className="mt-3 space-y-1 text-sm">
                  {s.reasons.map((r) => <li key={r} className="flex gap-2"><span aria-hidden className="text-ink-soft rtl:rotate-180">→</span><span>{r}</span></li>)}
                </ul>
              )}
              <div className="mt-4 border-t border-line pt-3">
                <p className="font-mono text-[10px] tracking-widest text-ink-soft uppercase">{tr(lang, "uc.run.events_rel", "Events released this step")}</p>
                <ul className="mt-2 space-y-2 text-sm">
                  {s.events.map((e) => (
                    <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <bdi dir="ltr" className="font-mono text-xs text-ink-soft">{e.id}</bdi>
                      <span className="min-w-0 flex-1 basis-60">{e.summary}</span>
                      {e.gate && e.status && <GateChip gate={e.gate} status={e.status} />}
                      <span className="rounded-full border border-line px-2 py-0.5 font-mono text-[11px] text-ink-soft">{tr(lang, "uc.run.only", "only")} <bdi dir="ltr">{e.recipients.join(", ")}</bdi></span>
                    </li>
                  ))}
                </ul>
              </div>
              {(() => {
                const cites = [...new Map(state.log.filter((r) => r.step === s.step).flatMap((r) => r.kb_citations).map((c) => [c.chunk_id, c])).values()];
                return cites.length > 0 && (
                  <details className="mt-3 text-sm">
                    <summary className="w-fit cursor-pointer font-medium underline decoration-line underline-offset-4 hover:decoration-ink">{tr(lang, "step.evidence", "Show the evidence behind this step")} ({cites.length})</summary>
                    <div className="mt-2 space-y-2">
                      {cites.map((c) => (
                        <blockquote key={c.chunk_id} className="rounded-lg border border-lit/40 bg-lit-soft/30 p-3">
                          <span className="font-display text-base italic">“{c.quote}”</span>
                          <cite className="mt-1.5 block font-mono text-[11px] text-ink-soft not-italic">
                            {sources[c.chunk_id] ? <a href={sources[c.chunk_id].url} className="font-sans text-xs text-ink underline underline-offset-2" target="_blank" rel="noreferrer">{sources[c.chunk_id].title}</a> : tr(lang, "uc.run.src_unavail", "source unavailable")} · <bdi dir="ltr">{c.chunk_id}</bdi>
                          </cite>
                        </blockquote>
                      ))}
                    </div>
                  </details>
                );
              })()}
            </li>
          ))}
          {!state.steps.length && <li className={`${card} text-sm text-ink-soft`}>{tr(lang, "uc.run.no_events", "No events released yet. Nothing has been shown to any agent.")}</li>}
        </ol>
      </Section>

      <Section
        eyebrow={tr(lang, "uc.run.audit", "Audit trail")}
        title={`${tr(lang, "trace.title", "Reasoning trace")} (${rows.length})`}
        lede={tr(lang, "uc.run.audit_lede", "What each agent saw, claimed and cited, in order. Evidence quoted from the knowledge base is set apart from the agent's own reasoning.")}
        aside={
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label={tr(lang, "uc.run.filter", "Filter by agent")}>
            {["all", ...agents].map((a) => (
              <button key={a} onClick={() => setAgent(a)} aria-pressed={agent === a}
                className={`rounded-full border px-3 py-1 text-xs ${agent === a ? "border-ink bg-ink text-paper" : "border-line hover:border-ink-soft"}`}>{a === "all" ? tr(lang, "uc.run.all", "all") : <bdi dir="ltr">{a}</bdi>}</button>
            ))}
          </div>
        }
      >
        <div className="space-y-6">
          {stepsIds.map((st) => (
            <div key={st}>
              <h3 className="mb-2 font-mono text-xs tracking-widest text-ink-soft uppercase">{tr(lang, "uc.run.step", "Step")} <bdi dir="ltr">{st}</bdi></h3>
              <ol className="space-y-3">
                {rows.filter((r) => r.step === st).map((r) => {
                  const rejected = r.disposition.startsWith("rejected");
                  return (
                    <li key={r.trace_id} className={`rounded-xl border bg-card p-4 ${rejected ? "border-ember/60" : "border-line"}`}>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <bdi dir="ltr" className="font-mono text-xs">{r.trace_id}</bdi>
                        <span className="rounded-md bg-paper-deep px-2 py-0.5 text-xs font-medium">{r.agent}</span>
                        {r.proposal && <span className="rounded-md border border-line px-2 py-0.5 font-mono text-[11px]">{tr(lang, "uc.run.proposes", "proposes:")} <bdi dir="ltr">{r.proposal}</bdi></span>}
                        {r.disposition !== "accepted" && (
                          <span className={`font-mono text-[11px] ${rejected ? "font-medium text-ember" : "text-ink-soft"}`}>{rejected && <span aria-hidden>✕ </span>}{r.disposition}</span>
                        )}
                      </div>
                      <p className="mt-2 font-mono text-[11px] text-ink-soft">{tr(lang, "uc.run.saw", "Saw:")} <bdi dir="ltr">{r.inputs_seen.join(", ") || "-"}</bdi></p>
                      {/* The agent's reasoning: plain text. */}
                      <div className="mt-2 space-y-1.5 text-sm">
                        <p className="font-mono text-[10px] tracking-widest text-ink-soft uppercase">{tr(lang, "uc.run.reasoning", "Agent reasoning")}</p>
                        {r.claims.map((c) => (
                          <p key={c.text}>{c.text}{c.evidence.length > 0 && <span className="ms-2 font-mono text-[11px] text-ink-soft">[{c.evidence.join(", ")}]</span>}</p>
                        ))}
                      </div>
                      {/* Evidence: quoted, framed and sourced, so it never reads as the agent's own words. */}
                      {r.kb_citations.length > 0 && (
                        <div className="mt-3 space-y-2">
                          <p className="font-mono text-[10px] tracking-widest text-ink-soft uppercase">{tr(lang, "uc.run.cited", "Cited evidence")}</p>
                          {r.kb_citations.map((c) => (
                            <blockquote key={c.chunk_id} className="rounded-lg border border-lit/40 bg-lit-soft/30 p-3 text-sm">
                              <span className="font-display text-base italic">“{c.quote}”</span>
                              <cite className="mt-1.5 block font-mono text-[11px] text-ink-soft not-italic">
                                {sources[c.chunk_id] ? <a href={sources[c.chunk_id].url} className="font-sans text-xs text-ink underline underline-offset-2" target="_blank" rel="noreferrer">{sources[c.chunk_id].title}</a> : "source unavailable"}
                                {" · "}<bdi dir="ltr">{c.chunk_id}</bdi>{sources[c.chunk_id] && <> · <bdi dir="ltr" className="break-all">sha256 {sources[c.chunk_id].sha256.slice(0, 10)}…</bdi></>}
                              </cite>
                            </blockquote>
                          ))}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
          {!rows.length && <p className="text-sm text-ink-soft">{tr(lang, "uc.run.no_trace", "No trace records yet.")}</p>}
        </div>
      </Section>
    <Tour steps={TOUR} open={tour} onClose={() => setTour(false)} />
    </div>
  );
}
