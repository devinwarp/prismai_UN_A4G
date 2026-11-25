import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { SYSTEM, REFLECT_SYSTEM } from "../src/lib/un/react-llm.ts";
import { NOTICE_SYSTEM } from "../src/lib/un/notice-draft.ts";
import { MODEL_FIX_SYSTEM } from "../src/lib/un/model-fix.ts";
import { SUBJECT_RULES } from "../src/lib/un/subject.ts";
import { DEMO_VERSIONS, DEMO_MODEL } from "../src/lib/un/sijil-screen-demo.ts";

// Every prompt the agent's model calls can carry, plus every skill line, must pass the Sijil node's
// enforce phrase list — a shipped line that trips a rule would block real runs. The list is vendored at
// tests/fixtures/sijil-node-policy.yaml (a copy of the node's deploy/render/policy.yaml; the public repo
// has no sibling checkout of the node).

const POLICY_PATH = path.join(process.cwd(), "tests/fixtures/sijil-node-policy.yaml");

/** Every quoted term of every `terms: [...]` list in the policy file (the keyword_flag rules). */
export function enforceTerms(yaml: string): string[] {
  const out: string[] = [];
  for (const line of yaml.split("\n")) {
    const m = line.match(/^\s*terms:\s*\[(.*)\]\s*$/);
    if (!m) continue;
    for (const t of m[1].matchAll(/"([^"]+)"/g)) out.push(t[1].toLowerCase());
  }
  return out;
}

function* shippedTexts(): Generator<[string, string]> {
  yield ["react SYSTEM", SYSTEM];
  yield ["REFLECT_SYSTEM", REFLECT_SYSTEM];
  yield ["NOTICE_SYSTEM", NOTICE_SYSTEM];
  yield ["MODEL_FIX_SYSTEM", MODEL_FIX_SYSTEM];
  for (const l of Object.values(SUBJECT_RULES)) yield [`SUBJECT_RULES: ${l.slice(0, 40)}`, l];
  const skills = path.join(process.cwd(), "kb/sop");
  for (const sop of readdirSync(skills)) {
    const dir = path.join(skills, sop, "skills");
    try {
      for (const f of readdirSync(dir).filter((x) => x.endsWith(".md"))) {
        yield [`skill ${sop}/${f}`, readFileSync(path.join(dir, f), "utf8")];
      }
    } catch { /* no skills dir */ }
  }
  // the demonstration's allowed version must pass too (its blocked sibling is the point of the demo)
  const v2 = DEMO_VERSIONS.find((v) => v.key === "draft-v2")!;
  yield ["demo draft-v2 on SYSTEM", SYSTEM + v2.suffix];
  yield ["demo draft-v2 on NOTICE_SYSTEM", NOTICE_SYSTEM + v2.suffix];
}

test("every shipped prompt and skill line passes the node's enforce phrase list", () => {
  const terms = enforceTerms(readFileSync(POLICY_PATH, "utf8"));
  assert.ok(terms.length >= 8, `expected the keyword_flag terms, got ${terms.length}`);
  const hits: string[] = [];
  for (const [name, text] of shippedTexts()) {
    const lower = text.toLowerCase();
    for (const t of terms) if (lower.includes(t)) hits.push(`${name}: "${t}"`);
  }
  assert.deepEqual(hits, []);
});

test("the vendored policy still matches the demo's expectations", () => {
  const terms = enforceTerms(readFileSync(POLICY_PATH, "utf8"));
  assert.ok(terms.includes("message another agent"), "agent_to_agent phrase missing from the vendored policy");
  const v1 = DEMO_VERSIONS.find((v) => v.key === "draft-v1")!;
  assert.ok(terms.some((t) => (SYSTEM + v1.suffix).toLowerCase().includes(t)), "draft v1 must trip an enforce term");
  assert.equal(DEMO_MODEL, "deepseek/deepseek-v4.1-flash");
});
