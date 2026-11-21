import type { AgentRuntimeSummary } from "@/lib/un/agent-eval-summary";
import { T, TV } from "./Lang";
import { card } from "./ui";

/** The licence-renewal agent's per-task evals and the Sijil call counts of that same agent (server component). */
export default function AgentRuntimePanel({ s, compact = false }: { s: AgentRuntimeSummary; compact?: boolean }) {
  const ok = s.correct === s.cases && s.in_authority.rejected === 0;
  return (
    <section className={`${card} mt-6`} aria-label="Agent runtime">
      <h2 className="text-lg font-semibold"><T k="ag.h" en="The agent that does the work, evaluated per task" /></h2>
      <p className="mt-1 text-sm text-ink-soft">
        <T k="ag.intro" en="These are the per-task evals of the licence-renewal agent: the same agent code, skill file, SOP knowledge base, document reader and case memory that the lifecycle runs. Every tool call it makes goes through Sijil." />
      </p>
      <p className="mt-2 rounded-lg border border-line px-3 py-2 text-sm font-medium">
        <TV k="ag.sim" en="Simulated Sijil: the gate is a simulation, so its counts are simulated. The agent is {r}, retrieval is {m}, and document reading uses recorded OCR output of synthetic images." v={{ r: s.reasoner === "model" ? "a language-model reasoner" : "rule-based (not a language model)", m: s.retrieval }} />
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div>
          <p className="font-mono text-[11px] tracking-wide text-ink-soft uppercase"><T k="ag.cases" en="Cases correct" /></p>
          <p className="mt-1 text-3xl font-medium tabular-nums" style={{ color: s.correct === s.cases ? "var(--color-v-auto)" : "var(--color-v-nogo)" }}>{s.correct} / {s.cases}</p>
          <p className="mt-1 text-xs text-ink-soft"><TV k="ag.holdout" en="Held out: {k} of {n}. Unsafe: {u}." v={{ k: s.holdout.correct, n: s.holdout.n, u: s.unsafe }} /></p>
        </div>
        <div>
          <p className="font-mono text-[11px] tracking-wide text-ink-soft uppercase"><T k="ag.inauth" en="Sijil rejections inside its authority" /></p>
          <p className="mt-1 text-3xl font-medium tabular-nums" style={{ color: s.in_authority.rejected ? "var(--color-v-nogo)" : "var(--color-v-auto)" }}>{s.in_authority.rejected} / {s.in_authority.calls}</p>
          <p className="mt-1 text-xs text-ink-soft"><T k="ag.inauth.sub" en="calls · simulated · must be 0" /></p>
        </div>
        <div>
          <p className="font-mono text-[11px] tracking-wide text-ink-soft uppercase"><T k="ag.probes" en="Authority probes rejected" /></p>
          <p className="mt-1 text-3xl font-medium tabular-nums">{s.probes.rejected} / {s.probes.cases}</p>
          <p className="mt-1 text-xs text-ink-soft"><TV k="ag.probes.sub" en="a task that is not this profile's, which Sijil must reject. All calls: {r} of {c} rejected, by design." v={{ r: s.sijil.rejected, c: s.sijil.calls }} /></p>
        </div>
      </div>
      <p className="mt-3 text-sm"><strong>{ok ? <T k="ag.ok" en="No case failed and no call inside its authority was rejected." /> : <T k="ag.notok" en="Something failed. See the cases below." />}</strong></p>
      {s.failing.length > 0 && <p className="mt-1 text-xs" dir="ltr">{s.failing.map((f) => `${f.id} (${f.verdict})`).join(", ")}</p>}
      {!compact && (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-line">
          <table className="w-full text-start text-sm">
            <caption className="sr-only"><T k="ag.table" en="Per-task results" /></caption>
            <thead className="border-b border-line text-xs text-ink-soft uppercase">
              <tr><th scope="col" className="p-3 text-start"><T k="ag.th.task" en="Task" /></th><th scope="col" className="p-3 text-start"><T k="ag.th.correct" en="Correct" /></th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {s.per_task.map((t) => (
                <tr key={t.task}><td className="p-3 font-mono" dir="ltr">{t.task}</td><td className="p-3 tabular-nums">{t.correct} / {t.total}{t.correct < t.total ? " ✕" : " ✓"}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
