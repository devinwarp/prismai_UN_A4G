import { chatCompletion, parseLlmJson } from "../llm.ts";
import { metered, type UsageSnapshot } from "./cost.ts";
import { checkStructured, parseStructured, STRUCTURE_SYSTEM, structurePrompt, tidy, type Checks, type StructuredSop } from "./sop-structure.ts";
import { testgenModel } from "./testgen.ts";

// The two model steps of SOP structuring. Both use the TEST GENERATOR's model (TESTGEN_MODEL), the one the owner chose for generation work: a model that is
// neither the agent under test nor the goal judge.
//   structureSop   drafts the structure of a loosely written SOP. A person reviews and approves it (the draft is never used until then).
//   reviewSkill    reads a compiled skill against the structure it came from and lists what looks wrong. Advisory: it never edits a skill.
// Neither call is told anything about the organisation beyond the SOP text. Neither throws: a failure is a value.

/** The agent's identity in the log. `actor` begins with "agent:", so the person who approves its draft is a different party from its author. */
export const STRUCTURING_AGENT = "agent:structuring";

export type ChatFn = (o: { system: string; user: string }) => Promise<string>;

export const defaultStructureChat = (model = testgenModel()): ChatFn => ({ system, user }) =>
  chatCompletion({ system, messages: [{ role: "user", content: user }], maxTokens: 12_000, timeoutMs: 170_000, seed: 11, model, json: true });

export type StructureResult =
  | { ok: true; model: StructuredSop; checks: Checks; llm: string; attempts: number; usage: UsageSnapshot }
  | { ok: false; error: string; usage: UsageSnapshot };

/** Draft the structure of a source. One retry when the answer is not a usable structure. */
export async function structureSop(source: string, title: string | undefined, chat: ChatFn = defaultStructureChat(), llm = testgenModel()): Promise<StructureResult> {
  let last = "The model could not be reached.";
  let attempts = 0;
  const { result, usage } = await metered(async () => {
    for (let i = 0; i < 2; i++) {
      attempts++;
      try {
        const reply = await chat({ system: STRUCTURE_SYSTEM, user: structurePrompt(source, title) + (i ? "\n\nYour last answer was not a valid JSON object of the required shape. Answer again with only that object." : "") });
        const parsed = parseStructured(parseLlmJson(reply));
        if (parsed.ok) { const model = tidy({ ...parsed.model, title: parsed.model.title || title || "" }); return { ok: true as const, model, checks: checkStructured(model, source) }; }
        last = parsed.error;
      } catch (e) { last = e instanceof Error ? e.message : "The model call failed."; }
    }
    return null;
  });
  return result ? { ...result, llm, attempts, usage } : { ok: false, error: `The model's structure could not be read after ${attempts} tries: ${last}`, usage };
}

export interface SkillReview { available: boolean; issues: { severity: "error" | "warn"; text: string }[]; llm: string; error?: string }

export const REVIEW_SYSTEM = [
  "You review an AI agent's skill (its instructions) against the structured SOP it was compiled from.",
  "List only real problems: an instruction that gives the role more authority than the SOP's \"may\" list, a \"may not\" or human-only decision the skill does not carry, a task step that is missing or changed, a tool that is not justified by the SOP, a figure that is not in the SOP, or a contradiction between sections.",
  "Do not rewrite the skill and do not praise it. If you find nothing, return an empty list.",
  'Answer with JSON only: {"issues":[{"severity":"error"|"warn","text":"one sentence naming the section"}]}.',
].join(" ");

export async function reviewSkill(skill: string, structure: unknown, chat: ChatFn = defaultStructureChat(), llm = testgenModel()): Promise<SkillReview> {
  try {
    const raw = parseLlmJson(await chat({ system: REVIEW_SYSTEM, user: `STRUCTURED SOP (what the skill must be faithful to):\n${JSON.stringify(structure)}\n\nSKILL:\n${skill}` })) as { issues?: unknown };
    const issues = (Array.isArray(raw?.issues) ? raw.issues : []).slice(0, 12).flatMap((x) => {
      const q = (x ?? {}) as { severity?: unknown; text?: unknown };
      return typeof q.text === "string" && q.text.trim() ? [{ severity: q.severity === "error" ? ("error" as const) : ("warn" as const), text: q.text.trim().slice(0, 300) }] : [];
    });
    return { available: true, issues, llm };
  } catch (e) {
    return { available: false, issues: [], llm, error: e instanceof Error ? e.message : "The review could not run." };
  }
}
