import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { bad, notFound, requireAdmin } from "@/lib/api-auth";
import { isUuid } from "@/lib/un/model";
import { withEntityGoals } from "@/lib/un/goals";
import { loadEntityGoals } from "@/lib/un/store";
import { attest, PROFILES, simulatedSijil, TARGET_RUNS, type Profile } from "@/lib/un/sijil";
import { liveConfigFromEnv, pullLive, SijilLiveError } from "@/lib/un/sijil-live";
import { fileReport, loadRuns, loadUseCase } from "@/lib/un/sijil-store";

const MAX_RUNS = 100;
type Ctx = { params: Promise<{ id: string }> };

/** POST { profile, count (1-30) } → adds simulated Sijil runs after the
 * existing ones. With SIJIL_BASE_URL set it instead pulls runs from the live
 * node (body ignored; verify first, nothing stored if the chain fails or the
 * node is unreachable). Reaching TARGET_RUNS files the pilot report. */
export async function POST(request: Request, { params }: Ctx) {
  const who = await requireAdmin();
  if (who instanceof NextResponse) return who;
  const { id } = await params;
  const b = (await request.json().catch(() => ({}))) as { profile?: string; count?: number };
  let live;
  try { live = liveConfigFromEnv(); } catch (e) { return bad(e instanceof Error ? e.message : "Invalid Sijil configuration"); }
  const count = Math.floor(Number(b.count));
  if (!live) {
    if (!b.profile || !(b.profile in PROFILES)) return bad(`profile must be one of ${Object.keys(PROFILES).join(", ")}`);
    if (!(count >= 1 && count <= 30)) return bad("count must be between 1 and 30");
  }
  const uc = await loadUseCase(who.org_id!, id);
  if (!uc) return NextResponse.json({ error: "Use case not found" }, { status: 404 });
  const have = await loadRuns(who.org_id!, id);

  let fresh;
  if (live) {
    let pull;
    try { pull = await pullLive(live, uc); } catch (e) {
      return NextResponse.json({ error: e instanceof SijilLiveError ? e.message : "Sijil pull failed", live: true }, { status: 502 });
    }
    if (!pull.verified) {
      return NextResponse.json({ error: `Sijil chain verification FAILED; nothing imported or filed. ${pull.verifyOutput}`.trim(), live: true, verified: false }, { status: 409 });
    }
    // Run numbers follow task order, so a repeat pull only adds new tasks.
    fresh = pull.runs.filter((r) => r.run_no > have.length).slice(0, MAX_RUNS - have.length);
  } else {
    if (have.length + count > MAX_RUNS) return bad(`At most ${MAX_RUNS} runs per use case`);
    fresh = simulatedSijil.runs(uc, b.profile as Profile, have.length + 1, count);
  }
  fresh = withEntityGoals(fresh, await loadEntityGoals(who.org_id!, uc.entity));
  if (fresh.length) {
    const { error } = await createAdminClient().from("un_sijil_runs").insert(
      fresh.map((r) => ({ ...r, org_id: who.org_id, use_case_id: id })),
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const all = [...have, ...fresh];
  // At or past the target every batch refiles, so the dashboard never lags the runs.
  const filed = all.length >= TARGET_RUNS && (fresh.length > 0 || !live);
  const res = filed ? await fileReport(who.org_id!, uc, all) : null;
  return NextResponse.json({ runs: all.length, added: fresh.length, live: Boolean(live), verified: live ? true : undefined, filed: Boolean(res), applied: res?.applied ?? false, attestation: attest(all) });
}

/** PUT → file an interim report now (does not change compliance below the target). */
export async function PUT(_req: Request, { params }: Ctx) {
  const who = await requireAdmin();
  if (who instanceof NextResponse) return who;
  const { id } = await params;
  const uc = await loadUseCase(who.org_id!, id);
  if (!uc) return NextResponse.json({ error: "Use case not found" }, { status: 404 });
  const runs = await loadRuns(who.org_id!, id);
  if (!runs.length) return bad("Run the pilot first");
  const res = await fileReport(who.org_id!, uc, runs);
  return NextResponse.json({ filed: true, ...res });
}

/** DELETE → clear the runs and compliance for a fresh demo run. Filed reports stay. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const who = await requireAdmin();
  if (who instanceof NextResponse) return who;
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const admin = createAdminClient();
  const { error } = await admin.from("un_sijil_runs").delete().eq("org_id", who.org_id!).eq("use_case_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await admin.from("un_use_cases").update({ compliant: false, updated_at: new Date().toISOString() }).eq("id", id).eq("org_id", who.org_id!);
  return NextResponse.json({ ok: true });
}
