import { NextResponse } from "next/server";
import { bad, notFound, requirePermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/un/model";
import { approvalBlockers, effectiveGates, evidenceFor } from "@/lib/un/gates";
import { factsOf, loadGov } from "@/lib/un/gates-store";
import { loadRelease } from "@/lib/un/release-store";
import { loadRun } from "@/lib/un/runs";
import { loadUseCase } from "@/lib/un/sijil-store";
import { targetsHash } from "@/lib/un/targets";
import { appendEntry, approvalState, configOf, verifyChain } from "@/lib/un/tuning";
import { appendLog, loadLog } from "@/lib/un/tuning-store";

/** POST { decision: "SIGN" | "WITHHOLD", comment } → a person's decision on a certified agent version,
 * appended to the tuning log. SIGN moves the use case to the "approved" stage. It does not write a
 * verdict: verdicts come only from a signed scenario run (guard.ts). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const who = await requirePermission("tuning.approve", { useCaseId: id });
  if (who instanceof NextResponse) return who;
  const b = (await request.json().catch(() => ({}))) as { decision?: unknown; comment?: unknown };
  if (b.decision !== "SIGN" && b.decision !== "WITHHOLD") return bad('decision must be "SIGN" or "WITHHOLD"');
  const comment = typeof b.comment === "string" ? b.comment.trim().slice(0, 1000) : "";
  if (b.decision === "WITHHOLD" && !comment) return bad("Withholding approval needs a comment");
  const uc = await loadUseCase(who.org_id!, id);
  if (!uc) return notFound();

  const log = await loadLog(who.org_id!, id);
  const v = verifyChain(log);
  if (!v.ok) return NextResponse.json({ error: `The tuning log failed verification at entry ${v.broken_seq}: ${v.reason}` }, { status: 409 });
  if (approvalState(log) !== "ready") return NextResponse.json({ error: "Nothing is certified and waiting for a decision." }, { status: 409 });

  // Every effective gate (rule set, admin-added, use-case-added) must be pass, or waived, before approval.
  if (b.decision === "SIGN") {
    const eff = effectiveGates({ ext: uc.ext_id, facts: factsOf(uc), gov: await loadGov(who.org_id!) });
    const run = uc.verdict_run_id ? await loadRun(who.org_id!, uc.verdict_run_id) : null;
    const blockers = approvalBlockers(eff, evidenceFor(eff, uc.ext_id, run?.state.state?.gates ?? {}));
    if (blockers.length) return NextResponse.json({ error: `Approval needs every effective gate to pass. Not yet passing: ${blockers.map((x) => `${x.label} (${x.status})`).join("; ")}.` }, { status: 409 });
  }
  // and a met pilot: the final report is what the person signs, and the entry records exactly which reports and targets that was
  let release: Awaited<ReturnType<typeof loadRelease>> | null = null;
  if (b.decision === "SIGN") {
    release = await loadRelease(who.org_id!, id);
    if (!release.ok) return NextResponse.json({ error: `Approval needs a met pilot. Not ready: ${release.blockers.slice(0, 6).map((x) => x.message).join(" ")}${release.blockers.length > 6 ? ` (and ${release.blockers.length - 6} more)` : ""}`, blockers: release.blockers }, { status: 409 });
  }
  const signer = who.email ?? who.id;
  const entry = appendEntry(log[log.length - 1], "approval", signer, { version: configOf(log)?.version ?? null, decision: b.decision, signer, comment, ...(release ? { release: { reports: release.reports, targets_hash: release.targets ? targetsHash(release.targets) : null } } : {}) }, new Date().toISOString());
  const err = await appendLog(who.org_id!, id, [entry]);
  if (err) return NextResponse.json({ error: err }, { status: 500 });
  if (b.decision === "SIGN") await createAdminClient().from("un_use_cases").update({ stage: "approved", updated_at: new Date().toISOString() }).eq("id", id).eq("org_id", who.org_id!);
  return NextResponse.json({ ok: true, decision: b.decision, hash: entry.hash });
}
