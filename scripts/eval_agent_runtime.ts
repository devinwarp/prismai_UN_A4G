// Compare the rule-based reasoner and the language-model reasoner on the same SOP questions.
//   node scripts/eval_agent_runtime.ts --reasoner rule|llm [--reps N] [--out file.json]
// Questions: the ASK cases of the per-task evals plus kb/eval/sop-lic-014-extra-questions.json.
// Retrieval is BM25 for both, so the only thing that differs is who chooses the next thought and action.
// The model reasoner needs AGENT_LLM_MODEL (optional) and a key in LLM_API_KEY / OPENROUTER_API_KEY, or LLM_BASE_URL (LM Studio).
import { readFileSync, writeFileSync } from "node:fs";
import { reactAnswer, ruleReasoner, type Reasoner } from "../src/lib/un/react-sop.ts";
import { llmReasoner } from "../src/lib/un/react-llm.ts";
import { searchSop } from "../src/lib/un/sop-kb.ts";
import { wilsonLower } from "../src/lib/un/eval-run.ts";

const arg = (k: string, d?: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const which = arg("--reasoner", "rule")!;
const reps = which === "llm" ? Number(arg("--reps", "3")) : 1;
const SOP = "SOP-LIC-014";
const retrieve = async (q: string, kind?: string) => (await searchSop(SOP, q, { k: 5, kind })).hits;
type Q = { id: string; q: string; expect: string[] | "outside" };
const questions: Q[] = (JSON.parse(readFileSync("kb/eval/sop-lic-014-extra-questions.json", "utf8")) as { questions: Q[] }).questions;
// the ASK cases of the per-task evals, as questions with the same expectations
questions.push(
  { id: "a1", q: "insurance certificate minimum cover", expect: ["D4"] },
  { id: "a2", q: "what is the corporate tax rate for my company", expect: "outside" },
  { id: "a3", q: "can I renew my trade licence in Dubai instead", expect: "outside" },
  { id: "a4", q: "Who is the head of licensing by name?", expect: "outside" },
  { id: "a5", q: "What is the name of the Head of Licensing who owns this procedure?", expect: "outside" },
  { id: "a6", q: "Which role is allowed to approve or reject a renewal?", expect: ["R1", "S7", "S3.4", "T15", "R4"] },
);

const lr = which === "llm" ? llmReasoner() : null;
const reasoner: Reasoner = lr ? lr.reasoner : ruleReasoner;
type Row = { id: string; expect: string; run: number; status: string; verdict: "correct" | "safe_miss" | "wrong_citation" | "leak"; cited: string[]; steps: number; rejected_actions: number; ms: number };
const rows: Row[] = [];
for (const x of questions) for (let run = 0; run < reps; run++) {
  const t0 = Date.now();
  const r = await reactAnswer(SOP, x.q, { retrieve, reasoner });
  const cited = r.citations.map((c) => c.split("#")[1]);
  let verdict: Row["verdict"];
  if (x.expect === "outside") verdict = r.status === "outside_kb" ? "correct" : "leak";
  else verdict = r.status === "outside_kb" ? "safe_miss" : cited.some((c) => (x.expect as string[]).includes(c)) ? "correct" : "wrong_citation";
  rows.push({ id: x.id, expect: x.expect === "outside" ? "outside" : x.expect.join("|"), run, status: r.status, verdict, cited, steps: r.steps.length, rejected_actions: r.steps.filter((s) => s.observation.startsWith("rejected")).length, ms: Date.now() - t0 });
}
const n = rows.length, k = (v: Row["verdict"]) => rows.filter((r) => r.verdict === v).length;
const inSop = rows.filter((r) => r.expect !== "outside"), out = rows.filter((r) => r.expect === "outside");
const pct = (a: number, b: number) => `${a}/${b} (95% lower bound ${Math.round(wilsonLower(a, b) * 100)}%)`;
const summary = {
  reasoner: which, model: lr?.model ?? "rule-based", reps, questions: questions.length, n,
  in_sop: { n: inSop.length, correct: inSop.filter((r) => r.verdict === "correct").length, safe_miss: inSop.filter((r) => r.verdict === "safe_miss").length, wrong_citation: inSop.filter((r) => r.verdict === "wrong_citation").length },
  outside_sop: { n: out.length, correct: out.filter((r) => r.verdict === "correct").length, leak: out.filter((r) => r.verdict === "leak").length },
  rejected_actions: rows.reduce((a, r) => a + r.rejected_actions, 0), mean_steps: Math.round((rows.reduce((a, r) => a + r.steps, 0) / n) * 10) / 10,
  llm: lr ? lr.usage : null,
};
console.log(JSON.stringify(summary, null, 1));
console.log(`in-SOP correct ${pct(summary.in_sop.correct, summary.in_sop.n)}; outside-SOP sent outside ${pct(summary.outside_sop.correct, summary.outside_sop.n)}; leaks ${summary.outside_sop.leak}; wrong citations ${summary.in_sop.wrong_citation}`);
for (const r of rows.filter((x) => x.verdict !== "correct")) console.log(`  ${r.verdict} ${r.id}#${r.run} expect ${r.expect} got ${r.status} ${r.cited.join(",")}`);
void k;
const o = arg("--out");
if (o) writeFileSync(o, JSON.stringify({ summary, rows }, null, 1));
