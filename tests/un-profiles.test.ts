import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { offlineClient } from "../src/lib/supabase/offline.ts";
import { checkSopKb, writeSkill } from "../src/lib/un/skill-extract.ts";
import { RULESETS, SG_IMDA, UAE_FEDERAL } from "../src/lib/un/rulesets.ts";
import { profilesOf } from "../src/lib/un/sop/data.ts";
import { deriveProfiles } from "../src/lib/un/sop/profiles.ts";
import { legacyLicenceRenewal } from "./helpers-sop-fixture.ts";
import { assessProfiles, mostRestrictive, type JobProfile } from "../src/lib/un/sop/profiles.ts";

const SOP = "data/sops/uc02-trade-licence-renewal-sop.md";
const lic = profilesOf("SOP-LIC-014")!;

/** The Annex of SOP-LIC-014 is the answer key: flags per task, by profile. Used here only, never by the analyzer. */
function answerKey(): JobProfile[] {
  const annex = readFileSync(SOP, "utf8").split("## Annex A")[1];
  const by = new Map<string, JobProfile>();
  for (const m of annex.matchAll(/^\| (T\d{2}) \| ([^|]+) \| [^|]+ \| (yes|no) \| (yes|no) \| (yes|no) \|/gm)) {
    const name = lic.find((p) => p.name.endsWith(m[2].trim().replace("Verification Analyst", "Document Verification Analyst")))!.name;
    const t = { id: m[1], title: m[1], flags: { client_facing: m[3] === "yes", affects_rights: m[4] === "yes", irreversible: m[5] === "yes" } };
    const p = by.get(name) ?? { name, tasks: [], flags: { client_facing: false, affects_rights: false, irreversible: false } };
    p.tasks.push(t);
    for (const f of ["client_facing", "affects_rights", "irreversible"] as const) p.flags[f] ||= t.flags[f];
    by.set(name, p);
  }
  return lic.map((p) => by.get(p.name)!);
}

test("SOP-LIC-014 gives the four job profiles with 4, 7, 3 and 6 tasks, and the analyzer never reads the Annex", () => {
  assert.deepEqual(lic.map((p) => [p.name, p.tasks.length]), [
    ["Licensing Front-Desk Officer", 4], ["Document Verification Analyst", 7], ["Fee and Payment Officer", 3], ["Licensing Supervisor", 6],
  ]);
  assert.deepEqual(lic[0].tasks.map((t) => t.id), ["T01", "T02", "T03", "T19"]);
});

test("SOP-LIC-014 flags match the answer key task by task: limits on authority ('may not waive or refund', 'does not approve or reject') and lookups of fines/holds are not rights-affecting; 'cannot be withdrawn' (T17) is irreversible", () => {
  const key = answerKey();
  lic.forEach((p, i) => {
    assert.deepEqual(p.flags, key[i].flags, p.name);
    // task level: the answer key also marks T17 "issue the licence" rights-affecting; no cue for that is added (it would flip the older licence-renewal fixture), the profile flag is unaffected
    p.tasks.forEach((t, j) => assert.deepEqual({ ...t.flags, affects_rights: t.flags.affects_rights || t.id === "T17" }, { ...key[i].tasks[j].flags }, `${p.name} ${t.id}`));
  });
  // the roll-up consequence: Analyst and Fee profiles are not rights-affecting, the Supervisor is rights-affecting AND irreversible
  assert.deepEqual(lic.map((p) => p.flags.affects_rights), [false, false, false, true]);
  assert.deepEqual(lic.map((p) => p.flags.irreversible), [false, false, false, true]);
});

test("worked example, UAE rule set, answer-key flags: gates, rules and the four evidence cases per profile", () => {
  const key = answerKey();
  assert.deepEqual(key.map((p) => Object.entries(p.flags).filter(([, v]) => v).map(([k]) => k)), [
    ["client_facing"], ["client_facing"], ["client_facing"], ["client_facing", "affects_rights", "irreversible"],
  ]);
  const a = assessProfiles(key, new Set(["Document Verification Analyst", "Fee and Payment Officer"]), UAE_FEDERAL, "Marsa Public Services Authority");
  assert.deepEqual(a.rows.map((r) => [r.tasks, r.gates, r.hitl, r.automate]), [[4, 5, 1, false], [7, 5, 1, true], [3, 5, 1, true], [6, 5, 3, false]]);
  for (const r of a.rows) assert.deepEqual(r.verdicts, { all_pass: "GO_SUPERVISED", one_fix: "ASSISTANT_ONLY", hosting_fails: "NO_GO", no_evidence: "ESCALATE" }, r.name);
  assert.deepEqual(a.rollup, { all_pass: "GO_SUPERVISED", one_fix: "ASSISTANT_ONLY", hosting_fails: "NO_GO", no_evidence: "ESCALATE" });
});

test("if a profile is not client-facing only three gates apply and GO_AUTONOMOUS is reachable", () => {
  const quiet: JobProfile = { name: "Back office", tasks: [{ id: "T1", title: "t", flags: { client_facing: false, affects_rights: false, irreversible: false } }], flags: { client_facing: false, affects_rights: false, irreversible: false } };
  const r = assessProfiles([quiet], new Set(["Back office"]), UAE_FEDERAL, "E").rows[0];
  assert.equal(r.gates, 3);
  assert.equal(r.verdicts.all_pass, "GO_AUTONOMOUS");
});

test("roll-up is the most restrictive verdict over ticked profiles only; none ticked means no roll-up", () => {
  assert.equal(mostRestrictive(["GO_SUPERVISED", "ESCALATE", "ASSISTANT_ONLY"]), "ESCALATE");
  assert.equal(mostRestrictive(["ESCALATE", "NO_GO", "GO_AUTONOMOUS"]), "NO_GO");
  assert.equal(mostRestrictive([]), null);
  const off = { client_facing: false, affects_rights: false, irreversible: false };
  const quiet: JobProfile = { name: "Quiet", tasks: [{ id: "T1", title: "t", flags: off }], flags: off };
  const loud: JobProfile = { name: "Loud", tasks: [{ id: "T2", title: "t", flags: { ...off, client_facing: true } }], flags: { ...off, client_facing: true } };
  const both = assessProfiles([quiet, loud], new Set(["Quiet", "Loud"]), SG_IMDA, "E");
  assert.equal(both.rows[0].verdicts.all_pass, "GO_AUTONOMOUS");
  assert.equal(both.rollup!.all_pass, "GO_SUPERVISED", "the client-facing profile caps the use case");
  assert.equal(assessProfiles([quiet, loud], new Set(["Quiet"]), SG_IMDA, "E").rollup!.all_pass, "GO_AUTONOMOUS", "an unticked profile does not count");
  assert.equal(assessProfiles([quiet, loud], new Set(), SG_IMDA, "E").rollup, null);
});

test("the same profiles are assessable under every rule set", () => {
  for (const rs of RULESETS) {
    const a = assessProfiles(lic, new Set([lic[1].name]), rs, "E");
    assert.ok(a.rollup, rs.id);
  }
});

test("generic SOPs: profiles come from actors, grouped by their steps, applicants excluded", () => {
  const fx = legacyLicenceRenewal();
  const p = deriveProfiles(fx.analysis, fx.input.text);
  assert.ok(p.length >= 2 && p.every((x) => x.tasks.length > 0));
  assert.ok(!p.some((x) => /applicant/i.test(x.name)));
  assert.equal(profilesOf("nope"), null);
});

test("ticks persist in the offline store and a re-tick updates the same row", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "prof-"));
  process.env.OFFLINE_DB = path.join(dir, "db.json");
  const db = offlineClient();
  const row = { org_id: "o", use_case_id: "u", sop_id: "SOP-LIC-014", profile: "Fee and Payment Officer" };
  await db.from("un_job_profiles").upsert({ ...row, automate: true, skill_sha256: "ab" }, { onConflict: "org_id,use_case_id,sop_id,profile" });
  await db.from("un_job_profiles").upsert({ ...row, automate: false, skill_sha256: null }, { onConflict: "org_id,use_case_id,sop_id,profile" });
  const { data } = await db.from("un_job_profiles").select("*").eq("use_case_id", "u");
  assert.equal((data as unknown[]).length, 1);
  assert.equal((data as { automate: boolean }[])[0].automate, false);
  delete process.env.OFFLINE_DB;
  rmSync(dir, { recursive: true, force: true });
});

test("ticking checks the SOP knowledge base and extracts the skill as a library call", () => {
  assert.equal(checkSopKb("SOP-LIC-014").ok, true);
  assert.equal(checkSopKb("no-such-sop").ok, false);
  const r = writeSkill("SOP-LIC-014", "Fee and Payment Officer");
  assert.ok(r.ok && /fee-and-payment-officer\.SKILL\.md$/.test(r.path));
  assert.equal(writeSkill("SOP-LIC-014", "Chief Wizard").ok, false);
  assert.equal(writeSkill("no-such-sop", "x").ok, false);
});

test("a SOP edited after its knowledge base was built is refused as out of date", () => {
  const root = mkdtempSync(path.join(tmpdir(), "kb-"));
  cpSync("kb/sop/SOP-LIC-014", path.join(root, "kb/sop/SOP-LIC-014"), { recursive: true });
  cpSync(SOP, path.join(root, SOP), { recursive: true });
  assert.equal(checkSopKb("SOP-LIC-014", root).ok, true);
  writeFileSync(path.join(root, SOP), readFileSync(SOP, "utf8").replace("14 calendar days", "21 calendar days"));
  const s = checkSopKb("SOP-LIC-014", root);
  assert.equal(s.ok, false);
  assert.match(s.reason, /changed since the knowledge base was built/);
  assert.ok(existsSync(path.join(root, SOP)));
  rmSync(root, { recursive: true });
});
