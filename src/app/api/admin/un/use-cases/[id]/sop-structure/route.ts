import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { bad, notFound, requirePermission } from "@/lib/api-auth";
import { recordChange } from "@/lib/un/country-actions";
import { appCountryDeps } from "@/lib/un/country-app";
import { isUuid } from "@/lib/un/model";
import { sweepPeople } from "@/lib/un/inbox-service";
import { attachSop, loadAttachedSop } from "@/lib/un/profiles-store";
import { loadUseCase } from "@/lib/un/sijil-store";
import { compileSkill, defaultManifest, isStructuredSop, type CompileReport } from "@/lib/un/skill-compile";
import { buildSopKb } from "@/lib/un/sop-kb-app";
import { liveChunks } from "@/lib/un/sop-kb-live";
import { skillFromChunks } from "@/lib/un/sop-kb";
import { rollOut } from "@/lib/un/sop-rollout";
import { reviewSkill, type SkillReview } from "@/lib/un/sop-structure-agent";
import { draftStructureFor } from "@/lib/un/sop-structure-service";
import { appendStructureLog, loadStructureLog } from "@/lib/un/sop-structure-store";
import { canApprove, checkStructured, parseStructured, renderCanonical, replayStructure, tidy, type StructEntry, type StructuredSop } from "@/lib/un/sop-structure";
import { latestOf, loadCustomRoots, saveVersion } from "@/lib/un/sop-version-store";
import { customSopFromText } from "@/lib/un/sop/custom";
import { MAX_SOP_CHARS } from "@/lib/un/sop/custom-limits";
import { SAMPLES, loadBaseline } from "@/lib/un/sop/data";
import { planNewVersion } from "@/lib/un/sop/versions";

export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const unreadable = (e: unknown) => NextResponse.json({ error: e instanceof Error ? e.message : "The structuring log could not be read" }, { status: 503 });

/** What the job profiles of the attached SOP can become: which already yield a skill, which would not. Pure reading; nothing is written. */
async function readiness(orgId: string, ucExt: string, entity: string, sopId: string | null) {
  if (!sopId) return { sop_id: null as string | null, version: null as number | null, structured: false, profiles: [] as { profile: string; ok: boolean; compiled: boolean; reason: string | null }[] };
  const v = await latestOf(orgId, sopId).catch(() => null);
  if (!v) return { sop_id: sopId, version: null, structured: false, profiles: [] };
  const chunks = liveChunks({ sopId, title: v.title, version: v.version, body: v.body, useCaseExt: ucExt, entity });
  return {
    sop_id: sopId, version: v.version, structured: isStructuredSop(chunks),
    profiles: v.profiles.map((p) => {
      try { const s = skillFromChunks(sopId, p.name, chunks); return { profile: p.name, ok: true, compiled: "compiled" in s, reason: null }; }
      catch (e) { return { profile: p.name, ok: false, compiled: false, reason: e instanceof Error ? e.message : "no skill" }; }
    }),
  };
}

/** GET → the structuring state of this use case: the draft waiting for review, the approved structure, and which job profiles of the attached SOP can become a skill. Any signed-in role. */
export async function GET(_request: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const who = await requirePermission("view");
  if (who instanceof NextResponse) return who;
  const uc = await loadUseCase(who.org_id!, id);
  if (!uc) return notFound();
  let log: StructEntry[];
  try { log = await loadStructureLog(who.org_id!, id); } catch (e) { return unreadable(e); }
  const sopId = await loadAttachedSop(who.org_id!, id);
  return NextResponse.json({ state: replayStructure(log), ready: await readiness(who.org_id!, uc.ext_id, uc.entity, sopId) });
}

/** POST { action, ... }
 *   draft     { text?, title? }   the model drafts the structure of `text`, or of the attached SOP when no text is given. Nothing is attached or changed.
 *   edit      { model }           a person's edit of the draft waiting for review
 *   approve   { model?, reviewed: true }   a person approves the structure (their own edited one, or the draft): it is written as Prism Markdown and published as
 *             the SOP of this use case (a new version when one is attached, else a new SOP), and its job profiles and skills come from it
 *   withdraw  { reason }          drop the draft
 * Needs entity.setup, like attaching an SOP. A deployed use case's SOP is frozen. Both model calls use the test generator's model (TESTGEN_MODEL). */
export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const who = await requirePermission("entity.setup", { useCaseId: id });
  if (who instanceof NextResponse) return who;
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const orgId = who.org_id!;
  const uc = await loadUseCase(orgId, id);
  if (!uc) return notFound();
  const actor = who.email ?? who.id;
  const act = String(b.action);
  if (!["draft", "edit", "approve", "withdraw"].includes(act)) return bad('action must be "draft", "edit", "approve" or "withdraw"');
  if (uc.stage === "deployed" && (act === "draft" || act === "approve")) return bad("This use case is deployed, so its SOP is frozen. Its business process owner can ask to move it to a newer version.");

  let log: StructEntry[];
  try { log = await loadStructureLog(orgId, id); } catch (e) { return unreadable(e); }
  const state = replayStructure(log);
  const next = (kind: StructEntry["kind"], by: string, payload: unknown) => ({ seq: (log.at(-1)?.seq ?? 0) + 1, at: new Date().toISOString(), actor: by, kind, payload }) as StructEntry;
  const append = async (e: StructEntry) => { const err = await appendStructureLog(orgId, id, e); return err ? NextResponse.json({ error: err }, { status: err.startsWith("Someone") ? 409 : 500 }) : null; };
  const out = (extra: Record<string, unknown> = {}) => NextResponse.json({ ok: true, ...extra });

  if (act === "draft") {
    const sopId = await loadAttachedSop(orgId, id);
    const attached = sopId ? await latestOf(orgId, sopId).catch(() => null) : null;
    const source = typeof b.text === "string" && b.text.trim() ? b.text : attached?.body ?? "";
    if (!source.trim()) return bad("Give the SOP text, or attach an SOP first.");
    if (source.length > MAX_SOP_CHARS || source.includes("\0")) return bad("Choose a non-empty text up to 200 KB.");
    const title = ((typeof b.title === "string" && b.title.trim()) || attached?.title || source.match(/^#\s+(.+)$/m)?.[1] || "").trim().slice(0, 120);
    const r = await draftStructureFor(orgId, id, source, title);
    if (!r.ok) return NextResponse.json({ error: r.error, usage: r.usage }, { status: r.status });
    return out({ state: replayStructure([...log, r.entry]), usage: r.result.usage });
  }

  if (!state.pending && act !== "withdraw") return bad("There is no draft waiting for review. Ask the model to draft one first.");
  if (act === "withdraw") {
    if (!state.pending) return bad("There is no draft to withdraw.");
    const e = next("withdrawn", actor, { reason: typeof b.reason === "string" ? b.reason.trim().slice(0, 500) : "" });
    const failed = await append(e);
    return failed ?? out({ state: replayStructure([...log, e]) });
  }

  // edit and approve both work on a structure a person gives (or, for approve, the draft as it stands); it is read again and checked against the source each time
  const supplied = b.model !== undefined ? parseStructured(b.model) : { ok: true as const, model: state.pending!.model };
  if (!supplied.ok) return bad(supplied.error);
  const model: StructuredSop = tidy(supplied.model);
  const checks = checkStructured(model, state.pending!.source);

  if (act === "edit") {
    const e = next("edited", actor, { model, checks });
    const failed = await append(e);
    return failed ?? out({ state: replayStructure([...log, e]) });
  }

  // approve
  if (b.reviewed !== true) return bad("Confirm that you have read the source and this structure side by side.");
  if (!canApprove(checks)) return NextResponse.json({ error: "The structure has errors a person must fix first.", checks }, { status: 400 });
  const title = (model.title || state.pending!.title || "SOP").slice(0, 120);
  const baseline = loadBaseline();
  const tools = defaultManifest();
  const sopId = await loadAttachedSop(orgId, id);
  const prev = sopId ? await latestOf(orgId, sopId) : null;
  let published: { sop_id: string; version: number; body: string; profiles: string[] };

  if (prev) {
    const canonical = renderCanonical(model, { sopId: prev.sop_id, useCase: uc.ext_id, version: String(prev.version + 1) }, tools);
    const plan = planNewVersion(prev, { text: canonical, title, entity: uc.entity, baseline });
    if (!plan.ok) return bad(plan.error);
    const err = await saveVersion(orgId, plan.version, who.id);
    if (err) return NextResponse.json({ error: err }, { status: 500 });
    const rollout = await rollOut(orgId, plan.version, who.id);
    await recordChange(appCountryDeps(orgId), actor, "sop_version", { use_case: uc.ext_id, sop_id: prev.sop_id, version: plan.version.version, from: prev.version, structured: true, moved: rollout.moved, frozen: rollout.frozen });
    published = { sop_id: prev.sop_id, version: plan.version.version, body: plan.version.body, profiles: plan.version.profiles.map((p) => p.name) };
  } else {
    const taken = [...(await loadCustomRoots(orgId)), ...SAMPLES.map((s) => s.sop_id)];
    const provisional = renderCanonical(model, { sopId: "pending", useCase: uc.ext_id, version: "1" }, tools);
    const made = customSopFromText({ title, text: provisional, entity: uc.entity, baseline, takenIds: taken, idBase: uc.ext_id });
    if (!made.ok) return bad(made.error);
    const canonical = renderCanonical(model, { sopId: made.sop_id, useCase: uc.ext_id, version: "1" }, tools);
    const e1 = await saveVersion(orgId, { sop_id: made.sop_id, version: 1, title: made.title, body: canonical, profiles: made.profiles, changes: null }, who.id);
    if (e1) return NextResponse.json({ error: e1 }, { status: 500 });
    const e2 = await attachSop(orgId, id, made.sop_id, who.id, 1);
    if (e2) return NextResponse.json({ error: e2 }, { status: 500 });
    await recordChange(appCountryDeps(orgId), actor, "sop_changed", { use_case: uc.ext_id, from: null, to: made.sop_id, version: 1, custom: true, structured: true, profiles: made.profiles.map((p) => p.name) });
    published = { sop_id: made.sop_id, version: 1, body: canonical, profiles: made.profiles.map((p) => p.name) };
  }
  await sweepPeople(orgId).catch(() => {});
  const kb = await buildSopKb(orgId, { sopId: published.sop_id, title, version: published.version, body: published.body, useCaseExt: uc.ext_id, entity: uc.entity });

  // each job profile's compiled skill, with the model's review of it against the structure (advisory)
  const chunks = liveChunks({ sopId: published.sop_id, title, version: published.version, body: published.body, useCaseExt: uc.ext_id, entity: uc.entity });
  const skills: { profile: string; report: CompileReport; review: SkillReview | null }[] = await Promise.all(published.profiles.slice(0, 12).map(async (profile) => {
    try {
      const s = compileSkill(published.sop_id, profile, chunks);
      const role = model.roles.find((r) => r.name.toLowerCase() === profile.toLowerCase());
      return { profile, report: s.report, review: await reviewSkill(s.markdown, { role, tasks: model.tasks.filter((t) => t.role.toLowerCase() === profile.toLowerCase()), controls: model.controls, exceptions: model.exceptions }) };
    } catch (e) {
      return { profile, report: { ok: false, errors: [e instanceof Error ? e.message : "no skill"], warnings: [], gaps: [], tasks: 0, tools: [], needs_integration: [] }, review: null };
    }
  }));
  const approved = next("approved", actor, { model, source_sha256: sha(state.pending!.source), canonical_sha256: sha(published.body), sop_id: published.sop_id, version: published.version, review: { skills, kb } });
  const failed = await append(approved);
  if (failed) return failed;
  return out({ state: replayStructure([...log, approved]), published: { sop_id: published.sop_id, version: published.version, profiles: published.profiles }, kb, skills });
}
