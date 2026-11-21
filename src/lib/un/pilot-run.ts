import { createHash } from "node:crypto";
import type { Blueprint } from "./test-derive.ts";
import type { PilotRun } from "./pilot.ts";
import type { CaseOutcome, TaskCase } from "./task-evals.ts";

// Runs the approved tests against the real agent (the cases of task-evals.ts) and records one PilotRun per
// repetition. Pure apart from the injected `run` and `now`, so it can be tested without the agent.
//
// What it does NOT do, on purpose:
//  - it never invents a result for a test that has no executable case: that test is listed in `unexecuted`
//    and the pilot reports it, so the sample cannot look bigger than it is;
//  - goal alignment and cost are not measured (null), so `alignment_goals` fails as "not measured" until a
//    rubric (a person or a model) is chosen;
//  - client-facing tests have no executable case yet, so they are always `unexecuted`.

/** Which hand-written cases can stand in for a blueprint. A case is chosen by task and by the kind of test:
 * plain cases ("tune") for the normal case, boundaries and adversarial inputs ("holdout") for exceptions and
 * boundaries, authority probes for the authority tests. This is a binding, recorded in each run's test_id. */
export function casesFor(b: Blueprint, cases: TaskCase[]): TaskCase[] {
  if (b.status !== "active" || !b.task) return [];
  const mine = cases.filter((c) => c.task === b.task);
  switch (b.family) {
    case "happy_path": return mine.filter((c) => c.split === "tune" && !c.probe);
    case "exception":
    case "boundary": return mine.filter((c) => c.split === "holdout" && !c.probe);
    case "authority": return cases.filter((c) => c.probe && c.task === b.task);
    default: return [];
  }
}

export interface PilotPlan {
  /** blueprint id → the case ids that will run for it. */
  bound: Record<string, string[]>;
  unexecuted: { id: string; family: string; task: string | null; why: string }[];
}

export function planPilot(blueprints: Blueprint[], cases: TaskCase[]): PilotPlan {
  const bound: Record<string, string[]> = {};
  const unexecuted: PilotPlan["unexecuted"] = [];
  for (const b of blueprints.filter((x) => x.status === "active")) {
    const cs = casesFor(b, cases);
    if (cs.length) bound[b.id] = cs.map((c) => c.id);
    else unexecuted.push({ id: b.id, family: b.family, task: b.task, why: b.family === "client_facing" ? "no executable client-facing case yet" : "no executable case for this task and kind of test" });
  }
  return { bound, unexecuted };
}

const digest = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 16);

/** One run of one case, turned into a PilotRun. */
export function toPilotRun(b: Blueprint, o: CaseOutcome, rep: number, latency_ms: number): PilotRun {
  const r = o.result;
  const refusalExpected = o.probe;
  const uncited = o.verdict === "uncited";
  return {
    test_id: `${b.id}#${o.id}`,
    family: b.family,
    task: b.task,
    rep,
    passed: o.verdict === "correct",
    answer: digest({ ok: r.ok, output: r.output, refused: !!r.refused, citations: [...r.citations].sort() }),
    latency_ms,
    cost: null,
    hallucinated: o.failures.some((f) => f.startsWith("cites chunks that do not exist")) || uncited ? true : r.citations.length || r.refused ? false : null,
    controls_ok: !o.failures.some((f) => f.startsWith("UNSAFE")),
    goals_ok: null,
    refusal_expected: refusalExpected,
    refused: refusalExpected ? !!r.refused || o.calls.some((c) => c.decision === "reject") : null,
    logged: o.calls.length > 0,
    rejected_calls: refusalExpected ? 0 : o.calls.filter((c) => c.decision === "reject").length,
    client_facing: false,
    compliance_ok: null,
    disclosed: null,
    promotion_free: null,
    fee_ok: null,
  };
}

export type RunCase = (c: TaskCase) => Promise<CaseOutcome>;

/** Execute the plan: every bound case, `reps` times. `now` is injected (Date.now in the app). */
export async function executePilot(blueprints: Blueprint[], cases: TaskCase[], run: RunCase, reps: number, now: () => number = Date.now): Promise<{ runs: PilotRun[]; plan: PilotPlan }> {
  const plan = planPilot(blueprints, cases);
  const byId = new Map(cases.map((c) => [c.id, c]));
  const runs: PilotRun[] = [];
  for (const b of blueprints) {
    for (const cid of plan.bound[b.id] ?? []) {
      const c = byId.get(cid)!;
      for (let rep = 1; rep <= reps; rep++) {
        const t0 = now();
        const o = await run(c);
        runs.push(toPilotRun(b, o, rep, Math.max(0, now() - t0)));
      }
    }
  }
  return { runs, plan };
}
