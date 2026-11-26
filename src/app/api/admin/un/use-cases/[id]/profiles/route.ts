import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { bad, notFound, requirePermission } from "@/lib/api-auth";
import { recordChange } from "@/lib/un/country-actions";
import { appCountryDeps } from "@/lib/un/country-app";
import { isUuid } from "@/lib/un/model";
import { attachSop, loadAttachedSop, saveTick } from "@/lib/un/profiles-store";
import { loadUseCase } from "@/lib/un/sijil-store";
import { checkSopKb, writeSkill } from "@/lib/un/skill-extract";
import { rollOut } from "@/lib/un/sop-rollout";
import { baseOf, discardSopDraft, latestOf, loadCustomRoots, profilesForUseCase, saveVersion } from "@/lib/un/sop-version-store";
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
 * owner (sop-change route). Every change is written to the hash-chained country log. A custom SOP has no knowledge base, so it can be ticked (and assessed)
 * but has no skill file or generated tests. */
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
    return NextResponse.json({ ok: true, sop_id: b.sop_id, version: latest.version, audited });
  }

  if (b.action === "attach_custom") {
    if (frozen) return bad(FROZEN);
    const onlyIfVacant = b.intake === true;
    if (onlyIfVacant && typeof b.text === "string" && (Buffer.byteLength(b.text, "utf8") > MAX_SOP_CHARS || b.text.includes("\0"))) {
      return bad("Choose a non-empty Markdown or text file up to 200 KB.");
    }
    const before = await loadAttachedSop(orgId, id);
    if (before && onlyIfVacant) return NextResponse.json({ error: "This use case already has an SOP." }, { status: 409 });
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
    return NextResponse.json({ ok: true, sop_id: made.sop_id, version: 1, profiles: made.profiles.length, audited });
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
    return NextResponse.json({ ok: true, version: next.version.version, changes: next.version.changes, rollout, audited });
  }

  if (b.action === "tick") {
    const sopId = await loadAttachedSop(orgId, id);
    if (!sopId) return bad("Attach an SOP first");
    if (typeof b.profile !== "string" || typeof b.automate !== "boolean") return bad("profile and automate are required");
    if (!(await profilesForUseCase(orgId, id, sopId))?.some((p) => p.name === b.profile)) return bad("Unknown job profile");
    const kb = b.automate ? checkSopKb(sopId) : null;
    const skill = b.automate && kb?.ok ? writeSkill(sopId, b.profile) : null;
    const err = await saveTick(orgId, id, sopId, b.profile, b.automate, who.id, skill?.ok ? { path: skill.path, sha256: skill.sha256 } : null);
    if (err) return fail(err);
    return NextResponse.json({ ok: true, kb, skill });
  }
  void baseOf;
  return bad('action must be "attach", "attach_custom", "new_version", "profile" or "tick"');
}
