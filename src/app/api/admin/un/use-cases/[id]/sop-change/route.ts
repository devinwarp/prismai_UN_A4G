import { NextResponse } from "next/server";
import { bad, forbidden, notFound, requirePermission } from "@/lib/api-auth";
import { recordChange } from "@/lib/un/country-actions";
import { appCountryDeps } from "@/lib/un/country-app";
import { rerunAffected } from "@/lib/un/gates-rerun";
import { isUuid } from "@/lib/un/model";
import { attachSop } from "@/lib/un/profiles-store";
import { getVersion, insertChangeRequest, latestOf, loadAttachment, loadChangeRequests, resolveChangeRequest, syncTicks } from "@/lib/un/sop-version-store";
import { loadUseCase } from "@/lib/un/sijil-store";
import { parseChange, planChangeRequest, planResolve } from "@/lib/un/sop/change";
import { loadRerunView } from "@/lib/un/rerun-store";

/** POST { action: "request", reason, plan } → the business process owner of a DEPLOYED use case asks to move it to the latest version of its SOP: why, and a
 *  plan for the change (what will be checked, in what order, how it can be undone). Needs sop.change.request for this use case. One request is open at a time.
 *  POST { action: "apply" } → an admin moves the use case to the version in the request: its job profiles follow (a profile that is gone loses its Automate
 *  tick) and it is rerun as a new run. Needs sop.change.apply.   POST { action: "decline", note? } → an admin declines it; the use case stays as it is.
 * A use case that is not deployed needs none of this: a new version reaches it by itself. Each step is written to the hash-chained country log. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const who = await requirePermission(["sop.change.request", "sop.change.apply"], { useCaseId: id });
  if (who instanceof NextResponse) return who;
  const orgId = who.org_id!;
  const uc = await loadUseCase(orgId, id);
  if (!uc) return notFound();
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const att = await loadAttachment(orgId, id);
  if (!att) return bad("This use case has no SOP attached.");
  const open = (await loadChangeRequests(orgId).catch(() => [])).filter((r) => r.use_case_id === id && r.status === "open").at(-1) ?? null;
  const actor = who.email ?? who.id;
  const d = appCountryDeps(orgId);
  const log = (kind: "sop_change_requested" | "sop_change_applied" | "sop_change_declined", payload: Record<string, unknown>) => recordChange(d, actor, kind, { use_case: uc.ext_id, sop_id: att.sop_id, ...payload });

  if (b.action === "request") {
    const may = who.decide("sop.change.request");
    if (!may.ok) return forbidden(may.reason);
    const latest = await latestOf(orgId, att.sop_id);
    if (!latest) return bad("Unknown SOP");
    const plan = planChangeRequest({ stage: uc.stage, attached: att.version, latest: latest.version, open: !!open });
    if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: plan.status });
    const p = parseChange(b.reason, b.plan);
    if (!p.ok) return bad(p.error);
    const err = await insertChangeRequest(orgId, { use_case_id: id, sop_id: att.sop_id, from_version: att.version, to_version: latest.version, requested_by: who.id, requested_email: who.email, reason: p.reason, plan: p.plan });
    if (err) return NextResponse.json({ error: err }, { status: 500 });
    const audited = await log("sop_change_requested", { from: att.version, to: latest.version, reason: p.reason, plan: p.plan });
    return NextResponse.json({ ok: true, audited });
  }

  if (b.action === "apply" || b.action === "decline") {
    const may = who.decide("sop.change.apply");
    if (!may.ok) return forbidden(may.reason);
    const res = planResolve(open);
    if (!res.ok || !open) return NextResponse.json({ error: res.ok ? "No open request" : res.error }, { status: res.ok ? 409 : res.status });
    if (b.action === "decline") {
      const note = typeof b.note === "string" ? b.note.trim().slice(0, 500) : null;
      const err = await resolveChangeRequest(orgId, open.id, "declined", who.id, { note });
      if (err) return NextResponse.json({ error: err }, { status: 500 });
      const audited = await log("sop_change_declined", { request: open.id, note });
      return NextResponse.json({ ok: true, audited });
    }
    const target = await getVersion(orgId, att.sop_id, open.to_version);
    if (!target) return bad("That SOP version no longer exists.");
    const e1 = await attachSop(orgId, id, att.sop_id, who.id, target.version);
    if (e1) return NextResponse.json({ error: e1 }, { status: 500 });
    await syncTicks(orgId, id, att.sop_id, target.profiles.map((p) => p.name));
    // the change request is what allows this rerun of a deployed use case; a use case with no earlier run has nothing to repeat
    const view = (await loadRerunView(orgId, [{ id, ext_id: uc.ext_id }], { log: [], countryOf: () => "UAE" }))[id];
    const reran = view?.hasRun ? await rerunAffected(orgId, [uc.ext_id], who.id) : [];
    const runId = reran[0]?.run_id ?? null;
    await resolveChangeRequest(orgId, open.id, "applied", who.id, { run_id: runId });
    const audited = await log("sop_change_applied", { request: open.id, from: att.version, to: target.version, requested_by: open.requested_email, run_id: runId });
    return NextResponse.json({ ok: true, version: target.version, run_id: runId, audited });
  }
  return bad('action must be "request", "apply" or "decline"');
}
