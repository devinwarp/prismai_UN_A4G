"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Checks, StructuredSop, StructState } from "@/lib/un/sop-structure";
import { btnGhost, btnPrimary, card, field } from "../../../_components/ui";

// The SOP structuring review. A model drafts a structured version of a loosely written SOP; a person reads the source and the structure side by side, edits
// anything that is wrong, and approves it. Only then does it become the SOP: job profiles, knowledge base and skills come from the approved structure.
// Text carries the meaning of every mark (Must fix / Check / Gap), never colour alone.

const NS = "Not stated in the source.";
type Ready = { sop_id: string | null; version: number | null; structured: boolean; profiles: { profile: string; ok: boolean; compiled: boolean; reason: string | null }[] };
type SkillOut = { profile: string; report: { ok: boolean; errors: string[]; warnings: string[]; gaps: string[]; tasks: number; tools: string[]; needs_integration: string[] }; review: { available: boolean; issues: { severity: string; text: string }[]; llm: string; error?: string } | null };
type Published = { published: { sop_id: string; version: number; profiles: string[] }; skills: SkillOut[] };

const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
const shown = (s: string) => (s === NS ? "" : s);

async function call(ucId: string, body: unknown) {
  const r = await fetch(`/api/admin/un/use-cases/${ucId}/sop-structure`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: r.ok, j };
}

function Issues({ checks }: { checks: Checks }) {
  const { errors, warnings, gaps, coverage } = checks;
  return (
    <div className="space-y-3 text-sm" aria-live="polite">
      <p className="font-medium">
        {errors.length ? `${errors.length} to fix before approval` : "No blocking errors"} · {warnings.length} to check · {gaps.length} gaps the source leaves open · {coverage.covered} of {coverage.total} statements of the source are carried
      </p>
      {errors.length > 0 && <ul className="space-y-1">{errors.map((x, i) => <li key={i} className="text-ember"><span className="font-medium">✕ Must fix · {x.where}:</span> {x.message}</li>)}</ul>}
      {warnings.length > 0 && <ul className="space-y-1">{warnings.map((x, i) => <li key={i}><span className="font-medium">! Check · {x.where}:</span> {x.message}</li>)}</ul>}
      {coverage.uncovered.length > 0 && (
        <details><summary className="cursor-pointer font-medium">○ Statements of the source no task, rule or exception carries ({coverage.uncovered.length})</summary>
          <ul className="mt-1 list-disc ps-5 text-ink-soft">{coverage.uncovered.map((s, i) => <li key={i}>{s}</li>)}</ul></details>
      )}
      {gaps.length > 0 && (
        <details><summary className="cursor-pointer font-medium">○ Gaps: the source does not say ({gaps.length})</summary>
          <ul className="mt-1 list-disc ps-5 text-ink-soft">{gaps.map((x, i) => <li key={i}>{x.where}</li>)}</ul></details>
      )}
    </div>
  );
}

export default function SopStructure({ ucId, canEdit, frozen, attached }: { ucId: string; canEdit: boolean; frozen: boolean; attached: string | null }) {
  const router = useRouter();
  const [state, setState] = useState<StructState | null>(null);
  const [ready, setReady] = useState<Ready | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [text, setText] = useState("");
  const [model, setModel] = useState<StructuredSop | null>(null);
  const [checks, setChecks] = useState<Checks | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [done, setDone] = useState<Published | null>(null);

  const adopt = useCallback((s: StructState) => { setState(s); setModel(s.pending?.model ?? null); setChecks(s.pending?.checks ?? null); setReviewed(false); }, []);
  const load = useCallback(async () => {
    const r = await fetch(`/api/admin/un/use-cases/${ucId}/sop-structure`, { cache: "no-store" });
    const j = (await r.json().catch(() => ({}))) as { state?: StructState; ready?: Ready; error?: string };
    if (!r.ok || !j.state) { setMsg({ ok: false, text: j.error ?? "The structuring state could not be read." }); return; }
    adopt(j.state); setReady(j.ready ?? null);
  }, [ucId, adopt]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  async function run(what: string, body: Record<string, unknown>, okText: string) {
    setBusy(what); setMsg(null);
    const { ok, j } = await call(ucId, body);
    setBusy(null);
    if (!ok) { setMsg({ ok: false, text: String(j.error ?? "The request failed.") }); if (j.checks) setChecks(j.checks as Checks); return null; }
    if (j.state) adopt(j.state as StructState);
    setMsg({ ok: true, text: okText });
    return j;
  }

  const pending = state?.pending ?? null;
  const set = (patch: Partial<StructuredSop>) => setModel((m) => (m ? { ...m, ...patch } : m));
  const setRole = (i: number, patch: Partial<StructuredSop["roles"][number]>) => setModel((m) => (m ? { ...m, roles: m.roles.map((r, j) => (j === i ? { ...r, ...patch } : r)) } : m));
  const setTask = (i: number, patch: Partial<StructuredSop["tasks"][number]>) => setModel((m) => (m ? { ...m, tasks: m.tasks.map((t, j) => (j === i ? { ...t, ...patch } : t)) } : m));
  const fill = (s: string) => (s.trim() ? s : NS);

  const canDraft = canEdit && !frozen;
  return (
    <section id="sop-structure" aria-labelledby="ss-h" className={`${card} mt-6 scroll-mt-4`}>
      <h2 id="ss-h" className="font-display text-xl font-medium">Structure the SOP</h2>
      <p className="mt-1 max-w-[72ch] text-sm text-ink-soft">
        An SOP that is not written in the Prism layout (a task per section, one job profile per task) cannot give job profiles and skills reliably. A model drafts a structured version using only what the SOP says, and marks what it does not say as a gap.
        You read the SOP and the structure side by side, change anything that is wrong, and approve. Nothing is used until you approve.
      </p>

      {ready && ready.sop_id && (
        <div className="mt-3 text-sm">
          <p className="font-medium">{ready.structured ? "This SOP was structured and approved: its skills are compiled." : "Can each job profile of the attached SOP become a skill?"}</p>
          <ul className="mt-1 space-y-0.5">
            {ready.profiles.map((p) => (
              <li key={p.profile}><span className="font-medium">{p.ok ? "✓ Ready" : "✕ No skill"}</span> · {p.profile}{p.ok && p.compiled ? " · compiled with a tool allow-list" : ""}{!p.ok && p.reason ? <span className="text-ember"> · {p.reason}</span> : null}</li>
            ))}
          </ul>
          {!ready.structured && ready.profiles.some((p) => !p.ok) && <p className="mt-2 font-medium">Some job profiles cannot become a skill from this text. Structuring it below fixes that.</p>}
        </div>
      )}

      {canDraft && !pending && !done && (
        <div className="mt-4 space-y-2">
          {!attached && (
            <label className="block text-sm font-medium">The SOP text
              <textarea className={`${field} mt-1 h-40 font-mono text-xs`} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the SOP, however it is written." />
            </label>
          )}
          <button type="button" className={btnPrimary} disabled={busy !== null || (!attached && !text.trim())} onClick={() => void run("draft", { action: "draft", ...(text.trim() ? { text } : {}) }, "The draft is ready: review it below.")}>
            {busy === "draft" ? "The model is reading the SOP…" : attached ? "Draft the structure from the attached SOP" : "Draft the structure"}
          </button>
          {busy === "draft" && <div role="progressbar" aria-label="The model is drafting the structure" className="h-2 w-64 overflow-hidden rounded-full bg-paper-deep"><div className="h-full w-1/3 animate-pulse rounded-full bg-lit motion-reduce:animate-none" /></div>}
          {busy === "draft" && <p className="text-xs text-ink-soft">This takes up to a minute or two for a long SOP.</p>}
        </div>
      )}
      {!canDraft && <p className="mt-3 text-sm text-ink-soft">{frozen ? "This use case is deployed, so its SOP is frozen." : "Structuring needs an administrator."}</p>}
      {msg && <p role={msg.ok ? "status" : "alert"} className={`mt-3 text-sm ${msg.ok ? "text-lit-deep" : "text-ember"}`}>{msg.ok ? "✓" : "✕"} {msg.text}</p>}

      {pending && model && checks && (
        <div className="mt-5">
          <p className="text-sm text-ink-soft">Drafted by the structuring agent ({pending.llm}) on {new Date(pending.at).toLocaleString()}. The draft is yours to change.</p>
          <div className="mt-3 rounded-lg border border-line bg-paper px-4 py-3"><Issues checks={checks} /></div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div>
              <h3 className="text-base font-medium">The SOP as written</h3>
              <div tabIndex={0} aria-label="The SOP as written" className="mt-2 max-h-[70vh] overflow-auto rounded-lg border border-line bg-paper p-3 text-sm leading-relaxed whitespace-pre-wrap break-words" dir="auto">{pending.source}</div>
            </div>
            <div>
              <h3 className="text-base font-medium">The structure</h3>
              <div className="mt-2 max-h-[70vh] space-y-4 overflow-auto rounded-lg border border-line p-3 text-sm">
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="block font-medium">Title<input className={field} value={model.title} onChange={(e) => set({ title: e.target.value })} /></label>
                  <label className="block font-medium">Owner<input className={field} value={shown(model.owner)} placeholder="Not stated" onChange={(e) => set({ owner: fill(e.target.value) })} /></label>
                </div>
                <label className="block font-medium">Purpose<textarea className={`${field} h-16`} value={shown(model.purpose)} placeholder="Not stated" onChange={(e) => set({ purpose: fill(e.target.value) })} /></label>
                <label className="block font-medium">Scope<textarea className={`${field} h-16`} value={shown(model.scope)} placeholder="Not stated" onChange={(e) => set({ scope: fill(e.target.value) })} /></label>

                <h4 className="font-medium">Job profiles ({model.roles.length})</h4>
                {model.roles.map((r, i) => (
                  <fieldset key={i} className="space-y-2 rounded-lg border border-line p-3">
                    <legend className="px-1 font-medium">Job profile {i + 1}</legend>
                    <label className="block font-medium">Name<input className={field} value={r.name} onChange={(e) => setRole(i, { name: e.target.value.replace(/\./g, "") })} /></label>
                    <label className="block font-medium">Purpose<input className={field} value={shown(r.purpose)} placeholder="Not stated" onChange={(e) => setRole(i, { purpose: fill(e.target.value) })} /></label>
                    <label className="block font-medium">May (one per line)<textarea className={`${field} h-16`} value={r.may.join("\n")} onChange={(e) => setRole(i, { may: lines(e.target.value) })} /></label>
                    <label className="block font-medium">May not (one per line)<textarea className={`${field} h-16`} value={r.may_not.join("\n")} onChange={(e) => setRole(i, { may_not: lines(e.target.value) })} /></label>
                    <label className="block font-medium">Only a named person decides (one per line)<textarea className={`${field} h-14`} value={r.human_only.join("\n")} onChange={(e) => setRole(i, { human_only: lines(e.target.value) })} /></label>
                    {(!r.may.length && !r.may_not.length) && <p className="font-medium text-ember">○ Gap: the source does not say what this job profile may or may not do. Its authority will then be the tasks it is responsible for, and nothing else.</p>}
                  </fieldset>
                ))}

                <h4 className="font-medium">Tasks ({model.tasks.length})</h4>
                {model.tasks.map((t, i) => {
                  const bad = checks.warnings.filter((w) => w.where === t.id);
                  return (
                    <fieldset key={i} className="space-y-2 rounded-lg border border-line p-3">
                      <legend className="px-1 font-mono text-xs">{t.id}</legend>
                      <label className="block font-medium">Title<input className={field} value={t.title} onChange={(e) => setTask(i, { title: e.target.value })} /></label>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <label className="block font-medium">Done by (exactly one job profile)
                          <select className={field} value={t.role} onChange={(e) => setTask(i, { role: e.target.value })}>
                            {!model.roles.some((r) => r.name === t.role) && <option value={t.role}>{t.role || "choose"}</option>}
                            {model.roles.map((r) => <option key={r.name} value={r.name}>{r.name}</option>)}
                          </select></label>
                        <label className="block font-medium">Accountable<input className={field} value={shown(t.accountable)} placeholder="Not stated" onChange={(e) => setTask(i, { accountable: fill(e.target.value) })} /></label>
                      </div>
                      <label className="block font-medium">Starts when<input className={field} value={shown(t.starts_when)} placeholder="Not stated" onChange={(e) => setTask(i, { starts_when: fill(e.target.value) })} /></label>
                      <label className="block font-medium">Inputs<input className={field} value={shown(t.inputs)} placeholder="Not stated" onChange={(e) => setTask(i, { inputs: fill(e.target.value) })} /></label>
                      <label className="block font-medium">Steps (one per line)<textarea className={`${field} h-20`} value={t.steps.join("\n")} onChange={(e) => setTask(i, { steps: lines(e.target.value) })} /></label>
                      <label className="block font-medium">Output<input className={field} value={shown(t.output)} placeholder="Not stated" onChange={(e) => setTask(i, { output: fill(e.target.value) })} /></label>
                      <label className="block font-medium">Problems and where they go<input className={field} value={shown(t.problems)} placeholder="Not stated" onChange={(e) => setTask(i, { problems: fill(e.target.value) })} /></label>
                      <p className="text-xs text-ink-soft">From the source: “{t.quote || "no quotation"}”</p>
                      {bad.map((w, k) => <p key={k} className="text-xs font-medium">! Check: {w.message}</p>)}
                      <button type="button" className="text-xs underline" onClick={() => setModel((m) => (m ? { ...m, tasks: m.tasks.filter((_, j) => j !== i) } : m))}>Remove this task</button>
                    </fieldset>
                  );
                })}

                <label className="block font-medium">Rules that apply to all work (one per line)<textarea className={`${field} h-24`} value={model.controls.join("\n")} onChange={(e) => set({ controls: lines(e.target.value) })} /></label>
                <label className="block font-medium">Exceptions and escalation (one per line: situation | handled by | escalate to | what to do)
                  <textarea className={`${field} h-24`} value={model.exceptions.map((x) => [x.scenario, shown(x.handled_by), shown(x.escalate_to), shown(x.what_to_do)].join(" | ")).join("\n")}
                    onChange={(e) => set({ exceptions: lines(e.target.value).map((l) => { const [a = "", b = "", c = "", d = ""] = l.split("|").map((x) => x.trim()); return { scenario: a, handled_by: fill(b), escalate_to: fill(c), what_to_do: fill(d) }; }).filter((x) => x.scenario) })} /></label>
                <label className="block font-medium">Systems the source names (one per line; they are not tools)<textarea className={`${field} h-14`} value={model.systems.join("\n")} onChange={(e) => set({ systems: lines(e.target.value) })} /></label>
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={btnGhost} disabled={busy !== null} onClick={() => void run("edit", { action: "edit", model }, "Saved and checked again against the source.")}>{busy === "edit" ? "Checking…" : "Save and check again"}</button>
              <button type="button" className={btnGhost} disabled={busy !== null} onClick={() => void run("withdraw", { action: "withdraw", reason: "Dropped by the reviewer" }, "The draft was dropped.")}>Drop this draft</button>
            </div>
            <label className="flex max-w-[72ch] items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />
              <span>I have read the SOP and this structure side by side. Approving makes it the SOP of this use case: a new version is published and its job profiles and skills come from it. The original text stays in the log.</span>
            </label>
            <button type="button" className={btnPrimary} disabled={busy !== null || !reviewed || checks.errors.length > 0}
              onClick={() => void run("approve", { action: "approve", model, reviewed: true }, "Approved and published.").then((j) => { if (j) { setDone(j as unknown as Published); router.refresh(); void load(); } })}>
              {busy === "approve" ? "Publishing and building skills…" : "Approve and publish"}
            </button>
            {busy === "approve" && <div><div role="progressbar" aria-label="Publishing the SOP and building its skills" className="h-2 w-64 overflow-hidden rounded-full bg-paper-deep"><div className="h-full w-1/3 animate-pulse rounded-full bg-lit motion-reduce:animate-none" /></div><p className="mt-1 text-xs text-ink-soft">Publishing the version, building its knowledge base, compiling each skill and having the model review it. This can take a minute.</p></div>}
            {checks.errors.length > 0 && <p className="text-sm font-medium text-ember">✕ Fix the errors above first.</p>}
          </div>
        </div>
      )}

      {done && (
        <div className="mt-5 rounded-lg border border-line p-4 text-sm" role="status">
          <p className="font-medium">✓ Published {done.published.sop_id} version {done.published.version} with {done.published.profiles.length} job profiles.</p>
          <ul className="mt-2 space-y-2">
            {done.skills.map((s) => (
              <li key={s.profile}>
                <span className="font-medium">{s.report.ok ? "✓ Skill compiled" : "✕ No skill"}</span> · {s.profile} · {s.report.tasks} tasks · tools: {s.report.tools.filter((t) => !s.report.needs_integration.some((n) => n.toLowerCase().includes(t.replace(/^use_/, "").replace(/_/g, " ")))).join(", ") || "none"}
                {s.report.needs_integration.map((x, i) => <span key={`n${i}`} className="block">! Needs an integration the entity has not registered: {x}. Until then the agent drafts the entry and a person makes it.</span>)}
                {s.report.errors.map((x, i) => <span key={i} className="block text-ember">✕ {x}</span>)}
                {s.report.gaps.map((x, i) => <span key={i} className="block text-ink-soft">○ Gap: {x}</span>)}
                {s.review?.available ? (s.review.issues.length ? s.review.issues.map((x, i) => <span key={i} className="block">! Model review ({x.severity}): {x.text}</span>) : <span className="block text-ink-soft">Model review ({s.review.llm}): nothing found.</span>) : s.review ? <span className="block text-ink-soft">Model review did not run.</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}
      {state?.approved && !pending && !done && (
        <p className="mt-4 text-sm text-ink-soft">Last approved {new Date(state.approved.at).toLocaleString()} by {state.approved.by}: {state.approved.sop_id} version {state.approved.version}.</p>
      )}
    </section>
  );
}
