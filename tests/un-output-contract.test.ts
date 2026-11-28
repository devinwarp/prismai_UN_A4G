import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { allowedPaths, assertionProblem, contractLines, contractOf, contractPrompt, replyProblem } from "../src/lib/un/output-contract.ts";
import { approverOptions, processOwnerOf } from "../src/lib/un/approvers.ts";
import { ownedBy, ownersOfTask } from "../src/lib/un/sop/owners.ts";
import { deriveProfiles, mergeJointProfiles } from "../src/lib/un/sop/profiles.ts";
import { journeyStatus, REASON_EN, type JourneyInput } from "../src/lib/un/journey.ts";
import { appendContract, approvedContractMap, CONTRACT_AGENT, contractSigner, contractsDrifted, contractsHash, EMPTY_CONTRACTS, planContracts, replayContracts, validateContracts, verifyContracts, type ContractEntry } from "../src/lib/un/output-contract-log.ts";
import { envelopeProblem, failureSummary, runSopCase, tuningPrompt, type SopPilotCase, type SopPilotRound } from "../src/lib/un/sop-pilot.ts";
import { buildGeneratorPrompt, validateCase, type Ctx, type GenScenario } from "../src/lib/un/testgen.ts";
import { extractSkill } from "../src/lib/un/sop-kb.ts";

// What a task RETURNS, set once: derived from the SOP's own text, checked and approved by a person, written into the skill, handed to the test generator, checked by the runner.

const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8").replaceAll("\r\n", "\n"); // a Windows checkout may have CRLF line endings

const T04 = [
  "- **Starts when:** the advertisement closes.",
  "- **Inputs:** D1, D2, D4 and section 6.",
  '- **Steps:** compare the qualification and years of relevant experience with the grade minimum; mark "meets", "does not meet" or "query"; record the reason.',
  "- **Output:** a status and reason for every application.",
  '- **Problems:** an unclear qualification or experience period is "query", never "does not meet". Control 4 applies.',
].join("\n");
const T05 = ['- **Starts when:** an application is marked "meets".', "- **Steps:** check D1 to D4 are present and consistent with each other.", "- **Output:** documents accepted, or a list of what is missing.", '- **Problems:** a missing document is requested once with 3 working days to reply.'].join("\n");

// ---- derived from the SOP's text ---------------------------------------------------------------------------------------

test("a task's outcomes are the quoted list in its Steps or Output, never in Starts when or Problems", () => {
  const c = contractOf("T04", T04);
  assert.deepEqual(c.decision, ["meets", "does not meet", "query"]);
  assert.equal(c.output, "a status and reason for every application");
  // 'an application is marked "meets"' starts T05; it is one value, not an outcome list
  assert.equal(contractOf("T05", T05).decision, null);
  assert.equal(contractOf("T05", T05).output, "documents accepted, or a list of what is missing");
  // a Problems line that names two of them is a rule about them, not their list
  assert.equal(contractOf("T09", '- **Steps:** decide.\n- **Output:** a decision.\n- **Problems:** an unclear case is "query", never "does not meet".').decision, null);
});

test("numbered steps of a structured SOP are read too, and a task that states no output has an empty one", () => {
  const structured = ["- **Starts when:** a request arrives", "- **Steps:**", "  1. Read the request.", '  2. Mark it “approved”, “declined” or “referred”.', "- **Output:** Not stated in the source.", "- **Problems:** none"].join("\n");
  const c = contractOf("T01", structured);
  assert.deepEqual(c.decision, ["approved", "declined", "referred"], "curly quotes too");
  assert.equal(c.output, "", "'Not stated' is not an output");
});

test("the same word twice is one outcome, and a single quoted word is not a choice", () => {
  assert.equal(contractOf("T1", '- **Steps:** mark "yes" or "yes".\n- **Output:** x').decision, null);
});

test("the skill's result format and the prompt name the same fields, and say no other key is defined", () => {
  const c = contractOf("T04", T04);
  const line = contractLines(c).join("\n");
  assert.match(line, /`output\.answer`.*beginning with the decision/);
  assert.match(line, /`output\.facts\.decision`, exactly one of "meets" \| "does not meet" \| "query"/);
  assert.match(line, /no other key in `output\.facts` is defined/);
  assert.match(contractPrompt(c), /output\.facts\.decision \(text, exactly one of "meets" \| "does not meet" \| "query"\)/);
  assert.doesNotMatch(contractLines(contractOf("T05", T05)).join(""), /output\.facts\.decision/, "a task with no choice has no decision field");
});

// ---- tests assert only on the contract ---------------------------------------------------------------------------------

test("an assertion on a key nobody defined is outside the contract; the decision may only be one of the outcomes", () => {
  const c = contractOf("T04", T04);
  assert.deepEqual(allowedPaths(c), ["ok", "refused", "escalate", "needs_human", "output.status", "output.answer", "output.facts.decision"]);
  assert.equal(assertionProblem(c, "output.answer", "contains", "Bachelor"), null);
  assert.equal(assertionProblem(c, "output.facts.decision", "eq", "meets"), null);
  assert.match(assertionProblem(c, "output.facts.status", "eq", "meets") ?? "", /not part of the output contract of T04/);
  assert.match(assertionProblem(c, "output.facts.relevant_experience_years", "gte", 5) ?? "", /not part of the output contract/);
  assert.match(assertionProblem(c, "output.facts.decision", "eq", "approved") ?? "", /can only be "meets" \| "does not meet" \| "query"/);
  assert.match(assertionProblem(contractOf("T05", T05), "output.facts.decision", "eq", "meets") ?? "", /not part of the output contract/, "no decision field on a task with no choice");
});

const scenario = (contract: GenScenario["contract"]): GenScenario => ({ context_hash: "h", id: "S/T04", title: "Check minimum requirements", sop_id: "S", profile: "P", task: "T04", skill_id: "p@1", risk: { client_facing: false, affects_rights: true, irreversible: false }, gates: [], contract });
const ctxOf = (sc: GenScenario): Ctx => ({ scenario: sc, chunkIds: new Set(["S#T04"]), fixtures: { licences: [], docs: [], today: "" }, profileTasks: ["T04"], model: "m" });
const raw = (assertions: unknown[]) => ({ id: "t04-case", title: "A case", family: "happy_path", rationale: "T04 says so", confidence: "high", citations: ["S#T04"], gates: [], input: { task: "T04", requested_task: "T04", request: "An applicant with a degree and 4 years." }, expect: { outcome: "produce", summary: "marks meets", assertions } });

test("the generator is told the contract, and a case that asserts outside it is rejected with the reason", () => {
  const sc = scenario(contractOf("T04", T04));
  const p = buildGeneratorPrompt(sc, "# skill", sc.risk, [], []);
  assert.match(p.system, /Assert ONLY on ok, refused, escalate, needs_human, output\.answer, output\.facts\.decision/);
  assert.match(p.system, /an assertion on any other path is rejected/);
  assert.match(p.user, /output_contract/);
  const ok = validateCase(raw([{ path: "output.facts.decision", op: "eq", value: "meets" }, { path: "output.answer", op: "contains", value: "Bachelor" }]), ctxOf(sc), new Set());
  assert.equal(ok.ok, true);
  const invented = validateCase(raw([{ path: "output.facts.status", op: "eq", value: "meets" }]), ctxOf(sc), new Set());
  assert.ok(!invented.ok && /not part of the output contract of T04/.test(invented.reason));
  // with no contract (the licensing reference, older scenarios) nothing changes
  assert.equal(validateCase(raw([{ path: "output.facts.status", op: "eq", value: "meets" }]), ctxOf(scenario(undefined)), new Set()).ok, true);
  assert.doesNotMatch(buildGeneratorPrompt(scenario(undefined), "# skill", sc.risk, [], []).system, /Assert ONLY on/);
});

// ---- the runner says which rule a reply broke --------------------------------------------------------------------------

const okReply = { ok: true, refused: null, escalate: null, needs_human: false, output: { answer: "meets: Bachelor's, 4 years", facts: { decision: "meets" } }, citations: ["S#T04"] };

test("the envelope check names the first rule broken instead of one generic message", () => {
  assert.equal(envelopeProblem(okReply), null);
  assert.match(envelopeProblem([]) ?? "", /not a JSON object/);
  assert.match(envelopeProblem({ ...okReply, ok: "yes" }) ?? "", /`ok` must be true or false/);
  assert.match(envelopeProblem({ ...okReply, needs_human: undefined }) ?? "", /`needs_human` must be true or false/);
  assert.match(envelopeProblem({ ...okReply, output: { answer: "" } }) ?? "", /`output\.answer` must be non-empty text/);
  assert.match(envelopeProblem({ ...okReply, ok: false, output: {} }) ?? "", /`refused` or `escalate` must say why/);
  assert.match(envelopeProblem({ ...okReply, ok: false, escalate: true, output: {} }) ?? "", /`ok` is false/, "an escalation that is not text names no reason");
  assert.match(envelopeProblem({ ...okReply, refused: undefined }) ?? "", /`refused` is missing: it must be text or null/);
  assert.match(envelopeProblem({ ...okReply, escalate: false }) ?? "", /`escalate` must be text or null/);
  assert.match(envelopeProblem({ ...okReply, citations: null }) ?? "", /`citations` must be a list/);
  assert.match(envelopeProblem({ ...okReply, citations: [1] }) ?? "", /passage id/);
});

test("a decision task must answer with exactly one of its outcomes; a refusal or an escalation is not a result", () => {
  const c = contractOf("T04", T04);
  assert.equal(replyProblem(c, okReply), null);
  assert.equal(replyProblem(c, { ok: true, output: { facts: { decision: " Meets " } } }), null, "case and spaces do not matter");
  assert.match(replyProblem(c, { ok: true, output: { answer: "x" } }) ?? "", /output\.facts\.decision is missing/);
  assert.match(replyProblem(c, { ok: true, output: { facts: { decision: "approved" } } }) ?? "", /must be exactly one of .*but it was "approved"/);
  assert.equal(replyProblem(c, { ok: false, output: {} }), null, "an escalation has no decision");
  assert.equal(replyProblem(contractOf("T05", T05), { ok: true, output: { answer: "x" } }), null, "a task with no choice has no decision to check");
});

const mkCase = (): SopPilotCase => ({ id: "c1", title: "c1", family: "happy_path", input: { kind: "sop", task: "T04", requested_task: "T04", request: "r", context_hash: "h" }, expect: { outcome: "produce", summary: "", assertions: [{ path: "output.facts.decision", op: "eq", value: "meets" }] } } as SopPilotCase);
const ctxRun = (contract?: ReturnType<typeof contractOf>) => ({ profile: "P", task: "Check", passages: [{ chunk_id: "S#T04", text: "t" }], humanRelease: false, skill: "# skill", instructions: "", allowedTasks: new Set(["T04"]), contract });

test("the runner puts the contract in the agent's prompt and fails a reply that breaks it, with the reason and how the reply began", async () => {
  let system = "";
  const bad = await runSopCase(mkCase(), ctxRun(contractOf("T04", T04)), async (a) => { system = a.system; return JSON.stringify({ ...okReply, output: { answer: "a", facts: { decision: "approved" } } }); });
  assert.match(system, /Result format for this task: Task T04/);
  assert.match(system, /exactly one of "meets" \| "does not meet" \| "query"/);
  assert.equal(bad.passed, false);
  assert.deepEqual(bad.failedChecks, ["output_contract"]);
  assert.match(bad.differences[0], /did not follow the task's output contract: output\.facts\.decision must be exactly one of/);
  assert.match(bad.replyHead ?? "", /approved/);
  const good = await runSopCase(mkCase(), ctxRun(contractOf("T04", T04)), async () => JSON.stringify(okReply));
  assert.equal(good.passed, true);
  const broken = await runSopCase(mkCase(), ctxRun(), async () => JSON.stringify({ ...okReply, escalate: undefined }));
  assert.deepEqual(broken.failedChecks, ["response_format"]);
  assert.match(broken.differences[0], /did not follow the output envelope: `escalate` is missing/);
  const noContract = await runSopCase(mkCase(), ctxRun(), async (a) => { system = a.system; return JSON.stringify({ ...okReply, output: { answer: "a", facts: { decision: "meets" } } }); });
  assert.doesNotMatch(system, /Result format for this task/, "no contract, no change to the prompt");
  assert.equal(noContract.passed, true);
});

// ---- the tuner sees the rule, never the test ---------------------------------------------------------------------------

test("the tuner is shown which rule of the format a reply broke, in our words, and still never a test or an expected answer", async () => {
  const c = mkCase();
  const bad = await runSopCase(c, ctxRun(contractOf("T04", T04)), async () => JSON.stringify({ ...okReply, output: { answer: "a", facts: { decision: "approved" } } }));
  const round: SopPilotRound = { instructions: "g", results: [bad] };
  const tasks = new Map([["T04", { title: "Check minimum requirements" }]]);
  const saw = failureSummary(round, [c], tasks);
  assert.equal(saw[0].task, "Check minimum requirements");
  assert.deepEqual(saw[0].checks, ["output_contract"]);
  assert.match(saw[0].problems?.[0] ?? "", /^output\.facts\.decision must be exactly one of/);
  const prompt = tuningPrompt(round, round, tasks, [c], "# skill", []);
  assert.match(prompt.system, /follow(ing)? the skill's Result format|by following the skill's Result format/);
  assert.match(prompt.user, /format_problem/);
  assert.doesNotMatch(prompt.user, /approved"/.source ? /"request":"r"/ : /x/, "the case text stays out");
  assert.doesNotMatch(prompt.user, /Check minimum requirements.*expect/);
});

// ---- the approval log --------------------------------------------------------------------------------------------------

const TASKS = ["T04", "T05"];
const derived = [contractOf("T04", T04), contractOf("T05", T05)];
const chain = (steps: [Parameters<typeof appendContract>[1], string, Record<string, unknown>][]): ContractEntry[] => steps.reduce<ContractEntry[]>((log, [kind, actor, payload], i) => [...log, appendContract(log[log.length - 1] ?? null, kind, actor, payload, new Date(Date.UTC(2026, 10, 28, 9, 0, i)).toISOString())], []);

test("a contract covers every task once, with short plain outcomes, or none", () => {
  assert.equal(validateContracts(derived, TASKS).ok, true);
  const v = (tasks: unknown) => validateContracts(tasks, TASKS);
  assert.match((v([derived[0]]) as { error: string }).error, /missing T05/);
  assert.match((v([...derived, derived[0]]) as { error: string }).error, /T04 appears twice/);
  assert.match((v([{ task: "T99", output: "x", decision: null }, derived[1]]) as { error: string }).error, /T99 is not a task/);
  assert.match((v([{ task: "T04", output: "x".repeat(301), decision: null }, derived[1]]) as { error: string }).error, /at most 300/);
  assert.match((v([{ task: "T04", output: "x", decision: ["only"] }, derived[1]]) as { error: string }).error, /at least two outcomes/);
  assert.match((v([{ task: "T04", output: "x", decision: ["a", "A"] }, derived[1]]) as { error: string }).error, /must differ/);
  assert.match((v([{ task: "T04", output: "x", decision: ['say "no"', "yes"] }, derived[1]]) as { error: string }).error, /without quotation marks/);
  const none = v([{ task: "T04", output: "x", decision: [] }, derived[1]]);
  assert.ok(none.ok && none.tasks[0].decision === null, "an empty list means the task makes no choice");
});

test("propose, then approve: the proposal the platform wrote needs a person, the holder may approve what they wrote themselves (recorded, not refused), and the approval carries the hash of what was approved", () => {
  const p1 = planContracts(EMPTY_CONTRACTS, { type: "propose", tasks: derived, source: "derived" }, CONTRACT_AGENT.id, TASKS);
  assert.ok(p1.ok);
  const log1 = chain([["proposed", CONTRACT_AGENT.email, p1.ok ? p1.payload : {}]]);
  const s1 = replayContracts(log1);
  assert.equal(s1.pending?.source, "derived");
  assert.equal(s1.approved, null);
  const a1 = planContracts(s1, { type: "approve", approver: { title: "Screening Analyst", source: "job_title" } }, "user-1", TASKS);
  assert.ok(a1.ok, "a person approves what the platform proposed: no reason needed");
  const s2 = replayContracts(chain([["proposed", CONTRACT_AGENT.email, p1.ok ? p1.payload : {}], ["approved", "user-1", a1.ok ? a1.payload : {}]]));
  assert.equal(s2.approved?.hash, contractsHash(derived));
  assert.equal(s2.approved?.approver, "Screening Analyst");
  assert.equal(s2.pending, null);
  assert.equal(approvedContractMap(s2)?.get("T04")?.decision?.length, 3);
  // a person edits (a different set of outcomes), then approves their own proposal: only with a reason
  const edited = [{ task: "T04", output: "a status and reason", decision: ["meets", "does not meet", "query", "withdrawn"] }, derived[1]];
  const p2 = planContracts(s2, { type: "propose", tasks: edited, source: "person" }, "user-2", TASKS);
  assert.ok(p2.ok);
  const s3 = replayContracts(chain([["proposed", CONTRACT_AGENT.email, p1.ok ? p1.payload : {}], ["approved", "user-1", a1.ok ? a1.payload : {}], ["proposed", "u2", p2.ok ? p2.payload : {}]]));
  assert.equal(s3.pending?.source, "person");
  assert.equal(s3.approved?.version, 1, "the earlier approval stays in force until the new proposal is approved");
  const own = planContracts(s3, { type: "approve", approver: { title: "Screening Analyst", source: "job_title" } }, "user-2", TASKS);
  assert.ok(own.ok, "the holder writes and approves what their job's agent returns: no second approval, no reason");
  assert.equal(own.ok && own.payload.edited_by_approver, true, "that the approver wrote it is on the record");
  const other = planContracts(s3, { type: "approve", approver: { title: "Screening Analyst", source: "job_title" } }, "user-3", TASKS);
  assert.equal(other.ok && other.payload.edited_by_approver, undefined, "a proposal written by someone else is not marked as the approver's own");
});

test("nothing changes twice, a withdrawal needs a reason, and the SOP drifting from the approval is noticed", () => {
  const p = planContracts(EMPTY_CONTRACTS, { type: "propose", tasks: derived, source: "derived" }, CONTRACT_AGENT.id, TASKS);
  const a = planContracts(replayContracts(chain([["proposed", "x", p.ok ? p.payload : {}]])), { type: "approve", approver: { title: "A", source: "job_title" } }, "u", TASKS);
  const log = chain([["proposed", "x", p.ok ? p.payload : {}], ["approved", "u", a.ok ? a.payload : {}]]);
  const s = replayContracts(log);
  const same = planContracts(s, { type: "propose", tasks: derived, source: "person" }, "u", TASKS);
  assert.ok(!same.ok && /already approved and nothing has changed/.test(same.error));
  assert.ok(!planContracts(s, { type: "withdraw", reason: " " }, "u", TASKS).ok);
  assert.ok(planContracts(s, { type: "withdraw", reason: "the SOP changed" }, "u", TASKS).ok);
  assert.ok(!planContracts(EMPTY_CONTRACTS, { type: "approve", approver: { title: "A", source: "job_title" } }, "u", TASKS).ok, "nothing waiting");
  assert.equal(contractsDrifted(derived, s), false);
  assert.equal(contractsDrifted([{ ...derived[0], decision: ["meets", "does not meet"] }, derived[1]], s), true, "the SOP's text gives something else now");
  assert.equal(contractsDrifted(derived, EMPTY_CONTRACTS), false, "nothing approved, nothing to drift from");
  assert.ok(verifyContracts(log).ok);
  assert.equal(verifyContracts([{ ...log[1], payload: { ...log[1].payload, approver: "someone else" } }, ...[]] as ContractEntry[]).ok, false, "a changed entry breaks the chain");
});

// ---- the skill ---------------------------------------------------------------------------------------------------------

test("a skill with no approved contract is exactly what it was: the committed licensing reference skill does not change", () => {
  const committed = read("kb/sop/SOP-LIC-014/skills/sop-lic-014-fee-and-payment-officer.SKILL.md");
  const built = extractSkill("SOP-LIC-014", "Fee and Payment Officer");
  assert.equal(built.markdown, committed, "no contract lines without an approved contract");
  assert.doesNotMatch(committed, /Result format/);
});

test("with an approved contract, each task of the skill carries it, and the person's edit is what the skill says", () => {
  const approved = new Map(derived.map((c) => [c.task, c]));
  approved.set("T04", { task: "T04", output: "a status and reason", decision: ["meets", "does not meet", "query", "withdrawn"] });
  const md = extractSkill("SOP-LIC-014", "Fee and Payment Officer", new Map([["T11", { task: "T11", output: "the fee", decision: ["due", "paid"] }]])).markdown;
  assert.match(md, /### T11[\s\S]*- \*\*Result format:\*\*[\s\S]*exactly one of "due" \| "paid"/);
  assert.notEqual(md, read("kb/sop/SOP-LIC-014/skills/sop-lic-014-fee-and-payment-officer.SKILL.md"));
});

// ---- the gate, the route and the page ----------------------------------------------------------------------------------

test("tests, test generation and the pilot need an approved output format, and the contract route and panel are in place", () => {
  const store = read("src/lib/un/test-set-store.ts");
  assert.match(store, /if \(!contract\.approved\) return \{ ok: false, error: "The output format of this job profile has to be approved first/);
  assert.match(store, /job\.tasks\.some\(\(t\) => !approvedTasks\.has\(t\.id\)\)/, "a task the approval does not cover needs a new approval");
  assert.match(store, /sopTestContext\(attached, uc, job, approvedContractMap\(contract\)\)/, "the skill the tests bind to is built from the approved contract");
  const route = read("src/app/api/admin/un/use-cases/[id]/contract/route.ts");
  for (const a of ["reextract", "propose", "approve", "withdraw"]) assert.match(route, new RegExp(`"${a}"`));
  assert.match(route, /requirePermission\(\["contract\.edit", "contract\.approve"\]/, "the job profile operator and the process owner, not only the governance admin");
  assert.match(route, /usesLicensingReference\(uc\.ext_id, sopId\)\) return \{ error: "This use case runs on the licence-renewal reference/, "the reference keeps its own format");
  assert.match(route, /const sk = plan\.kind === "proposed" \? null : await rebuild\(next, /, "an approval or withdrawal builds the skill again");
  const page = read("src/app/admin/federal/use-cases/[id]/sop/page.tsx");
  assert.match(page, /<ContractPanel key=\{name\}/);
  assert.match(read("supabase/un-output-contract.sql"), /un_output_contract_log is append-only/);
});

// ---- who may change and approve it: the holder of the job, or the process owner ----------------------------------------------

test("the holder of the job may change and approve its output format; the process owner may as the fallback; nobody else, whatever role they hold", () => {
  const holder = contractSigner({ profile: "Screening Analyst", signerTitle: "screening analyst ", isProcessOwner: false, processOwnerTitle: "Director of Talent Acquisition" });
  assert.deepEqual(holder, { ok: true, as: "holder", approver: { title: "Screening Analyst", source: "job_title" } }, "case and spaces do not matter, and the approver is the job");
  const owner = contractSigner({ profile: "Screening Analyst", signerTitle: "Head of Recruitment", isProcessOwner: true, processOwnerTitle: "Director of Talent Acquisition" });
  assert.deepEqual(owner, { ok: true, as: "process_owner", approver: { title: "Director of Talent Acquisition", source: "process_owner" } });
  assert.equal(contractSigner({ profile: "Screening Analyst", signerTitle: "Head of Recruitment", isProcessOwner: true, processOwnerTitle: null }).ok && (contractSigner({ profile: "Screening Analyst", signerTitle: null, isProcessOwner: true, processOwnerTitle: null }) as { approver: { title: string } }).approver.title, "Process owner", "an SOP that names no owner still has a process owner");
  // an operator of the use case who does another job: no say
  const other = contractSigner({ profile: "Screening Analyst", signerTitle: "Recruitment Operations Officer", isProcessOwner: false, processOwnerTitle: "Director of Talent Acquisition" });
  assert.ok(!other.ok && /Only the holder of the job "Screening Analyst"/.test(other.error));
  assert.equal(contractSigner({ profile: "Screening Analyst", signerTitle: null, isProcessOwner: false, processOwnerTitle: null }).ok, false, "no job title, no role: no say");
  // a holder who is also the process owner signs as the holder
  assert.equal((contractSigner({ profile: "Screening Analyst", signerTitle: "Screening Analyst", isProcessOwner: true, processOwnerTitle: "X" }) as { as: string }).as, "holder");
});

test("the route sets the approver from who signs and never from the request; any operator may still re-extract the skill", () => {
  const route = read("src/app/api/admin/un/use-cases/[id]/contract/route.ts");
  assert.match(route, /const signer = act === "reextract" \? null : await signerOf\(/);
  assert.match(route, /if \(signer && !signer\.ok\) return forbidden\(signer\.error\)/);
  assert.match(route, /approver: signer!\.ok \? signer!\.approver/);
  assert.doesNotMatch(route, /resolveApprover|b\.approver/, "the approver is not chosen or typed");
  assert.match(route, /isProcessOwner: who\.decide\("tuning\.approve"\)\.ok/);
  assert.match(route, /requirePermission\("view", \{ useCaseId: id \}\)/, "GET judges the caller where the use case is, as POST does");
  const panel = read("src/app/admin/federal/use-cases/[id]/sop/ContractPanel.tsx");
  assert.doesNotMatch(panel, /<select/, "no approver picker");
  assert.match(panel, /You approve as /);
  assert.match(panel, /const mayAct = s\.you\.ok/);
});

// ---- the journey asks for it before the tests --------------------------------------------------------------------------

test("before the tests, the journey asks a person to approve what each task returns, and the pilot waits for it", () => {
  const sopDone = { attached: true, profiles: 5, ticked: 2, kbOk: true, skills: 2 };
  const base = (o: Partial<JourneyInput>): JourneyInput => ({ sop: sopDone, gates: { accepted: true }, verdict: "GO_SUPERVISED", tests: { ticked: 2, ready: 2 }, pilot: { ticked: 2, run: 0, met: 0 }, evalSet: false, evalRuns: 0, evalMet: null, tuning: [], watch: [], ...o });
  const at = (i: JourneyInput, id: string) => { const s = journeyStatus(i).stages.find((x) => x.id === id)!; return [s.state, s.reason]; };
  assert.deepEqual(at(base({ contracts: { ticked: 2, approved: 1 } }), "tests"), ["needs_you", "approve_contract"], "one of two profiles has no approved format");
  assert.deepEqual(at(base({ contracts: { ticked: 2, approved: 1 } }), "pilot"), ["not_yet", "tests_first"], "tests that rest on no approved format do not count");
  assert.deepEqual(at(base({ contracts: { ticked: 2, approved: 2 } }), "tests"), ["done", null]);
  assert.deepEqual(at(base({}), "tests"), ["done", null], "a use case on the licensing reference has its own format and is not asked");
  assert.match(REASON_EN.approve_contract, /approves what each task .* returns/);
});

// ---- an SOP that names no owner names nobody ---------------------------------------------------------------------------

test('an SOP whose owner is "Not stated in the source." has no process owner, so that text is never offered as an approver', () => {
  assert.equal(processOwnerOf("| Owner | Not stated in the source. |"), null);
  assert.equal(processOwnerOf("| Owner | not stated in the source |"), null);
  assert.equal(processOwnerOf("| Owner | Director of Talent Acquisition, Sahel Federal Workforce Agency |"), "Director of Talent Acquisition");
  assert.deepEqual(approverOptions({ sopText: "| Owner | Not stated in the source. |", profiles: ["Line manager"] }).map((a) => a.title), ["Line manager"]);
});

// ---- a task two roles share ---------------------------------------------------------------------------------------------

test("a task owned by two roles belongs to both of them, and is not a third job profile with no skill", () => {
  const all = ["Violations Officer", "Field Inspector", "Violations Officer and Field Inspector"];
  assert.deepEqual(ownersOfTask("Violations Officer and Field Inspector", all), ["Violations Officer", "Field Inspector"]);
  assert.deepEqual(ownersOfTask("Violations Officer / Field Inspector", all), ["Violations Officer", "Field Inspector"], "a slash too");
  assert.deepEqual(ownersOfTask("Violations Officer", all), ["Violations Officer"]);
  // a real title that contains "and" is left whole: its parts own nothing on their own
  assert.deepEqual(ownersOfTask("Research and Development Officer", ["Research and Development Officer", "Clerk"]), ["Research and Development Officer"]);
  assert.equal(ownedBy("Violations Officer and Field Inspector", "field inspector", all), true);
  assert.equal(ownedBy("Violations Officer and Field Inspector", "Clerk", all), false);
  assert.equal(ownedBy(null, "Clerk", all), false);
});

const jointSop = [
  "### T01. Inspect the site", "- **Job profile:** Field Inspector.", "Walk the site.", "",
  "### T02. Draft the notice", "- **Job profile:** Violations Officer.", "Write it.", "",
  "### T03. Hold the re-inspection", "- **Job profile:** Violations Officer and Field Inspector.", "Visit again.", "",
].join("\n");

test("profile derivation gives the shared task to each role and no profile named after both", () => {
  const profiles = deriveProfiles({ actors: [], steps: [] } as never, jointSop);
  assert.deepEqual(profiles.map((p) => p.name).sort(), ["Field Inspector", "Violations Officer"]);
  assert.deepEqual(profiles.find((p) => p.name === "Field Inspector")!.tasks.map((t) => t.id), ["T01", "T03"]);
  assert.deepEqual(profiles.find((p) => p.name === "Violations Officer")!.tasks.map((t) => t.id), ["T02", "T03"]);
});

test("both skill builders take a shared task for each of its owners", () => {
  for (const f of ["src/lib/un/sop-kb.ts", "src/lib/un/skill-compile.ts"]) assert.match(read(f), /ownedBy\(c\.job_profile, profile,/, f);
  assert.doesNotMatch(read("src/lib/un/sop-kb.ts"), /c\.job_profile\?\.toLowerCase\(\) === profile\.toLowerCase\(\)/);
});

test("a missing migration is said so, not mistaken for nothing approved: the gate reports it, and the journey does not ask for an approval nobody can give", () => {
  const store = read("src/lib/un/test-set-store.ts");
  assert.match(store, /if \(!read\.ok\) return \{ ok: false, error: read\.error, status: 503 \}/);
  assert.match(read("src/lib/un/journey-store.ts"), /sopId && !contractLog\.error && !usesLicensingReference/);
  assert.match(read("src/lib/un/output-contract-store.ts"), /The output contract migration is missing\. Apply supabase\/un-output-contract\.sql\./);
});

test("a profile list stored before joint ownership was understood is repaired as it is read, and one that was right is left alone", () => {
  const flags = { client_facing: false, affects_rights: false, irreversible: false };
  const t = (id: string) => ({ id, title: id, flags });
  const stored = [
    { name: "Field Inspector", tasks: [t("T01")], flags },
    { name: "Violations Officer", tasks: [t("T02")], flags },
    { name: "Violations Officer and Field Inspector", tasks: [t("T03")], flags },
  ];
  const fixed = mergeJointProfiles(stored);
  assert.deepEqual(fixed.map((p) => p.name), ["Field Inspector", "Violations Officer"], "no phantom profile");
  assert.deepEqual(fixed[0].tasks.map((x) => x.id), ["T01", "T03"]);
  assert.deepEqual(fixed[1].tasks.map((x) => x.id), ["T02", "T03"]);
  const right = [{ name: "Research and Development Officer", tasks: [t("T01")], flags }, { name: "Clerk", tasks: [t("T02")], flags }];
  assert.strictEqual(mergeJointProfiles(right), right, "a real title with 'and' in it is the same list, untouched");
  assert.equal(mergeJointProfiles([stored[0]]).length, 1, "a lone role is not a joint one");
  assert.match(read("src/lib/un/sop-version-store.ts"), /mergeJointProfiles\(r\.profiles as JobProfile\[\]\)/, "at the row mapper");
  assert.match(read("src/lib/un/sop-version-store.ts"), /mergeJointProfiles\(\(Array\.isArray\(r\.profiles\)/, "and in the bulk index");
});

test("a joint owner written with level notes and short forms resolves to the roles it names, but only when each part names exactly one", () => {
  const known = ["Operations Control Duty Officer", "Head of Operations Control", "Incident commander"];
  const who = "Duty Officer (Level 2), Head of Operations Control (Level 3)";
  assert.deepEqual(ownersOfTask(who, [...known, who]), ["Operations Control Duty Officer", "Head of Operations Control"], "'Duty Officer' is the short form of 'Operations Control Duty Officer'");
  // two roles end with "Duty Officer": the short form names no single one, so the name is left as written
  assert.deepEqual(ownersOfTask("Duty Officer, Head of Operations Control", ["Night Duty Officer", "Day Duty Officer", "Head of Operations Control"]), ["Duty Officer, Head of Operations Control"]);
  assert.deepEqual(ownersOfTask("Duty Officer and Someone Else", known), ["Duty Officer and Someone Else"], "one part that names nobody keeps the whole name");
  assert.equal(ownedBy(who, "Head of Operations Control", [...known, who]), true);
  const flags = { client_facing: false, affects_rights: false, irreversible: false };
  const t = (id: string) => ({ id, title: id, flags });
  const merged = mergeJointProfiles([{ name: "Operations Control Duty Officer", tasks: [t("T01")], flags }, { name: "Head of Operations Control", tasks: [t("T02")], flags }, { name: who, tasks: [t("T09")], flags }]);
  assert.deepEqual(merged.map((p) => [p.name, p.tasks.map((x) => x.id)]), [["Operations Control Duty Officer", ["T01", "T09"]], ["Head of Operations Control", ["T02", "T09"]]]);
});

// ---- skill versions ----------------------------------------------------------------------------------------------------------

import { appendSkillVersion, planSkillVersion, replaySkillVersions, verifySkillVersions, versionOfHash, type SkillBuild, type SkillVersionEntry } from "../src/lib/un/skill-versions.ts";

const build = (sha: string, o: Partial<SkillBuild> = {}): SkillBuild => ({ sha256: sha, markdown: `# skill ${sha}`, reason: "ticked", contract_version: null, contract_hash: null, sop_id: "S", sop_version: 1, ...o });
const record = (log: SkillVersionEntry[], b: SkillBuild, by = "u@x", i = log.length) => {
  const payload = planSkillVersion(log, b, by);
  return payload ? [...log, appendSkillVersion(log[log.length - 1] ?? null, by, payload, new Date(Date.UTC(2026, 10, 28, 9, 0, i)).toISOString())] : log;
};

test("every build that gives a different skill is the next version, a rebuild that changes nothing is not, and the text and the reason are kept", () => {
  let log: SkillVersionEntry[] = [];
  log = record(log, build("a1"));
  assert.deepEqual(replaySkillVersions(log).map((v) => v.version), [1]);
  log = record(log, build("a1", { reason: "kb_rebuilt" }));
  assert.equal(replaySkillVersions(log).length, 1, "the same skill again is not a new version (re-ticking, rebuilding the knowledge base)");
  log = record(log, build("b2", { reason: "contract_approved", contract_version: 3, contract_hash: "h3" }), "holder@x");
  const v = replaySkillVersions(log);
  assert.deepEqual(v.map((x) => [x.version, x.reason, x.contract_version, x.by]), [[1, "ticked", null, "u@x"], [2, "contract_approved", 3, "holder@x"]]);
  assert.equal(v[1].markdown, "# skill b2", "the skill text itself is kept, so what ran can be read back");
  log = record(log, build("a1", { reason: "contract_withdrawn" }));
  assert.deepEqual(replaySkillVersions(log).map((x) => x.version), [1, 2, 3], "going back to an earlier text is a new version, never an edit of an old one");
  assert.equal(versionOfHash(replaySkillVersions(log), "b2"), 2);
  assert.equal(versionOfHash(replaySkillVersions(log), "zz"), null);
  assert.ok(verifySkillVersions(log).ok);
  assert.equal(verifySkillVersions([{ ...log[1], payload: { ...log[1].payload, sha256: "forged" } }] as SkillVersionEntry[]).ok, false, "an entry changed afterwards breaks the chain");
});

// ---- one engine, whichever use case calls it ----------------------------------------------------------------------------------

test("one engine builds and stores every skill: ticking, rebuilding the knowledge base, re-extracting and approving all call it, and none builds a skill on its own", () => {
  const engine = read("src/lib/un/skill-engine.ts");
  assert.match(engine, /export async function rebuildSkill\(/);
  assert.match(engine, /approvedContractMap\(state\)/, "it applies the approved contract");
  assert.match(engine, /usesLicensingReference\(uc\.ext_id, att\.sop_id\)/, "the reference keeps its own format");
  assert.match(engine, /planSkillVersion\(/, "and keeps the skill as a version");
  assert.match(engine, /does not undo the build|reported/, "a version log that cannot be written is reported, it does not stop the build");
  const profiles = read("src/app/api/admin/un/use-cases/[id]/profiles/route.ts");
  assert.match(profiles, /rebuildSkill\(orgId, uc, b\.profile, .*"ticked"/);
  assert.match(profiles, /rebuildSkill\(orgId, uc, row\.profile, .*"kb_rebuilt"/);
  assert.doesNotMatch(profiles, /writeSkillFor/, "the profiles route no longer builds a skill itself");
  const contract = read("src/app/api/admin/un/use-cases/[id]/contract/route.ts");
  assert.match(contract, /rebuildSkill\(orgId, p\.uc, profile,/);
  assert.doesNotMatch(contract, /writeSkillFor|saveTick/, "nor does the contract route");
  // outside the engine, the only callers of writeSkillFor are the engine and the helpers that define it
  for (const f of ["src/app/api/admin/un/use-cases/[id]/profiles/route.ts", "src/app/api/admin/un/use-cases/[id]/contract/route.ts"]) assert.doesNotMatch(read(f), /writeSkillFor/, f);
});

test("the job holder reviews, edits and approves in one step: the edits go into the skill with the approval, as a new version, with no second approval", () => {
  const route = read("src/app/api/admin/un/use-cases/[id]/contract/route.ts");
  assert.match(route, /act === "approve" && b\.tasks !== undefined/, "approve takes the holder's edits");
  assert.match(route, /planContracts\(state, \{ type: "propose", tasks: v\.tasks, source: "person"/, "they are recorded as the person's proposal, in the same request");
  assert.match(route, /await rebuild\(next, plan\.kind === "approved" \? "contract_approved" : "contract_withdrawn"\)/, "and the skill is built from them at once");
  const panel = read("src/app/admin/federal/use-cases/[id]/sop/ContractPanel.tsx");
  assert.match(panel, /dirty \? \{ action: "approve", tasks: draft\.map\(fromDraft\) \} : \{ action: "approve" \}/);
  assert.match(panel, /Save and approve/);
  assert.doesNotMatch(panel, /self_approval_reason|only if you wrote this proposal/, "no reason to give");
  const sql = read("supabase/un-output-contract.sql");
  assert.match(sql, /create table if not exists public\.un_skill_version_log/);
  assert.match(sql, /un_skill_version_log is append-only/);
});

// ---- what ran, what was certified and what was deployed name the skill version -------------------------------------------------

import { certificationFromPlan, certificationPayload, sopCertifications, snapshotOf, type CertifiedProfile } from "../src/lib/un/sop-deployment.ts";

test("a certification and the deployment snapshot built from it carry the version of the skill that was certified", () => {
  const c: CertifiedProfile = { profile: "Screening Analyst", sop_id: "S", sop_version: 1, skill_sha256: "ab8f", skill_version: 3, skill_markdown: "# skill", guidance: "g", guidance_sha256: "x", report_id: "r", test_hash: "t", params_hash: "p" };
  const payload = certificationPayload({ ...c, met: true });
  assert.equal(payload.skill_version, 3);
  const plan = { agent: {}, bound: {}, unexecuted: [], aggregate: [], certified: { profile: c.profile, sop_id: "S", sop_version: 1, skill_sha256: "ab8f", skill_version: 3, skill_markdown: "# skill", guidance: "g", test_hash: "t", params_hash: "p" } };
  const fromPlan = certificationFromPlan(plan, "final")!;
  assert.equal(fromPlan.skill_version, 3, "the version recorded when the pilot ran is the one certified at the goal review");
  const log = [{ seq: 1, kind: "certification", at: "2026-11-28T09:00:00.000Z", actor: "u", payload: fromPlan, prev_hash: "0", hash: "h" }] as never;
  const certified = sopCertifications(log).get("Screening Analyst")!;
  assert.equal(certified.skill_version, 3);
  const { snapshot, sha256 } = snapshotOf([certified]);
  assert.equal(snapshot.profiles[0].skill_version, 3, "so the deployed snapshot names it");
  const other = snapshotOf([{ ...certified, skill_version: 4 }]);
  assert.notEqual(other.sha256, sha256, "a different skill version is a different snapshot");
  // a certification made before versions existed has none, and still reads
  assert.equal(snapshotOf([{ ...certified, skill_version: undefined }]).snapshot.profiles[0].skill_version, undefined);
});

test("a test-set approval, a pilot run, a certification and the production screen all name the skill version they used", () => {
  const tests = read("src/app/api/admin/un/use-cases/[id]/tests/route.ts");
  assert.match(tests, /p\.kind === "approved" && need\.sop\?\.skill \? \{ \.\.\.p\.payload, skill_sha256: need\.sop\.skill\.sha256, skill_version: await skillVersionOf\(/);
  const pilot = read("src/app/api/admin/un/use-cases/[id]/pilot/sop/route.ts");
  assert.match(pilot, /skillHash: suite\.skill\.sha256, skillVersion: await skillVersionOf\(/, "the run records it when it starts");
  assert.match(pilot, /skill_sha256: suite\.skill\.sha256, skill_version: await skillVersionOf\(/, "the certification records it");
  assert.match(read("src/app/admin/federal/use-cases/[id]/production/page.tsx"), /p\.skill_version \? ` \(v\$\{p\.skill_version\}\)` : ""/);
  assert.match(read("src/lib/un/skill-version-store.ts"), /Never throws/, "a log that cannot be read is no version known, not a failure of the pilot");
});
