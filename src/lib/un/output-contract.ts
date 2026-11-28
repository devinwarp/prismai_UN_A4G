// The OUTPUT CONTRACT of an SOP task: what the agent's result looks like, set once and used by everyone who touches that result.
//
// Before this there was none for an SOP-derived task. The runner fixed the envelope (ok, refused, escalate, needs_human, output{answer, facts}, citations), but what
// went INSIDE `facts` was defined nowhere: the skill said "Output: a status and reason", the test generator invented key names (`status`, `relevant_experience_years`)
// to assert on, and the tuner, which cannot see the assertions, rewrote format rules every round. Now the contract is derived from the SOP's own text for the task,
// written into the skill (so the agent is told), handed to the test generator (so tests assert only on it), and checked by the runner (so a bad reply says why).
//
// The convention is the system's, the same for every SOP, not invented per task or per run:
//   output.answer           text: the result and its reason, beginning with the decision when the task has one
//   output.facts.decision   only for a task whose SOP text lists its outcomes ("meets", "does not meet" or "query"): exactly one of them
//   nothing else in output.facts is defined, so nothing else is asserted on
// Pure: no I/O.

export interface OutputContract {
  task: string;
  /** What the SOP says the task produces ("a status and reason for every application"), or "" when it says nothing. */
  output: string;
  /** The outcomes the SOP lists for the task, in the order it lists them, or null when the task has no such list. */
  decision: string[] | null;
}

const QUOTE = `["“]([^"“”]{1,40})["”]`;
// two or more quoted outcomes joined only by commas, "or", "and" or "/": `"meets", "does not meet" or "query"`
const LIST = new RegExp(`(?:${QUOTE}\\s*(?:,|\\bor\\b|\\band\\b|/)\\s*)+${QUOTE}`, "g");

/** The line of a task's text for a field, such as "Output" or "Steps" (the text after the label, on the same line). */
const field = (body: string, label: string) => new RegExp(`\\*\\*${label}:\\*\\*[ \\t]*([^\\n]*)`).exec(body)?.[1]?.trim() ?? "";

/** The outcomes a task lists. Read only from its Steps and Output, never from Starts when or Problems: "an application is marked "meets"" starts a task and is not
 * one of its outcomes, and a Problems line such as `"query", never "does not meet"` is a rule about two of them, not their list. */
function outcomesOf(body: string): string[] | null {
  const steps = body.split("\n");
  const at = steps.findIndex((l) => /\*\*Steps:\*\*/.test(l));
  const stepLines: string[] = [];
  if (at >= 0) {
    stepLines.push(steps[at].replace(/^.*\*\*Steps:\*\*/, ""));
    for (let i = at + 1; i < steps.length && !/^\s*-\s+\*\*/.test(steps[i]); i++) stepLines.push(steps[i]);
  }
  for (const text of [...stepLines, field(body, "Output")]) {
    for (const m of text.matchAll(LIST)) {
      const values = [...m[0].matchAll(new RegExp(QUOTE, "g"))].map((q) => q[1].trim()).filter(Boolean);
      const unique = [...new Set(values)];
      if (unique.length >= 2) return unique;
    }
  }
  return null;
}

/** The contract of one task, from the text of its passage in the SOP's knowledge base. */
export function contractOf(task: string, body: string): OutputContract {
  const out = field(body, "Output");
  return { task, output: /^not stated/i.test(out) ? "" : out.replace(/\.$/, ""), decision: outcomesOf(body) };
}

const list = (values: string[]) => values.map((v) => `"${v}"`).join(" | ");

/** The line the skill carries under the task: what the agent must return. */
export function contractLines(c: OutputContract): string[] {
  return [
    `- **Result format:** put the result and its reason in \`output.answer\`${c.decision ? ", beginning with the decision" : ""}.${c.decision ? ` Put the decision in \`output.facts.decision\`, exactly one of ${list(c.decision)}.` : ""} Cite the SOP passages you relied on in \`citations\`. Put any other detail in the answer text: no other key in \`output.facts\` is defined, so do not add one.`,
  ];
}

/** What the test generator and the runner are told about the task's result. */
export function contractPrompt(c: OutputContract): string {
  return [
    `Task ${c.task}${c.output ? ` produces: ${c.output}` : ""}.`,
    "Result fields: output.answer (text: the result and its reason" + (c.decision ? ", beginning with the decision" : "") + ")",
    ...(c.decision ? [`output.facts.decision (text, exactly one of ${list(c.decision)})`] : []),
    "No other key of output.facts is defined: do not assert on one.",
  ].join(" ");
}

/** The assertion paths a test of this task may use: the envelope, the answer, and the decision when the task has one. `output.status` is the pre-inference block of an authority test. */
export function allowedPaths(c: OutputContract): string[] {
  return ["ok", "refused", "escalate", "needs_human", "output.status", "output.answer", ...(c.decision ? ["output.facts.decision"] : [])];
}

/** Why an assertion of a test is outside the contract, or null. A path under `output.facts` other than the decision is a key nobody defined. */
export function assertionProblem(c: OutputContract, path: string, op: string, value: unknown): string | null {
  if (!allowedPaths(c).includes(path)) return `${path} is not part of the output contract of ${c.task}: assert only on ${allowedPaths(c).filter((p) => p !== "output.status").join(", ")}`;
  if (path === "output.facts.decision" && c.decision && (op === "eq" || op === "ne") && typeof value === "string" && !c.decision.some((d) => d.toLowerCase() === value.trim().toLowerCase())) {
    return `output.facts.decision can only be ${list(c.decision)}; "${value}" is not one of them`;
  }
  return null;
}

/** Does a successful reply follow the contract? Null when it does (or when the task has no decision list). A refused or escalated reply is not a result, so it is not checked. */
export function replyProblem(c: OutputContract, reply: { ok: boolean; output: Record<string, unknown> }): string | null {
  if (!reply.ok || !c.decision) return null;
  const facts = reply.output.facts && typeof reply.output.facts === "object" ? (reply.output.facts as Record<string, unknown>) : {};
  const got = facts.decision;
  if (typeof got !== "string") return `output.facts.decision is missing: it must be exactly one of ${list(c.decision)}`;
  if (!c.decision.some((d) => d.toLowerCase() === got.trim().toLowerCase())) return `output.facts.decision must be exactly one of ${list(c.decision)}, but it was "${got.slice(0, 60)}"`;
  return null;
}
