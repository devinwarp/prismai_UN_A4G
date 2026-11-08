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
import { GateChip, Section, VerdictBadge, STATUS_META, btnGhost, btnPrimary, card, field } from "../../_components/ui";

const isVerdict = (s: string): s is Verdict => (VERDICTS as readonly string[]).includes(s);
const time = (iso: string) => new Date(iso).toLocaleTimeString();
/** Portfolio steps: "deployed 6/20 (30%), compliant 4/20 (20%), target 10, gap 4 ..." */
function dash(outcome: string) {
  const m = /deployed (\d+)\/(\d+).*?compliant (\d+)\/\d+.*?target (\d+)/.exec(outcome);
  return m ? { deployed: +m[1], total: +m[2], compliant: +m[3], target: +m[4] } : null;
}

function PortfolioBars({ outcome }: { outcome: string }) {
  const d = dash(outcome);
  if (!d) return null;
  const w = (n: number) => `${(n / d.total) * 100}%`;
  return (
    <div className="mt-3" role="img" aria-label={`Deployed ${d.deployed} of ${d.total}, compliant ${d.compliant}, target ${d.target}`}>
      <div className="relative h-3 rounded-full bg-paper-deep">
        <div className="absolute inset-y-0 left-0 rounded-full bg-lit" style={{ width: w(d.deployed) }} />
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: w(d.compliant), background: "var(--color-v-sup)" }} />
        <div aria-hidden className="absolute -top-1 -bottom-1 w-0.5 bg-ink" style={{ left: `calc(${w(d.target)} - 1px)` }} />
      </div>
      <p className="mt-1 font-mono text-[11px] text-ink-soft">deployed {d.deployed} (green) · compliant {d.compliant} (blue) · target line {d.target} of {d.total}</p>
    </div>
  );
}

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
    if (decision === "WITHHOLD" && !comment.trim()) { setErr("Withholding approval needs a comment."); return; }
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
    else setErr(data.error ?? "Failed");
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

  const nextLabel = state.steps.length ? "Release next step" : "Release first step";
  const slots = Array.from({ length: totalSteps }, (_, i) => state.steps[i] ?? null);

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
    else setErr(data.error ?? "Failed");
  }

  return (
    <div className="space-y-12">
      <header>
        <Link href="/admin/federal/scenarios" className="text-sm text-ink-soft underline underline-offset-2">← All scenarios</Link>
        <h1 className="font-display mt-3 max-w-[30ch] text-3xl font-medium tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-2 font-mono text-xs text-ink-soft">{state.run_id} · {state.steps.length} of {totalSteps} steps released</p>
      </header>

      {/* Integrity first: this is what makes every verdict below trustworthy. */}
      <div role="status" className={`flex flex-wrap items-center justify-between gap-4 rounded-2xl border-2 p-5 ${verification.ok ? "border-lit/60 bg-lit-soft/40" : "border-ember bg-paper"}`}>
        <div className="flex items-start gap-4">
          <span aria-hidden className={`font-display text-4xl leading-none ${verification.ok ? "text-lit-deep" : "text-ember"}`}>{verification.ok ? "✓" : "✕"}</span>
          <div>
            <p className={`text-base font-medium ${verification.ok ? "text-lit-deep" : "text-ember"}`}>
              {verification.ok
                ? `Trace log verified: ${verification.length} records, hash chain intact`
                : `Trace log FAILED verification at record ${(verification.brokenAt ?? 0) + 1}: ${verification.reason}`}
            </p>
            <p className="mt-0.5 max-w-[60ch] text-sm text-ink-soft">
              {verification.ok
                ? "Each record's hash covers the one before it, so any edit to history would break the chain. Re-checked on every load."
                : "Release is disabled. Nothing after the broken record can be trusted."}
            </p>
          </div>
        </div>
        {canEdit && !state.done && (
          <div className="flex flex-wrap items-center gap-3">
            {llmAvailable && (
              <label className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" className="accent-[var(--color-lit)]" checked={llm} onChange={(e) => setLlm(e.target.checked)} />
                Agents use the model
              </label>
            )}
            <button onClick={next} disabled={busy || !verification.ok} className={btnPrimary}>
              {busy ? "Releasing…" : nextLabel}
            </button>
          </div>
        )}
        {state.done && <p className="text-sm font-medium text-ink-soft">✓ All steps released.</p>}
      </div>
      {err && <p role="alert" className="-mt-8 text-sm text-ember">✕ {err}</p>}

      {isGate && state.done && (
        <Section eyebrow="Final approval" title="Human sign-off" lede="The policy engine and the agents propose; a person signs. The verdict is written to the use case only after a Sign, together with this run, its head hash and the signer. Withholding leaves the use case without a verdict.">
          <div className={card}>
            <div className="flex flex-wrap items-center gap-3">
              {isVerdict(finalOutcome) && <VerdictBadge verdict={finalOutcome} size="lg" />}
              <p className="text-sm text-ink-soft">verdict after the last step</p>
            </div>
            {signature ? (
              <div role="status" className="mt-4 border-t border-line pt-3 text-sm">
                <p className={`font-medium ${signature.decision === "SIGN" ? "text-lit-deep" : "text-ember"}`}>
                  <span aria-hidden>{signature.decision === "SIGN" ? "✓" : "✕"}</span>{" "}
                  {signature.decision === "SIGN" ? "Signed" : "Approval withheld"} by {signature.role} · {time(lastRecord.timestamp)}
                </p>
                {signature.comment && <p className="mt-1 text-ink-soft">“{signature.comment}”</p>}
                <p className="mt-1 font-mono text-[11px] text-ink-soft">Last record in the chain: {lastRecord.trace_id} · signer {signature.signer_id}</p>
              </div>
            ) : canEdit ? (
              <div className="mt-4 border-t border-line pt-3">
                <label className="block text-xs">
                  <span className="font-medium">Comment (required to withhold)</span>
                  <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} maxLength={1000} className={`${field} mt-1 w-full`} />
                </label>
                <div className="mt-3 flex flex-wrap gap-3">
                  <button type="button" onClick={() => sign("SIGN")} disabled={busy || !verification.ok} className={btnPrimary}>Sign</button>
                  <button type="button" onClick={() => sign("WITHHOLD")} disabled={busy || !verification.ok} className={btnGhost}>Withhold</button>
                </div>
              </div>
            ) : (
              <p className="mt-4 border-t border-line pt-3 text-sm text-ink-soft">Awaiting a signature from an administrator.</p>
            )}
          </div>
        </Section>
      )}

      <Section eyebrow="Timeline" title="Step by step" lede="Each step releases new events to only some of the agents. The outcome is the verdict the policy engine reaches from what has been shown so far.">
        <div className="relative overflow-x-auto pb-2">
        <ol className="flex gap-2" aria-label="Run progress">
          {slots.map((s, i) => (
            <li key={i} className="min-w-[8.5rem] flex-1">
              <a href={s ? `#step-${s.step}` : undefined} aria-current={s && i === state.steps.length - 1 ? "step" : undefined} className={`block rounded-xl border p-2.5 text-center ${s ? "border-line bg-card hover:border-ink-soft" : "border-dashed border-line text-ink-soft"} ${s && i === state.steps.length - 1 ? "outline-2 outline-offset-2 outline-ink" : ""}`}>
                <span className="font-mono text-xs">{s ? s.step : `T${i}`}</span>
                <span className="mt-1.5 flex min-h-6 items-center justify-center">
                  {s ? (isVerdict(s.outcome) ? <VerdictBadge verdict={s.outcome} /> : <span className="font-mono text-[11px] tabular-nums">{dash(s.outcome) ? `${dash(s.outcome)!.deployed}/${dash(s.outcome)!.total}` : "·"}</span>) : <span className="text-[11px]">to come</span>}
                </span>
                {s && <span className={`mt-1 block text-[11px] ${s.match ? "text-lit-deep" : "font-medium text-ember"}`}><span aria-hidden>{s.match ? "✓" : "✕"}</span> {s.match ? "as expected" : "unexpected"}</span>}
              </a>
            </li>
          ))}
        </ol>
        </div>

        {showGates && (
          <div className="relative mt-6 overflow-x-auto">
            <table className="w-full min-w-[28rem] border-separate border-spacing-1 text-sm">
              <caption className="mb-2 text-left font-mono text-[11px] tracking-widest text-ink-soft uppercase">Gate status after each step</caption>
              <thead>
                <tr>
                  <th scope="col" className="text-left font-mono text-[10px] font-normal text-ink-soft uppercase">Gate</th>
                  {state.steps.map((s) => <th key={s.step} scope="col" className="px-1 font-mono text-xs font-normal">{s.step}</th>)}
                </tr>
              </thead>
              <tbody>
                {gateIds.map((g) => (
                  <tr key={g}>
                    <th scope="row" className="py-1 pr-3 text-left font-normal" title={GATES[g].label}>{g.replaceAll("_", " ")}</th>
                    {gateAt(g).map((c, i) => {
                      const m = STATUS_META[c.cur];
                      return (
                        <td key={i} className="h-9 min-w-12 rounded-md text-center font-mono text-sm" style={{ background: `color-mix(in srgb, ${m.color} ${c.moved ? 22 : 8}%, transparent)`, outline: c.moved ? `1px solid color-mix(in srgb, ${m.color} 60%, transparent)` : undefined }} title={`${m.label}${c.moved ? " (new evidence this step)" : " (carried over)"}`}>
                          <span aria-hidden style={{ color: m.color }}>{m.glyph}</span>
                          <span className="sr-only">{m.label}{c.moved ? ", new evidence" : ""}</span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 font-mono text-[11px] text-ink-soft">✓ pass · ✕ fail · ↻ fix declared, not re-tested · ? no evidence. Outlined cell = evidence arrived this step.</p>
          </div>
        )}

        {expected.length > 0 && (
          <div className="relative mt-8 overflow-x-auto">
            <table className="w-full min-w-[28rem] border-separate border-spacing-y-1 text-sm">
              <caption className="mb-2 flex flex-wrap items-center justify-between gap-3 text-left">
                <span className="font-mono text-[11px] tracking-widest text-ink-soft uppercase">Expected vs actual · {matchSummary(expected)}</span>
                <button type="button" onClick={downloadExpected} className="text-xs underline underline-offset-2">Download CSV</button>
              </caption>
              <thead>
                <tr className="text-left font-mono text-[10px] font-normal text-ink-soft uppercase">
                  <th scope="col" className="font-normal">Step</th><th scope="col" className="font-normal">Expected</th><th scope="col" className="font-normal">Actual</th><th scope="col" className="font-normal">Match</th>
                </tr>
              </thead>
              <tbody>
                {expected.map((r) => (
                  <tr key={r.step}>
                    <th scope="row" className="py-1 pr-3 text-left font-mono text-xs font-normal">{r.step}</th>
                    <td className="pr-3">{isVerdict(r.expected) ? <VerdictBadge verdict={r.expected} /> : <span className="text-xs">{r.expected}</span>}</td>
                    <td className="pr-3">{isVerdict(r.actual) ? <VerdictBadge verdict={r.actual} /> : <span className="text-xs">{r.actual}</span>}</td>
                    <td className={r.match ? "text-lit-deep" : "font-medium text-ember"}><span aria-hidden>{r.match ? "✓" : "✕"}</span> {r.match ? "match" : "differs"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {know.length > 1 && (
          <div className="relative mt-8 overflow-x-auto">
            <table className="w-full min-w-[40rem] border-separate border-spacing-1 text-sm">
              <caption className="mb-2 text-left font-mono text-[11px] tracking-widest text-ink-soft uppercase">What each agent knows after each step</caption>
              <thead>
                <tr>
                  <th scope="col" className="text-left font-mono text-[10px] font-normal text-ink-soft uppercase">Step</th>
                  {know.map((a) => <th key={a.role} scope="col" className="px-1 text-left text-xs font-medium" title={ROLES[a.role].mandate}>{ROLES[a.role].label}</th>)}
                </tr>
              </thead>
              <tbody>
                {state.steps.map((s, i) => (
                  <tr key={s.step} className="align-top">
                    <th scope="row" className="py-1 pr-2 text-left font-mono text-xs font-normal">{s.step}</th>
                    {know.map((a) => (
                      <td key={a.role} className={`min-w-36 rounded-md border p-1.5 text-xs ${a.received[i].length ? "border-lit/50 bg-lit-soft/30" : "border-dashed border-line text-ink-soft"}`}>
                        {a.received[i].length
                          ? a.received[i].map((e) => <span key={e.id} className="mb-1 block"><span className="font-mono text-[10px] text-ink-soft">{e.id}</span> {e.summary}</span>)
                          : <span>nothing new</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 font-mono text-[11px] text-ink-soft">Each event reaches only some agents. A blank cell means that agent was told nothing at that step and cannot reason about what it did not see.</p>
          </div>
        )}

        <ol className="mt-8 space-y-4">
          {state.steps.map((s) => (
            <li key={s.step} id={`step-${s.step}`} className={`${card} scroll-mt-6`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-mono text-sm font-medium">{s.step} <span className="font-normal text-ink-soft">· released {time(s.released_at)}</span></p>
                <p className={`text-sm font-medium ${s.match ? "text-lit-deep" : "text-ember"}`}>
                  <span aria-hidden>{s.match ? "✓" : "✕"}</span> {s.match ? "matches expected" : `expected ${s.expected}`}
                </p>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {isVerdict(s.outcome) && <VerdictBadge verdict={s.outcome} size="lg" />}
                <p className={`font-display ${isVerdict(s.outcome) ? "text-lg text-ink-soft" : "text-xl"}`}>{isVerdict(s.outcome) ? "verdict after this step" : s.outcome}</p>
              </div>
              {!isVerdict(s.outcome) && <PortfolioBars outcome={s.outcome} />}
              {s.reasons.length > 0 && (
                <ul className="mt-3 space-y-1 text-sm">
                  {s.reasons.map((r) => <li key={r} className="flex gap-2"><span aria-hidden className="text-ink-soft">→</span><span>{r}</span></li>)}
                </ul>
              )}
              <div className="mt-4 border-t border-line pt-3">
                <p className="font-mono text-[10px] tracking-widest text-ink-soft uppercase">Events released this step</p>
                <ul className="mt-2 space-y-2 text-sm">
                  {s.events.map((e) => (
                    <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-mono text-xs text-ink-soft">{e.id}</span>
                      <span className="min-w-0 flex-1 basis-60">{e.summary}</span>
                      {e.gate && e.status && <GateChip gate={e.gate} status={e.status} />}
                      <span className="rounded-full border border-line px-2 py-0.5 font-mono text-[11px] text-ink-soft">only {e.recipients.join(", ")}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
          {!state.steps.length && <li className={`${card} text-sm text-ink-soft`}>No events released yet. Nothing has been shown to any agent.</li>}
        </ol>
      </Section>

      <Section
        eyebrow="Audit trail"
        title={`Reasoning trace (${rows.length})`}
        lede="What each agent saw, claimed and cited, in order. Evidence quoted from the knowledge base is set apart from the agent's own reasoning."
        aside={
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by agent">
            {["all", ...agents].map((a) => (
              <button key={a} onClick={() => setAgent(a)} aria-pressed={agent === a}
                className={`rounded-full border px-3 py-1 text-xs ${agent === a ? "border-ink bg-ink text-paper" : "border-line hover:border-ink-soft"}`}>{a}</button>
            ))}
          </div>
        }
      >
        <div className="space-y-6">
          {stepsIds.map((st) => (
            <div key={st}>
              <h3 className="mb-2 font-mono text-xs tracking-widest text-ink-soft uppercase">Step {st}</h3>
              <ol className="space-y-3">
                {rows.filter((r) => r.step === st).map((r) => {
                  const rejected = r.disposition.startsWith("rejected");
                  return (
                    <li key={r.trace_id} className={`rounded-xl border bg-card p-4 ${rejected ? "border-ember/60" : "border-line"}`}>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="font-mono text-xs">{r.trace_id}</span>
                        <span className="rounded-md bg-paper-deep px-2 py-0.5 text-xs font-medium">{r.agent}</span>
                        {r.proposal && <span className="rounded-md border border-line px-2 py-0.5 font-mono text-[11px]">proposes: {r.proposal}</span>}
                        {r.disposition !== "accepted" && (
                          <span className={`font-mono text-[11px] ${rejected ? "font-medium text-ember" : "text-ink-soft"}`}>{rejected && <span aria-hidden>✕ </span>}{r.disposition}</span>
                        )}
                      </div>
                      <p className="mt-2 font-mono text-[11px] text-ink-soft">Saw: {r.inputs_seen.join(", ") || "-"}</p>
                      {/* The agent's reasoning: plain text. */}
                      <div className="mt-2 space-y-1.5 text-sm">
                        <p className="font-mono text-[10px] tracking-widest text-ink-soft uppercase">Agent reasoning</p>
                        {r.claims.map((c) => (
                          <p key={c.text}>{c.text}{c.evidence.length > 0 && <span className="ml-2 font-mono text-[11px] text-ink-soft">[{c.evidence.join(", ")}]</span>}</p>
                        ))}
                      </div>
                      {/* Evidence: quoted, framed and sourced, so it never reads as the agent's own words. */}
                      {r.kb_citations.length > 0 && (
                        <div className="mt-3 space-y-2">
                          <p className="font-mono text-[10px] tracking-widest text-ink-soft uppercase">Cited evidence</p>
                          {r.kb_citations.map((c) => (
                            <blockquote key={c.chunk_id} className="rounded-lg border border-lit/40 bg-lit-soft/30 p-3 text-sm">
                              <span className="font-display text-base italic">“{c.quote}”</span>
                              <cite className="mt-1.5 block font-mono text-[11px] text-ink-soft not-italic">
                                {sources[c.chunk_id] ? <a href={sources[c.chunk_id].url} className="font-sans text-xs text-ink underline underline-offset-2" target="_blank" rel="noreferrer">{sources[c.chunk_id].title}</a> : "source unavailable"}
                                {" · "}{c.chunk_id}{sources[c.chunk_id] && ` · sha256 ${sources[c.chunk_id].sha256.slice(0, 10)}…`}
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
          {!rows.length && <p className="text-sm text-ink-soft">No trace records yet.</p>}
        </div>
      </Section>
    </div>
  );
}
