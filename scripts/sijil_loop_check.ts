// Manual end-to-end check of the WHOLE Sijil loop in one pilot run, against a local node
// (sijil-foundationflow) with a fake OpenAI upstream — no real model key needed:
//
//   1. screening:   every model call (reasoner, reflector, drafter) goes through the node's /v1
//                   (AGENT_LLM_BASE_URL) and is allowed or blocked BEFORE inference;
//   2. sealing:     each run's tool calls and deliverable are sealed through /api/agent/*
//                   (SIJIL_AGENT_* from scripts/sijil_register.ts);
//   3. verification: the node's own chain verifies, and the read adapter pulls the sealed runs back
//                   (the same calls the pilot page's "Pull from Sijil" makes).
//
//   node (sijil-foundationflow):
//     POLICY_PATH=deploy/render/policy.yaml DATABASE_PATH=/tmp/sijil-loop.db \
//     LMSTUDIO_BASE_URL=http://127.0.0.1:8791/v1 SIJILL_UPSTREAM_PROVIDER=openrouter \
//     SIJILL_TOKEN=agent-token SIJILL_ADMIN_TOKEN=admin-token \
//     venv/bin/uvicorn sijill.proxy:app --port 8077
//   register once:  SIJIL_BASE_URL=http://localhost:8077 SIJIL_AGENT_TOKEN=agent-token SIJIL_ADMIN_TOKEN=admin-token \
//                     node scripts/sijil_register.ts loopcheck
//   run:  SIJIL_BASE_URL=http://localhost:8077 SIJIL_AGENT_ID=spiffe://prism/agent/loopcheck SIJIL_AGENT_KEY=<hex> \
//         SIJIL_AGENT_TOKEN=agent-token AGENT_LLM_BASE_URL=http://localhost:8077/v1 \
//         AGENT_LLM_MODEL=deepseek/deepseek-v4.1-flash node scripts/sijil_loop_check.ts [sample-size]
import { createServer } from "node:http";
import { deriveTests } from "../src/lib/un/test-derive.ts";
import { profilesOf } from "../src/lib/un/sop/data.ts";
import { loadSop, searchSop } from "../src/lib/un/sop-kb.ts";
import { ALL_CASES, recordedOcr, runCase, SOP_ID } from "../src/lib/un/task-evals.ts";
import { executePilot, generatedCases, inferenceBlockSummary } from "../src/lib/un/pilot-run.ts";
import { llmReasoner, llmReflector } from "../src/lib/un/react-llm.ts";
import { makeDrafter } from "../src/lib/un/notice-draft.ts";
import { demoBlueprintIds } from "../src/lib/un/sijil-screen-demo.ts";
import { agentConfigFromEnv, configProblem, createSealer, verifyChain } from "../src/lib/un/sijil-agent-client.ts";
import { pullLive, liveConfigFromEnv } from "../src/lib/un/sijil-live.ts";

const cfg = agentConfigFromEnv();
if (!cfg) { console.error(configProblem() ?? "set SIJILL_BASE_URL, SIJIL_AGENT_ID, SIJILL_AGENT_KEY, SIJILL_AGENT_TOKEN"); process.exit(2); }
const live = liveConfigFromEnv();
if (!live) { console.error("set SIJILL_BASE_URL for the pull-back check"); process.exit(2); }

// the fake upstream the node forwards to (same canned ReAct step as sijil_inference_check.ts)
const stub = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const j = JSON.parse(body || "{}");
    const isReflect = /review ONE proposed answer/i.test(JSON.stringify(j.messages ?? []));
    const content = isReflect
      ? JSON.stringify({ answers: false, quote: "", why: "stub" })
      : JSON.stringify({ thought: "stub: ask outside", action: { tool: "request_outside_information", question: "stub", reason: "stub check" } });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }));
  });
});
await new Promise<void>((r) => stub.listen(8791, "127.0.0.1", r));

const sopId = SOP_ID, profile = "Document Verification Analyst";
const profiles = profilesOf(sopId)!;
const flags = Object.fromEntries(profiles.flatMap((p) => p.tasks.map((t) => [t.id, { client_facing: t.flags.client_facing }])));
const blueprints = deriveTests({ sopId, profile, chunks: loadSop(sopId).chunks, flags });
const cases = [...ALL_CASES, ...generatedCases(blueprints, ALL_CASES, "dv", true)];
const only = new Set(demoBlueprintIds(blueprints, cases, Number(process.argv[2]) || 3));
const retrieve = async (q: string, kind?: string) => (await searchSop(sopId, q, { k: 5, kind })).hits;
const env = { retrieve, ocr: recordedOcr(), reasoner: llmReasoner().reasoner, reflect: llmReflector().reflect, drafter: makeDrafter().draft };

const out: Record<string, unknown> = {};
try {
  const { runs, plan } = await executePilot(blueprints, cases, (c) => runCase(c, env), 1, Date.now, "dv", only, createSealer(cfg));
  out.pilot = {
    runs: runs.length,
    sealed_on_node: runs.filter((r) => r.sijil?.source.startsWith("node:")).length,
    sealed_total_records: runs.reduce((a, r) => a + (r.sijil?.sealed ?? 0), 0),
    inference_blocks: inferenceBlockSummary(runs),
    statuses: [...new Set(runs.map((r) => r.status))],
  };
  out.unexecuted = Object.keys(plan.unexecuted ?? {}).length;

  out.chain = await verifyChain(cfg);
  const pull = await pullLive(live, { ext_id: "UC02" });
  out.pull = { verified: pull.verified, nodeId: pull.nodeId, records: pull.records, runs_pulled: pull.runs.length };
} finally {
  stub.close();
}
console.log(JSON.stringify(out, null, 1));
const p = out.pilot as { sealed_on_node?: number; runs?: number };
const chain = out.chain as { ok?: boolean };
const pull = out.pull as { verified?: boolean; runs_pulled?: number };
if (!p.runs || p.sealed_on_node !== p.runs || chain.ok !== true || pull.verified !== true || !pull.runs_pulled) {
  console.error("FAIL: the loop did not close (screen + seal + verify + pull)");
  process.exit(1);
}
console.log("PASS: prompts screened, every run sealed on the node, chain verified, runs pulled back");
