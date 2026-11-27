import { NextResponse } from "next/server";
import { sweepPeople } from "@/lib/un/inbox-service";
import { randomUUID } from "node:crypto";
import { bad, notFound, requirePermission } from "@/lib/api-auth";
import { recordChange } from "@/lib/un/country-actions";
import { appCountryDeps } from "@/lib/un/country-app";
import { isUuid } from "@/lib/un/model";
import { attachSop, loadAttachedSop, loadProfileRows, saveTick } from "@/lib/un/profiles-store";
import { loadUseCase } from "@/lib/un/sijil-store";
import type { KbCheck } from "@/lib/un/skill-extract";
import { buildSopKb, checkSopKbFor, ensureSopKb, writeSkillFor } from "@/lib/un/sop-kb-app";
import { assessSop } from "@/lib/un/sop-assess";
import { draftStructureFor, structuringAvailable } from "@/lib/un/sop-structure-service";
import type { LiveBuildResult } from "@/lib/un/sop-kb-live";
import { rollOut } from "@/lib/un/sop-rollout";
import { baseOf, discardSopDraft, getVersion, latestOf, loadAttachment, loadCustomRoots, profilesForUseCase, saveVersion } from "@/lib/un/sop-version-store";
import { customSopFromText, type ProfileOp } from "@/lib/un/sop/custom";
import { MAX_SOP_CHARS } from "@/lib/un/sop/custom-limits";
import { SAMPLES, loadBaseline } from "@/lib/un/sop/data";
import { planManualVersion, planNewVersion } from "@/lib/un/sop/versions";

type Ctx = { params: Promise<{ id: string }> };

/** POST { action: "attach", sop_id }  attach an SOP (a shipped sample or one pasted earlier) at its latest version.
 *      { action: "attach_custom", title, text }  paste an SOP of your own: a new SOP, version 1; job profiles are derived from it and it is attached.
 *      { action: "new_version", text, title? }  publish a NEW VERSION of the attached SOP from new text. It is compared with the last version, only the job
 *        profiles it affects are derived again (added, changed, removed; the rest are kept as they were), and it reaches every use case on this SOP that is
 *        not deployed at once, each rerun. A deployed use case stays on the version it has.
 *      { action: "profile", op: "add" | "update" | "remove", name, new_name?, tasks? }  edit a job profile of the attached SOP: this too makes a new version.
 *      { action: "tick", profile, automate }  tick or untick Automate on one job profile.
 * A deployed use case's SOP is frozen: it cannot be switched here, and a new version reaches it only through a change request from its business process
 * owner (sop-change route). Every change is written to the hash-chained country log. An uploaded SOP gets its knowledge base built here (chunks and vectors, in
 * the knowledge-base store) when it is attached or gets a new version, and ticking a profile builds it if it is missing, stale or was built without vectors.
 * A build that cannot embed says so: the SOP is then not usable by an automated agent until it is built again.
 *      { action: "build_kb" }  build (or rebuild) the knowledge base of the attached SOP now, and record the skills of the profiles that are already ticked. */
export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  // attaching an SOP and ticking its job profiles is entity setup: the entity admin of this use case's entity (or an administrator)
  const who = await requirePermission("entity.setup", { useCaseId: id });
  if (who instanceof NextResponse) return who;
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const orgId = who.org_id!;
  const uc = await loadUseCase(orgId, id);
  if (!uc) return notFound();
  const actor = who.email ?? who.id;
  const audit = (kind: "sop_changed" | "profile_changed" | "sop_version", payload: Record<string, unknown>) => recordChange(appCountryDeps(orgId), actor, kind, { use_case: uc.ext_id, ...payload });
  const fail = (err: string) => NextResponse.json({ error: err }, { status: 500 });
  const frozen = uc.stage === "deployed";
  /** The knowledge base of an SOP, built now when it is missing, stale for this version or was built without vectors. A repo SOP built on disk is only checked. */
  const readyKb = async (sopId: string, version: number): Promise<KbCheck & { built?: LiveBuildResult }> => {
    if ((await ensureSopKb(orgId, sopId)) === "disk") return checkSopKbFor(orgId, sopId, version);
    const check = await checkSopKbFor(orgId, sopId, version);
    if (check.ok) return check;
    const v = (await getVersion(orgId, sopId, version)) ?? (await latestOf(orgId, sopId));
    if (!v) return check;
    const built = await buildSopKb(orgId, { sopId, title: v.title, version: v.version, body: v.body, useCaseExt: uc.ext_id, entity: uc.entity });
    return { ok: built.ready, reason: built.ready ? "vectors current" : built.reason, built };
  };
  const FROZEN = "This use case is deployed, so its SOP is frozen. Its business process owner can ask to move it to a newer version, with a reason and a plan.";

  if (b.action === "attach") {
    if (typeof b.sop_id !== "string") return bad("Unknown SOP");
    const latest = await latestOf(orgId, b.sop_id);
    if (!latest) return bad("Unknown SOP");
    if (frozen) return bad(FROZEN);
    const before = await loadAttachedSop(orgId, id);
    const err = await attachSop(orgId, id, b.sop_id, who.id, latest.version);
    if (err) return fail(err);
    const audited = await audit("sop_changed", { from: before, to: b.sop_id, version: latest.version });
    await sweepPeople(orgId).catch(() => {}); // the job profiles changed: the People agent looks for positions nobody holds
    const kb = await readyKb(b.sop_id, latest.version);
    return NextResponse.json({ ok: true, sop_id: b.sop_id, version: latest.version, audited, kb });
  }

  if (b.action === "attach_custom") {
    if (frozen) return bad(FROZEN);
    const onlyIfVacant = b.intake === true;
    if (onlyIfVacant && typeof b.text === "string" && (Buffer.byteLength(b.text, "utf8") > MAX_SOP_CHARS || b.text.includes("\0"))) {
      return bad("Choose a non-empty Markdown or text file up to 200 KB.");
    }
    const before = await loadAttachedSop(orgId, id);
    if (before && onlyIfVacant) return NextResponse.json({ error: "This use case already has an SOP." }, { status: 409 });
    // Intake analysis: not every SOP needs structuring. One that would give a skill for each of its job profiles is attached as it is. One that would not is
    // drafted by the structuring agent for a person to review, and is NOT attached until a person approves the structure (b.structure === "as_is" attaches it anyway).
    let structureWarning: { reasons: string[]; error: string } | null = null;
    if (b.structure !== "as_is" && typeof b.text === "string") {
      const a = assessSop({ title: b.title, text: b.text, entity: uc.entity, baseline: loadBaseline() });
      if (a.needsStructuring) {
        const title = (typeof b.title === "string" ? b.title.trim() : "").slice(0, 120) || b.text.match(/^#\s+(.+)$/m)?.[1]?.trim().slice(0, 120) || "";
        const drafted = structuringAvailable() ? await draftStructureFor(orgId, id, b.text, title) : ({ ok: false, error: "No model is configured for structuring.", status: 503 } as const);
        if (drafted.ok) return NextResponse.json({ ok: true, needs_structuring: true, drafted: true, reasons: a.reasons, assessment: { profiles: a.profiles, skills: a.skills } });
        // no draft could be made: an SOP that still gives job profiles is attached as it is, with the warning; one that gives none cannot be attached at all
        if (!a.profiles) return NextResponse.json({ error: `${a.reasons[0]} It could not be structured either: ${drafted.error}`, needs_structuring: true, drafted: false }, { status: 422 });
        structureWarning = { reasons: a.reasons, error: drafted.error };
      }
    }
    const taken = onlyIfVacant ? [] : [...(await loadCustomRoots(orgId)), ...SAMPLES.map((s) => s.sop_id)];
    const made = customSopFromText({ title: b.title, text: b.text, entity: uc.entity, baseline: loadBaseline(), takenIds: taken,
      idBase: onlyIfVacant ? randomUUID() : uc.ext_id });
    if (!made.ok) return bad(made.error);
    const e1 = await saveVersion(orgId, { sop_id: made.sop_id, version: 1, title: made.title, body: made.body, profiles: made.profiles, changes: null }, who.id);
    if (e1) return fail(e1);
    const e2 = await attachSop(orgId, id, made.sop_id, who.id, 1, onlyIfVacant);
    if (e2) {
      if (onlyIfVacant && e2.startsWith("An SOP has already")) {
        await discardSopDraft(orgId, made.sop_id, who.id);
        return NextResponse.json({ error: e2 }, { status: 409 });
      }
      return fail(e2);
    }
    const change = { from: before, to: made.sop_id, version: 1, custom: true, profiles: made.profiles.map((p) => p.name) };
    let audited = await audit("sop_changed", change);
    for (let attempt = 0; onlyIfVacant && !audited && attempt < 2; attempt++) audited = await audit("sop_changed", change);
    // the knowledge base (chunks and vectors) of the SOP just attached: a failure to embed does not undo the attach, it is reported
    const kb = await buildSopKb(orgId, { sopId: made.sop_id, title: made.title, version: 1, body: made.body, useCaseExt: uc.ext_id, entity: uc.entity });
    return NextResponse.json({ ok: true, sop_id: made.sop_id, version: 1, profiles: made.profiles.length, audited, kb, ...(structureWarning ? { needs_structuring: true, drafted: false, reasons: structureWarning.reasons, draft_error: structureWarning.error } : {}) });
  }

  if (b.action === "new_version" || b.action === "profile") {
    const sopId = await loadAttachedSop(orgId, id);
    if (!sopId) return bad("Attach an SOP first");
    const prev = await latestOf(orgId, sopId);
    if (!prev) return bad("Unknown SOP");
    let next;
    if (b.action === "new_version") {
      next = planNewVersion(prev, { text: b.text, title: b.title, entity: uc.entity, baseline: loadBaseline() });
      if (!next.ok) return bad(next.error);
    } else {
      if (b.op !== "add" && b.op !== "update" && b.op !== "remove") return bad("op must be add, update or remove");
      const op = (b.op === "add" ? { type: "add", name: b.name, tasks: b.tasks } : b.op === "update" ? { type: "update", name: b.name, new_name: b.new_name, tasks: b.tasks } : { type: "remove", name: b.name }) as ProfileOp;
      const m = planManualVersion(prev, op);
      if (!m.ok) return NextResponse.json({ error: m.error }, { status: m.status ?? 400 });
      next = m;
    }
    const e1 = await saveVersion(orgId, next.version, who.id);
    if (e1) return fail(e1);
    const rollout = await rollOut(orgId, next.version, who.id);
    const audited = await audit(b.action === "profile" ? "profile_changed" : "sop_version", { sop_id: sopId, version: next.version.version, from: prev.version, profiles: next.version.changes?.profiles, moved: rollout.moved, frozen: rollout.frozen });
    const kb = await buildSopKb(orgId, { sopId, title: next.version.title, version: next.version.version, body: next.version.body, useCaseExt: uc.ext_id, entity: uc.entity });
    return NextResponse.json({ ok: true, version: next.version.version, changes: next.version.changes, rollout, audited, kb });
  }

  if (b.action === "tick") {
    const sopId = await loadAttachedSop(orgId, id);
    if (!sopId) return bad("Attach an SOP first");
    if (typeof b.profile !== "string" || typeof b.automate !== "boolean") return bad("profile and automate are required");
    if (!(await profilesForUseCase(orgId, id, sopId))?.some((p) => p.name === b.profile)) return bad("Unknown job profile");
    const version = (await loadAttachment(orgId, id))?.version ?? 1;
    const kb = b.automate ? await readyKb(sopId, version) : null;
    const skill = b.automate && kb?.ok ? await writeSkillFor(orgId, sopId, b.profile, version) : null;
    const err = await saveTick(orgId, id, sopId, b.profile, b.automate, who.id, skill?.ok ? { path: skill.path, sha256: skill.sha256 } : null);
    if (err) return fail(err);
    await sweepPeople(orgId).catch(() => {}); // the job profiles changed: the People agent looks for positions nobody holds
    return NextResponse.json({ ok: true, kb, skill });
  }
  if (b.action === "build_kb") {
    const att = await loadAttachment(orgId, id);
    if (!att) return bad("Attach an SOP first");
    const kb = await readyKb(att.sop_id, att.version);
    // the profiles already ticked get their skill recorded now that the knowledge base is usable
    const skills: { profile: string; ok: boolean; reason?: string }[] = [];
    if (kb.ok) {
      for (const row of (await loadProfileRows(orgId, id, att.sop_id)).filter((r) => r.automate)) {
        const sk = await writeSkillFor(orgId, att.sop_id, row.profile, att.version);
        if (sk.ok) await saveTick(orgId, id, att.sop_id, row.profile, true, who.id, { path: sk.path, sha256: sk.sha256 });
        skills.push(sk.ok ? { profile: row.profile, ok: true } : { profile: row.profile, ok: false, reason: sk.reason });
      }
    }
    return NextResponse.json({ ok: kb.ok, kb, skills });
  }
  void baseOf;
  return bad('action must be "attach", "attach_custom", "new_version", "profile", "tick" or "build_kb"');
}
