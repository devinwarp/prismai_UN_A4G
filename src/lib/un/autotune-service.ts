import { decideChange, DEFAULT_BUDGET, heldOutAlignment, riskOf, type AutoState, type Budget, type Change, type CycleRecord, type Edit, type StopReason } from "./auto-tune.ts";
import { modelCandidates, type ChatFn } from "./model-fix.ts";
import type { ReactConfig } from "./react-config.ts";
import { runQuestions, type QResult } from "./tuning-bank.ts";
import { describeFix, proposeFixes, type FixOp } from "./tuning-fix.ts";
import { decide, loadState, propose, PROFILES, retrieveOf, score, type Ctx, type TuningState } from "./tuning-service.ts";
import { activeSkillRules } from "./tuning-versions.ts";

// One tuning cycle of the tuning agent: find what the agent gets wrong on the TUNING questions, gather candidate edits (the deterministic
// proposer, and a model that proposes edits), and for each ask auto-tune.ts what to do: discard it, leave it as a proposal for a person, or
// apply it. The model and the proposer only suggest; the scores and the rules decide. It reads tuning questions only, never a held-out one.
// A change it applies is an ordinary approved version in the tuning log, by "tuning agent (auto)", so it can be seen and rolled back.

export const AGENT = "tuning agent (auto)";

const textOf = (op: FixOp): string => (op.op === "glossary_add" ? `${op.term} -> ${op.to}` : op.op === "glossary_remove" ? `${op.term} (${op.entry})` : op.op === "route_add" ? `${op.term} -> ${op.kind}` : `${op.key} ${op.from} -> ${op.to}`);
export const editOf = (op: FixOp): Edit => ({ kind: op.op, text: textOf(op) });

interface Cand { change: FixOp; candidate: ReactConfig; because: string[]; source: "rules" | "model" }

/** Does the candidate fix the miss and break no tuning question that was right? (The same test the deterministic proposer applies.) */
async function verifiedOnTuning(c: Ctx, tuneQs: TuningState["questions"], results: QResult[], miss: QResult, candidate: ReactConfig): Promise<boolean> {
  const before = new Map(results.map((r) => [r.id, r.verdict]));
  const after = await runQuestions(c.sopId ?? "SOP-LIC-014", candidate, tuneQs, retrieveOf(c));
  const fixed = after.find((r) => r.id === miss.id)?.verdict === "correct";
  const broke = after.some((r) => r.verdict !== "correct" && before.get(r.id) === "correct");
  return fixed && !broke;
}

/** Run one cycle. `mode` "auto" may apply low-risk changes; "propose_only" only records proposals. Never throws: a failure is the record's `error`. */
export async function runAutoTune(c: Ctx, a: { state: AutoState; actor: string; mode: CycleRecord["mode"]; chat?: ChatFn; budget?: Budget; modelCallsLeft?: number; now?: () => string }): Promise<CycleRecord> {
  const budget = a.budget ?? DEFAULT_BUDGET;
  const now = a.now ?? (() => new Date().toISOString());
  const rec: CycleRecord = { at: now(), by: a.actor, mode: a.mode, held_out_before: null, held_out_after: null, applied: [], proposed: [], discarded: [], stop: "done", model_calls: 0 };
  let callsLeft = a.modelCallsLeft ?? budget.modelCallsPerDay;
  let tried = 0;
  const seen = new Set<string>();
  try {
    let st = await loadState(c);
    if (!st.chain.ok) throw new Error(`the tuning log failed verification at entry ${st.chain.broken_seq}: ${st.chain.reason}`);
    const scoreNow = (s: TuningState) => score(c, s.retrieval.config, activeSkillRules(s.versions, PROFILES), s.questions);
    let before = await scoreNow(st);
    rec.held_out_before = heldOutAlignment(before);
    let stop: StopReason | null = null;

    for (let iter = 0; iter < budget.iterationsPerCycle && !stop; iter++) {
      const tuneQs = st.questions.filter((q) => q.split === "tune");
      const results = await runQuestions(c.sopId ?? "SOP-LIC-014", st.retrieval.config, tuneQs, retrieveOf(c));
      const misses = results.filter((r) => r.verdict !== "correct");
      if (!misses.length) { stop = iter === 0 ? "no_misses" : "done"; break; }

      const cands: Cand[] = (await proposeFixes({ sopId: c.sopId ?? "SOP-LIC-014", cfg: st.retrieval.config, questions: tuneQs, results, retrieve: retrieveOf(c) }))
        .map((f) => ({ change: f.change, candidate: f.candidate, because: f.because, source: "rules" as const }));
      if (a.chat) {
        for (const miss of misses.slice(0, 3)) {
          if (callsLeft <= 0) break;
          callsLeft--; rec.model_calls++;
          try {
            for (const m of await modelCandidates(a.chat, { cfg: st.retrieval.config, miss, sopId: c.sopId ?? "SOP-LIC-014" })) {
              if (await verifiedOnTuning(c, tuneQs, results, miss, m.candidate)) cands.push({ change: m.change, candidate: m.candidate, because: [miss.id], source: "model" });
            }
          } catch { /* a failed model call is a missed idea, not a failed cycle */ }
        }
      }
      const unique = [...new Map(cands.map((x) => [JSON.stringify(x.change), x])).values()];

      let applied = false;
      for (const cand of unique) {
        if (tried >= budget.candidatesPerCycle) { stop = "budget"; break; }
        tried++;
        const summary = `${describeFix(cand.change)}${cand.source === "model" ? " (written by the model)" : ""}`;
        if (seen.has(summary)) continue;
        seen.add(summary);
        const after = await score(c, cand.candidate, activeSkillRules(st.versions, PROFILES), st.questions);
        const d = decideChange({ enabled: a.mode === "auto", threshold: a.state.threshold, edit: editOf(cand.change), before, after });
        const change: Omit<Change, "id"> = { summary, risk: riskOf(editOf(cand.change)).risk, why: d.why, before: heldOutAlignment(before), after: heldOutAlignment(after) };
        if (d.action === "discard") { rec.discarded.push({ summary, reason: d.why }); continue; }
        // an identical proposal still waiting for a person is not proposed again
        if (d.action === "propose" && st.versions.some((v) => v.status === "proposed" && v.summary.includes(summary))) continue;
        const v = await propose(c, { target: "retrieval", value: cand.candidate, summary: `[tuning agent] ${summary}`, because: cand.because, actor: AGENT });
        if (d.action === "propose") { rec.proposed.push({ ...change, id: v.id }); continue; }
        await decide(c, { id: v.id, decision: "approve", actor: AGENT, comment: `auto-applied: ${d.why}` });
        rec.applied.push({ ...change, id: v.id });
        applied = true;
        st = await loadState(c);
        before = await scoreNow(st);
        break;
      }
      if (!applied) break;
    }
    const final = await scoreNow(st);
    rec.held_out_after = heldOutAlignment(final);
    rec.stop = stop ?? (a.mode === "auto" && rec.held_out_after !== null && rec.held_out_after >= a.state.threshold ? "threshold_reached" : "done");
  } catch (e) {
    rec.stop = "error";
    rec.error = e instanceof Error ? e.message.slice(0, 300) : "error";
  }
  return rec;
}
