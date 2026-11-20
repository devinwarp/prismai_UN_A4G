import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { EVAL_SETS } from "../src/lib/un/evalset.ts";
import { AR } from "../src/lib/un/i18n/dict.ts";
import { SUBJECT_RULES } from "../src/lib/un/subject.ts";

const FILES = [
  "src/app/admin/federal/use-cases/[id]/evals/page.tsx",
  "src/app/admin/federal/use-cases/[id]/evals/EvalRunButton.tsx",
  "src/app/admin/federal/use-cases/[id]/tuning/page.tsx",
  "src/app/admin/federal/use-cases/[id]/tuning/TuningControls.tsx",
  "src/app/admin/federal/evals/page.tsx",
  "src/app/admin/federal/_components/EvalText.tsx",
  "src/app/admin/federal/use-cases/[id]/production/page.tsx",
  "src/app/admin/federal/use-cases/[id]/production/ProductionControls.tsx",
];

test("every literal translation key the lifecycle screens use has an Arabic string", () => {
  const keys = new Set<string>();
  for (const f of FILES) {
    const src = readFileSync(f, "utf8");
    // k="ev.x" in JSX, and tr(lang, "ev.x", ...) in client code
    for (const m of src.matchAll(/\bk="([a-z]+\.[\w.]+)"/g)) keys.add(m[1]);
    for (const m of src.matchAll(/tr\(lang, "([a-z]+\.[\w.]+)"/g)) keys.add(m[1]);
  }
  assert.ok(keys.size > 60, `found ${keys.size} keys`);
  const missing = [...keys].filter((k) => !AR[k]);
  assert.deepEqual(missing, []);
});

test("keys built at run time are covered: verdicts, findings, reasons, entry kinds, rules, cases", () => {
  const need: string[] = [
    ...["correct", "hallucinated", "misaligned", "incomplete"].map((v) => `ev.v.${v}`),
    ...["contradicts_record", "not_in_record", "rejected_call", "no_disclosure", "missing_fact", "should_hand_over"].map((c) => `ev.f.${c}`),
    ...["tool_not_authorised", "human_release_missing"].map((r) => `ev.reason.${r}`),
    ...["baseline", "iteration", "certification", "holdout_burned", "approval"].map((k) => `tu.k.${k}`),
    ...["active", "warned", "suspended", "probation"].map((x) => `pr.s.${x}`),
    ...["sijil_rejection", "repeated_probe_failures", "probe_failures"].map((x) => `pr.r.${x}`),
    ...["deployed", "window", "warning", "suspension", "reinstatement", "recovery"].map((x) => `pr.k.${x}`),
    ...Object.keys(SUBJECT_RULES).map((r) => `rule.${r}`),
    ...Object.values(EVAL_SETS).flat().flatMap((c) => [`case.${c.id}.title`, `case.${c.id}.request`]),
  ];
  assert.deepEqual(need.filter((k) => !AR[k]), []);
});

test("Arabic strings keep the placeholders of their English source", () => {
  const sources = FILES.map((f) => readFileSync(f, "utf8")).join("\n");
  for (const m of sources.matchAll(/k="([a-z]+\.[\w.]+)" en="([^"]*)"/g)) {
    const [, key, en] = m;
    const want = [...en.matchAll(/\{(\w+)\}/g)].map((x) => x[1]).sort();
    const got = [...(AR[key] ?? "").matchAll(/\{(\w+)\}/g)].map((x) => x[1]).sort();
    assert.deepEqual(got, want, `${key}: placeholders differ`);
  }
});
