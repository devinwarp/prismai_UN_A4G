import { createAdminClient } from "@/lib/supabase/admin";
import { chatCompletion } from "@/lib/llm";
import { DOCS, RECORDS, TODAY } from "./fixtures-uc02";
import { GATES, applicableGates } from "./policy";
import { searchChunks } from "./kb";
import { extractSkill, loadSop } from "./sop-kb";
import { profilesOf } from "./sop/data";
import { fieldsOf, relatedChunks } from "./test-derive";
import { appendGenLogTo, loadGenLogFrom, testgenModel, type ChatFn, type Ctx, type GateInfo, type GenEntry, type GenScenario, type SopLine } from "./testgen";

export const loadGenLog = (orgId: string, useCaseId: string, profile: string) => loadGenLogFrom(createAdminClient(), orgId, useCaseId, profile);
export const appendGenLog = (orgId: string, useCaseId: string, profile: string, entry: GenEntry) => appendGenLogTo(createAdminClient(), orgId, useCaseId, profile, entry);

/** The generator's chat function: its own model (TESTGEN_MODEL), never the goal judge's or the agent's by default. */
export const defaultChat = (model = testgenModel()): ChatFn => ({ system, user }) =>
  chatCompletion({ system, messages: [{ role: "user", content: user }], maxTokens: 6000, timeoutMs: 120_000, seed: 11, model, json: true });

const FEE_TASK = /fee|payment|amount/i;

export type Built = { ok: true; scenario: GenScenario; skill: string; lines: SopLine[]; ctx: Ctx } | { ok: false; error: string; status: number };

/** Everything the generator needs for one task of one job profile: the scenario with its skill, risk and gates, the
 * skill text, the SOP lines retrieved for it (BM25 over the SOP chunks, plus the passages the task names) and the
 * validation context. A scenario whose skill cannot be built is returned with skill_id null, so it is refused. */
export function buildScenario(sopId: string, profile: string, task: string, existingIds: Set<string>): Built {
  const p = profilesOf(sopId)?.find((x) => x.name === profile);
  const t = p?.tasks.find((x) => x.id === task);
  if (!p || !t) return { ok: false, error: `${sopId} has no task "${task}" in the job profile "${profile}"`, status: 400 };
  let skill = "";
  let skill_id: string | null = null;
  try { const s = extractSkill(sopId, profile); skill = s.markdown; skill_id = s.name; } catch { /* no skill: refused by the core */ }

  const feeTask = FEE_TASK.test(t.title);
  const ids = new Set([...applicableGates(t.flags.client_facing), ...(feeTask ? ["fee_accuracy"] : [])]);
  const gates: GateInfo[] = [...ids].filter((g) => GATES[g]).map((g) => ({ id: g, label: GATES[g].label, testable: GATES[g].evidence === "eval" }));

  const { chunks } = loadSop(sopId);
  const taskChunk = chunks.find((c) => c.chunk_id === `${sopId}#${task}`);
  const picked = new Map<string, (typeof chunks)[number]>();
  const add = (c?: (typeof chunks)[number]) => { if (c && !picked.has(c.chunk_id)) picked.set(c.chunk_id, c); };
  add(taskChunk);
  if (taskChunk) relatedChunks(taskChunk, chunks).forEach(add);
  chunks.filter((c) => c.topics.includes("controls") || c.topics.includes("escalation")).forEach(add);
  const query = taskChunk ? `${t.title} ${Object.values(fieldsOf(taskChunk)).join(" ")}` : t.title;
  searchChunks(chunks, query, { k: 5 }).forEach((h) => add(chunks.find((c) => c.chunk_id === h.chunk.chunk_id)));
  const lines: SopLine[] = [...picked.values()].slice(0, 14).map((c) => ({ chunk_id: c.chunk_id, text: c.text.slice(0, 1500) }));

  const scenario: GenScenario = {
    id: `${sopId}/${profile}/${task}`, title: `${t.id}. ${t.title}`, sop_id: sopId, profile, task, skill_id,
    risk: { client_facing: t.flags.client_facing, affects_rights: t.flags.affects_rights, irreversible: t.flags.irreversible }, gates,
  };
  const ctx: Ctx = {
    // a citation must be one of the SOP lines the model was shown, not just any chunk of the SOP
    scenario, chunkIds: new Set(lines.map((l) => l.chunk_id)),
    fixtures: { licences: Object.entries(RECORDS).map(([key, r]) => ({ key, activity_group: r.activity_group, expiry: r.expiry, holder: r.holder, activity_code: r.activity_code, registered_email: r.registered_email, language: r.language })), docs: Object.keys(DOCS), today: TODAY },
    profileTasks: p.tasks.map((x) => x.id), model: testgenModel(), existingIds,
  };
  return { ok: true, scenario, skill, lines, ctx };
}
