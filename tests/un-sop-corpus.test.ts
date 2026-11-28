import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { friendlySkillReason, profileProblems, skillProblem } from "../src/lib/un/sop/profile-health.ts";
import { liveChunks } from "../src/lib/un/sop-kb-live.ts";
import { assessSop } from "../src/lib/un/sop-assess.ts";
import { customSopFromText } from "../src/lib/un/sop/custom.ts";
import { loadBaseline } from "../src/lib/un/sop/data.ts";
import { mergeJointProfiles } from "../src/lib/un/sop/profiles.ts";

// A SAFETY NET FOR SOPs NOBODY HAS WRITTEN YET. The profiles of an SOP are derived from its text in one place and their skills are built from its passages in another. For some shape of SOP
// the two can disagree (a task shared by two roles was the first). So every SOP we have is run through both, and every job profile the engine would OFFER must be one a skill can be built
// for. A new SOP in data/sops or data/sop that breaks this fails here, in the build, instead of in front of a person who ticks the box. (data/sop is not committed on every checkout:
// the SOPs that are there are all checked, the others are simply not there.)

const FILES = ["data/sops", "data/sop"].flatMap((dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".md")).map((f) => `${dir}/${f}`) : []));
const baseline = loadBaseline();

const profilesOf = (text: string) => {
  const made = customSopFromText({ title: undefined, text, entity: "Test entity", baseline, takenIds: [], idBase: "corpus" });
  if (!made.ok) return null;
  return { made, chunks: liveChunks({ sopId: made.sop_id, title: made.title, version: 1, body: made.body, useCaseExt: "UC", entity: "Test entity" }) };
};

test("there are SOPs to check", () => assert.ok(FILES.length >= 2, `found ${FILES.length}`));

test("no SOP we have can be attached as it is with a job profile that no skill can be built for: intake sends it to structuring first", () => {
  let checked = 0; let sentToStructuring = 0; let skipped = 0;
  const leaks: string[] = [];
  for (const f of FILES) {
    const text = readFileSync(f, "utf8");
    const r = profilesOf(text);
    if (!r) { skipped++; continue; } // not in a layout the engine reads at all: intake refuses it, there are no profiles to offer
    // the list a use case works with is the stored list read through the repair
    const problems = profileProblems(r.made.sop_id, mergeJointProfiles(r.made.profiles), r.chunks);
    checked += r.made.profiles.length;
    if (!Object.keys(problems).length) continue;
    const a = assessSop({ title: undefined, text, entity: "Test entity", baseline });
    if (a.needsStructuring) sentToStructuring++;
    else leaks.push(`${f}: ${Object.entries(problems).map(([n, why]) => `${n} (${why.slice(0, 60)}…)`).join("; ")}`);
  }
  assert.ok(checked > 0, "no profile was checked");
  assert.deepEqual(leaks, [], `an SOP would be attached as it is although a job profile it offers cannot have a skill:\n  ${leaks.join("\n  ")}\n(${checked} profiles checked, ${sentToStructuring} SOPs sent to structuring, ${skipped} not in a layout the engine reads)`);
});

test("every job profile of an SOP that intake attaches as it is gets a skill, and the shipped reference SOPs are among them", () => {
  const strict = FILES.filter((f) => f.startsWith("data/sops/"));
  assert.ok(strict.length >= 2, "the committed reference SOPs are checked");
  for (const f of strict) {
    const r = profilesOf(readFileSync(f, "utf8"));
    if (!r) continue;
    assert.deepEqual(profileProblems(r.made.sop_id, mergeJointProfiles(r.made.profiles), r.chunks), {}, f);
  }
});

// ---- the words, and the shape that started it --------------------------------------------------------------------------------

const UC02 = existsSync("data/sops/uc02-trade-licence-renewal-sop.md") ? readFileSync("data/sops/uc02-trade-licence-renewal-sop.md", "utf8") : "";

test("the reason a profile cannot have a skill is in words for whoever wrote the SOP, not the builder's own message", () => {
  assert.match(friendlySkillReason('no job profile named "X and Y" in custom-s-1', "X and Y"), /The SOP has no section that describes the role "X and Y"/);
  assert.match(friendlySkillReason('no job profile named "X and Y" in custom-s-1', "X and Y"), /a task shared by two roles belongs to both of them/);
  assert.match(friendlySkillReason('job profile "Z" has no tasks in custom-s-1', "Z"), /No task of the SOP is assigned to "Z"/);
  assert.equal(friendlySkillReason("something else in custom-abc", "Z"), "something else", "anything else is passed on, without the internal id");
});

test("a task two roles share gets a skill for each of them, and the engine offers no profile named after both", () => {
  assert.ok(UC02.length > 0, "data/sops/uc02-trade-licence-renewal-sop.md is part of the repository");
  const roles = [...UC02.matchAll(/^- \*\*Job profile:\*\*\s*([^.\n]+)/gm)].map((m) => m[1].trim());
  const names = [...new Set(roles)];
  assert.ok(names.length >= 2, "the reference SOP has at least two roles");
  const [a, b] = names;
  // hand the first task of role A to both A and B, the way another SOP writes a shared task
  const shared = UC02.replace(new RegExp(`(- \\*\\*Job profile:\\*\\*\\s*)${a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.`), `$1${a} and ${b}.`);
  assert.notEqual(shared, UC02, "the fixture changed a task's owner");
  const r = profilesOf(shared)!;
  assert.ok(r, "the changed SOP is still read");
  const offered = mergeJointProfiles(r.made.profiles);
  assert.equal(offered.some((p) => p.name === `${a} and ${b}`), false, "no third profile named after both");
  assert.deepEqual(profileProblems(r.made.sop_id, offered, r.chunks), {}, "every profile that is offered builds a skill");
  assert.equal(skillProblem(r.made.sop_id, a, r.chunks), null);
  assert.equal(skillProblem(r.made.sop_id, b, r.chunks), null);
  const taskIdsOf = (name: string) => offered.find((p) => p.name === name)!.tasks.map((t) => t.id);
  const sharedId = taskIdsOf(a).find((id) => taskIdsOf(b).includes(id));
  assert.ok(sharedId, "the shared task is in both profiles");
});

test("a name the skill builder cannot match is reported, not offered silently: the check catches shapes nobody has met", () => {
  const r = profilesOf(UC02)!;
  assert.ok(r);
  const ghost = { name: "A Role The SOP Never Mentions", tasks: [{ id: "T99", title: "x", flags: { client_facing: false, affects_rights: false, irreversible: false } }], flags: { client_facing: false, affects_rights: false, irreversible: false } };
  const problems = profileProblems(r.made.sop_id, [...r.made.profiles, ghost], r.chunks);
  assert.deepEqual(Object.keys(problems), ["A Role The SOP Never Mentions"]);
  assert.match(problems["A Role The SOP Never Mentions"], /no section that describes the role/);
});

test("the SOP page shows why a profile cannot be ticked, the tick route and the engine say it in the same words, and intake uses the same check", () => {
  const read = (f: string) => readFileSync(f, "utf8");
  assert.match(read("src/app/admin/federal/use-cases/[id]/sop/page.tsx"), /profileProblems\(sopId, profiles \?\? \[\], chunksOfVersion\(attachedDoc, uc\)\)/);
  assert.match(read("src/app/admin/federal/use-cases/[id]/sop/page.tsx"), /blocked=\{cannotHaveSkill\[r\.name\]\}/);
  assert.match(read("src/app/admin/federal/use-cases/[id]/sop/ProfileControls.tsx"), /disabled=\{!canEdit \|\| busy \|\| \(!!blocked && !checked\)\}/);
  assert.match(read("src/lib/un/skill-engine.ts"), /friendlySkillReason\(sk\.reason, profile\)/);
  assert.match(read("src/lib/un/sop-assess.ts"), /skillProblem\(made\.sop_id, p\.name, chunks\)/);
});
