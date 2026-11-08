import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { bad, requireAdmin } from "@/lib/api-auth";
import { startRun } from "@/lib/un/scenario";
import { SCENARIOS } from "@/lib/un/scenarios";
import { headOf } from "@/lib/un/runs";
import { loadPolicy, loadUnUseCases } from "@/lib/un/store";

/** POST { scenario_id } → { id }. S3 needs the 20 use cases imported first. */
export async function POST(request: Request) {
  const who = await requireAdmin();
  if (who instanceof NextResponse) return who;
  const b = (await request.json().catch(() => ({}))) as { scenario_id?: string };
  const sc = b.scenario_id ? SCENARIOS[b.scenario_id] : undefined;
  if (!sc) return bad(`scenario_id must be one of ${Object.keys(SCENARIOS).join(", ")}`);
  const admin = createAdminClient();
  const id = crypto.randomUUID();
  let state;
  try {
    state = startRun(sc, `${sc.id}-${id.slice(0, 8)}`, sc.kind === "portfolio"
      ? { cases: await loadUnUseCases(who.org_id!), policy: await loadPolicy(who.org_id!) }
      : {});
  } catch {
    return bad("Import the use cases on the Federal page first (S3 runs over them).");
  }
  const { error } = await admin.from("un_runs").insert({
    id, org_id: who.org_id, scenario_id: sc.id, state, head_hash: headOf(state), created_by: who.id,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id });
}
