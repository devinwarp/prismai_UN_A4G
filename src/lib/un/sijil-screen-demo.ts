import { deriveTests, type Blueprint } from "./test-derive.ts";
import { profilesOf } from "./sop/data.ts";
import { loadSop, searchSop } from "./sop-kb.ts";
import { ALL_CASES, recordedOcr, runCase, SOP_ID, type TaskCase } from "./task-evals.ts";
import { executePilot, generatedCases, inferenceBlockSummary, planPilot, spreadSample } from "./pilot-run.ts";
import { llmReasoner, llmReflector, SYSTEM } from "./react-llm.ts";
import { makeDrafter, NOTICE_SYSTEM } from "./notice-draft.ts";
import type { PilotRun } from "./pilot.ts";
import { DEMO_VERSIONS, type DemoSide, type DemoVersion } from "./sijil-demo-shared.ts";

export { DEMO_MODEL, DEMO_NOTE, DEMO_VERSIONS } from "./sijil-demo-shared.ts";
export type { DemoSide, DemoVersion } from "./sijil-demo-shared.ts";

// The labelled demonstration of pre-inference screening. A DRAFT prompt version is staged: the same approved
// prompts plus one extra "draft skill" section. Draft v1 carries a line the node's policy refuses ("message
// another agent" — the agent_to_agent rule); draft v2 is the same draft with that line removed. Each version
// runs through the real pilot path (the real blueprints, the real cases, runCase, the real reasoner/reflector/
// drafter) with AGENT_LLM_BASE_URL routing every model call through the Sijil node — so the blocks and the
// allow are REAL node decisions with real record seqs, recorded on each run. The scenario itself is synthetic
// and labelled as such (DEMO_NOTE is shown verbatim on the page). The constants and response types live in
// sijil-demo-shared.ts so the tuning page's client component never pulls this file's node:* imports.

const byId = (cases: TaskCase[]) => new Map(cases.map((c) => [c.id, c]));

/** The blueprints whose bound cases make model calls — the ReAct questions (ask cases) and the T12 fee
 * notice (the drafter). Screened prompts only exist where a model is called, so the demo samples these. */
export function demoBlueprintIds(blueprints: Blueprint[], cases: TaskCase[], n = 4): string[] {
  const plan = planPilot(blueprints, cases, "dv");
  const m = byId(cases);
  const modelBound = Object.keys(plan.bound).filter((id) => plan.bound[id].some((cid) => { const c = m.get(cid); return !!c && (!!c.ask || c.task === "T12"); }));
  const pool = modelBound.length ? modelBound : Object.keys(plan.bound);
  return spreadSample(pool, n);
}

function sideOf(v: DemoVersion, runs: PilotRun[], sample: string[]): DemoSide {
  const inference = inferenceBlockSummary(runs);
  const seqs = runs.flatMap((r) => (r.sijil_blocks ?? []).map((b) => b.seq));
  return {
    key: v.key, label: v.label, runs: runs.length,
    blocked_runs: runs.filter((r) => r.status === "blocked_by_sijil").length,
    inference, seqs, allowed: inference.alignment === 0, sample,
  };
}

/** Run both draft versions through a small real pilot sample. Requires AGENT_LLM_BASE_URL (the caller checks). */
export async function runScreenDemo(sampleSize = 4): Promise<{ sop: string; profile: string; v1: DemoSide; v2: DemoSide }> {
  const sopId = SOP_ID;
  const profile = "Document Verification Analyst";
  const profiles = profilesOf(sopId)!;
  const flags = Object.fromEntries(profiles.flatMap((p) => p.tasks.map((t) => [t.id, { client_facing: t.flags.client_facing }])));
  const blueprints = deriveTests({ sopId, profile, chunks: loadSop(sopId).chunks, flags });
  const cases = [...ALL_CASES, ...generatedCases(blueprints, ALL_CASES, "dv", true)];
  const only = new Set(demoBlueprintIds(blueprints, cases, sampleSize));
  const retrieve = async (q: string, kind?: string) => (await searchSop(sopId, q, { k: 5, kind })).hits;

  const sides: DemoSide[] = [];
  for (const v of DEMO_VERSIONS) {
    const env = {
      retrieve, ocr: recordedOcr(),
      reasoner: llmReasoner({ system: SYSTEM + v.suffix }).reasoner,
      reflect: llmReflector().reflect,
      drafter: makeDrafter({ system: NOTICE_SYSTEM + v.suffix }).draft,
    };
    const { runs } = await executePilot(blueprints, cases, (c) => runCase(c, env), 1, Date.now, "dv", only);
    sides.push(sideOf(v, runs, [...only]));
  }
  return { sop: sopId, profile, v1: sides[0], v2: sides[1] };
}
