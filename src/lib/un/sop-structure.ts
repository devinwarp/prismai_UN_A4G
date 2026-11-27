import { MAX_PROFILES, MAX_TASKS } from "./sop/custom-limits.ts";

// SOP structuring. A loosely written SOP cannot yield job profiles and skills with the rules the upload uses (see docs/sop-structure-and-skill-derivation-analysis.md),
// so a model DRAFTS a structured version of it and a person reviews, edits and approves it, like the targets draft. Pure: the model call, the log and the routes
// are in sop-structure-agent.ts, sop-structure-store.ts and the sop-structure route.
//
// The shape follows the process-doc skill's SOP template (purpose, scope, a RACI per step, detailed steps with who / when / how / output, exceptions, metrics) and
// the Prism task format the knowledge base chunker already reads (### T01. Title with a **Job profile:** line), so the approved result is rendered as ordinary
// Prism Markdown and everything downstream (job profiles, chunks, skills, tests, pilot) works on it unchanged.
//
// The model may only restate what the source says. Anything the source does not say is NOT_STATED, which the review screen shows as a gap, never a guess. Code checks
// the draft against the source (quotes, figures, coverage) so a person can see what to look at.

export const NOT_STATED = "Not stated in the source.";
export const STRUCTURED_MARK = "Prism SOP structuring";

export interface StructRole { name: string; purpose: string; works_with: string[]; may: string[]; may_not: string[]; human_only: string[]; skills: string }
export interface StructTask {
  id: string; title: string;
  /** Responsible: exactly one job profile does the task. */
  role: string;
  /** RACI: who owns the outcome, who is asked, who is told. Names of people or roles, as the source gives them. */
  accountable: string; consulted: string[]; informed: string[];
  starts_when: string; inputs: string; steps: string[]; output: string; problems: string;
  /** The systems, tools or records the source says the role uses in this task (a payroll system, a registry). They decide which tools the role needs. */
  systems: string[];
  /** A verbatim excerpt of the source that supports this task. */
  quote: string;
}
export interface StructException { scenario: string; handled_by: string; escalate_to: string; what_to_do: string }
export interface StructMetric { metric: string; target: string; how: string }
export interface StructuredSop {
  title: string; owner: string; review_cadence: string; purpose: string; scope: string;
  roles: StructRole[]; tasks: StructTask[]; controls: string[]; exceptions: StructException[]; metrics: StructMetric[];
  /** Systems the source names (a recruitment system, a registry). Not tools: see skill compile. */
  systems: string[];
}

// ---- the prompt ----------------------------------------------------------------------------------------------

export const STRUCTURE_SYSTEM = [
  "You are an SOP writer who turns a loosely written procedure into a structured standard operating procedure, the way a careful process documenter would: purpose, scope, who is responsible, accountable, consulted and informed for each step, detailed steps (who, when, how, output), exceptions and edge cases, controls and metrics.",
  "Use ONLY what the source says. Do not add steps, people, figures, dates, systems, limits or rules. Where the source does not say something, write exactly \"Not stated in the source.\" for a text field, or an empty list for a list. Never fill a gap with what is usual or sensible.",
  "Job profiles are the staff roles that do the work. Use the source's own names, one canonical name per role (do not make \"Panel\" and \"Panel chair\" two roles; do not include the people the service is for, such as applicants, citizens or customers, and do not make the requester of the work a role). Role names have no full stops.",
  "Each task is done by exactly ONE role (responsible). If a step is done by two roles, make two tasks. Number tasks T01, T02, ... in the order of the source. Keep every step of the source: do not drop or merge away a step.",
  "Each task carries `quote`: one verbatim excerpt (at most 250 characters) copied exactly from the source that supports it. For authority, a role's `may`, `may_not` and `human_only` lists hold only what the source says the role may do, may not do, or that only a named person may decide.",
  "For each task, `systems` lists the systems, tools or records the source says the role uses to do it (for example a payroll system); leave it empty if none is named. A role is responsible for its tasks: that is what it is there to do.","Put every rule that applies to all work in `controls`. Put \"if X happens, who handles it and who it goes to\" in `exceptions`. Put measures and targets the source states in `metrics`. List systems, tools or records the source names in `systems`.",
  "Answer with one JSON object and nothing else, with exactly this shape:",
  '{"title":"","owner":"","review_cadence":"","purpose":"","scope":"","roles":[{"name":"","purpose":"","works_with":[""],"may":[""],"may_not":[""],"human_only":[""],"skills":""}],"tasks":[{"id":"T01","title":"","role":"","accountable":"","consulted":[""],"informed":[""],"starts_when":"","inputs":"","steps":[""],"output":"","problems":"","systems":[""],"quote":""}],"controls":[""],"exceptions":[{"scenario":"","handled_by":"","escalate_to":"","what_to_do":""}],"metrics":[{"metric":"","target":"","how":""}],"systems":[""]}',
].join(" ");

export const structurePrompt = (source: string, title?: string) => [title ? `Title given by the uploader: ${title}` : null, "SOURCE (the procedure to structure):", source].filter(Boolean).join("\n");

// ---- reading a model's answer --------------------------------------------------------------------------------

const MAX = { name: 80, short: 300, long: 1200, item: 300, list: 40 };
const str = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");
const text = (v: unknown, n: number) => str(v, n) || NOT_STATED;
const list = (v: unknown, n = MAX.item) => (Array.isArray(v) ? v.map((x) => str(x, n)).filter((x) => x && x !== NOT_STATED).slice(0, MAX.list) : []);
/** A name as the SOP will carry it: one line, no full stops (the Prism task format ends a profile name at one), and no case-only variants. */
export const cleanName = (v: unknown) => str(v, MAX.name).replace(/\./g, "").trim();

/** The model's reply as a StructuredSop, or why it is not one. Reads leniently (types are coerced, lengths clipped) and never trusts ids or links. */
export function parseStructured(reply: unknown): { ok: true; model: StructuredSop } | { ok: false; error: string } {
  const o = typeof reply === "string" ? (() => { try { return JSON.parse(reply); } catch { return null; } })() : reply;
  if (!o || typeof o !== "object" || Array.isArray(o)) return { ok: false, error: "The model's answer was not a JSON object." };
  const r = o as Record<string, unknown>;
  if (!Array.isArray(r.roles) || !Array.isArray(r.tasks)) return { ok: false, error: "The model's answer has no roles or no tasks." };
  const roles: StructRole[] = (r.roles as unknown[]).slice(0, MAX_PROFILES + 5).map((x) => {
    const q = (x ?? {}) as Record<string, unknown>;
    return { name: cleanName(q.name), purpose: text(q.purpose, MAX.short), works_with: list(q.works_with), may: list(q.may), may_not: list(q.may_not), human_only: list(q.human_only), skills: text(q.skills, MAX.short) };
  }).filter((x) => x.name);
  const tasks: StructTask[] = (r.tasks as unknown[]).slice(0, MAX_TASKS * MAX_PROFILES).map((x, i) => {
    const q = (x ?? {}) as Record<string, unknown>;
    return {
      id: str(q.id, 8).toUpperCase() || `T${String(i + 1).padStart(2, "0")}`, title: str(q.title, 200), role: cleanName(q.role),
      accountable: text(q.accountable, MAX.name), consulted: list(q.consulted, MAX.name), informed: list(q.informed, MAX.name),
      starts_when: text(q.starts_when, MAX.short), inputs: text(q.inputs, MAX.short), steps: list(q.steps, MAX.item), output: text(q.output, MAX.short), problems: text(q.problems, MAX.short),
      systems: list(q.systems, MAX.name), quote: str(q.quote, 400),
    };
  }).filter((x) => x.title);
  const exceptions: StructException[] = (Array.isArray(r.exceptions) ? (r.exceptions as unknown[]) : []).slice(0, MAX.list).map((x) => {
    const q = (x ?? {}) as Record<string, unknown>;
    return { scenario: str(q.scenario, MAX.item), handled_by: text(q.handled_by, MAX.name), escalate_to: text(q.escalate_to, MAX.name), what_to_do: text(q.what_to_do, MAX.short) };
  }).filter((x) => x.scenario);
  const metrics: StructMetric[] = (Array.isArray(r.metrics) ? (r.metrics as unknown[]) : []).slice(0, MAX.list).map((x) => {
    const q = (x ?? {}) as Record<string, unknown>;
    return { metric: str(q.metric, MAX.item), target: text(q.target, MAX.name), how: text(q.how, MAX.short) };
  }).filter((x) => x.metric);
  return { ok: true, model: {
    title: str(r.title, 120), owner: text(r.owner, MAX.name), review_cadence: text(r.review_cadence, MAX.name), purpose: text(r.purpose, MAX.long), scope: text(r.scope, MAX.long),
    roles, tasks, controls: list(r.controls), exceptions, metrics, systems: list(r.systems, MAX.name),
  } };
}

/** Task ids in source order (T01, T02, ...), and every task's role name matched to a role case-insensitively. A fix a person would also make, so it is not an "error". */
export function tidy(m: StructuredSop): StructuredSop {
  const byLower = new Map(m.roles.map((x) => [x.name.toLowerCase(), x.name]));
  return { ...m, tasks: m.tasks.map((t, i) => ({ ...t, id: `T${String(i + 1).padStart(2, "0")}`, role: byLower.get(t.role.toLowerCase()) ?? t.role })) };
}

// ---- checks against the source --------------------------------------------------------------------------------

export interface Issue { code: string; where: string; message: string }
export interface Checks {
  /** Block approval: the structure would not give job profiles and skills. */
  errors: Issue[];
  /** A person should look: something in the draft is not backed by the source. */
  warnings: Issue[];
  /** Things the source does not say, left as gaps. Not errors: a person fills them in or leaves them. */
  gaps: Issue[];
  coverage: { covered: number; total: number; uncovered: string[] };
  /** Numbers in the draft that are not in the source. */
  new_figures: string[];
}

const norm = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();
const words = (s: string) => new Set(norm(s).split(/[^a-z0-9؀-ۿ]+/).filter((w) => w.length >= 4));
const figures = (s: string) => new Set((s.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(/,/g, "")));

/** The statements of a source: list items, table rows and sentences long enough to be a step, headings and table rules left out. */
export function statementsOf(source: string): string[] {
  const out: string[] = [];
  for (const raw of source.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line || /^#{1,6}\s/.test(line) || /^\|?\s*:?-{3,}/.test(line)) continue;
    const body = line.replace(/^(\d+[.)]|[-*•]|\|)\s*/, "").replace(/\|/g, " ");
    for (const s of body.split(/(?<=[.!?])\s+/)) if (s.trim().split(/\s+/).length >= 6) out.push(s.trim());
  }
  return out;
}

export function checkStructured(m: StructuredSop, source: string): Checks {
  const errors: Issue[] = [], warnings: Issue[] = [], gaps: Issue[] = [];
  const e = (code: string, where: string, message: string) => errors.push({ code, where, message });
  const w = (code: string, where: string, message: string) => warnings.push({ code, where, message });
  const g = (where: string, message: string) => gaps.push({ code: "not_stated", where, message });
  const src = norm(source);

  if (!m.roles.length) e("no_roles", "roles", "The structure has no job profiles.");
  if (!m.tasks.length) e("no_tasks", "tasks", "The structure has no tasks.");
  if (m.roles.length > MAX_PROFILES) e("too_many_roles", "roles", `At most ${MAX_PROFILES} job profiles.`);
  const seen = new Map<string, string>();
  for (const r of m.roles) {
    const k = r.name.toLowerCase();
    if (seen.has(k)) e("duplicate_role", r.name, `The job profile "${r.name}" appears twice.`);
    seen.set(k, r.name);
    if (r.name.length < 2) e("role_name", r.name, "A job profile name is 2 to 80 characters.");
    if (!m.tasks.some((t) => t.role.toLowerCase() === k)) w("role_without_tasks", r.name, `"${r.name}" has no tasks: it will not become a job profile.`);
    if (!norm(r.name).split(" ").some((x) => x.length >= 4 && src.includes(x))) w("role_not_in_source", r.name, `The name "${r.name}" does not appear in the source.`);
    if (!r.may.length && !r.may_not.length) g(`${r.name} · authority`, "The source does not say what this job profile may or may not do beyond its tasks: its authority is the tasks it is responsible for, and nothing else.");
    if (!r.human_only.length) g(`${r.name} · human-only decisions`, "No decision is stated as reserved for a named person.");
    if (r.purpose === NOT_STATED) g(`${r.name} · purpose`, "The purpose of this job profile is not stated.");
  }
  const ids = new Set<string>();
  const perRole = new Map<string, number>();
  for (const t of m.tasks) {
    if (ids.has(t.id)) e("duplicate_task", t.id, `Task id ${t.id} is used twice.`);
    ids.add(t.id);
    if (!/^T\d{2,3}$/.test(t.id)) e("task_id", t.id, `Task id ${t.id} must look like T01.`);
    if (!seen.has(t.role.toLowerCase())) e("task_role", t.id, `${t.id} is assigned to "${t.role || "nobody"}", which is not one of the job profiles. Give it exactly one.`);
    else perRole.set(t.role.toLowerCase(), (perRole.get(t.role.toLowerCase()) ?? 0) + 1);
    if (!t.steps.length) e("task_steps", t.id, `${t.id} has no steps.`);
    if ((perRole.get(t.role.toLowerCase()) ?? 0) > MAX_TASKS) e("too_many_tasks", t.role, `At most ${MAX_TASKS} tasks in a job profile.`);
    if (renderTask(t).length > 1500) e("task_too_long", t.id, `${t.id} is too long to be one passage of the knowledge base: split it into two tasks.`);
    if (!t.quote) w("no_quote", t.id, `${t.id} has no quotation from the source to check it against.`);
    else if (!src.includes(norm(t.quote))) w("quote_not_found", t.id, `The quotation for ${t.id} is not word for word in the source: check the task against the source.`);
    for (const f of ["starts_when", "inputs", "output", "problems"] as const) if (t[f] === NOT_STATED) g(`${t.id} · ${f.replace("_", " ")}`, "Not stated in the source.");
    if (t.accountable === NOT_STATED) g(`${t.id} · accountable`, "Who is accountable for this task is not stated.");
  }
  if (!m.controls.length) g("controls", "The source states no rule that applies to all work.");
  if (!m.exceptions.length) g("exceptions", "The source states no exception or escalation.");
  for (const x of m.exceptions) {
    if (x.handled_by !== NOT_STATED && !seen.has(x.handled_by.toLowerCase()) && !src.includes(norm(x.handled_by))) w("exception_actor", x.scenario, `"${x.handled_by}" in an exception is neither a job profile nor in the source.`);
    if (x.escalate_to === NOT_STATED) g(`exception · ${x.scenario.slice(0, 40)}`, "Where this goes is not stated.");
  }

  // figures in the draft that the source does not contain (a number the model made up, or a section number it numbered itself)
  const known = figures(source);
  const draftText = [m.purpose, m.scope, ...m.controls, ...m.tasks.flatMap((t) => [t.starts_when, t.inputs, ...t.steps, t.output, t.problems]), ...m.exceptions.flatMap((x) => [x.what_to_do]), ...m.metrics.flatMap((x) => [x.target])].join(" ");
  const new_figures = [...figures(draftText)].filter((n) => !known.has(n));
  if (new_figures.length) w("new_figures", "figures", `These figures are in the draft but not in the source: ${new_figures.slice(0, 12).join(", ")}.`);

  // coverage: every statement of the source should be carried by some task, control or exception, or it was dropped
  const carried = [...m.tasks.flatMap((t) => [t.title, t.starts_when, t.inputs, ...t.steps, t.output, t.problems, t.quote]), ...m.controls, ...m.exceptions.flatMap((x) => [x.scenario, x.what_to_do, x.handled_by, x.escalate_to]), m.purpose, m.scope, ...m.metrics.map((x) => `${x.metric} ${x.target}`), ...m.roles.flatMap((r) => [r.purpose, ...r.may, ...r.may_not, ...r.human_only])].filter((x) => x && x !== NOT_STATED);
  // a statement is carried when ONE item of the draft shares at least half of its words (pooling every word of the draft would let unrelated items cover it)
  const items = carried.map((c) => words(c));
  const sts = statementsOf(source);
  const uncovered = sts.filter((s) => { const ws = [...words(s)]; return ws.length >= 3 && !items.some((it) => ws.filter((x) => it.has(x)).length / ws.length >= 0.5); });
  if (uncovered.length) w("uncovered", "coverage", `${uncovered.length} statement(s) of the source are not carried by any task, rule or exception: nothing may be dropped silently.`);
  return { errors, warnings, gaps, coverage: { covered: sts.length - uncovered.length, total: sts.length, uncovered: uncovered.slice(0, 15) }, new_figures };
}

export const canApprove = (c: Checks) => c.errors.length === 0;

// ---- rendering: the canonical Prism SOP ----------------------------------------------------------------------

const bullets = (items: string[], indent = "  ") => (items.length ? items.map((x) => `${indent}- ${x}`).join("\n") : `${indent}- ${NOT_STATED}`);
const inline = (items: string[]) => (items.length ? items.join(", ") : NOT_STATED);
const cell = (s: string) => s.replace(/\|/g, "/").replace(/\n/g, " ");

export function renderTask(t: StructTask): string {
  return [
    `### ${t.id}. ${t.title}`,
    `- **Job profile:** ${t.role}.`,
    `- **Accountable:** ${t.accountable}`,
    `- **Consulted:** ${inline(t.consulted)}`,
    `- **Informed:** ${inline(t.informed)}`,
    `- **Starts when:** ${t.starts_when}`,
    `- **Inputs:** ${t.inputs}`,
    "- **Steps:**",
    ...t.steps.map((s, i) => `  ${i + 1}. ${s}`),
    `- **Output:** ${t.output}`,
    `- **Problems:** ${t.problems}`,
    `- **Systems used:** ${t.systems.length ? t.systems.join(", ") : "None named"}`,
    ...(t.quote ? [`- **Source:** "${t.quote.slice(0, 200)}"`] : []),
  ].join("\n");
}

export interface RenderMeta { sopId: string; useCase: string; version: string }

/** The approved structure as Prism Markdown: the layout the chunker and the skill compiler read. `structured by` marks it as one the compiler may read as data. */
export function renderCanonical(m: StructuredSop, meta: RenderMeta, tools: unknown): string {
  const roles = m.roles.filter((r) => m.tasks.some((t) => t.role.toLowerCase() === r.name.toLowerCase()));
  return [
    `# ${m.title || meta.sopId}`,
    "",
    "| Field | Value |",
    "|---|---|",
    `| Document id | ${meta.sopId} |`,
    `| Version | ${meta.version} |`,
    `| Owner | ${cell(m.owner)} |`,
    `| Review cycle | ${cell(m.review_cadence)} |`,
    `| Related use case | ${meta.useCase} |`,
    `| Structured by | ${STRUCTURED_MARK}, reviewed and approved by a person |`,
    "",
    "## 1. Purpose",
    "",
    m.purpose,
    "",
    "## 2. Scope",
    "",
    m.scope,
    "",
    "## 3. Roles",
    "",
    `${roles.length} job profiles carry out this procedure.`,
    "",
    ...roles.flatMap((r, i) => [
      `### 3.${i + 1} ${r.name}`,
      `- **Purpose:** ${r.purpose}`,
      `- **Works with:** ${inline(r.works_with)}`,
      "- **Authority, may:**", bullets(r.may),
      "- **Authority, may not:**", bullets(r.may_not),
      "- **Human only (a named person decides):**", bullets(r.human_only),
      `- **Skills:** ${r.skills}`,
      "",
    ]),
    "## 4. Procedure and who is responsible, accountable, consulted and informed",
    "",
    "| Task | Step | Responsible | Accountable | Consulted | Informed |",
    "|---|---|---|---|---|---|",
    ...m.tasks.map((t) => `| ${t.id} | ${cell(t.title)} | ${cell(t.role)} | ${cell(t.accountable)} | ${cell(inline(t.consulted))} | ${cell(inline(t.informed))} |`),
    "",
    "## 7. Controls",
    "",
    ...(m.controls.length ? m.controls.map((c, i) => `${i + 1}. ${c}`) : [NOT_STATED]),
    "",
    "## 8. Exceptions and escalation",
    "",
    "| Situation | Handled by | Escalate to | What to do |",
    "|---|---|---|---|",
    ...(m.exceptions.length ? m.exceptions.map((x) => `| ${cell(x.scenario)} | ${cell(x.handled_by)} | ${cell(x.escalate_to)} | ${cell(x.what_to_do)} |`) : [`| ${NOT_STATED} | | | |`]),
    "",
    "## 9. Metrics",
    "",
    "| Metric | Target | How to measure |",
    "|---|---|---|",
    ...(m.metrics.length ? m.metrics.map((x) => `| ${cell(x.metric)} | ${cell(x.target)} | ${cell(x.how)} |`) : [`| ${NOT_STATED} | | |`]),
    "",
    "## 11. Detailed description of each task",
    "",
    "Each entry gives the job profile, who is accountable, consulted and informed, when the task starts, what goes in, the steps, what comes out, and where a problem goes.",
    "",
    ...m.tasks.flatMap((t) => [renderTask(t), ""]),
    "## 14. Systems and tools",
    "",
    "### K1. Tool allow-list",
    "",
    "The only tools the agent may call. Everything else is denied. The systems the procedure names are listed below; a system becomes a tool only when the entity registers an integration for it.",
    "",
    "```json",
    JSON.stringify(tools, null, 2),
    "```",
    "",
    "### K2. Systems named in the source",
    "",
    ...(m.systems.length ? m.systems.map((s) => `- ${s}`) : [`- ${NOT_STATED}`]),
    "",
  ].join("\n");
}

// ---- the log of drafts and approvals -----------------------------------------------------------------------

export type StructEntry =
  | { seq: number; at: string; actor: string; kind: "drafted"; payload: { source: string; title: string; model: StructuredSop; checks: Checks; llm: string; usage?: unknown; attempt: number } }
  | { seq: number; at: string; actor: string; kind: "edited"; payload: { model: StructuredSop; checks: Checks } }
  | { seq: number; at: string; actor: string; kind: "approved"; payload: { model: StructuredSop; source_sha256: string; canonical_sha256: string; sop_id: string; version: number; review: unknown } }
  | { seq: number; at: string; actor: string; kind: "withdrawn"; payload: { reason: string } };

export interface StructState {
  /** The draft a person is reviewing: the last drafted or edited entry, until it is approved or withdrawn. */
  pending: { source: string; title: string; model: StructuredSop; checks: Checks; by: string; at: string; llm: string } | null;
  approved: { model: StructuredSop; by: string; at: string; sop_id: string; version: number; source_sha256: string; canonical_sha256: string; review: unknown } | null;
  entries: number;
}

export function replayStructure(entries: StructEntry[]): StructState {
  let pending = null as StructState["pending"];
  let approved = null as StructState["approved"];
  for (const x of [...entries].sort((a, b) => a.seq - b.seq)) {
    if (x.kind === "drafted") pending = { source: x.payload.source, title: x.payload.title, model: x.payload.model, checks: x.payload.checks, by: x.actor, at: x.at, llm: x.payload.llm };
    else if (x.kind === "edited" && pending) pending = { ...pending, model: x.payload.model, checks: x.payload.checks };
    else if (x.kind === "approved") { approved = { model: x.payload.model, by: x.actor, at: x.at, sop_id: x.payload.sop_id, version: x.payload.version, source_sha256: x.payload.source_sha256, canonical_sha256: x.payload.canonical_sha256, review: x.payload.review }; pending = null; }
    else if (x.kind === "withdrawn") pending = null;
  }
  return { pending, approved, entries: entries.length };
}
