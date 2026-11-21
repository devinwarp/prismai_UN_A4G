import { addStats, statsFromDecisions, type SijilCallStats } from "./sijil-calls.ts";
import { perTask, recordedOcr, runAll, SOP_ID, type CaseOutcome } from "./task-evals.ts";
import { searchSop } from "./sop-kb.ts";

// The per-task evals of the licence-renewal agent, summarised for the lifecycle screens. The agent that
// is evaluated here is the one the screens watch: same Agent class, same skill, same tools, and every tool
// call it makes goes through the Sijil gate. The gate is simulated (src/lib/un/sijil-calls.ts), so every
// figure below is labelled simulated; the agent, its retrieval and its OCR input are not.

/** Use cases whose agent is the SOP-driven one. */
export const SOP_BY_USE_CASE: Record<string, string> = { UC02: SOP_ID };

export interface AgentRuntimeSummary {
  sop_id: string;
  cases: number;
  correct: number;
  unsafe: number;
  holdout: { n: number; correct: number };
  per_task: { task: string; total: number; correct: number }[];
  /** every tool call of every case, decided by the simulated Sijil gate */
  sijil: SijilCallStats;
  /** calls made by cases that stay inside the agent's authority: any rejection here is a failure */
  in_authority: SijilCallStats;
  /** authority probes: a task that is not this profile's, which Sijil must reject */
  probes: { cases: number; rejected: number };
  failing: { id: string; verdict: string }[];
  reasoner: "rule-based" | "model";
  retrieval: string;
}

export function summarise(outcomes: CaseOutcome[], reasoner: AgentRuntimeSummary["reasoner"] = "rule-based"): AgentRuntimeSummary {
  const stats = (os: CaseOutcome[]) => addStats(os.map((o) => statsFromDecisions(o.calls)));
  const probes = outcomes.filter((o) => o.probe);
  const holdout = outcomes.filter((o) => o.split === "holdout");
  return {
    sop_id: SOP_ID, cases: outcomes.length, correct: outcomes.filter((o) => o.verdict === "correct").length, unsafe: outcomes.filter((o) => o.verdict === "unsafe").length,
    holdout: { n: holdout.length, correct: holdout.filter((o) => o.verdict === "correct").length },
    per_task: perTask(outcomes).map((t) => ({ task: t.task, total: t.total, correct: t.correct })),
    sijil: stats(outcomes), in_authority: stats(outcomes.filter((o) => !o.probe)),
    probes: { cases: probes.length, rejected: probes.filter((o) => o.calls.some((c) => c.decision === "reject")).length },
    failing: outcomes.filter((o) => o.verdict !== "correct").map((o) => ({ id: o.id, verdict: o.verdict })),
    reasoner, retrieval: "BM25 keyword search",
  };
}

let memo: Promise<AgentRuntimeSummary> | null = null;

/** Run the per-task evals (about two seconds: recorded OCR output, keyword retrieval) and summarise. Cached per process. */
export function agentRuntimeSummary(): Promise<AgentRuntimeSummary> {
  memo ??= runAll({ retrieve: async (q, kind) => (await searchSop(SOP_ID, q, { k: 5, kind })).hits, ocr: recordedOcr() }).then((o) => summarise(o));
  return memo;
}
