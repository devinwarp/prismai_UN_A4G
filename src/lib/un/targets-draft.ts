import { chatCompletion, CHAT_MODEL, parseLlmJson } from "../llm.ts";
import { agentLlmEndpoint } from "./agent-llm.ts";
import { modelAvailable } from "./consult-draft.ts";
import type { EntityGoal } from "./goals.ts";
import type { Target, Unit } from "./targets.ts";

// The targets agent: it DRAFTS a use case's process targets and a person approves them. Pure, apart from the optional
// model call at the foot. Nothing here approves, signs or sends anything.
//
// The rules draft comes first and is always valid:
//   outcome targets   one per entity goal, carrying the goal's own value, unit and comparison. No figure is invented: where a
//                     goal's unit has no exact equivalent the target says so in its statement, for the person to fix.
//   control targets   from the use case's own flags: client facing gives an AI-disclosure check; affects rights or
//                     irreversible gives a human-approval check.
// A model may then reword each target's statement and evidence. It never sees or changes an id, a goal link, a value, a unit
// or a check: those are taken from the rules draft whatever the model returns.

export interface DraftUseCase {
  ext_id: string;
  title: string;
  entity: string;
  description?: string | null;
  client_facing: boolean;
  affects_rights?: boolean;
  irreversible?: boolean;
  /** The use case's own sentence about human oversight, e.g. "Irreversible actions need human approval". */
  hitl_rule?: string | null;
}

/** The goal's free-text unit as one of the target units, or null when none is exact. */
export function unitOf(raw: string): Unit | null {
  const u = raw.trim().toLowerCase();
  if (u === "%" || u === "percent" || u === "per cent" || u === "percentage") return "percent";
  if (u === "business hours" || u === "business hour" || u === "working hours") return "business_hours";
  if (u === "minutes" || u === "minute" || u === "min") return "minutes";
  if (u === "requests" || u === "cases" || u === "count" || u === "incidents") return "count";
  return null;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export function draftTargets(goals: EntityGoal[], uc: DraftUseCase): Target[] {
  const out: Target[] = [];
  for (const g of goals) {
    const m = g.measurement;
    if (!m) continue;
    const unit = unitOf(m.unit);
    const exact = unit !== null;
    out.push({
      id: `T${out.length + 1}`,
      kind: "outcome",
      goal_id: g.id,
      statement: clip(exact ? `${uc.ext_id} contributes to: ${g.text}` : `${uc.ext_id} contributes to: ${g.text} (goal unit "${m.unit}": confirm the unit before approving)`, 300),
      comparator: m.comparison === "at_most" ? "max" : "min",
      value: m.value,
      unit: unit ?? "count",
      measured_by: g.criterion ? "pilot" : "go_live",
      evidence: clip(`Measured as: ${m.criterion}`, 300),
    });
  }
  let controls = 0;
  const control = (t: Omit<Target, "id" | "kind" | "comparator" | "value" | "unit">) => out.push({ id: `C${++controls}`, kind: "control", comparator: "min", value: 100, unit: "percent", ...t });
  if (uc.client_facing) control({ statement: "Everyone who receives an output is told when it is AI-generated", measured_by: "pilot", evidence: "Checked on each client-facing pilot test", check: { criterion: "ai_disclosure", scope: "client_facing" } });
  if (uc.affects_rights || uc.irreversible) control({ statement: "A named person approves every decision that affects someone's rights or cannot be undone", measured_by: "pilot", evidence: "Checked on each pilot test", check: { criterion: "human_final_approval", scope: "all" } });
  return out;
}

/** A warning for the approver when the use case's own rule talks about approval but its flags do not mark it as affecting rights or irreversible, so
 * no human-approval control was drafted. The rule is NOT read to add a control: a control becomes a zero-tolerance pilot check, and a sentence is
 * ambiguous. The flags stay the one source; this only points at the mismatch. */
export function approvalRuleWarning(uc: Pick<DraftUseCase, "hitl_rule" | "affects_rights" | "irreversible">): string | null {
  const rule = (uc.hitl_rule ?? "").trim();
  if (!rule || !/\bapprov/i.test(rule) || uc.affects_rights || uc.irreversible) return null;
  return `Check the risk flags: this use case's rule says "${clip(rule, 120)}", but its flags do not mark it as affecting rights or irreversible, so no human-approval control was drafted. Add one if the rule applies.`;
}

// ---- optional wording by a model --------------------------------------------------------------

export const POLISH_SYSTEM = [
  "You improve the wording of draft process targets for an AI use case in a government service.",
  "For each target you are given its id, its statement and how it is measured. Rewrite ONLY the statement and the evidence, each clear and under 200 characters, in plain professional English.",
  "Keep the meaning exact. Do not add figures, dates, names, commitments or new targets, and do not change ids.",
  'Answer with JSON: {"targets": [{"id": "<same id>", "statement": "...", "evidence": "..."}]}.',
].join(" ");

export const polishPrompt = (uc: DraftUseCase, drafts: Target[]) => [
  `Use case: ${uc.ext_id}: ${uc.title}`,
  uc.description ? `What it does: ${uc.description}` : null,
  ...drafts.map((t) => `- ${t.id} (${t.kind}): "${t.statement}" | measured: "${t.evidence}"`),
].filter(Boolean).join("\n");

/** Merge a model's rewording into the rules draft. Only `statement` and `evidence` of ids the draft already has are taken, and
 * only when they are plain text of a sane length; anything else the model says is dropped. Returns the draft unchanged when
 * the reply is unusable. */
export function applyPolish(drafts: Target[], reply: string): Target[] {
  let list: unknown;
  try { list = (parseLlmJson(reply) as { targets?: unknown })?.targets; } catch { return drafts; }
  if (!Array.isArray(list)) return drafts;
  const by = new Map<string, { statement?: unknown; evidence?: unknown }>();
  for (const x of list) if (x && typeof x === "object" && typeof (x as { id?: unknown }).id === "string") by.set((x as { id: string }).id, x as { statement?: unknown; evidence?: unknown });
  const ok = (v: unknown): v is string => typeof v === "string" && v.trim().length >= 5 && v.trim().length <= 300 && !/\b(i hereby|approved and signed)\b/i.test(v);
  return drafts.map((t) => {
    const p = by.get(t.id);
    if (!p) return t;
    return { ...t, ...(ok(p.statement) ? { statement: p.statement.trim() } : {}), ...(ok(p.evidence) ? { evidence: p.evidence.trim() } : {}) };
  });
}

type Chat = (a: { system: string; user: string }) => Promise<string>;
const defaultChat: Chat = ({ system, user }) => {
  const ep = agentLlmEndpoint();
  return chatCompletion({ system, messages: [{ role: "user", content: user }], maxTokens: 1200, timeoutMs: 30_000, json: true, model: process.env.AGENT_LLM_MODEL || CHAT_MODEL, ...(ep ? { baseUrl: ep.baseUrl, apiKey: ep.apiKey } : {}) });
};

/** The rules draft, with the model's wording when a model is available and answers usably. Never throws. */
export async function draftWithWording(goals: EntityGoal[], uc: DraftUseCase, chat: Chat = defaultChat, available: boolean = modelAvailable()): Promise<{ targets: Target[]; worded_by: "model" | "rules" }> {
  const drafts = draftTargets(goals, uc);
  if (!drafts.length || !available) return { targets: drafts, worded_by: "rules" };
  try {
    const polished = applyPolish(drafts, await chat({ system: POLISH_SYSTEM, user: polishPrompt(uc, drafts) }));
    return { targets: polished, worded_by: polished.some((t, i) => t.statement !== drafts[i].statement || t.evidence !== drafts[i].evidence) ? "model" : "rules" };
  } catch {
    return { targets: drafts, worded_by: "rules" };
  }
}
