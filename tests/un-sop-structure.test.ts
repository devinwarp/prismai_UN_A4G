import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { checkToolCall, checkToolRequests, compileSkill, defaultManifest, isStructuredSop, manifestOfSkill, validateManifest } from "../src/lib/un/skill-compile.ts";
import { chunkSop, skillFromChunks } from "../src/lib/un/sop-kb.ts";
import { canApprove, checkStructured, NOT_STATED, parseStructured, renderCanonical, replayStructure, statementsOf, tidy, type StructEntry, type StructuredSop } from "../src/lib/un/sop-structure.ts";
import { assessSop } from "../src/lib/un/sop-assess.ts";
import { deriveFrom } from "../src/lib/un/sop/versions.ts";
import { loadBaseline } from "../src/lib/un/sop/data.ts";

const SOURCE = `Hiring procedure

When a manager asks for a new hire, the coordinator checks the position number and the budget approval. The coordinator then publishes the advertisement for 14 days.
The screener checks each application against the minimum requirements and marks it meets, does not meet or query. The screener never rejects an application.
Only the panel chair approves the shortlist. If a document looks altered, the screener sends it to Compliance straight away.`;

const reply = {
  title: "Hiring procedure", owner: "Director of Talent", review_cadence: "Every 12 months", purpose: "Fill approved vacancies fairly.", scope: "Approved vacancies.",
  roles: [
    { name: "Coordinator", purpose: "Run the vacancy", works_with: ["Screener"], may: ["publish an approved advertisement"], may_not: ["shortlist"], human_only: [], skills: "" },
    { name: "Screener", purpose: "Check applications", works_with: ["Panel chair"], may: ["mark an application meets, does not meet or query"], may_not: ["reject an application"], human_only: ["Only the panel chair approves the shortlist"], skills: "" },
  ],
  tasks: [
    { id: "x", title: "Open the vacancy", role: "coordinator", accountable: "Director of Talent", consulted: ["Hiring manager"], informed: [], starts_when: "a manager asks for a new hire", inputs: "position number, budget approval", steps: ["check the position number and the budget approval", "publish the advertisement for 14 days"], output: "a published advertisement", problems: "", quote: "the coordinator checks the position number and the budget approval" },
    { id: "y", title: "Check applications", role: "Screener", accountable: "Panel chair", consulted: [], informed: [], starts_when: "", inputs: "", steps: ["check each application against the minimum requirements", "mark it meets, does not meet or query"], systems: [], output: "a status per application", problems: "a document that looks altered goes to Compliance", quote: "The screener checks each application against the minimum requirements" },
  ],
  controls: ["Only the panel chair approves the shortlist"],
  exceptions: [{ scenario: "A document looks altered", handled_by: "Screener", escalate_to: "Compliance", what_to_do: "send it to Compliance straight away" }],
  metrics: [], systems: ["recruitment system"],
};
const parse = (r: unknown) => { const p = parseStructured(r); assert.ok(p.ok); return tidy(p.model); };

test("a model's answer is read leniently, ids are renumbered and roles matched without case", () => {
  const m = parse(reply);
  assert.deepEqual(m.tasks.map((t) => t.id), ["T01", "T02"]);
  assert.equal(m.tasks[0].role, "Coordinator");
  assert.equal(m.tasks[1].starts_when, NOT_STATED);
  assert.equal(parseStructured("not json").ok, false);
  assert.equal(parseStructured({ roles: [] }).ok, false);
});

test("checks: a clean draft can be approved, gaps are listed, nothing is invented", () => {
  const c = checkStructured(parse(reply), SOURCE);
  assert.ok(canApprove(c), JSON.stringify(c.errors));
  assert.equal(c.warnings.some((w) => w.code === "quote_not_found"), false);
  assert.ok(c.gaps.some((g) => /T02 · starts when/.test(g.where)));
  assert.deepEqual(c.new_figures, []);
});

test("checks: unknown role, invented quote, invented figure and dropped statements are caught", () => {
  const bad = parse({ ...reply, tasks: [{ ...reply.tasks[0], role: "Recruiter", quote: "the coordinator signs every contract", steps: ["wait 30 days", "publish"] }, reply.tasks[1]] });
  const c = checkStructured(bad, SOURCE);
  assert.ok(!canApprove(c));
  assert.ok(c.errors.some((e) => e.code === "task_role"));
  assert.ok(c.warnings.some((w) => w.code === "quote_not_found"));
  assert.ok(c.new_figures.includes("30"));
  const dropped = parse({ ...reply, tasks: [reply.tasks[0]] });
  assert.ok(checkStructured(dropped, SOURCE).coverage.uncovered.some((s) => /screener checks each application/i.test(s)));
  assert.ok(statementsOf(SOURCE).length >= 4);
});

test("the approved structure becomes ordinary Prism Markdown: profiles are derived and a compiled skill is built for each", () => {
  const m = parse(reply);
  const md = renderCanonical(m, { sopId: "custom-uc-hiring", useCase: "UC99", version: "1" }, defaultManifest());
  const d = deriveFrom(md, { sopId: "custom-uc-hiring", title: "Hiring procedure", entity: "Test entity", baseline: loadBaseline() });
  assert.deepEqual(d.profiles.map((p) => p.name).sort(), ["Coordinator", "Screener"]);
  const chunks = chunkSop(md, { sopId: "custom-uc-hiring", version: "1", useCaseId: "UC99", entity: "Test entity", jurisdiction: "Test entity", sourcePath: "sop://x/v1" });
  assert.ok(isStructuredSop(chunks));
  for (const p of d.profiles) {
    const skill = skillFromChunks("custom-uc-hiring", p.name, chunks);
    assert.match(skill.markdown, /compiled: true/);
    for (const part of ["## Who you are", "## What you may do", "## What you may not do", "## Output contract", "## Tools you may use (allow-list)", "## Controls that apply", "## Escalation"]) assert.ok(skill.markdown.includes(part), part);
    assert.deepEqual(manifestOfSkill(skill.markdown)?.tools.map((t) => t.name), ["search_sop", "request_outside_information", "finish"]);
  }
  const screener = skillFromChunks("custom-uc-hiring", "Screener", chunks).markdown;
  assert.match(screener, /reject an application/);
  assert.match(screener, /Only the panel chair approves the shortlist/);
  // the same chunks give the same skill, byte for byte
  assert.equal(skillFromChunks("custom-uc-hiring", "Screener", chunks).markdown, screener);
});

test("responsibility is authority: a role with no explicit authority still gets a skill limited to its tasks, and a gap is reported", () => {
  const m = parse({ ...reply, roles: [{ ...reply.roles[0], may: [], may_not: [] }, reply.roles[1]] });
  const md = renderCanonical(m, { sopId: "custom-uc-x", useCase: "UC99", version: "1" }, defaultManifest());
  const chunks = chunkSop(md, { sopId: "custom-uc-x", version: "1", useCaseId: "UC99", entity: "E", jurisdiction: "E", sourcePath: "sop://x/v1" });
  const skill = compileSkill("custom-uc-x", "Coordinator", chunks);
  assert.ok(skill.report.ok);
  assert.ok(skill.report.gaps.some((g) => /no explicit authority/.test(g)));
  assert.match(skill.markdown, /Carry out the tasks you are responsible for \(T01\)/);
  assert.match(skill.markdown, /Anything outside the tasks you are responsible for/);
});

test("the systems a task uses become tools the role needs, listed but not callable until an integration is registered", () => {
  const m = parse({ ...reply, tasks: [{ ...reply.tasks[0], systems: ["recruitment system"] }, reply.tasks[1]] });
  const md = renderCanonical(m, { sopId: "custom-uc-y", useCase: "UC99", version: "1" }, defaultManifest());
  const chunks = chunkSop(md, { sopId: "custom-uc-y", version: "1", useCaseId: "UC99", entity: "E", jurisdiction: "E", sourcePath: "sop://x/v1" });
  const coordinator = compileSkill("custom-uc-y", "Coordinator", chunks);
  assert.deepEqual(coordinator.report.needs_integration, ["recruitment system (T01)"]);
  const tool = coordinator.manifest.tools.find((t) => t.name === "use_recruitment_system");
  assert.ok(tool && tool.callable === false && tool.permission === "write" && tool.release === "person");
  assert.match(coordinator.markdown, /not yet: no integration is registered/);
  assert.match(coordinator.markdown, /set `needs_human` to true, and a person makes it/);
  // the screener's tasks name no system, so it needs none
  assert.deepEqual(compileSkill("custom-uc-y", "Screener", chunks).report.needs_integration, []);
  const call = checkToolCall(coordinator.manifest, { tool: "use_recruitment_system" });
  assert.equal(call.ok, false);
  assert.equal(call.ok ? "" : call.code, "not_available");
  assert.deepEqual(manifestOfSkill(coordinator.markdown)?.tools.find((t) => t.name === "use_recruitment_system")?.callable, false);
});

test("an SOP that was not structured keeps its existing skill, unchanged", () => {
  const md = readFileSync("data/sops/uc02-trade-licence-renewal-sop.md", "utf8");
  const chunks = chunkSop(md, { sopId: "SOP-LIC-014", version: "2.3", useCaseId: "UC02", entity: "E", sourcePath: "x" });
  assert.equal(isStructuredSop(chunks), false);
  const skill = skillFromChunks("SOP-LIC-014", "Document Verification Analyst", chunks);
  assert.ok(!skill.markdown.includes("compiled: true"));
  assert.match(skill.markdown, /## Before you act/);
});

test("the tool allow-list: a listed tool passes, anything else is denied and named", () => {
  const manifest = defaultManifest();
  assert.equal(checkToolCall(manifest, { tool: "search_sop" }).ok, true);
  const no = checkToolCall(manifest, { tool: "send_email" });
  assert.equal(no.ok, false);
  assert.match(no.ok ? "" : no.reason, /send_email.*allow-list/);
  assert.equal(checkToolCall(manifest, {}).ok, false);
  assert.deepEqual(checkToolRequests(manifest, { tool_requests: [{ tool: "search_sop" }, { tool: "post_to_hr_system" }] }), { requested: 2, denied: [{ tool: "post_to_hr_system", reason: checkToolCall(manifest, "post_to_hr_system").ok ? "" : (checkToolCall(manifest, "post_to_hr_system") as { reason: string }).reason }] });
  assert.deepEqual(checkToolRequests(manifest, { answer: "x" }), { requested: 0, denied: [] });
  assert.deepEqual(validateManifest(manifest), []);
  assert.ok(validateManifest({ version: 1, tools: [...manifest.tools, { name: "release_offer", purpose: "", input: "", output: "", permission: "send", release: "none", justified_by: "T12" }] }).some((x) => /person does not release/.test(x)));
});

test("the log: a draft is pending until it is approved or withdrawn", () => {
  const m = parse(reply);
  const checks = checkStructured(m, SOURCE);
  const e = (seq: number, kind: StructEntry["kind"], payload: unknown): StructEntry => ({ seq, at: `2026-11-27T10:0${seq}:00Z`, actor: "agent:structuring", kind, payload } as StructEntry);
  const drafted = e(1, "drafted", { source: SOURCE, title: "Hiring", model: m, checks, llm: "m", attempt: 1 });
  assert.equal(replayStructure([drafted]).pending?.title, "Hiring");
  const edited: StructuredSop = { ...m, purpose: "Edited." };
  assert.equal(replayStructure([drafted, e(2, "edited", { model: edited, checks })]).pending?.model.purpose, "Edited.");
  const approved = replayStructure([drafted, e(2, "approved", { model: m, source_sha256: "a", canonical_sha256: "b", sop_id: "s", version: 2, review: null })]);
  assert.equal(approved.pending, null);
  assert.equal(approved.approved?.version, 2);
  assert.equal(replayStructure([drafted, e(2, "withdrawn", { reason: "x" })]).pending, null);
});

test("intake analysis: an SOP in the Prism layout is attached as it is, a loose one needs structuring, and a structured one is fine", () => {
  const baseline = loadBaseline();
  const strict = assessSop({ title: "Trade licence renewal", text: readFileSync("data/sops/uc02-trade-licence-renewal-sop.md", "utf8"), entity: "E", baseline });
  assert.equal(strict.needsStructuring, false, strict.reasons.join(" | "));
  assert.ok(strict.profiles >= 4 && strict.skills === strict.profiles);
  const loose = assessSop({ title: "Leave", text: SOURCE, entity: "E", baseline });
  assert.equal(loose.needsStructuring, true);
  assert.ok(loose.reasons.length > 0);
  const none = assessSop({ title: "Misc", text: "Our recruiter talent partner and hiring lead handle hiring together every week.", entity: "E", baseline });
  assert.equal(none.needsStructuring, true);
  assert.equal(none.profiles, 0);
  const md = renderCanonical(parse(reply), { sopId: "custom-uc-hiring", useCase: "UC99", version: "1" }, defaultManifest());
  const done = assessSop({ title: "Hiring procedure", text: md, entity: "E", baseline });
  assert.equal(done.needsStructuring, false, done.reasons.join(" | "));
});
