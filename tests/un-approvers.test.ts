import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { approvalFields, approverOptions, GOVERNANCE_APPROVERS, governanceApprovers, processOwnerOf, resolveApprover } from "../src/lib/un/approvers.ts";
import { acceptanceOf, appendGov, effectiveGates, replayGov, type GovEntry } from "../src/lib/un/gates.ts";
import { GATES } from "../src/lib/un/policy.ts";
import { flagsOfText } from "../src/lib/un/sop/reference.ts";
import { profilesOf } from "../src/lib/un/sop/data.ts";

const SOP = readFileSync("data/sops/uc02-trade-licence-renewal-sop.md", "utf8");
const NOW = "2026-11-21T10:00:00Z";
const facts = { client_facing: true, affects_rights: false, irreversible: false };
const def = { label: "Median response time stays under the agreed limit", owner: "security", category: "non-functional", evidence: "reviewer" };
const log = (...es: [GovEntry["kind"], Record<string, unknown>][]) => {
  const out: GovEntry[] = [];
  for (const [k, p] of es) out.push(appendGov(out[out.length - 1] ?? null, k, "admin@example.invalid", p, NOW));
  return out;
};
const allPass = { ...Object.fromEntries(Object.keys(GATES).map((g) => [g, "pass" as const])), latency_p50: "pass" as const };

test("the process owner is read from the SOP's document control, as a job title", () => {
  assert.equal(processOwnerOf(SOP), "Head of Licensing");
  assert.equal(processOwnerOf(SOP.replace(/\n/g, "\r\n")), "Head of Licensing");
  assert.equal(processOwnerOf("# An SOP with no owner row\n\n| Field | Value |\n|---|---|\n| Version | 1 |"), null);
});

test("approver options: process owner first (the default), then the SOP's job titles, without repeats", () => {
  const titles = profilesOf("SOP-LIC-014")!.map((p) => p.name);
  const o = approverOptions({ sopText: SOP, profiles: titles });
  assert.deepEqual(o[0], { title: "Head of Licensing", source: "process_owner" });
  assert.deepEqual(o.slice(1).map((a) => a.title), titles);
  assert.ok(o.slice(1).every((a) => a.source === "job_title"));
  const dup = approverOptions({ sopText: SOP, profiles: ["head of licensing", "Licensing Supervisor", "licensing supervisor"] });
  assert.deepEqual(dup.map((a) => a.title), ["Head of Licensing", "Licensing Supervisor"]);
});

test("with no SOP the approvers are the governance roles, which also approve org-wide catalogue changes", () => {
  assert.deepEqual(approverOptions({}).map((a) => a.title), [...GOVERNANCE_APPROVERS]);
  assert.ok(governanceApprovers().every((a) => a.source === "governance"));
});

test("an approver must be on the list: typed names are refused, the owner is the default, and the match is case-insensitive", () => {
  const o = approverOptions({ sopText: SOP, profiles: ["Licensing Supervisor"] });
  assert.deepEqual(resolveApprover("", o), { ok: true, approver: o[0] });
  assert.deepEqual(resolveApprover(undefined, o), { ok: true, approver: o[0] });
  assert.deepEqual(resolveApprover("licensing supervisor", o), { ok: true, approver: o[1] });
  const typed = resolveApprover("Somebody I know", o);
  assert.equal(typed.ok, false);
  assert.match((typed as { error: string }).error, /chosen from the list/);
  // no process owner (no SOP) and nothing chosen: the admin has to choose
  assert.equal(resolveApprover("", governanceApprovers()).ok, false);
  // an org-wide catalogue change never defaults to a process owner
  assert.equal(resolveApprover("", o, { defaultToOwner: false }).ok, false);
  assert.equal(resolveApprover("Compliance lead", governanceApprovers(), { defaultToOwner: false }).ok, true);
});

test("the log keeps the approver and where it came from for added gates, waivers and catalogue gates", () => {
  const owner = { approver: "Head of Licensing", approver_source: "process_owner" };
  const es = log(
    ["gate_added", { gate: "latency_p50", def, signed_off_by: "Compliance lead", ...approvalFields({ title: "Compliance lead", source: "governance" }) }],
    ["use_case_gate", { ext_id: "UC02", gate: "latency_p50", reason: "Citizens wait on screen", source: "task", ...owner }],
    ["waiver", { ext_id: "UC02", gate: "audit_log", reason: "Logged upstream", ...owner }],
  );
  const g = replayGov(es);
  assert.deepEqual([g.custom.latency_p50.signed_off_by, g.custom.latency_p50.approver_source], ["Compliance lead", "governance"]);
  assert.deepEqual([g.added.UC02[0].approver, g.added.UC02[0].approver_source], ["Head of Licensing", "process_owner"]);
  assert.deepEqual([g.waivers.UC02[0].approver, g.waivers.UC02[0].approver_source], ["Head of Licensing", "process_owner"]);
  assert.equal(effectiveGates({ ext: "UC02", facts, gov: g }).gates.find((x) => x.id === "latency_p50")!.addedApprover, "Head of Licensing");
});

test("a gate added to a use case with no approver recorded counts as unsigned; with one it is signed", () => {
  const withoutApprover = replayGov(log(["gate_added", { gate: "latency_p50", def, signed_off_by: "Compliance lead" }], ["use_case_gate", { ext_id: "UC02", gate: "latency_p50", reason: "r", source: "task" }]));
  const a = acceptanceOf(effectiveGates({ ext: "UC02", facts, gov: withoutApprover }), "UC02", allPass, withoutApprover);
  assert.deepEqual(a.unsigned, ["latency_p50"]);
  assert.equal(a.accepted, false);
  const withApprover = replayGov(log(["gate_added", { gate: "latency_p50", def, signed_off_by: "Compliance lead" }], ["use_case_gate", { ext_id: "UC02", gate: "latency_p50", reason: "r", source: "task", approver: "Head of Licensing", approver_source: "process_owner" }]));
  const b = acceptanceOf(effectiveGates({ ext: "UC02", facts, gov: withApprover }), "UC02", allPass, withApprover);
  assert.deepEqual(b.unsigned, []);
  assert.equal(b.accepted, true);
});

test("decision pinned: a task that sends something to the applicant is client-facing even when a person releases it", () => {
  // The analyzer works from the task's own words and makes no exception for human release.
  assert.equal(flagsOfText("Draft an email to the applicant. An officer reads it and releases it.").client_facing, true);
  assert.equal(flagsOfText("Prepare a summary for the supervisor to read.").client_facing, false);
  const lic = profilesOf("SOP-LIC-014")!;
  const task = (id: string) => lic.flatMap((p) => p.tasks).find((t) => t.id === id)!;
  // T10 (the on-hold email) and T12 (the fee notice) are drafted for a person to release, and both count
  assert.equal(task("T10").flags.client_facing, true);
  assert.equal(task("T12").flags.client_facing, true);
  const profile = (n: string) => lic.find((p) => p.name === n)!;
  assert.equal(profile("Document Verification Analyst").flags.client_facing, true);
  assert.equal(profile("Fee and Payment Officer").flags.client_facing, true);
});
