// Citation support: does the cited chunk actually back the model's claim?
// Input: the JSON written by `eval_agents.ts --collect` (accepted model messages
// with a citation). Samples 100 (seeded), has a SECOND model label each
// supported / partially / not supported (a model, NOT a human), and writes a
// 30-row blind sheet for human labelling.
//   node --env-file=.env.local scripts/citation_support.ts docs/eval/citation-collected.json --judge-model <id> [--generator <id>]
import { readFileSync, writeFileSync } from "node:fs";
import { parseLlmJson } from "../src/lib/llm.ts";
import type { Chunk } from "../src/lib/un/kb.ts";
import { wilson } from "./eval_agents.ts";

interface Collected { scenario: string; run: number; step: string; agent: string; claim: string; chunk_id: string; evidence: string[]; gate?: string }
const LABELS = ["supported", "partially", "not supported"] as const;

/** Small seeded PRNG so the sample is reproducible. */
function rng(seed: number) { return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function sample<T>(xs: T[], k: number, seed: number): T[] {
  const r = rng(seed); const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, k);
}
export const csv = (rows: Record<string, string | number>[]) => {
  const cols = Object.keys(rows[0] ?? {});
  const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  return [cols.join(","), ...rows.map((r) => cols.map((c) => q(r[c])).join(","))].join("\n") + "\n";
};

const TAIL = `Judge whether the cited chunk helps back the claim; do not judge whether the claim is true of the real world.
Reply with JSON only: {"label":"supported"|"partially"|"not supported","reason":"one short sentence"}`;
/** Two readings of "supports the claim". Both are reported; neither was tuned to the result of the other. */
const JUDGES = {
  // v1: the whole claim must be backed by the chunk.
  whole_claim: `You check whether a quoted source passage supports a claim. You see a CLAIM written by an AI agent and the full text of one SOURCE CHUNK it cited.
Label strictly:
- "supported": the chunk states or clearly entails what the claim says the source shows.
- "partially": the chunk is on topic and consistent but backs only part of the claim, or only loosely.
- "not supported": the chunk is off topic, or does not back the claim, or contradicts it.
${TAIL}`,
  // v2: facts about the case come from events, not from the source; only the part of the claim that leans on the source is checked.
  source_link: `You check whether a quoted source passage supports what an AI agent's message draws from it. You see a CLAIM and the full text of one SOURCE CHUNK it cited. The claim mixes facts about a specific case (these come from case events, not from the source, so ignore whether the chunk mentions them) with a policy, legal or standards point that it ties to the source.
Check only the part of the claim that leans on the source: the requirement, principle or obligation it names or implies.
- "supported": the chunk states or clearly entails that policy, legal or standards point, and the claim uses it appropriately.
- "partially": the chunk is on topic and consistent, but the point it backs is only loosely what the claim relies on.
- "not supported": the chunk is off topic for what the claim relies on, or the claim draws no point from the source that the chunk backs, or the chunk contradicts it.
${TAIL}`,
} as const;
type Reading = keyof typeof JUDGES;
const col = (r: Reading, what: "label" | "reason") => `llm_judge_${r}_${what} (llm_judge, NOT human)`;

if (process.argv[1]?.endsWith("citation_support.ts")) {
  const arg = (f: string) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : undefined; };
  const input = process.argv[2];
  const judgeModel = arg("--judge-model");
  const generator = arg("--generator") ?? "anthropic/claude-sonnet-5.5";
  if (!input || !judgeModel) { console.error("usage: citation_support.ts <collected.json> --judge-model <id> [--generator <id>]"); process.exit(2); }
  const chunks = new Map((JSON.parse(readFileSync("kb/chunks.json", "utf8")) as Chunk[]).map((c) => [c.chunk_id, c]));
  const all = (JSON.parse(readFileSync(input, "utf8")) as Collected[]).filter((m) => m.claim && chunks.has(m.chunk_id));
  const seen = new Set<string>();
  const uniq = all.filter((m) => { const k = `${m.claim}|${m.chunk_id}`; if (seen.has(k)) return false; seen.add(k); return true; });
  const picked = sample(uniq, 100, 20251119);
  const { chatCompletion } = await import("../src/lib/llm.ts");
  let cost = 0;
  const rows: Record<string, string | number>[] = [];
  for (const [i, m] of picked.entries()) {
    const c = chunks.get(m.chunk_id)!;
    const row: Record<string, string | number> = { id: i + 1, scenario: m.scenario, run: m.run, step: m.step, agent: m.agent, gate: m.gate ?? "", claim: m.claim, cited_chunk_id: m.chunk_id, chunk_source: c.title, chunk_text: c.text };
    for (const r of Object.keys(JUDGES) as Reading[]) {
      let label = "error"; let reason = "";
      for (let attempt = 0; attempt < 2 && label === "error"; attempt++) {
        try {
          const raw = await chatCompletion({ system: JUDGES[r], messages: [{ role: "user", content: JSON.stringify({ claim: m.claim, source_chunk: { title: c.title, text: c.text.slice(0, 4000) } }) }], json: true, maxTokens: 400, model: judgeModel, timeoutMs: 120_000, onUsage: (u) => { cost += u?.cost ?? 0; } });
          const j = parseLlmJson(raw) as { label?: string; reason?: string };
          if ((LABELS as readonly string[]).includes(j.label ?? "")) { label = j.label!; reason = String(j.reason ?? "").slice(0, 300); }
        } catch { /* retry once */ }
      }
      row[col(r, "label")] = label; row[col(r, "reason")] = reason;
    }
    rows.push(row);
  }
  writeFileSync("docs/eval/citation-support-sample.csv", csv(rows));
  const human = sample(rows, 30, 7).sort((a, b) => Number(a.id) - Number(b.id)).map((r) => ({ id: r.id, claim: r.claim, cited_chunk_id: r.cited_chunk_id, chunk_source: r.chunk_source, chunk_text: r.chunk_text, "human_label (supported / partially / not supported)": "", human_note: "" }));
  writeFileSync("docs/eval/citation-support-human-30.csv", csv(human));
  const pc = (k: number, n: number) => { const w = wilson(k, n); return `${(w.p * 100).toFixed(1)}% (${k}/${n}), 95% CI ${(w.lo * 100).toFixed(1)}% to ${(w.hi * 100).toFixed(1)}%`; };
  const stat = (r: Reading, pick?: (x: Record<string, string | number>) => boolean) => {
    const rs = rows.filter((x) => x[col(r, "label")] !== "error" && (!pick || pick(x)));
    const k = (l: string) => rs.filter((x) => x[col(r, "label")] === l).length;
    return { n: rs.length, sup: k("supported"), par: k("partially"), not: k("not supported") };
  };
  const w = stat("whole_claim"), s = stat("source_link");
  const scen = [...new Set(rows.map((r) => r.scenario as string))];
  const md = [
    "# Citation support (preliminary, labelled by a model)",
    "",
    "**Human labels are pending. The labels below were assigned by a second language model acting as judge, not by a person. Treat every number here as provisional until the 30-row human sheet is filled in and compared with the judge.**",
    "",
    "Question: does the chunk a model message cites actually support the claim in that message? The agent already guarantees the cited chunk id exists and was shown to the model (that is all the earlier \"citation validity\" figure checks); this checks relevance and support, which that guarantee does not.",
    "",
    `- Messages generated by \`${generator}\` in real runs of S1, S2 and S4 (accepted model messages that cite a chunk; ${uniq.length} distinct claim and chunk pairs collected).`,
    `- Sample: 100 pairs drawn at random (seeded) from those. Judge: \`${judgeModel}\` (a model from a different vendor than the generator). Judge cost about $${cost.toFixed(2)}.`,
    `- Files: \`citation-support-sample.csv\` (all 100 rows: claim, cited chunk id, chunk text, and both judge labels with a one-line reason; label columns are headed "llm_judge, NOT human") and \`citation-support-human-30.csv\` (30 random rows of the same 100, judge labels hidden, empty \`human_label\` column).`,
    "",
    "A message usually mixes a fact about the case (from an event) with a policy point tied to the source. Two readings of \"supports\" were judged, both reported, and the second was added after the first gave a low result, so read the pair as a range rather than picking one:",
    "",
    "1. Whole claim (strict): the chunk must back everything the claim says. A claim about a specific test result can never pass, because no source chunk mentions the case.",
    "2. Source link only: ignore case facts; check only the requirement or principle the claim leans on the source for.",
    "",
    "| Reading | Supported | Partially | Not supported |",
    "|---|---|---|---|",
    `| Whole claim | ${pc(w.sup, w.n)} | ${w.par} | ${w.not} |`,
    `| Source link only | ${pc(s.sup, s.n)} | ${s.par} | ${s.not} |`,
    "",
    `Supported or partially, source link only: **${pc(s.sup + s.par, s.n)}**.`,
    "",
    "Source link only, by scenario (supported):",
    "",
    "| Scenario | Supported (LLM judge) |",
    "|---|---|",
    ...scen.map((sc) => { const x = stat("source_link", (r) => r.scenario === sc); return `| ${sc} | ${pc(x.sup, x.n)} |`; }),
    "",
    "## How to label the human sheet",
    "",
    "Use the second reading. Read the claim, ignore facts about the specific case, and ask: does the chunk text state the requirement or principle the claim relies on it for? Fill `human_label` with `supported`, `partially` or `not supported`, and add a note if unsure. Then compare with the judge's `source_link` labels for the same ids in `citation-support-sample.csv`.",
    "",
    "## Caveats",
    "",
    "- The judge is a model and can be wrong in either direction. Its agreement with people is not yet measured; the 30-row sheet exists to measure it. Until then, do not quote these numbers as validated.",
    "- The interval treats the 100 pairs as independent; they come from a small number of runs of three scripted scenarios and are correlated, so it is optimistic.",
    "- Retrieval is lexical (BM25), and a message often cites a chunk because it was shown, not because it was needed. A \"partially\" or \"not supported\" label usually means loosely relevant background, not a wrong claim about the case.",
    "- The earlier 100% citation validity only checks that the chunk id exists in `kb/chunks.json`. It says nothing about support. This is the first measure of support.",
    "",
  ].join("\n");
  writeFileSync("docs/eval/citation-support.md", md);
  console.log(md);
}
