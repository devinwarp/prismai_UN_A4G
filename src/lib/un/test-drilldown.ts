import type { GoalJudgment, GoalSet, Override, Review } from "./goal-judge.ts";
import { goalSetOf } from "./goal-judge.ts";
import type { EntityGoal } from "./goals.ts";
import type { PilotPlan } from "./pilot-run.ts";
import type { PilotRun } from "./pilot.ts";
import type { Blueprint } from "./test-derive.ts";

// The whole chain behind one test of one pilot, for a reviewer. Pure: no I/O. The page loads the pieces and hands
// them here: goal set -> SOP lines -> the test -> what the agent produced on every repetition -> how it was assessed.

export interface SopLine { id: string; text: string | null }
export interface ParsedSummary {
  ok: boolean | null;
  refused: unknown;
  escalate: unknown;
  /** The output as stored: an object when the summary parsed, else the raw text cut at the storage limit. */
  output: unknown;
  citations: string[];
  /** The stored summary is cut at 900 characters; when it no longer parses, fields after the cut are unknown. */
  truncated: boolean;
}

/** The stored run summary (`JSON.stringify({ok, output, refused, escalate, citations}).slice(0, 900)`) in readable
 * fields. A summary cut mid-way is not valid JSON: read what can be read and say it was cut, never guess. */
export function parseSummary(raw: string | undefined): ParsedSummary | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    return { ok: typeof o.ok === "boolean" ? o.ok : null, refused: o.refused ?? null, escalate: o.escalate ?? null, output: o.output ?? null, citations: Array.isArray(o.citations) ? o.citations.filter((c): c is string => typeof c === "string") : [], truncated: false };
  } catch {
    const ok = raw.match(/^\{"ok":(true|false)/)?.[1];
    const out = raw.match(/"output":([\s\S]*)$/)?.[1] ?? raw;
    const cites = raw.match(/"citations":\[([^\]]*)\]?/)?.[1];
    return { ok: ok === undefined ? null : ok === "true", refused: null, escalate: null, output: out, citations: cites ? [...cites.matchAll(/"([^"]+)"/g)].map((m) => m[1]) : [], truncated: true };
  }
}

export interface DrillRep {
  rep: number;
  answer: string;
  latency_ms: number | null;
  parsed: ParsedSummary | null;
  /** The deterministic result of the run, as recorded at pilot time. */
  det: Pick<PilotRun, "passed" | "controls_ok" | "refused" | "refusal_expected" | "hallucinated" | "logged" | "rejected_calls" | "client_facing" | "compliance_ok" | "disclosed" | "promotion_free" | "fee_ok" | "goals_ok">;
}

export interface DrillInput {
  testId: string;
  pilot: { id: string; at: string; actor: string; reps: number; plan: Pick<PilotPlan, "bound">; test_set_hash: string; params_hash: string };
  /** The runs of this pilot (any test); the assembler picks the test's. */
  runs: PilotRun[];
  /** The review of this pilot, or null if nobody has judged it. */
  review: Review | null;
  /** The entity's goals as they read now (shown, and flagged, for a review that did not record its goal set). */
  goalsNow: EntityGoal[];
  blueprints: Blueprint[];
  chunks: { chunk_id: string; text: string }[];
  /** Hashes of the test set and verdict parameters in force now, if any. */
  current: { test_set_hash: string | null; params_hash: string | null };
}

export interface Drill {
  ok: true;
  test_id: string;
  goal_set: GoalSet & { recorded: boolean };
  sop: { source: SopLine[]; cited: (SopLine & { in_source: boolean })[] };
  test: { blueprint_id: string; case_id: string; found: boolean; title: string | null; family: string | null; task: string | null; expect: string[]; bound_cases: string[] };
  reps: DrillRep[];
  assessment: {
    status: "not_judged" | "judged" | "approved";
    model: string | null;
    judgment: GoalJudgment | null;
    approval: { approver: string; approver_source: string; hash: string; by: string; at: string } | null;
    override: Override | null;
    /** The judgment in force: the person's override, else the model's. null: not judged or unreadable. */
    effective: boolean | null;
  };
  hashes: { test_set: string; params: string; test_set_unchanged: boolean | null; params_unchanged: boolean | null };
}
export type DrillResult = Drill | { ok: false; error: string };

const resolve = (chunks: DrillInput["chunks"], ids: string[]): SopLine[] => ids.map((id) => ({ id, text: chunks.find((c) => c.chunk_id === id)?.text ?? null }));

export function assembleDrill(i: DrillInput): DrillResult {
  const mine = i.runs.filter((r) => r.test_id === i.testId).sort((a, b) => a.rep - b.rep);
  if (!mine.length) return { ok: false, error: `No run of ${i.testId} in this pilot` };
  const [bpId, caseId = ""] = i.testId.split("#");
  const bp = i.blueprints.find((b) => b.id === bpId) ?? null;

  const reps: DrillRep[] = mine.map((r) => ({
    rep: r.rep, answer: r.answer, latency_ms: r.latency_ms, parsed: parseSummary(r.summary),
    det: { passed: r.passed, controls_ok: r.controls_ok, refused: r.refused, refusal_expected: r.refusal_expected, hallucinated: r.hallucinated, logged: r.logged, rejected_calls: r.rejected_calls, client_facing: r.client_facing, compliance_ok: r.compliance_ok, disclosed: r.disclosed, promotion_free: r.promotion_free, fee_ok: r.fee_ok, goals_ok: r.goals_ok },
  }));

  const sourceIds = bp?.source ?? [];
  const citedIds = [...new Set(reps.flatMap((r) => r.parsed?.citations ?? []))];

  const judgment = i.review?.judgments.find((j) => j.test_id === i.testId) ?? null;
  const approval = i.review?.approved ?? null;
  const override = approval?.overrides.find((o) => o.test_id === i.testId) ?? null;
  const recorded = i.review?.goal_set ?? null;
  const goal_set = recorded ? { ...recorded, recorded: true } : { ...goalSetOf(i.goalsNow), recorded: false };

  return {
    ok: true,
    test_id: i.testId,
    goal_set,
    sop: { source: resolve(i.chunks, sourceIds), cited: resolve(i.chunks, citedIds).map((l) => ({ ...l, in_source: sourceIds.includes(l.id) })) },
    test: { blueprint_id: bpId, case_id: caseId, found: !!bp, title: bp?.title ?? null, family: bp?.family ?? mine[0].family, task: bp?.task ?? mine[0].task, expect: bp?.expect.map((c) => c.text) ?? [], bound_cases: i.pilot.plan.bound[bpId] ?? [] },
    reps,
    assessment: {
      status: approval ? "approved" : i.review ? "judged" : "not_judged",
      model: i.review?.model ?? null,
      judgment,
      approval: approval ? { approver: approval.approver, approver_source: approval.approver_source, hash: approval.hash, by: approval.by, at: approval.at } : null,
      override,
      effective: override ? override.met : (judgment?.met ?? null),
    },
    hashes: {
      test_set: i.pilot.test_set_hash, params: i.pilot.params_hash,
      test_set_unchanged: i.current.test_set_hash === null ? null : i.current.test_set_hash === i.pilot.test_set_hash,
      params_unchanged: i.current.params_hash === null ? null : i.current.params_hash === i.pilot.params_hash,
    },
  };
}
