import assert from "node:assert/strict";
import test from "node:test";
import { compliantPatch, engineValues, parseUseCasePatch, verdictPatch } from "../src/lib/un/guard.ts";
import type { UnUseCaseState } from "../src/lib/un/model.ts";

const uc = (o: Partial<UnUseCaseState> = {}): UnUseCaseState => ({
  id: "1", ext_id: "UC02", entity: "E", entity_sector: null, title: "t", quadrant: "External Agents", matrix_examples: null,
  departments: null, client_facing: true, hitl_rule: null, description: null, stage: "intake", verdict: null, compliant: false, ...o,
});

test("I-1: a PATCH carrying verdict or compliant is rejected", () => {
  for (const body of [{ verdict: "GO_AUTONOMOUS" }, { verdict: null }, { compliant: true }, { stage: "pilot", verdict: "NO_GO" }]) {
    const r = parseUseCasePatch(body);
    assert.equal(r.ok, false);
  }
});

test("I-1: stage is still editable and validated", () => {
  assert.deepEqual(parseUseCasePatch({ stage: "pilot" }), { ok: true, patch: { stage: "pilot" } });
  assert.equal(parseUseCasePatch({ stage: "nope" }).ok, false);
});

test("I-1: the dashboard reads hand-set verdicts and compliance as unset", () => {
  const hand = engineValues(uc({ verdict: "GO_AUTONOMOUS", compliant: true }));
  assert.equal(hand.verdict, null);
  assert.equal(hand.compliant, false);
  const eng = uc({ verdict: "GO_SUPERVISED", verdict_run_id: "r", verdict_head_hash: "h", verdict_signed_by: "u1", compliant: true, compliant_report_id: "p" });
  assert.deepEqual(engineValues(eng), eng);
});

test("I-1: verdict is written only from a completed run, with run id and head hash", () => {
  const run = { id: "uuid", head_hash: "abc", done: true };
  const sig = { signer_id: "u1", signed_at: "2026-11-09T08:00:00Z" };
  assert.deepEqual(verdictPatch(run, "GO_SUPERVISED", true, sig), {
    verdict: "GO_SUPERVISED", stage: "deployed", verdict_run_id: "uuid", verdict_head_hash: "abc", verdict_signed_by: "u1", verdict_signed_at: sig.signed_at,
  });
  assert.equal(verdictPatch(run, "ASSISTANT_ONLY", true, sig).stage, "pilot"); // not a GO verdict: not deployed
  assert.equal(verdictPatch(run, "GO_AUTONOMOUS", false, sig).stage, "deployed");
  assert.throws(() => verdictPatch({ ...run, done: false }, "NO_GO", true, sig), /completed/);
  assert.throws(() => verdictPatch(run, "GO_AUTONOMOUS", true, sig), /client-facing/);
  assert.throws(() => verdictPatch(run, "GO_SUPERVISED", true, { signer_id: "", signed_at: "" }), /signature/);
  assert.equal(verdictPatch(run, "GO_AUTONOMOUS", false, sig).verdict, "GO_AUTONOMOUS");
});

test("I-1: only a passing Sijil report flips compliant, and records its hash", () => {
  assert.deepEqual(compliantPatch({ id: "p1", pass: true, sha256: "s" }), { compliant: true, compliant_report_id: "p1", compliant_report_sha256: "s" });
  assert.equal(compliantPatch({ id: "p2", pass: false, sha256: "s" }).compliant, false);
});

test("I-3: npm test globs the test files and the engine floor is declared", async () => {
  const { readFileSync } = await import("node:fs");
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(pkg.scripts.test, 'node --test "tests/*.test.ts"');
  assert.equal(pkg.engines.node, ">=22.18");
  assert.equal(pkg.type, "module");
});

test("I-5: the default deadline is labelled as assumed; a configured one is shown as set", async () => {
  const { DEFAULT_POLICY, deadlineText } = await import("../src/lib/un/model.ts");
  assert.match(deadlineText(DEFAULT_POLICY), /about April 2028.*assumed/);
  assert.equal(deadlineText({ ...DEFAULT_POLICY, deadline: "2027-12-31" }), " by 2027-12-31");
  assert.equal(deadlineText({ ...DEFAULT_POLICY, deadline: null }), "");
});

test("I-5: the report no longer claims ITU code was reused unmodified, and carries no author", async () => {
  const { readFileSync } = await import("node:fs");
  const { execFileSync } = await import("node:child_process");
  const xml = execFileSync("python", ["-c", "import zipfile,sys;z=zipfile.ZipFile('docs/report/prism-technical-report.docx');sys.stdout.buffer.write(z.read('word/document.xml')+z.read('docProps/core.xml'))"], { encoding: "utf8" });
  assert.ok(!xml.includes("reused unmodified"));
  assert.ok(xml.includes("HTML cleaning is ours"));
  assert.ok(!xml.includes("Meng"));
  const src = JSON.parse(readFileSync("kb/sources.json", "utf8")) as { local?: string; itu_repo_commit?: string }[];
  assert.ok(src.filter((s) => s.local).every((s) => /^[0-9a-f]{40}$/.test(s.itu_repo_commit ?? "")));
});

test("I-6: the ITU MIT notice is present and names the pinned commit", async () => {
  const { readFileSync } = await import("node:fs");
  const n = readFileSync("THIRD_PARTY_NOTICES.md", "utf8");
  const pins = (JSON.parse(readFileSync("kb/sources.json", "utf8")) as { itu_repo_commit?: string }[]).flatMap((s) => (s.itu_repo_commit ? [s.itu_repo_commit] : []));
  assert.ok(n.includes("MIT License") && n.includes("Permission is hereby granted"));
  assert.ok(pins.length >= 3 && new Set(pins).size === 1 && n.includes(pins[0]));
});

test("C5-2: every file the README maps to a Y.3172 node exists, and P is the policy engine", async () => {
  const { existsSync, readFileSync } = await import("node:fs");
  const md = readFileSync("README.md", "utf8");
  const sec = md.slice(md.indexOf("## Architecture, in ITU-T Y.3172 terms"), md.indexOf("## Run it"));
  assert.ok(sec.includes("| **P (policy)** |") && sec.includes("`src/lib/un/policy.ts`"));
  assert.ok(!/policer/i.test(sec.replace("not a \"policer\"", "")));
  const paths = [...sec.matchAll(/`((?:src|data|kb)\/[^`\s,]+?)`/g)].map((m) => m[1]).filter((p) => !p.includes("{"));
  assert.ok(paths.length >= 10);
  for (const p of paths) assert.ok(existsSync(p), `${p} does not exist`);
  for (const n of ["SRC", "C (collector)", "PP", "M (model)", "D (distributor)", "SINK", "MLFO", "ML sandbox", "ML intent"]) assert.ok(sec.includes(`| ${n}`), n);
});

test("13.5: the video script fixes the two overstated captions, labels the deadline as assumed and does not promise unbuilt screens", async () => {
  const { readFileSync } = await import("node:fs");
  const md = readFileSync("docs/video-v3-voiceover.md", "utf8");
  const script = md.slice(md.indexOf("## Script"));
  assert.ok(!/policer/i.test(script));
  assert.ok(script.includes("policy node") && /assumed/.test(script) && !/30 April 2028/.test(script));
  assert.ok(md.includes("Sign / Withhold") && md.includes("Do not show yet"));
  assert.ok(/Sijil is simulated/.test(script));
  // the timeline is contiguous and about four minutes
  const t = [...script.matchAll(/\| (\d):(\d\d)–(\d):(\d\d) \|/g)].map((m) => [+m[1] * 60 + +m[2], +m[3] * 60 + +m[4]]);
  assert.ok(t.length >= 8);
  for (let i = 1; i < t.length; i++) assert.equal(t[i][0], t[i - 1][1]);
  assert.ok(t[t.length - 1][1] >= 230 && t[t.length - 1][1] <= 270);
});

test("C1-5: chunk metadata matches kb/sources.json; ITU files have file-level pinned URLs and dates; the DESC landing page is replaced by the ISR", async () => {
  const { readFileSync } = await import("node:fs");
  const src = JSON.parse(readFileSync("kb/sources.json", "utf8")) as Record<string, unknown>[];
  const chunks = JSON.parse(readFileSync("kb/chunks.json", "utf8")) as Record<string, unknown>[];
  const by = new Map(src.map((s) => [s.id as string, s]));
  for (const c of chunks) for (const k of ["title", "url", "issuer", "jurisdiction", "instrument_type", "binding", "date"]) assert.deepEqual(c[k], by.get(c.source_id as string)![k], `${c.chunk_id}.${k}`);
  for (const s of src.filter((x) => x.local)) {
    assert.ok((s.url as string).includes(`/blob/${s.itu_repo_commit}/`) && decodeURIComponent(s.url as string).endsWith(s.local as string), s.id as string);
    assert.ok(s.date, `${s.id} has no date`);
  }
  assert.ok(!by.has("desc-regulations") && !by.has("desc-isr-3-1")); // landing page and full text are gone
  assert.equal(by.get("desc-isr-excerpts")!.binding, true); // the ISR is binding on Dubai government entities; only excerpts are held
});

test("C1-4: the KB cleaner strips skip links and cookie prompts, keeps policy text, and drops near-duplicate chunks", async () => {
  const { spawnSync } = await import("node:child_process");
  const run = (code: string) => spawnSync("python", ["-c", code], { encoding: "utf8", cwd: "kb" });
  const r = run(`
import sys; sys.path.insert(0, '.')
from clean import strip_boilerplate, drop_near_duplicates
t = strip_boilerplate("Title Skip to main content We use cookies to improve your visit. Agents must keep a human in the loop. Follow us on Twitter and LinkedIn All rights reserved.")
print(t)
a = {"text": "Agents must be overseen by a competent person who can override every decision before it reaches a citizen."}
b = {"text": "Agents must be overseen by a competent person who can override every decision before it reaches a citizen!"}
c = {"text": "Hosting must use certified infrastructure in approved regions with logging of every request."}
print(len(drop_near_duplicates([a, b, c])))
`);
  assert.equal(r.status, 0, r.stderr);
  const [cleaned, kept] = r.stdout.trim().split(/\r?\n/);
  assert.match(cleaned, /Agents must keep a human in the loop\./);
  assert.ok(!/skip to|cookies|follow us|all rights/i.test(cleaned));
  assert.equal(kept, "2");
});

test("13.4: the handover names functions and files that exist", async () => {
  const { existsSync, readFileSync } = await import("node:fs");
  const md = readFileSync("docs/DB_HANDOVER.md", "utf8");
  const sig = readFileSync("src/lib/un/signature.ts", "utf8");
  const guard = readFileSync("src/lib/un/guard.ts", "utf8");
  const store = readFileSync("src/lib/un/store.ts", "utf8");
  for (const f of ["signRun", "signedVerdict", "signatureOf"]) assert.ok(md.includes(f) && sig.includes(`export function ${f}`) || sig.includes(`export const ${f}`), f);
  assert.ok(md.includes("verdictPatch") && guard.includes("export function verdictPatch"));
  assert.ok(md.includes("loadHitlConfig") && store.includes("export async function loadHitlConfig"));
  for (const p of ["supabase/un-federal-t1.sql", "supabase/seed-entities.sql"]) assert.ok(md.includes(p) && existsSync(p), p);
});

test("C5-1 / C2-3: the report docx quotes the Y.3172 P node and describes the redesigned S2", async () => {
  const { execFileSync } = await import("node:child_process");
  const xml = execFileSync("python", ["-c", "import zipfile,sys;sys.stdout.buffer.write(zipfile.ZipFile('docs/report/prism-technical-report.docx').read('word/document.xml'))"], { encoding: "utf8" });
  assert.ok(xml.includes("enables the application of policies to the output of the model node"));
  assert.ok(xml.includes("GO_SUPERVISED, ASSISTANT_ONLY, NO_GO, NO_GO, ASSISTANT_ONLY, GO_SUPERVISED"));
  assert.ok(xml.includes("fee_accuracy") && xml.includes("22 sources (331 chunks) pinned"));
});

test("13.1: the UN SQL lives in supabase/un-federal-t1.sql and the verdict trigger lets a verdict be cleared to null", async () => {
  const { existsSync, readFileSync } = await import("node:fs");
  assert.ok(existsSync("supabase/un-federal-t1.sql") && !existsSync("supabase/migrations"));
  const sql = readFileSync("supabase/un-federal-t1.sql", "utf8");
  assert.match(sql, /new\.verdict is distinct from old\.verdict and new\.verdict is not null/);
  for (const t of ["un_guard_verdict", "un_trace_records", "un_entities"]) assert.ok(sql.includes(t), t);
  const handover = readFileSync("docs/DB_HANDOVER.md", "utf8");
  assert.ok(handover.includes("signRun(sc: Scenario") && handover.includes("loadHitlConfig(orgId: string)"));
});

test("C3-2 / C3-3: the report's gap table covers the six ITU categories and every chunk id it cites exists", async () => {
  const { execFileSync } = await import("node:child_process");
  const { readFileSync } = await import("node:fs");
  const xml = execFileSync("python", ["-c", "import zipfile,re,sys;x=zipfile.ZipFile('docs/report/prism-technical-report.docx').read('word/document.xml').decode('utf8');sys.stdout.buffer.write(re.sub(r'<[^>]+>','',x).encode('utf8'))"], { encoding: "utf8" });
  for (const c of ["Responsibilities:", "Standards:", "Technology:", "Legislative:", "Coordination:", "Conflicting objectives:"]) assert.ok(xml.includes(c), c);
  assert.ok(!xml.includes("Not verified here"));
  const ids = new Set((JSON.parse(readFileSync("kb/chunks.json", "utf8")) as { chunk_id: string }[]).map((c) => c.chunk_id));
  const cited = [...xml.matchAll(/\(((?:[a-z0-9-]+#\d+(?:, #\d+)*)(?:; [a-z0-9-]+#\d+)*)\)/g)].flatMap((m) => m[1].split(/;\s*/));
  assert.ok(cited.length >= 14);
  for (const group of cited) {
    const [first, ...rest] = group.split(/,\s*/);
    const src = first.split("#")[0];
    for (const id of [first, ...rest.map((r) => `${src}${r}`)]) assert.ok(ids.has(id), `cited chunk ${id} does not exist`);
  }
  // the hand-typed table must not drift from kb/gaps.json: every gap id and every chunk it lists appears in the report
  const resolved = new Set(cited.flatMap((group) => { const [first, ...rest] = group.split(/,\s*/); const src = first.split("#")[0]; return [first, ...rest.map((r) => `${src}${r}`)]; }));
  const gj = JSON.parse(readFileSync("kb/gaps.json", "utf8"));
  const gaps = (Array.isArray(gj) ? gj : gj.gaps) as { id: string; national: { chunk_id: string }[]; global: { chunk_ids: string[] }[] }[];
  for (const g of gaps) {
    assert.ok(new RegExp(`\\b${g.id}\\b`).test(xml), `${g.id} missing from the report`);
    for (const id of [...g.national.map((n) => n.chunk_id), ...g.global.flatMap((x) => x.chunk_ids)]) assert.ok(resolved.has(id), `${g.id}: ${id} is in kb/gaps.json but not in the report`);
  }
});

test("C5-1 / section 8: the shipped report PDF is the export of the final docx: 5 pages at most, no author, current claims", async (t) => {
  const { spawnSync } = await import("node:child_process");
  const { existsSync } = await import("node:fs");
  const py = existsSync(".venv/Scripts/python.exe") ? ".venv/Scripts/python.exe" : "python";
  const r = spawnSync(py, ["-c", "import fitz,sys,re;d=fitz.open('docs/report/prism-technical-report.pdf');t=' '.join(p.get_text() for p in d);sys.stdout.buffer.write((str(len(d))+'|'+d.metadata.get('author','')+'|'+' '.join(t.split())).encode('utf8'))"], { encoding: "utf8" });
  if (r.status !== 0 && /ModuleNotFoundError/.test(r.stderr)) return t.skip("PyMuPDF (the kb venv) is not installed here");
  assert.equal(r.status, 0, r.stderr);
  const parts = r.stdout.split("|");
  const text = parts.slice(2).join("|");
  assert.ok(Number(parts[0]) <= 5, `${parts[0]} pages`);
  assert.equal(parts[1], "");
  assert.ok(text.includes("HTML cleaning is ours") && text.includes("enables the application of policies") && text.includes("recall@5"));
  assert.ok(!/reused unmodified|policer|Not verified here/.test(text));
});

test("I-6: the two restricted sources are held as short excerpts only; the notice records the decision and the full text is gone", async () => {
  const { existsSync, readFileSync } = await import("node:fs");
  const src = JSON.parse(readFileSync("kb/sources.json", "utf8")) as { id: string; excerpts?: { text: string; where: string }[]; file?: string; local?: string; url: string }[];
  const chunks = JSON.parse(readFileSync("kb/chunks.json", "utf8")) as { chunk_id: string; source_id: string; text: string }[];
  const ex = src.filter((s) => s.excerpts);
  assert.deepEqual(ex.map((s) => s.id).sort(), ["desc-isr-excerpts", "dff-agentic-accelerator", "dff-ai-sandbox", "dubai-ai-ethics-2019", "dubai-ai-matrix-excerpts", "dubai-ai-matrix-launch", "sg-agentic-summary", "uae-ai-charter", "uae-ai-strategy-2031", "uae-cabinet-2026-05-18", "uae-cabinet-agentic-50", "uae-cyber-ai-policy", "uae-data-protection-laws", "un-global-dialogue"]);
  for (const s of ex) {
    assert.ok(s.url.startsWith("https://") && !s.file && !s.local, s.id);
    for (const e of s.excerpts!) assert.ok(e.text.split(/\s+/).length <= 40 && e.where, `${s.id}: ${e.text}`);
    assert.equal(chunks.filter((c) => c.source_id === s.id).length, s.excerpts!.length); // one chunk per excerpt, nothing else
  }
  // the full texts, the PDFs and their ids are gone
  for (const p of ["kb/docs/uae-cabinet-agentic-50.txt", "kb/docs/dubai-ai-matrix-launch.txt", "kb/docs/sg-agentic-summary.txt", "kb/docs/desc-isr-3-1.txt", "kb/docs/dubai-ai-matrix-framework.txt", "kb/docs/desc-isr-3.1.pdf", "kb/local"]) assert.ok(!existsSync(p), p);
  assert.ok(!chunks.some((c) => c.source_id === "desc-isr-3-1" || c.source_id === "dubai-ai-matrix-framework"));
  const n = readFileSync("THIRD_PARTY_NOTICES.md", "utf8");
  const section = n.slice(n.indexOf("## RESOLVED"), n.indexOf("## ITU AI Readiness reference repository"));
  for (const s of ["resolved by removal", "desc-isr-excerpts", "dubai-ai-matrix-excerpts", "15 words", "squashed", "Decision log", "8 Nov 2026"]) assert.ok(section.includes(s), s);
  assert.ok(!n.includes("UNRESOLVED") && !n.includes("OPEN ITEM"));
  const gi = readFileSync(".gitignore", "utf8");
  assert.ok(gi.includes("kb/docs/desc-isr-3.1.pdf") && gi.includes("kb/local/"));
  assert.ok(!readFileSync("docs/DB_HANDOVER.md", "utf8").includes("OPEN ITEM"));
});
