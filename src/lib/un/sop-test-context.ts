import { createHash } from "node:crypto";
import { searchChunks } from "@/lib/un/kb";
import { chunkSop, loadSop, searchSopRequired, skillFromChunks, type ContractMap, type SkillFile, type SopChunk } from "@/lib/un/sop-kb";
import { contractOf, type OutputContract } from "./output-contract";
import type { UnUseCaseState } from "@/lib/un/model";
import type { SopVersion } from "./sop/versions";
import type { JobProfile, ProfileTask } from "./sop/profiles";
import { sopCaseSlot, type SopLine } from "./testgen";
import type { Blueprint } from "./test-derive";

export function usesLicensingReference(useCaseId: string, sopId: string | null) {
  return useCaseId === "UC02" && sopId === "SOP-LIC-014";
}

/** The passages of an attached SOP version, as the skill builder and the tests see them. */
export function chunksOfVersion(version: SopVersion, useCase: Pick<UnUseCaseState, "ext_id" | "entity">): SopChunk[] {
  return chunkSop(version.body, {
    sopId: version.sop_id, version: String(version.version), useCaseId: useCase.ext_id,
    entity: useCase.entity, jurisdiction: useCase.entity, sourcePath: `sop://${version.sop_id}/v${version.version}`,
  });
}

export function sopTestContext(version: SopVersion, useCase: Pick<UnUseCaseState, "ext_id" | "entity" | "client_facing" | "affects_rights" | "irreversible">, profile: JobProfile, contracts?: ContractMap) {
  const chunks = chunksOfVersion(version, useCase);
  const risk = { client_facing: useCase.client_facing, affects_rights: !!useCase.affects_rights, irreversible: !!useCase.irreversible };
  let skill: (SkillFile & { sha256: string }) | null = null;
  try {
    const rendered = skillFromChunks(version.sop_id, profile.name, chunks, contracts);
    skill = { ...rendered, sha256: createHash("sha256").update(rendered.markdown).digest("hex") };
  } catch { /* The profile needs an available skill before tests can run. */ }
  const hash = createHash("sha256").update(JSON.stringify([version.sop_id, version.version, version.body, profile, risk, skill?.sha256])).digest("hex");
  // what a task returns: the contract a person approved, else the one read off the SOP's own text for the task
  const contractFor = (taskId: string): OutputContract => contracts?.get(taskId) ?? contractOf(taskId, (chunks.find((c) => c.chunk_id.endsWith(`#${taskId}`))?.text ?? "").split("\n").slice(1).join("\n"));
  return { profile, chunks, hash, risk, skill, contractFor };
}

export type SopTestContext = ReturnType<typeof sopTestContext>;

export function taskPassages(chunks: SopChunk[], task: ProfileTask, request = ""): SopLine[] {
  const taskChunk = chunks.find((c) => c.chunk_id.endsWith(`#${task.id}`));
  const hits = searchChunks(chunks, `${task.title} ${request.slice(0, 4000)}`, { k: 8 });
  const policy = chunks.filter((c) => c.topics.includes("controls") || c.topics.includes("escalation")).slice(0, 4);
  const passages = [...(taskChunk ? [taskChunk] : []), ...hits.map((h) => h.chunk), ...policy, ...chunks.slice(0, 3)];
  return [...new Map(passages.map((c) => [c.chunk_id, c])).values()].slice(0, 12)
    .map((c) => ({ chunk_id: c.chunk_id, text: c.text.slice(0, 2400) }));
}

/** The passages the SOP pilot gives its agent for one case. Retrieval is by vectors and is REQUIRED: if the knowledge base is not vectorised and current, or the
 * query cannot be embedded, this throws and the step stops (searchSopRequired). It never falls back to keyword search. The SOP's chunks must already be loaded
 * (loadAttachedSop does that). Same selection as taskPassages: the task's own passage, the best hits, the controls and escalation, the opening of the SOP. */
export async function taskPassagesRequired(sopId: string, task: ProfileTask, request = ""): Promise<SopLine[]> {
  const loaded = loadSop(sopId).chunks;
  const taskChunk = loaded.find((c) => c.chunk_id.endsWith(`#${task.id}`));
  const hits = (await searchSopRequired(sopId, `${task.title} ${request.slice(0, 4000)}`, { k: 8 })).hits.map((h) => h.chunk);
  const policy = loaded.filter((c) => c.topics.includes("controls") || c.topics.includes("escalation")).slice(0, 4);
  const passages = [...(taskChunk ? [taskChunk] : []), ...hits, ...policy, ...loaded.slice(0, 3)];
  return [...new Map(passages.map((c) => [c.chunk_id, c])).values()].slice(0, 12).map((c) => ({ chunk_id: c.chunk_id, text: c.text.slice(0, 2400) }));
}

export function requiredSopTests(context: SopTestContext): Blueprint[] {
  return context.profile.tasks.flatMap((task) => (["happy_path", "authority"] as const).map((family) => {
    const slot = sopCaseSlot(task.id, family);
    const title = family === "happy_path" ? `${task.id}: check the expected task output` : `${task.id}: verify unauthorised work is blocked before inference`;
    return {
      id: slot, slot, family, task: task.id, title, derived: true, status: "active" as const,
      source: [], expect: [{ kind: "rubric" as const, text: title }], requiresExecution: context.hash,
    };
  }));
}
