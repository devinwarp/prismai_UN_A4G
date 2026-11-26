import { NextResponse } from "next/server";
import { bad, forbidden, notFound, requirePermission } from "@/lib/api-auth";
import { recordChange } from "@/lib/un/country-actions";
import { noticeAsk, noticeDone } from "@/lib/un/inbox-service";
import { appCountryDeps } from "@/lib/un/country-app";
import { rerunAffected } from "@/lib/un/gates-rerun";
import { isUuid } from "@/lib/un/model";
import { parseReason, planRequest, planRerun } from "@/lib/un/rerun";
import { insertRequest, loadRerunView, resolveRequest } from "@/lib/un/rerun-store";
import { loadUseCase } from "@/lib/un/sijil-store";

/** POST { action: "request", reason } → the business process owner asks for a rerun of a use case that is in production (deployed); needs rerun.request
 *  for this use case. A reason is required. One request is open at a time.
 *  POST { action: "run" } → reruns the use case's verdict as a NEW run under today's rules and SOP; needs rerun.run. A use case that is not yet deployed
 *  can be rerun directly. A deployed one only while a request is open, and the rerun uses the request up. The earlier verdict, run and signature are never
 *  touched: a person signs the new run if they accept it. Both actions are written to the hash-chained country log. Nothing reruns a deployed use case by itself. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const who = await requirePermission(["rerun.request", "rerun.run"], { useCaseId: id });
  if (who instanceof NextResponse) return who;
  const orgId = who.org_id!;
  const uc = await loadUseCase(orgId, id);
  if (!uc) return notFound();
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const view = (await loadRerunView(orgId, [{ id, ext_id: uc.ext_id }], { log: [], countryOf: () => "UAE" }))[id];
  const actor = who.email ?? who.id;
  const d = appCountryDeps(orgId);

  if (b.action === "request") {
    const may = who.decide("rerun.request");
    if (!may.ok) return forbidden(may.reason);
    const plan = planRequest(uc.stage, view);
    if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: plan.status });
    const r = parseReason(b.reason);
    if (!r.ok) return bad(r.error);
    const err = await insertRequest(orgId, { use_case_id: id, requested_by: who.id, requested_email: who.email, reason: r.reason });
    if (err) return NextResponse.json({ error: err }, { status: 500 });
    const audited = await recordChange(d, actor, "rerun_requested", { use_case: uc.ext_id, reason: r.reason });
    await noticeAsk(orgId, id, { step: "monitor", key: `rerun:${id}`, kind: "rerun.requested", subject: `A rerun was requested for ${uc.ext_id}`, body: `The process owner asked for a rerun of ${uc.ext_id}, which is in production. Reason: ${r.reason}`, link: `/admin/federal/use-cases/${id}`, by: who.id });
    return NextResponse.json({ ok: true, audited });
  }

  if (b.action === "run") {
    const may = who.decide("rerun.run");
    if (!may.ok) return forbidden(may.reason);
    const plan = planRerun(uc.stage, view);
    if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: plan.status });
    const out = await rerunAffected(orgId, [uc.ext_id], who.id);
    if (!out.length) return NextResponse.json({ error: "The earlier run could not be repeated." }, { status: 409 });
    if (view.open) await resolveRequest(orgId, view.open.id, who.id, out[0].run_id);
    const audited = await recordChange(d, actor, "rerun_done", { use_case: uc.ext_id, run_id: out[0].run_id, request: view.open?.id ?? null, requested_by: view.open?.requested_email ?? null });
    await noticeDone(orgId, id, { step: "monitor", key: `rerun:${id}`, kind: "rerun.done", subject: `${uc.ext_id} was rerun`, body: `${uc.ext_id} was rerun as a new run under today's rules and SOP. A person signs the new run if they accept it.`, link: `/admin/federal/use-cases/${id}`, by: who.id, ref: String(out[0].run_id).slice(0, 8) });
    return NextResponse.json({ ok: true, run_id: out[0].run_id, audited });
  }
  return bad('action must be "request" or "run"');
}
