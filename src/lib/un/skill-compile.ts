import { createHash } from "node:crypto";
import { contractLines, contractOf, type OutputContract } from "./output-contract.ts";
import { ownedBy } from "./sop/owners.ts";
import type { SkillFile, SopChunk } from "./sop-kb.ts";

// The skill compiler. For an SOP that went through the structuring step (the approved structure rendered as Prism Markdown, marked "Structured by"), a job
// profile's skill is COMPILED from its parts rather than copied from whatever the chunks hold: identity, authority as data (may, may not, human-only), the
// profile's tasks, how to work, the output contract, what to do when unsure, language and disclosure, the TOOL ALLOW-LIST, controls, escalation and provenance,
// with a validation report. Every statement of the SOP is still the SOP's own words; the compiler adds only fixed operating rules, never SOP content.
// Pure. An SOP that was not structured keeps its existing skill (sop-kb skillFromChunks), so no existing skill, test or pilot hash changes.

export interface ToolSpec {
  name: string; purpose: string; input: string; output: string;
  /** read: looks something up. write: records something. send: sends something outside. */
  permission: "read" | "write" | "send";
  /** person: a person must release what the tool produces before it takes effect. */
  release: "none" | "person";
  /** The SOP line that justifies the tool, or why the platform provides it. */
  justified_by: string;
  /** false: the tool is needed (a task uses the system) but the entity has not registered an integration, so the agent cannot call it yet. Absent means callable. */
  callable?: boolean;
  /** The system a needs-integration tool stands for. */
  system?: string;
}
export interface ToolManifest { version: 1; tools: ToolSpec[] }

/** The tools every agent has: look up the SOP, ask a person about what the SOP does not cover, and hand back the answer. Read-only or released by a person. */
export const DEFAULT_TOOLS: ToolSpec[] = [
  { name: "search_sop", purpose: "Look up passages of this SOP's knowledge base", input: "a search query in the SOP's own words", output: "passages with their ids", permission: "read", release: "none", justified_by: "Platform: every agent retrieves and cites before it acts" },
  { name: "request_outside_information", purpose: "Ask a person about something the SOP does not cover", input: "the question and what was tried", output: "a request in the people queue", permission: "write", release: "person", justified_by: "Platform: the agent never answers outside the SOP from memory" },
  { name: "finish", purpose: "Return the answer for this task", input: "the answer, its citations and whether a person must review it", output: "the answer", permission: "read", release: "none", justified_by: "Platform: ends the task" },
];
export const defaultManifest = (): ToolManifest => ({ version: 1, tools: DEFAULT_TOOLS.map((t) => ({ ...t })) });

export type ToolDecision = { ok: true; tool: ToolSpec } | { ok: false; code: "not_listed" | "malformed" | "not_available"; reason: string };

/** The one gate every tool call passes: a call is allowed only when the tool is on the profile's manifest. Anything else is denied and the caller logs the denial. */
export function checkToolCall(manifest: ToolManifest, call: unknown): ToolDecision {
  const name = typeof call === "string" ? call : call && typeof call === "object" ? (call as { tool?: unknown; name?: unknown }).tool ?? (call as { name?: unknown }).name : undefined;
  if (typeof name !== "string" || !name.trim()) return { ok: false, code: "malformed", reason: "A tool call must name the tool." };
  const tool = manifest.tools.find((t) => t.name === name.trim());
  if (tool && tool.callable === false) return { ok: false, code: "not_available", reason: `The tool "${tool.name}" (${tool.system ?? "a system"}) is needed but the entity has not registered an integration for it, so it cannot be called yet.` };
  return tool ? { ok: true, tool } : { ok: false, code: "not_listed", reason: `The tool "${name.trim()}" is not on this job profile's allow-list (${manifest.tools.map((t) => t.name).join(", ")}).` };
}

/** The tool requests an agent's output carries (`output.tool_requests`), each checked against the manifest. */
export function checkToolRequests(manifest: ToolManifest, output: unknown): { requested: number; denied: { tool: string; reason: string }[] } {
  const reqs = output && typeof output === "object" ? (output as { tool_requests?: unknown }).tool_requests : undefined;
  if (reqs === undefined || reqs === null) return { requested: 0, denied: [] };
  const list = Array.isArray(reqs) ? reqs : [reqs];
  const denied: { tool: string; reason: string }[] = [];
  for (const r of list) {
    const d = checkToolCall(manifest, r);
    if (!d.ok) denied.push({ tool: typeof r === "string" ? r : String((r as { tool?: unknown })?.tool ?? "?"), reason: d.reason });
  }
  return { requested: list.length, denied };
}

const MANIFEST_OPEN = "<!-- tool-manifest";
/** The manifest a skill carries, or null for a skill without one. */
export function manifestOfSkill(markdown: string): ToolManifest | null {
  const m = new RegExp(`${MANIFEST_OPEN}\\n([\\s\\S]*?)\\n-->`).exec(markdown);
  if (!m) return null;
  try { const v = JSON.parse(m[1]) as ToolManifest; return v && Array.isArray(v.tools) ? v : null; } catch { return null; }
}

export function validateManifest(m: ToolManifest): string[] {
  const out: string[] = [];
  const names = new Set<string>();
  for (const t of m.tools) {
    if (!/^[a-z][a-z0-9_]{1,40}$/.test(t.name)) out.push(`The tool name "${t.name}" is not a plain lower-case name.`);
    if (names.has(t.name)) out.push(`The tool "${t.name}" is listed twice.`);
    names.add(t.name);
    if (!t.justified_by?.trim()) out.push(`The tool "${t.name}" has no justification.`);
    if ((t.permission === "write" || t.permission === "send") && t.release !== "person") out.push(`The tool "${t.name}" can ${t.permission} but a person does not release it.`);
  }
  if (!names.has("search_sop")) out.push('The tool "search_sop" is missing: the agent could not retrieve and cite.');
  if (!names.has("request_outside_information")) out.push('The tool "request_outside_information" is missing: the agent could not ask a person.');
  return out;
}

// ---- reading the structured SOP's chunks ------------------------------------------------------------------

const body = (c: SopChunk) => c.text.split("\n").slice(1).join("\n").trim();
const lastCrumb = (c: SopChunk) => (c.text.split("\n")[0].split(" | ").at(-1) ?? "").trim();
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const NS = "Not stated in the source.";

/** Was this SOP rendered from an approved structure, so the compiler may read it as data? */
export const isStructuredSop = (chunks: SopChunk[]): boolean => chunks.some((c) => /\|\s*Structured by\s*\|\s*Prism SOP structuring/.test(c.text));

function field(text: string, label: string): string {
  const m = new RegExp(`^- \\*\\*${label}:\\*\\*[ \\t]*(.*)$`, "m").exec(text);
  return (m?.[1] ?? "").trim();
}
function bulletsUnder(text: string, label: string): string[] {
  const lines = text.split("\n");
  const at = lines.findIndex((l) => l.startsWith(`- **${label}`));
  if (at < 0) return [];
  const out: string[] = [];
  for (const l of lines.slice(at + 1)) { const m = /^ {2}- (.+)$/.exec(l); if (m) out.push(m[1].trim()); else break; }
  return out.filter((x) => x !== NS);
}

export interface RoleData { name: string; purpose: string; works_with: string; may: string[]; may_not: string[]; human_only: string[]; skills: string }
export interface CompileReport { ok: boolean; errors: string[]; warnings: string[]; gaps: string[]; tasks: number; tools: string[]; /** Systems this job profile's tasks use that have no registered integration yet. */ needs_integration: string[] }
export type CompiledSkill = SkillFile & { sha256: string; manifest: ToolManifest; manifest_sha256: string; report: CompileReport; compiled: true };

/** Compile the skill of one job profile from the chunks of a structured SOP. Throws, like skillFromChunks, when the profile or its tasks are missing. */
export function compileSkill(sopId: string, profile: string, chunks: SopChunk[], extraTools: ToolSpec[] = [], contracts?: ReadonlyMap<string, OutputContract>): CompiledSkill {
  const want = profile.trim().toLowerCase();
  const roleChunk = chunks.find((c) => c.topics.includes("role") && lastCrumb(c).replace(/^\d+\.\d+\s+/, "").toLowerCase() === want);
  if (!roleChunk) throw new Error(`no job profile named "${profile}" in ${sopId}`);
  const tasks = chunks.filter((c) => c.topics.includes("task") && ownedBy(c.job_profile, profile, chunks.map((x) => x.job_profile ?? "").filter(Boolean)));
  if (!tasks.length) throw new Error(`job profile "${profile}" has no tasks in ${sopId}`);
  const pick = (t: string) => chunks.filter((c) => c.topics.includes(t));
  const first = chunks[0];
  const rb = body(roleChunk);
  const role: RoleData = { name: profile, purpose: field(rb, "Purpose"), works_with: field(rb, "Works with"), may: bulletsUnder(rb, "Authority, may"), may_not: bulletsUnder(rb, "Authority, may not"), human_only: bulletsUnder(rb, "Human only"), skills: field(rb, "Skills") };

  // the tool allow-list: the SOP's own K1 block (read, never trusted blindly), else the defaults; extra tools only from registered integrations
  const toolChunk = chunks.find((c) => c.chunk_id.endsWith("#K1"));
  let manifest = defaultManifest();
  const fence = toolChunk ? /```json\n([\s\S]*?)\n```/.exec(toolChunk.text)?.[1] : undefined;
  if (fence) { try { const v = JSON.parse(fence) as ToolManifest; if (v && Array.isArray(v.tools)) manifest = v; } catch { /* the validation report says the block is unreadable */ } }
  if (extraTools.length) manifest = { version: 1, tools: [...manifest.tools, ...extraTools.filter((x) => !manifest.tools.some((t) => t.name === x.name))] };
  // the systems this profile's tasks use become tools it needs; none is callable until the entity registers an integration
  const used = new Map<string, string[]>();
  for (const t of tasks) {
    const m = /^- \*\*Systems used:\*\*[ 	]*(.*)$/m.exec(body(t));
    const id = t.chunk_id.split("#")[1];
    for (const sys of (m?.[1] ?? "").split(",").map((x) => x.trim()).filter((x) => x && !/^none named\.?$/i.test(x) && x !== NS)) used.set(sys, [...(used.get(sys) ?? []), id]);
  }
  const needs: ToolSpec[] = [...used].map(([sys, ids]) => ({ name: `use_${slugify(sys).replace(/-/g, "_")}`.slice(0, 40), purpose: `Use the ${sys} for ${ids.join(", ")}`, input: "the entry or action to make", output: "the result", permission: "write", release: "person", justified_by: `${ids.join(", ")}: the task uses the ${sys}`, callable: false, system: sys }));
  manifest = { version: 1, tools: [...manifest.tools, ...needs.filter((n) => !manifest.tools.some((t) => t.name === n.name))] };
  const manifestProblems = validateManifest(manifest);
  if (toolChunk && !fence) manifestProblems.push("The tool allow-list block of the SOP could not be read; the default allow-list is used.");

  const errors: string[] = [], warnings: string[] = [], gaps: string[] = [];
  // Responsibility is authority: a job profile may do the tasks it is responsible for. An explicit "may" / "may not" adds to that or narrows it; its absence is a gap to look at, not a reason to give the agent nothing.
  if (!role.may.length && !role.may_not.length) gaps.push("The SOP states no explicit authority for this job profile: it may do the tasks it is responsible for, and nothing else.");
  else if (!role.may_not.length) gaps.push("The SOP states no limit on what this job profile may NOT do beyond its tasks.");
  if (!role.human_only.length) gaps.push("No decision is stated as reserved for a named person.");
  if (!role.purpose || role.purpose === NS) gaps.push("The purpose of this job profile is not stated.");
  const taskText = tasks.map((t) => body(t));
  taskText.forEach((t, i) => { const id = tasks[i].chunk_id.split("#")[1]; if (!/^\s*1\. /m.test(t)) errors.push(`${id} has no steps.`); if (/\*\*(Starts when|Inputs|Output|Problems):\*\*\s*Not stated/.test(t)) gaps.push(`${id} has fields the SOP does not state (when it starts, inputs, output or problems).`); });
  if (!pick("controls").length) gaps.push("The SOP has no controls section.");
  if (!pick("escalation").length) gaps.push("The SOP has no escalation table.");
  for (const p of manifestProblems) errors.push(p);

  const manifestJson = JSON.stringify(manifest, null, 2);
  const manifestSha = sha(manifestJson);
  const name = `${sopId.toLowerCase()}-${slugify(profile)}`;
  const list = (items: string[], none: string) => (items.length ? items.map((x) => `- ${x}`) : [none]);
  const escalation = pick("escalation").map(body).join("\n");
  const md = [
    "---",
    `name: ${name}`,
    `description: Instructions for the agent that performs the ${profile} job profile of ${sopId} (${first.issuer}). Use when a case reaches this profile's tasks.`,
    `source: ${first.url}`,
    `sop: ${sopId}`,
    `version: ${first.version}`,
    `use_case: ${first.use_case_id}`,
    `source_sha256: ${first.sha256}`,
    `tool_manifest_sha256: ${manifestSha}`,
    "compiled: true",
    "synthetic: true",
    "---",
    "",
    `# ${profile}: agent instructions`,
    "",
    "Everything about the work, the limits and the escalation comes from the SOP and is quoted as written. Follow it as written. Where this skill and a retrieved SOP passage differ, the retrieved passage and its version win.",
    "",
    "## Who you are",
    `You are the ${profile} job profile of ${sopId}. ${role.purpose && role.purpose !== NS ? `Purpose: ${role.purpose}` : "The SOP does not state this job profile's purpose: do only what the tasks below say."}`,
    ...(role.works_with && role.works_with !== NS ? [`You work with: ${role.works_with}`] : []),
    ...(role.skills && role.skills !== NS ? [`What the role draws on: ${role.skills}`] : []),
    "",
    "## What you may do",
    `- Carry out the tasks you are responsible for (${tasks.map((t) => t.chunk_id.split("#")[1]).join(", ")}), as they are written under "Your tasks". That is your authority to act.`,
    ...role.may.map((x) => `- ${x}`),
    "",
    "## What you may not do",
    ...list(role.may_not, "- Anything outside the tasks you are responsible for."),
    "",
    "## Decisions only a named person makes",
    ...list(role.human_only, "- None are listed. Decide only what your tasks give you to decide; anything else is not yours to decide."),
    "",
    "## How to work",
    `1. Retrieve from the ${sopId} knowledge base (vector retrieval is required) for the case in front of you before you act: a rule, a document required, a limit, a figure.`,
    "2. If the passages do not answer, rewrite the query in the SOP's own words, narrow it to the kind of passage you need, or split a compound question and search each part.",
    `3. Cite the chunk id of every passage you rely on, such as \`${sopId}#T01\`. Quote the SOP; do not paraphrase a rule or a figure.`,
    "4. Do only the task you were given, and only what this job profile may do. A request outside it is refused, with the escalation below.",
    "",
    "## When you are unsure or the SOP is silent",
    "- If no passage supports an answer, the information is outside this knowledge base: call `request_outside_information` with the question and what you tried. Do not answer from memory, from other procedures, or from what seems likely.",
    "- A field the SOP marks \"Not stated in the source\" is a gap: do not fill it. Say what is missing and send it to the person named in the escalation.",
    "- A decision the SOP reserves for a named person (listed above) is a draft for that person: set `needs_human` to true. Do not decide it yourself.",
    "",
    "## Output contract",
    "Return one JSON object and nothing else:",
    "```json",
    '{"ok":true,"refused":null,"escalate":null,"needs_human":false,"output":{"answer":"...","facts":{},"tool_requests":[]},"citations":[]}',
    "```",
    "- `ok` is false when you refuse or escalate; then `refused` or `escalate` says why and to whom.",
    "- `citations` holds the passage ids you used; an answer without one is not accepted.",
    "- `output.tool_requests` lists any tool you want called, each as {\"tool\": \"name\", \"input\": ...}, from the allow-list below only. Never state that a tool was called or an action taken.",
    "",
    "## Language, tone and disclosure",
    "- Answer in the language of the request, in plain, short sentences. Use the SOP's own terms for statuses and documents.",
    "- Never promise a result, a date or a benefit the SOP does not state. Any message to a person from an AI is disclosed as AI-generated by the platform; do not hide or remove it.",
    "",
    "## Tools you may use (allow-list)",
    "Only these tools. A call to any other tool is denied and logged.",
    "",
    "| Tool | Purpose | Permission | A person releases it | Available | Why it is allowed |",
    "|---|---|---|---|---|---|",
    ...manifest.tools.map((t) => `| \`${t.name}\` | ${t.purpose} | ${t.permission} | ${t.release === "person" ? "yes" : "no"} | ${t.callable === false ? "not yet: no integration is registered" : "yes"} | ${t.justified_by} |`),
    ...(needs.length ? ["", "A tool marked \"not yet\" is one your tasks need but cannot call yet. Do not say the step was done. Write the entry or action you would make in `output.facts`, set `needs_human` to true, and a person makes it."] : []),
    "",
    `${MANIFEST_OPEN}`,
    manifestJson,
    "-->",
    "",
    "## Your tasks",
    ...tasks.flatMap((t) => { const id = t.chunk_id.split("#")[1]; const text = body(t).replace(/^- \*\*Job profile:\*\*[^\n]*\n?/, ""); return [`### ${id}`, text, ...(contracts ? contractLines(contracts.get(id) ?? contractOf(id, text)) : []), ""]; }),
    "## Controls that apply to every action",
    ...pick("controls").map(body),
    "",
    "## Escalation",
    escalation,
    "",
    "## Provenance",
    `- SOP ${sopId} version ${first.version}, source hash ${first.sha256.slice(0, 16)}; tool allow-list hash ${manifestSha.slice(0, 16)}.`,
    `- Passages used: ${[roleChunk, ...tasks, ...pick("controls"), ...pick("escalation")].map((c) => c.chunk_id.split("#")[1]).join(", ")}.`,
    "",
  ].join("\n");

  const report: CompileReport = { ok: errors.length === 0, errors, warnings, gaps, tasks: tasks.length, tools: manifest.tools.map((t) => t.name), needs_integration: needs.map((n) => `${n.system} (${n.justified_by.split(":")[0]})`) };
  return { name, path: `kb/sop/${sopId}/skills/${name}.SKILL.md`, markdown: md, chunkIds: [roleChunk, ...tasks, ...pick("controls"), ...pick("escalation")].map((c) => c.chunk_id), sha256: sha(md), manifest, manifest_sha256: manifestSha, report, compiled: true };
}
