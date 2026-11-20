import { NextResponse } from "next/server";
import { bad, notFound, requireAdmin } from "@/lib/api-auth";
import { activeCases, evalSetFor } from "@/lib/un/evalset";
import { alignment, runEvalSet } from "@/lib/un/eval-run";
import { saveEvalRun } from "@/lib/un/eval-store";
import { isUuid } from "@/lib/un/model";
import { loadUseCase } from "@/lib/un/sijil-store";
import { baselineConfig } from "@/lib/un/subject";
import { configOf, designationOf } from "@/lib/un/tuning";
import { loadLog } from "@/lib/un/tuning-store";

type Ctx = { params: Promise<{ id: string }> };

/** POST → run the use case's eval set against the baseline agent (SIMULATED subject agent and
 * Sijil gate) and store the run. Later slices add tuned versions; this one records the pilot start. */
export async function POST(_req: Request, { params }: Ctx) {
  const who = await requireAdmin();
  if (who instanceof NextResponse) return who;
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const uc = await loadUseCase(who.org_id!, id);
  if (!uc) return notFound();
  const cases = evalSetFor(uc.ext_id);
  if (!cases.length) return bad(`No eval set for ${uc.ext_id} yet`);
  const log = await loadLog(who.org_id!, id);
  const run = runEvalSet(configOf(log) ?? baselineConfig(`${uc.ext_id}-agent`), activeCases(cases, designationOf(log)));
  const saved = await saveEvalRun(who.org_id!, id, run);
  if ("error" in saved) return NextResponse.json({ error: saved.error }, { status: 500 });
  return NextResponse.json({ id: saved.id, summary: run.summary, alignment: alignment(run.summary), sha256: run.sha256 });
}
