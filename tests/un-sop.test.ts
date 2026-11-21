import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import test from "node:test";
import { compareProcesses, flatEvidence } from "../src/lib/un/compare.ts";
import { applicableRules } from "../src/lib/un/hitl.ts";
import { parseUseCases, QUADRANTS } from "../src/lib/un/model.ts";
import { RULESETS } from "../src/lib/un/rulesets.ts";
import { parseBaseline } from "../src/lib/un/sop/baseline.ts";
import { inputFromBody, loadBaseline, loadSamples } from "../src/lib/un/sop/data.ts";
import { llmAnalyzer } from "../src/lib/un/sop/llm.ts";
import { toUseCase } from "../src/lib/un/sop/promote.ts";
import { analyzeSop, ruleAnalyzer } from "../src/lib/un/sop/reference.ts";
import { offlineClient } from "../src/lib/supabase/offline.ts";

const samples = loadSamples();
const by = (id: string) => samples.find((s) => s.input.sop_id === id)!;

test("the synthetic baseline validates, and bad files are refused with every problem listed", () => {
  const raw = JSON.parse(readFileSync("data/sop-baseline.json", "utf8"));
  assert.equal(parseBaseline(raw).currency, "XXD");
  assert.throws(() => parseBaseline({ ...raw, currency: "AED" }), /XXD/);
  assert.throws(() => parseBaseline({ ...raw, share_by_class: { automate: 2, assist: 0.2, keep_human: 0.1 } }), /automate.*keep_human/);
  assert.throws(() => parseBaseline({ ...raw, note: "real figures" }), /fictional or synthetic/);
  assert.throws(() => parseBaseline({ ...raw, default_step_minutes: { step: 0 } }), /default_step_minutes/);
});

test("all four fixtures parse: numbered, bulleted and headed prose", () => {
  assert.deepEqual(samples.map((s) => [s.input.sop_id, s.analysis.steps.length]), [["licence-renewal", 13], ["records-archive", 7], ["fee-waiver", 12], ["SOP-LIC-014", 152]]);
  for (const { input, analysis } of samples) {
    const lines = input.text.split("\n");
    for (const s of analysis.steps) {
      const span = lines.slice(s.cite.start - 1, s.cite.end).join("\n");
      assert.ok(span.includes(s.cite.quote), `${s.id} quote must be a substring of its lines`);
    }
    assert.ok(analysis.actors.length >= 2 && analysis.systems.length >= 2, input.sop_id);
  }
  assert.deepEqual(by("licence-renewal").analysis.steps[3].systems, ["Marsa Licence Register"]);
  assert.equal(by("licence-renewal").analysis.steps[0].minutes, 5);
  assert.equal(by("licence-renewal").analysis.steps[2].kind, "exception");
  assert.equal(by("records-archive").analysis.steps[3].minutes, 20);
});

test("output is deterministic, and CRLF input gives the same steps", () => {
  const { input } = by("fee-waiver");
  assert.equal(JSON.stringify(analyzeSop(input)), JSON.stringify(analyzeSop(input)));
  const crlf = analyzeSop({ ...input, text: input.text.replace(/\n/g, "\r\n") });
  assert.deepEqual(crlf.steps.map((s) => s.text), analyzeSop(input).steps.map((s) => s.text));
});

test("risk flags: renewal is client-facing only, the archive has none, the waiver has all three", () => {
  const f = (id: string) => by(id).analysis.flags;
  assert.deepEqual([f("licence-renewal").client_facing, f("licence-renewal").affects_rights, f("licence-renewal").irreversible], [true, false, false]);
  assert.deepEqual([f("records-archive").client_facing, f("records-archive").affects_rights, f("records-archive").irreversible], [false, false, false]);
  assert.deepEqual([f("fee-waiver").client_facing, f("fee-waiver").affects_rights, f("fee-waiver").irreversible], [true, true, true]);
  for (const k of ["client_facing", "affects_rights", "irreversible"] as const) assert.ok(f("fee-waiver").evidence[k].length > 0);
});

test("classes: routine checks automate, drafting assists, approvals stay with a person", () => {
  const a = by("licence-renewal").analysis;
  const cls = (id: string) => a.candidates.find((c) => c.step_ids.includes(id))!.class;
  assert.equal(cls("S4"), "automate");
  assert.equal(cls("S8"), "assist");
  assert.equal(cls("S10"), "keep_human");
  const keep = a.candidates.find((c) => c.class === "keep_human")!;
  assert.equal(keep.hours_saved_per_year, 0);
  assert.equal(keep.cost_saved_per_year, 0);
});

test("savings = baseline minutes x volume x class share, recomputed independently", () => {
  for (const { input, analysis: a } of samples) {
    const b = input.baseline;
    const cases = b.cases_per_year[input.sop_id];
    const cls = new Map(a.candidates.flatMap((c) => c.step_ids.map((s) => [s, c.class] as const)));
    let base = 0, saved = 0;
    for (const s of a.steps) {
      const m = s.minutes ?? b.default_step_minutes[s.kind];
      base += (m * cases) / 60;
      saved += (m * cases * b.share_by_class[cls.get(s.id)!]) / 60;
    }
    assert.ok(Math.abs(a.totals.baseline_hours_per_year - base) < 0.06, input.sop_id);
    assert.ok(Math.abs(a.totals.hours_saved_per_year - saved) < 0.06 * a.candidates.length, input.sop_id);
    assert.equal(a.totals.cost_saved_per_year, a.candidates.reduce((n, c) => n + c.cost_saved_per_year, 0));
    assert.equal(a.totals.currency, "XXD");
    assert.deepEqual(a.assumptions.share_by_class, b.share_by_class);
  }
});

test("promote: a valid use case, ext_id SOP-*, flags carried, oversight rules derived", () => {
  for (const { input, analysis } of samples) {
    const u = toUseCase(analysis, input);
    assert.match(u.ext_id, /^SOP-[A-Z0-9-]+$/);
    assert.ok((QUADRANTS as readonly string[]).includes(u.quadrant));
    assert.equal(u.hitl_rule, null);
    // survives the real CSV importer
    const q = (s: string | null) => `"${(s ?? "").replaceAll('"', '""')}"`;
    const csv = `id,entity,entity_sector,use_case,quadrant,departments_in_scope,client_facing,affects_rights,irreversible,description\n` +
      [u.ext_id, u.entity, u.entity_sector, u.title, u.quadrant, u.departments, u.client_facing ? "yes" : "no", u.affects_rights ? "yes" : "no", u.irreversible ? "yes" : "no", u.description].map(q).join(",");
    const back = parseUseCases(csv);
    assert.deepEqual(back.errors, []);
    assert.equal(back.useCases[0].ext_id, u.ext_id);
  }
  const u = toUseCase(by("fee-waiver").analysis, by("fee-waiver").input);
  assert.equal(u.quadrant, "External Agents");
  assert.deepEqual(applicableRules({}, u.entity, u), ["client_facing_final_approval", "rights_or_fees_human_decision", "irreversible_human_approval"]);
  assert.equal(toUseCase(by("records-archive").analysis, by("records-archive").input).quadrant, "Internal Agents");
});

test("promoted rows get a verdict under every rule set; the waiver is rights-escalated under the EU set", () => {
  for (const { input, analysis } of samples) {
    const u = toUseCase(analysis, input);
    for (const rs of RULESETS) {
      for (const pass of [false, true]) {
        const [r] = compareProcesses(rs, [{ id: u.ext_id, entity: u.entity, facts: u, requested: "GO_AUTONOMOUS", gates: flatEvidence(pass), hitlUnmet: [] }]);
        assert.ok(r.decision.verdict);
        if (pass && u.client_facing) assert.equal(r.decision.verdict, "GO_SUPERVISED");
        if (pass && !u.client_facing) assert.equal(r.decision.verdict, "GO_AUTONOMOUS");
        if (!pass) assert.equal(r.decision.verdict, "ESCALATE");
      }
    }
  }
  const w = by("fee-waiver");
  const u = toUseCase(w.analysis, w.input);
  const eu = RULESETS.find((r) => r.id === "eu-ai-act")!;
  const [row] = compareProcesses(eu, [{ id: u.ext_id, entity: u.entity, facts: u, requested: "GO_AUTONOMOUS", gates: flatEvidence(true), hitlUnmet: [] }]);
  assert.equal(row.highRisk, true);
});

test("fixtures and baseline are fictitious: no real organisations, the fictitious authority is named, XXD only", () => {
  const files = readdirSync("data/sop").map((f) => `data/sop/${f}`).concat("data/sop-baseline.json");
  assert.ok(files.length >= 4);
  for (const f of files) {
    const t = readFileSync(f, "utf8");
    assert.doesNotMatch(t, /\b(dubai|abu dhabi|sharjah|emirates|dewa|etisalat|du\b|barakah|prism\.infinite|\.gov|\.ae\b|AED|USD|EUR)\b/i, f);
    assert.doesNotMatch(t, /[\w.]+@[\w.]+\.\w+/, `${f} has an email address`);
  }
  for (const f of files.filter((x) => x.endsWith(".md"))) {
    const t = readFileSync(f, "utf8");
    assert.match(t, /fictitious/i);
    assert.match(t, /Marsa Public Services Authority/);
  }
});

test("input validation: empty, oversized and unknown-sample bodies are refused; pasted text is slugged", () => {
  assert.equal(inputFromBody({ text: "  " }), "The SOP text is empty.");
  assert.match(String(inputFromBody({ text: "x".repeat(200_001) })), /too large/);
  assert.equal(inputFromBody({ sample: "nope" }), "Unknown sample");
  const ok = inputFromBody({ text: "# My Own SOP!\n1. The clerk checks the form.\n2. The clerk emails the applicant.\n3. The clerk closes the case." });
  assert.ok(typeof ok !== "string");
  if (typeof ok !== "string") {
    assert.equal(ok.sop_id, "my-own-sop");
    const a = analyzeSop(ok);
    assert.equal(a.steps.length, 3);
    assert.match(a.warnings.join(" "), /default of 5000 cases/);
  }
});

test("the model pass is optional: failure and offline fall back to the rules; it can only fill gaps with text from the step", async () => {
  const { input, analysis: rules } = by("licence-renewal");
  const down = await llmAnalyzer(async () => { throw new Error("network down"); }, true).analyze(input);
  assert.equal(down.analyzer.mode, "deterministic");
  assert.deepEqual({ ...down, warnings: [] }, { ...rules, warnings: [] });
  assert.match(down.warnings.at(-1)!, /failed/);

  const prev = process.env.OFFLINE;
  process.env.OFFLINE = "1";
  try {
    let called = false;
    const off = await llmAnalyzer(async () => { called = true; return "{}"; }).analyze(input);
    assert.equal(called, false);
    assert.equal(off.analyzer.mode, "deterministic");
    assert.equal((await ruleAnalyzer.analyze(input)).totals.hours_saved_per_year, rules.totals.hours_saved_per_year);
  } finally {
    if (prev === undefined) delete process.env.OFFLINE; else process.env.OFFLINE = prev;
  }

  const reply = JSON.stringify({ steps: [{ id: "S2", actor: "Wizard", systems: ["Imaginary Portal"] }, { id: "S10", actor: "x", systems: [] }] });
  const filled = await llmAnalyzer(async () => reply, true).analyze(input);
  assert.equal(filled.analyzer.mode, "llm");
  assert.equal(filled.steps[1].actor, rules.steps[1].actor); // "Wizard" is not in the step text
  assert.deepEqual(filled.steps[1].systems, rules.steps[1].systems);
  assert.deepEqual(filled.totals, rules.totals);
  assert.deepEqual(filled.flags, rules.flags);
});

test("offline mode: promoting writes a SOP-* row beside the CSV rows and re-promoting updates it", async () => {
  const f = `.data/test-sop-${process.pid}.json`;
  process.env.OFFLINE_DB = f;
  try {
    const db = offlineClient();
    const { input, analysis } = by("fee-waiver");
    const u = toUseCase(analysis, input);
    for (let i = 0; i < 2; i++) {
      const r = await db.from("un_use_cases").upsert([{ ...u, org_id: "o1" }], { onConflict: "org_id,ext_id" });
      assert.equal(r.error, null);
    }
    const { data } = await db.from("un_use_cases").select("*").eq("org_id", "o1");
    const rows = data as { ext_id: string; affects_rights: boolean; stage: string }[];
    assert.equal(rows.length, 1);
    assert.deepEqual([rows[0].ext_id, rows[0].affects_rights, rows[0].stage], ["SOP-FEE-WAIVER", true, "intake"]);
  } finally {
    delete process.env.OFFLINE_DB;
    if (existsSync(f)) rmSync(f);
  }
});

test("both SOP write routes check requireAdmin before reading the body (viewers get the read-only 403)", () => {
  for (const f of ["src/app/api/admin/un/sop/analyze/route.ts", "src/app/api/admin/un/sop/promote/route.ts"]) {
    const src = readFileSync(f, "utf8");
    const post = src.slice(src.indexOf("export async function POST"));
    assert.ok(post.indexOf("requireAdmin()") > 0 && post.indexOf("requireAdmin()") < post.indexOf("request.json()"), f);
  }
  assert.ok(loadBaseline().currency === "XXD");
});
