// Manual end-to-end check: runs a small sample of the real (rule-based) agent's pilot through executePilot with the real sealer against a Sijil
// node, then prints what was sealed. No model key is needed. Environment: SIJIL_BASE_URL, SIJIL_AGENT_ID, SIJIL_AGENT_KEY, SIJIL_AGENT_TOKEN.
//   node scripts/sijil_pilot_check.ts [--sample 8] [--no-disclosure]
// --no-disclosure strips the AI-disclosure sentence from each drafted message BEFORE the run is recorded: a deliberate failing fixture to see the
// deliverable sealed flagged. It edits the check's own copy of the output, never product code.
import { executePilot, generatedCases, sealSummary, spreadSample } from "../src/lib/un/pilot-run.ts";
import { agentConfigFromEnv, createSealer, verifyChain } from "../src/lib/un/sijil-agent-client.ts";
import { sha256Hex } from "../src/lib/un/sijil-agent.ts";
import { deriveTests } from "../src/lib/un/test-derive.ts";
import { loadSop, searchSop } from "../src/lib/un/sop-kb.ts";
import { profilesOf } from "../src/lib/un/sop/data.ts";
import { ALL_CASES, recordedOcr, runCase, SOP_ID } from "../src/lib/un/task-evals.ts";
import { measure } from "../src/lib/un/pilot.ts";

const cfg = agentConfigFromEnv();
if (!cfg) { console.error("set SIJIL_BASE_URL, SIJIL_AGENT_ID, SIJIL_AGENT_KEY and SIJIL_AGENT_TOKEN"); process.exit(2); }
const sample = Number(process.argv[process.argv.indexOf("--sample") + 1]) || 8;
const strip = process.argv.includes("--no-disclosure");

const profiles = profilesOf(SOP_ID)!;
const flags = Object.fromEntries(profiles.flatMap((p) => p.tasks.map((t) => [t.id, { client_facing: t.flags.client_facing }])));
const set = deriveTests({ sopId: SOP_ID, profile: "Document Verification Analyst", chunks: loadSop(SOP_ID).chunks, flags });
const env = { retrieve: async (q: string, kind?: string) => (await searchSop(SOP_ID, q, { k: 5, kind })).hits, ocr: recordedOcr() };
const cases = [...ALL_CASES, ...generatedCases(set, ALL_CASES)];
const bound = set.filter((b) => b.status === "active").map((b) => b.id);
const only = new Set(spreadSample(bound, sample));

const texts = new Map<string, string>();
const run = async (c: (typeof cases)[number]) => {
  const o = await runCase(c, env);
  const email = (o.result.output as { email?: { body?: string } | null }).email;
  if (strip && email?.body) email.body = email.body.replace(/[^.\n]*\bAI\b[^.\n]*\.?/gi, "").trim() || "Your documents were received.";
  if (email?.body) texts.set(c.id, email.body);
  return o;
};
const { runs } = await executePilot(set, cases, run, 1, Date.now, "dv", only, createSealer(cfg));
const m = measure(runs);
const sealed = sealSummary(runs);
const withDeliverable = runs.filter((r) => r.sijil?.deliverable_hash);
const hashesMatch = withDeliverable.every((r) => [...texts.values()].some((t) => sha256Hex(t) === r.sijil!.deliverable_hash));
console.log(JSON.stringify({
  runs: runs.length, summary: sealed, deliverables_sealed: withDeliverable.length, deliverable_hashes_match_text: hashesMatch,
  deliverable_decisions: [...new Set(withDeliverable.map((r) => r.sijil!.deliverable_decision))],
  rejected_calls_total: m.rejected_calls, disclosure: m.disclosure, chain: await verifyChain(cfg),
}, null, 1));
