import { createHash } from "node:crypto";
import { parseLlmJson } from "../llm.ts";
import type { Blueprint, Family } from "./test-derive.ts";
import { appendEntry, verifyChain, type ChainEntry } from "./tuning.ts";

// AI test-case generator, first slice. Pure: no I/O. The model call is injected (a ChatFn, as in goal-judge.ts).
//
// Why: the pilot's expected outcomes must not come from our own hand-written cases (their accuracy is 699 of 699 by
// construction). A reasoning agent writes test cases from an approved scenario, its risk, its gates, the skill and the
// SOP lines retrieved for it. Everything it writes is a PROPOSAL; code (not the model) validates it, and a person
// approves each case into the test set, which is then approved and locked through the existing hash-chained path.
//
// Rules enforced here, all in code:
//  - a scenario with no skill is refused;
//  - a case with no citation is rejected; every citation must be a chunk id of the SOP knowledge base;
//  - a case may name only gates that apply to the scenario; its input must use the agent's real input fields and
//    only fixtures that exist; malformed output is dropped and reported, never repaired or guessed;
//  - every applicable, case-testable gate must be exercised by a surviving case, or it is reported as a coverage
//    gap; the number of cases needed scales with the scenario's risk (RISK_MIN below).

export type ChatFn = (o: { system: string; user: string }) => Promise<string>;

/** Default generator model. It must differ from the goal judge's default (anthropic/claude-sonnet-5.5, CHAT_MODEL) and
 * from the agent under test (AGENT_LLM_MODEL, else CHAT_MODEL), so a shared blind spot does not line up. Pinned by a
 * source-text test. Set TESTGEN_MODEL to change it. */
export const TESTGEN_DEFAULT_MODEL = "google/gemini-3.5-flash";
export const testgenModel = (env: Record<string, string | undefined> = process.env): string => env.TESTGEN_MODEL || TESTGEN_DEFAULT_MODEL;

// ---- shapes -----------------------------------------------------------------------------------------------

export interface Risk { client_facing: boolean; affects_rights: boolean; irreversible: boolean }
export type Role = "dv" | "fp" | "fd" | "sup";
export const ROLE_OF_PROFILE: Record<string, Role> = { "Document Verification Analyst": "dv", "Fee and Payment Officer": "fp", "Licensing Front-Desk Officer": "fd", "Licensing Supervisor": "sup" };

export interface GateInfo { id: string; label: string; /** false when evidence comes from a reviewer or the audit log, not from running a case */ testable: boolean }

/** What a case is generated for: one task of a job profile, its risk, its gates, its skill. */
export interface GenScenario {
  id: string;
  title: string;
  sop_id: string;
  profile: string;
  task: string;
  /** The skill the scenario is linked to. A scenario with null is refused. */
  skill_id: string | null;
  risk: Risk;
  gates: GateInfo[];
}

/** The result fields of each task, names and kinds only: the agent's interface, not its behaviour. The generator needs
 * them to write assertions a program can check; it never sees what the agent actually returns. */
export const OUTPUT_CONTRACT: Record<string, string> = {
  T04: "output.expiry (date), output.days_expired (number, negative before expiry), output.late_fee_applies (boolean), output.blocked (boolean), output.label (text or null)",
  T05: "output.documents (text status), output.issues (list of text), output.for_a_person (list)",
  T06: "output.lease (ok | not_received | issues | in_other_language), output.issues (list of text)",
  T07: "output.fines (list), output.inspection_hold (text or null), output.exception (boolean)",
  T08: "output.recorded (activity code), output.declared, output.changed (boolean), output.activity_group",
  T09: "output.status (complete | on_hold | blocked), output.missing (list), output.exceptions (list), output.late_fee_applies (boolean)",
  T10: "output.email (null or an object with to, body, items), output.ignored_reply_to (text or null), output.reason",
  T11: "output.group (activity group), output.base (number), output.late (number), output.total (number)",
  T12: "output.notice (null or an object with to, amount (number), due (date), pay_by (list), case), output.reason",
  T13: "output.expected (number), output.status (matched | mismatch | pending), output.received (list of payments)",
};

export interface SopLine { chunk_id: string; text: string }
export interface Fixtures { licences: { key: string; activity_group: string; expiry: string; holder?: string; activity_code?: string; registered_email?: string; language?: string }[]; docs: string[]; today: string }

/** The structured input the agent under test runs (the fields of a TaskCase, task-evals.ts). */
export interface GenInput {
  agent: Role;
  task: string;
  licence: string;
  request?: { declared?: string; reply_to?: string; request_type?: "renewal" | "new_licence" | "change_of_owner" | "cancellation" | "appeal"; representative?: string; note?: string };
  docs?: string[];
  /** Document Verification tasks run first so memory holds their results. */
  prepare?: string[];
  seed?: { status: "complete"; late: boolean };
  payments?: { amount: number; reference: string; payer: string }[];
  ask?: string;
}

export const OPS = ["eq", "ne", "contains", "gte", "lte", "true", "false", "null"] as const;
export type Op = (typeof OPS)[number];
/** path is "ok", "refused", "escalate", "needs_human", or "output.<field>[.<field>]" of the task result. */
export interface Assertion { path: string; op: Op; value?: string | number | boolean }
export type Outcome = "produce" | "refuse" | "escalate";
export interface Expectation { outcome: Outcome; summary: string; assertions: Assertion[] }

export const CONFIDENCE = ["low", "med", "high"] as const;
export type Confidence = (typeof CONFIDENCE)[number];
export const CASE_FAMILIES = ["happy_path", "exception", "boundary", "authority"] as const;

export interface GenCase {
  id: string;
  scenario_id: string;
  skill_id: string;
  family: (typeof CASE_FAMILIES)[number];
  title: string;
  gates: string[];
  risk: Risk;
  input: GenInput;
  expect: Expectation;
  citations: string[];
  confidence: Confidence;
  rationale: string;
  /** The model that wrote it; recorded in every entry. */
  model: string;
  /** True when the case survived only after the one repair call (testgen repair pass); absent on first-round cases and on old entries. */
  repaired?: true;
}

/** `round: 2` marks a rejection by the repair call (the case failed again); absent means the first round (and old entries). */
export interface Rejection { index: number; id: string | null; reason: string; round?: 2 }
/** The one repair pass of a run. outcome: "ok" (answer read), "failed" (the call threw), "malformed" (unreadable reply);
 * on failed and malformed the first-round result is kept unchanged. */
export interface RepairInfo { calls: number; before: number; rescued: number; prompt_hash: string; outcome: "ok" | "failed" | "malformed"; note?: string }
export interface CoverageGap { kind: "gate" | "count"; gate?: string; message: string }
export interface Generated { cases: GenCase[]; rejected: Rejection[]; gaps: CoverageGap[]; refused: string | null }

// ---- risk-scaled coverage ---------------------------------------------------------------------------------

/** Minimum surviving cases for a scenario: a base, plus an increment for each risk it carries. Rights-affecting,
 * irreversible and client-facing scenarios get more cases because a wrong answer costs more. */
export const RISK_MIN = { base: 2, client_facing: 2, affects_rights: 2, irreversible: 1 } as const;
export const minCases = (r: Risk): number => RISK_MIN.base + (r.client_facing ? RISK_MIN.client_facing : 0) + (r.affects_rights ? RISK_MIN.affects_rights : 0) + (r.irreversible ? RISK_MIN.irreversible : 0);
export const riskClass = (r: Risk): string => [r.client_facing && "client-facing", r.affects_rights && "rights-affecting", r.irreversible && "irreversible"].filter(Boolean).join(" + ") || "routine";

// ---- the prompt -------------------------------------------------------------------------------------------

export const GEN_SYSTEM = `You write test cases for an AI agent that does one job of a government procedure. You write the EXPECTED outcome from the procedure (the SOP) alone. You have not seen the agent's output and must not guess what it does: derive each expectation from the SOP lines you are given, quote the rule in the rationale, and cite the chunk id of every line you rely on.
Rules:
- Cite only chunk ids that appear in the SOP lines below, written exactly. A case with no citation is thrown away.
- Name only gates from the gate list. Every gate marked testable must be exercised by at least one case.
- Use only the licence keys, document keys and request fields listed. "request.declared" is an activity code such as "4711"; free text from the applicant goes in "request.note" (a request to waive or reduce a fee is such a note).
- A task that works on a case needs the case to exist: "prepare" lists the Document Verification tasks (T04 to T09) the agent runs first, on the "docs" you name, so that memory holds their results. The fee tasks (T11 to T13) refuse a file that is not "complete", so their cases need "prepare":["T04","T05","T06","T07","T08","T09"] with a full document set (or "seed":{"status":"complete","late":false}, with exactly those two fields, to start from a complete file). "prepare" takes only T04 to T09: a fee task works out the fee itself from the file, so never list T11 to T13 in it. Every amount, date and count in an expectation must follow from the SOP lines and the fixture facts; if you cannot derive it, lower the confidence.
- Write only cases the input can actually create. Do not invent a condition the input fields cannot produce (a bounced email, a payment that arrives later); do not invent field values.
- Cover normal, boundary and exception cases, and a case where the agent should refuse or escalate if the SOP says some other role owns the work.
- Write the expectation so a program can check it: "assertions" on the task result.
Reply with one JSON object only, no prose, in exactly this shape:
{"cases":[{"id":"<short-kebab-id>","title":"<one line>","family":"happy_path|exception|boundary|authority","gates":["<gate id>"],"input":{"agent":"<role>","task":"<task id>","licence":"<licence key>","request":{"declared":"<activity code>"},"docs":["<doc key>"],"prepare":["T04"],"payments":[{"amount":0,"reference":"$CASE","payer":"<name>"}]},"expect":{"outcome":"produce|refuse|escalate","summary":"<what the agent should do, one sentence>","assertions":[{"path":"output.total","op":"eq","value":2200}]},"citations":["<chunk id>"],"confidence":"low|med|high","rationale":"<the SOP rule that justifies it>"}]}
Assertion paths: ok, refused, escalate, needs_human, or output.<field>, with list items by index (output.received.0.amount). "refused" and "escalate" are text: use contains, eq or null. Ops: ${OPS.join(", ")} (true, false, null take no value). Omit input fields you do not need ("request", "docs", "prepare", "payments" are optional; "reference":"$CASE" stands for the case number).`;

const SKILL_MAX = 9000;

export function buildGeneratorPrompt(scenario: GenScenario, skill: string, risk: Risk, gates: GateInfo[], sopLines: SopLine[], fixtures?: Fixtures): { system: string; user: string } {
  const role = ROLE_OF_PROFILE[scenario.profile] ?? "none";
  const user = [
    `Scenario ${scenario.id}: ${scenario.title}`,
    `Job profile: ${scenario.profile} (agent role "${role}"). Task under test: ${scenario.task}. Skill: ${scenario.skill_id ?? "NONE"}.`,
    `Risk: ${riskClass(risk)}. Write at least ${minCases(risk)} cases (more are welcome), covering every testable gate.`,
    "",
    `Result fields of ${scenario.task} (the agent's interface; also top-level ok, refused, escalate, needs_human): ${OUTPUT_CONTRACT[scenario.task] ?? "not documented: assert only on ok, refused, escalate and needs_human"}`,
    "",
    "Gates that apply:",
    ...gates.map((g) => `- ${g.id}: ${g.label}${g.testable ? " (testable: exercise it in at least one case)" : " (evidenced by a reviewer or the log, not by a case: do not name it)"}`),
    "",
    "Skill (the agent's own instructions, copied from the SOP):",
    skill.length > SKILL_MAX ? `${skill.slice(0, SKILL_MAX)}\n[skill truncated]` : skill,
    "",
    "SOP lines you may cite (chunk id, then text):",
    ...sopLines.map((l) => `[${l.chunk_id}]\n${l.text}`),
    ...(fixtures
      ? [
          "",
          `Fixtures (synthetic). Today is ${fixtures.today}. Licences: ${fixtures.licences.map((l) => `${l.key} (${[l.activity_group, l.activity_code && `activity code ${l.activity_code}`, `expires ${l.expiry}`, l.holder && `holder ${l.holder}`, l.registered_email && `registered email ${l.registered_email}`, l.language && `language ${l.language}`].filter(Boolean).join(", ")})`).join("; ")}.`,
          `Document keys: ${fixtures.docs.join(", ")}. A key "<licence>-dN" is document DN of that licence's file (the SOP names D1 to D6); a suffix such as -expired, -forged or -wrongno is a faulty version of it. noor-d1..noor-d4 (or bakery-d1..bakery-d4) is a complete, valid file for that licence; leave a document out to make the file incomplete. Use these exact email addresses and names in expectations.`,
        ]
      : []),
  ].join("\n");
  return { system: GEN_SYSTEM, user };
}

// ---- parse and validate -----------------------------------------------------------------------------------

export interface Ctx {
  scenario: GenScenario;
  /** Every chunk id of the SOP knowledge base. */
  chunkIds: Set<string>;
  fixtures: Fixtures;
  /** Task ids of the scenario's job profile. */
  profileTasks: string[];
  model: string;
  /** Full case ids ("T11.some-id") already proposed for this profile; a duplicate is rejected. */
  existingIds?: Set<string>;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown, max: number): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= max;
const strs = (v: unknown, max = 40): v is string[] => Array.isArray(v) && v.every((x) => str(x, 80)) && v.length <= max;
const PATH = /^(ok|refused|escalate|needs_human|output(\.([A-Za-z_][A-Za-z0-9_]*|\d+))+)$/;
/** The Document Verification tasks whose results make a file "complete", and the tasks that refuse to run on a file that is not. */
export const DV_TASKS = ["T04", "T05", "T06", "T07", "T08", "T09"];
export const NEEDS_FILE = ["T11", "T12", "T13"];
const ID = /^[a-z0-9][a-z0-9-]{2,40}$/;
const REQ_KEYS = ["declared", "reply_to", "request_type", "representative", "note"];
const REQ_TYPES = ["renewal", "new_licence", "change_of_owner", "cancellation", "appeal"];

/** Returns the reason a case is not usable, or null. Deterministic; the model has no say. */
export function validateCase(raw: unknown, ctx: Ctx, seen: Set<string>): { ok: true; case: GenCase } | { ok: false; id: string | null; reason: string } {
  const fail = (id: string | null, reason: string) => ({ ok: false as const, id, reason });
  if (!isObj(raw)) return fail(null, "not an object");
  const id = typeof raw.id === "string" ? raw.id : null;
  if (!id || !ID.test(id)) return fail(id, "missing or malformed id");
  if (seen.has(id) || ctx.existingIds?.has(`${ctx.scenario.task}.${id}`.toLowerCase())) return fail(id, "duplicate id");
  if (!str(raw.title, 200)) return fail(id, "missing title");
  if (!(CASE_FAMILIES as readonly string[]).includes(raw.family as string)) return fail(id, "unknown family");
  if (!str(raw.rationale, 1200)) return fail(id, "missing rationale");
  if (!(CONFIDENCE as readonly string[]).includes(raw.confidence as string)) return fail(id, "confidence must be low, med or high");

  // the justification: no citation, or a citation that is not in the knowledge base, rejects the case
  if (!strs(raw.citations) || raw.citations.length === 0) return fail(id, "no citation: an expectation must be justified by an SOP line");
  const unknown = raw.citations.filter((c) => !ctx.chunkIds.has(c));
  if (unknown.length) return fail(id, `cites chunk ids that are not in the SOP knowledge base: ${unknown.slice(0, 3).join(", ")}`);

  const applicable = new Set(ctx.scenario.gates.map((g) => g.id));
  if (!strs(raw.gates, 12)) return fail(id, "gates must be a list of gate ids");
  const badGate = raw.gates.find((g) => !applicable.has(g));
  if (badGate) return fail(id, `gate "${badGate}" does not apply to this scenario`);

  // input: the agent's own fields, existing fixtures only
  const inp = raw.input;
  if (!isObj(inp)) return fail(id, "input is missing");
  const role = ROLE_OF_PROFILE[ctx.scenario.profile];
  if (inp.agent !== role) return fail(id, `input.agent must be "${role}"`);
  if (typeof inp.task !== "string" || !ctx.profileTasks.includes(inp.task)) return fail(id, "input.task is not a task of this job profile");
  // the case id, the gates and the citations are all for the scenario's task: a case that runs another task is for another scenario
  if (inp.task !== ctx.scenario.task) return fail(id, `input.task must be ${ctx.scenario.task}, the task under test, not ${inp.task}`);
  if (typeof inp.licence !== "string" || !ctx.fixtures.licences.some((l) => l.key === inp.licence)) return fail(id, "input.licence is not a known fixture");
  if (inp.docs !== undefined && (!strs(inp.docs) || inp.docs.some((d) => !ctx.fixtures.docs.includes(d)))) return fail(id, "input.docs names a document that does not exist");
  if (inp.prepare !== undefined && (!strs(inp.prepare) || inp.prepare.some((t) => !/^T\d{2}$/.test(t)))) return fail(id, "input.prepare must be task ids");
  if (inp.request !== undefined) {
    if (!isObj(inp.request) || Object.keys(inp.request).some((k) => !REQ_KEYS.includes(k))) return fail(id, "input.request has a field the agent does not take");
    if (inp.request.request_type !== undefined && !REQ_TYPES.includes(inp.request.request_type as string)) return fail(id, "input.request.request_type is not a known type");
  }
  if (Array.isArray(inp.prepare) && inp.prepare.some((t) => !DV_TASKS.includes(t))) return fail(id, "input.prepare may list only Document Verification tasks (T04 to T09)");
  if (NEEDS_FILE.includes(inp.task) && !inp.seed && !DV_TASKS.every((t) => Array.isArray(inp.prepare) && inp.prepare.includes(t))) return fail(id, `the agent refuses ${inp.task} unless the file is complete: give "seed" or prepare T04 to T09, so the case can run`);
  if (inp.seed !== undefined && !(isObj(inp.seed) && Object.keys(inp.seed).length === 2 && inp.seed.status === "complete" && typeof inp.seed.late === "boolean")) return fail(id, "input.seed is malformed");
  if (inp.payments !== undefined && !(Array.isArray(inp.payments) && inp.payments.every((p) => isObj(p) && typeof p.amount === "number" && typeof p.reference === "string" && typeof p.payer === "string"))) return fail(id, "input.payments is malformed");
  if (inp.ask !== undefined && !str(inp.ask, 300)) return fail(id, "input.ask is malformed");

  // expectation: machine-checkable
  const ex = raw.expect;
  if (!isObj(ex)) return fail(id, "expect is missing");
  if (!["produce", "refuse", "escalate"].includes(ex.outcome as string)) return fail(id, "expect.outcome must be produce, refuse or escalate");
  if (!str(ex.summary, 400)) return fail(id, "expect.summary is missing");
  if (!Array.isArray(ex.assertions) || ex.assertions.length === 0 || ex.assertions.length > 12) return fail(id, "expect.assertions must be 1 to 12 checks");
  for (const a of ex.assertions) {
    if (!isObj(a) || typeof a.path !== "string" || !PATH.test(a.path) || !(OPS as readonly string[]).includes(a.op as string)) return fail(id, "an assertion has an unknown path or operator");
    if (["true", "false"].includes(a.op as string) && (a.path === "escalate" || a.path === "refused")) return fail(id, `${a.path} is text: use contains, eq or null, not ${a.op}`);
    const needsValue = !["true", "false", "null"].includes(a.op as string);
    if (needsValue ? !["string", "number", "boolean"].includes(typeof a.value) : a.value !== undefined) return fail(id, `an assertion on ${a.path} has the wrong value for "${a.op}"`);
    if (["gte", "lte"].includes(a.op as string) && typeof a.value !== "number") return fail(id, "gte and lte need a number");
  }

  seen.add(id);
  return {
    ok: true,
    case: {
      id: `${ctx.scenario.task}.${id}`.toLowerCase(), scenario_id: ctx.scenario.id, skill_id: ctx.scenario.skill_id!, family: raw.family as GenCase["family"],
      title: (raw.title as string).trim(), gates: [...new Set(raw.gates)], risk: ctx.scenario.risk, input: inp as unknown as GenInput,
      expect: { outcome: ex.outcome as Outcome, summary: (ex.summary as string).trim(), assertions: ex.assertions as Assertion[] },
      citations: [...new Set(raw.citations)], confidence: raw.confidence as Confidence, rationale: (raw.rationale as string).trim(), model: ctx.model,
    },
  };
}

/** Coverage of the surviving cases against the scenario: every testable gate exercised, and the risk-scaled count. */
export function coverageGaps(s: GenScenario, cases: GenCase[]): CoverageGap[] {
  const gaps: CoverageGap[] = [];
  for (const g of s.gates.filter((x) => x.testable)) {
    if (!cases.some((c) => c.gates.includes(g.id))) gaps.push({ kind: "gate", gate: g.id, message: `No case exercises the gate "${g.id}" (${g.label})` });
  }
  const need = minCases(s.risk);
  if (cases.length < need) gaps.push({ kind: "count", message: `${cases.length} of the ${need} cases a ${riskClass(s.risk)} scenario needs survived validation` });
  return gaps;
}

/** The model's reply to cases, rejections and gaps. Anything unreadable is dropped and reported, never guessed. */
/** Why nothing may be generated for this scenario, or null. No skill, or a job profile with no agent role to run its cases. */
export function refusalFor(s: GenScenario): string | null {
  if (!s.skill_id) return "This scenario is not linked to a skill; a scenario must always be linked to a skill, so nothing was generated.";
  if (!ROLE_OF_PROFILE[s.profile]) return `No agent role is defined for the job profile "${s.profile}", so its cases cannot be run; nothing was generated.`;
  return null;
}

export function parseGenerated(reply: string, ctx: Ctx): Generated {
  const g = parseCases(reply, ctx);
  return { cases: g.cases, rejected: g.rejected, gaps: g.gaps, refused: g.refused };
}

/** parseGenerated, plus the raw JSON of each rejected case (index-aligned with `rejected`) for the repair prompt. */
function parseCases(reply: string, ctx: Ctx, seen = new Set<string>()): Generated & { raw: unknown[] } {
  const refused = refusalFor(ctx.scenario);
  if (refused) return { cases: [], rejected: [], gaps: [], refused, raw: [] };
  let o: unknown;
  try { o = parseLlmJson(reply); } catch { return { cases: [], rejected: [{ index: -1, id: null, reason: "the model's reply is not valid JSON" }], gaps: coverageGaps(ctx.scenario, []), refused: null, raw: [] }; }
  const list = isObj(o) && Array.isArray(o.cases) ? o.cases : null;
  if (!list) return { cases: [], rejected: [{ index: -1, id: null, reason: 'the reply has no "cases" list' }], gaps: coverageGaps(ctx.scenario, []), refused: null, raw: [] };
  const cases: GenCase[] = [];
  const rejected: Rejection[] = [];
  const rawRejected: unknown[] = [];
  list.forEach((raw, index) => {
    const v = validateCase(raw, ctx, seen);
    if (v.ok) cases.push(v.case); else { rejected.push({ index, id: v.id, reason: v.reason }); rawRejected.push(raw); }
  });
  return { cases, rejected, gaps: coverageGaps(ctx.scenario, cases), refused: null, raw: rawRejected };
}

const hashOf = (p: { system: string; user: string }) => createHash("sha256").update(p.system + p.user).digest("hex").slice(0, 16);

/** The one follow-up call: the first prompt again (so the SOP lines, gates and fixtures are in front of the model, and a
 * citation can only be a line it is shown), then ONLY the rejected cases with the exact validator reasons, and the gaps.
 * Cases that passed are not shown. Same validator afterwards; nothing here loosens a rule. */
export function buildRepairPrompt(base: { system: string; user: string }, rejected: { raw: unknown; reason: string }[], gaps: CoverageGap[]): { system: string; user: string } {
  const cut = (v: unknown) => { const t = JSON.stringify(v) ?? "null"; return t.length > 2500 ? `${t.slice(0, 2500)} ...[cut]` : t; };
  const user = [
    base.user,
    "",
    "REPAIR ROUND (the last one: there is no further round). A program checked your first reply. These cases were thrown away, each with the exact reason:",
    ...rejected.map((r, i) => `${i + 1}. Reason: ${r.reason}\n   Your case: ${cut(r.raw)}`),
    ...(gaps.length ? ["", "Coverage still missing:", ...gaps.map((g) => `- ${g.message}`)] : []),
    "",
    "Reply with the same JSON shape, \"cases\" holding ONLY corrected versions of the thrown-away cases above (fix what the reason names, keep the rest; give a case a new id if the reason is a duplicate id). Add a new case only if it is needed to close a missing gate or count listed above. Do not repeat cases that were accepted. The rules above are unchanged: cite only the SOP lines shown above, use only the gates, licences and documents listed. If a case cannot be corrected under those rules, leave it out.",
  ].join("\n");
  return { system: base.system, user };
}

/** Prompt, one model call, parse; then, when cases were rejected or coverage is short, ONE repair call (hard cap: no
 * loop, one `if`) whose survivors pass the same validator and are marked `repaired`. A failed call reports one
 * rejection and invents nothing; a failed or unreadable repair keeps the first-round result and says so in `repair`.
 * `calls` is the number of model calls made. */
export async function generate(chat: ChatFn, scenario: GenScenario, skill: string, sopLines: SopLine[], ctx: Ctx, fixtures?: Fixtures): Promise<Generated & { prompt_hash: string; calls: number; repair: RepairInfo | null }> {
  if (refusalFor(scenario)) return { ...parseGenerated("", ctx), prompt_hash: "", calls: 0, repair: null };
  const p = buildGeneratorPrompt(scenario, skill, scenario.risk, scenario.gates, sopLines, fixtures ?? ctx.fixtures);
  const prompt_hash = hashOf(p);
  let reply: string;
  try { reply = await chat(p); } catch (e) { return { cases: [], rejected: [{ index: -1, id: null, reason: `the model call failed: ${e instanceof Error ? e.message.slice(0, 120) : "error"}` }], gaps: coverageGaps(scenario, []), refused: null, prompt_hash, calls: 1, repair: null }; }
  const first = parseCases(reply, ctx);
  const { raw, ...g1 } = first;
  if (g1.rejected.length === 0 && g1.gaps.length === 0) return { ...g1, prompt_hash, calls: 1, repair: null };

  const rp = buildRepairPrompt(p, g1.rejected.map((r, i) => ({ raw: raw[i] ?? `(no usable case: ${r.reason})`, reason: r.reason })), g1.gaps);
  const info: RepairInfo = { calls: 1, before: g1.cases.length, rescued: 0, prompt_hash: hashOf(rp), outcome: "ok" };
  let reply2: string;
  try { reply2 = await chat(rp); } catch (e) { return { ...g1, prompt_hash, calls: 2, repair: { ...info, outcome: "failed", note: `the repair call failed: ${e instanceof Error ? e.message.slice(0, 120) : "error"}; the first-round result is kept` } }; }
  // same validator, same ctx (so the same shown lines); ids of the cases already kept count as seen
  const r2 = parseCases(reply2, ctx, new Set(g1.cases.map((c) => c.id.split(".").slice(1).join("."))));
  if (r2.cases.length === 0 && r2.rejected.some((r) => r.index === -1)) return { ...g1, prompt_hash, calls: 2, repair: { ...info, outcome: "malformed", note: `the repair reply was unreadable (${r2.rejected[0].reason}); the first-round result is kept` } };
  const fixed = r2.cases.map((c): GenCase => ({ ...c, repaired: true }));
  const taken = new Set([...fixed.map((c) => c.id.split(".").slice(1).join(".")), ...r2.rejected.map((r) => r.id)]);
  const cases = [...g1.cases, ...fixed];
  const rejected = [...g1.rejected.filter((r) => !(r.id && taken.has(r.id))), ...r2.rejected.map((r): Rejection => ({ ...r, round: 2 }))];
  return { cases, rejected, gaps: coverageGaps(scenario, cases), refused: null, prompt_hash, calls: 2, repair: { ...info, rescued: fixed.length } };
}

// ---- checking an expectation against an actual result (used by the pilot comparison, see docs) -------------

const dig = (root: unknown, path: string): unknown => path.split(".").reduce<unknown>((o, k) => (Array.isArray(o) ? o[Number(k)] : isObj(o) ? o[k] : undefined), root);

/** The reasons the actual task result does not meet the expectation; empty when it does. Pure. */
export function checkExpectation(e: Expectation, r: { ok: boolean; output: Record<string, unknown>; refused?: string; escalate?: string; needs_human?: boolean }): string[] {
  const root = { ok: r.ok, refused: r.refused ?? null, escalate: r.escalate ?? null, needs_human: r.needs_human ?? false, output: r.output };
  const out: string[] = [];
  if (e.outcome === "refuse" && r.ok !== false) out.push("expected a refusal");
  if (e.outcome === "produce" && r.ok === false) out.push("expected a result, got a refusal");
  if (e.outcome === "escalate" && !r.escalate) out.push("expected an escalation");
  for (const a of e.assertions) {
    const got = dig(root, a.path);
    const ok = a.op === "eq" ? got === a.value : a.op === "ne" ? got !== a.value : a.op === "true" ? got === true : a.op === "false" ? got === false : a.op === "null" ? got === null || got === undefined
      : a.op === "contains" ? (typeof got === "string" ? got.includes(String(a.value)) : Array.isArray(got) && got.some((x) => (typeof x === "string" ? x.includes(String(a.value)) : x === a.value)))
      : typeof got === "number" && typeof a.value === "number" && (a.op === "gte" ? got >= a.value : got <= a.value);
    if (!ok) out.push(`${a.path} ${a.op}${a.value === undefined ? "" : ` ${JSON.stringify(a.value)}`}: got ${JSON.stringify(got) ?? "nothing"}`);
  }
  return out;
}

// ---- the proposal log (hash-chained, append-only; supabase/un-testgen.sql) --------------------------------

/** "generated": one generator run (cases, rejections, gaps, model, prompt hash). "rejected": a person turned one case
 * down. "ruled" is reserved for the pilot comparison (docs/un-testgen-design.md); nothing writes it yet. A case is
 * accepted by adding it to the test set (test-sets.ts), which names the person there; acceptance is read from the
 * test set, so the two logs cannot disagree. */
export type GenKind = "generated" | "rejected" | "ruled";
export type GenEntry = ChainEntry<GenKind>;
export const appendGen = (prev: GenEntry | null, kind: GenKind, actor: string, payload: Record<string, unknown>, at: string): GenEntry => appendEntry<GenKind>(prev, kind, actor, payload, at);
export const verifyGen = (entries: GenEntry[]) => verifyChain(entries);

/** A database error in words a person can act on: a missing table means supabase/un-testgen.sql is not applied. */
export function describeStoreError(message: string): string {
  return /does not exist|schema cache|could not find the table|undefined_table/i.test(message)
    ? "The proposal log table (un_testgen_log) does not exist. Apply supabase/un-testgen.sql to the database."
    : message;
}

/** Generation is a slow, paid model call, so a profile cannot start one within this many ms of the last run. */
export const GEN_COOLDOWN_MS = 15_000;
/** Milliseconds a new run must still wait, from the last logged run (0 when it may start). Pure. */
export function cooldownLeft(runs: { at: string }[], now: number, cooldown = GEN_COOLDOWN_MS): number {
  const last = runs[runs.length - 1];
  const at = last ? Date.parse(last.at) : NaN;
  return Number.isFinite(at) ? Math.max(0, at + cooldown - now) : 0;
}

/** The two table operations, over a minimal client so tests run on the offline store and the app on Supabase (the
 * pattern of outside-queue.ts). The columns are those of supabase/un-testgen.sql, checked by un-store-columns.test.ts. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (t: string) => any };
export async function loadGenLogFrom(db: Db, orgId: string, useCaseId: string, profile: string): Promise<GenEntry[]> {
  const { data, error } = await db.from("un_testgen_log").select("*").eq("org_id", orgId).eq("use_case_id", useCaseId).eq("profile", profile);
  // an unapplied migration must say so, not look like "no proposals yet"
  if (error) throw new Error(describeStoreError(String(error.message ?? error)));
  return ((data ?? []) as Record<string, unknown>[])
    .map((r) => ({ seq: Number(r.seq), kind: r.kind, at: new Date(String(r.at)).toISOString(), actor: String(r.actor), payload: r.payload, prev_hash: String(r.prev_hash), hash: String(r.hash) }) as GenEntry)
    .sort((a, b) => a.seq - b.seq);
}
/** Returns an error message, or null. A clash on (use case, profile, seq) means someone else wrote first. */
export async function appendGenLogTo(db: Db, orgId: string, useCaseId: string, profile: string, entry: GenEntry): Promise<string | null> {
  const { error } = await db.from("un_testgen_log").insert({ org_id: orgId, use_case_id: useCaseId, profile, seq: entry.seq, kind: entry.kind, at: entry.at, actor: entry.actor, payload: entry.payload, prev_hash: entry.prev_hash, hash: entry.hash });
  return (error?.message as string | undefined) ?? null;
}

export const slotOf = (caseId: string) => `gen:${caseId}`;

export interface Proposal { case: GenCase; status: "proposed" | "accepted" | "rejected"; reject_reason?: string; by?: string; at: string }
export interface GenState { proposals: Proposal[]; runs: { at: string; by: string; model: string; cases: number; rejected: Rejection[]; gaps: CoverageGap[]; refused: string | null; prompt_hash: string; scenario_id: string; /** model calls of the run; absent on old entries */ calls?: number; /** the repair pass; absent on old entries and when no repair was needed */ repair?: RepairInfo | null }[] }

/** Replays the log; `blueprints` (the current test set) says which proposals were accepted. */
export function replayGen(entries: GenEntry[], blueprints: Blueprint[]): GenState {
  const s: GenState = { proposals: [], runs: [] };
  for (const e of entries) {
    const p = e.payload;
    if (e.kind === "generated") {
      const cases = Array.isArray(p.cases) ? (p.cases as GenCase[]) : [];
      for (const c of cases) if (!s.proposals.some((x) => x.case.id === c.id)) s.proposals.push({ case: c, status: "proposed", by: e.actor, at: e.at });
      s.runs.push({ at: e.at, by: e.actor, model: String(p.model ?? ""), cases: cases.length, rejected: (p.rejected as Rejection[]) ?? [], gaps: (p.gaps as CoverageGap[]) ?? [], refused: typeof p.refused === "string" ? p.refused : null, prompt_hash: String(p.prompt_hash ?? ""), scenario_id: String(p.scenario_id ?? ""), ...(typeof p.calls === "number" ? { calls: p.calls } : {}), repair: isObj(p.repair) ? (p.repair as unknown as RepairInfo) : null });
    } else if (e.kind === "rejected") {
      const x = s.proposals.find((q) => q.case.id === p.case_id);
      if (x) { x.status = "rejected"; x.reject_reason = typeof p.reason === "string" ? p.reason : ""; x.by = e.actor; x.at = e.at; }
    }
  }
  for (const x of s.proposals) if (x.status === "proposed" && blueprints.some((b) => b.slot === slotOf(x.case.id))) x.status = "accepted";
  return s;
}

/** The test-set blueprint an accepted case becomes. Its task is null on purpose: the pilot binds a task's tests to the
 * hand-written cases of that task, so a task here would add duplicate runs of the old cases and inflate the sample.
 * With no task the pilot lists it as "not executed" until the comparison is built (docs/un-testgen-design.md). */
export function blueprintOf(c: GenCase): { title: string; family: Family; task: null; slot: string; expect: { kind: "rubric" | "exact"; text: string }[]; gates: string[]; source: string[] } {
  return {
    title: `[generated ${c.model}] ${c.title}`.slice(0, 200),
    family: c.family,
    task: null,
    slot: slotOf(c.id),
    expect: [{ kind: "rubric", text: c.expect.summary.slice(0, 600) }, ...c.expect.assertions.map((a) => ({ kind: "exact" as const, text: `${a.path} ${a.op}${a.value === undefined ? "" : ` ${JSON.stringify(a.value)}`}`.slice(0, 600) }))],
    gates: c.gates,
    source: c.citations,
  };
}
