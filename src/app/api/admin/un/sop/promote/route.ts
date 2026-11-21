import { NextResponse } from "next/server";
import { bad, requireAdmin } from "@/lib/api-auth";
import { inputFromBody } from "@/lib/un/sop/data";
import { toUseCase } from "@/lib/un/sop/promote";
import { ruleAnalyzer } from "@/lib/un/sop/reference";
import { importUnUseCases } from "@/lib/un/store";

/** POST { sample } | { text, title?, entity? } -> { ext_id, compare_url }.
 * The analysis is recomputed here by the rules, never taken from the client, so a row
 * always matches what the reference analyzer says about the text. */
export async function POST(request: Request) {
  const who = await requireAdmin();
  if (who instanceof NextResponse) return who;
  if (Number(request.headers.get("content-length") ?? 0) > 400_000) return bad("The SOP is too large (200 KB limit).");
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return bad("Invalid JSON");
  }
  const input = inputFromBody(body);
  if (typeof input === "string") return bad(input);
  const analysis = await ruleAnalyzer.analyze(input);
  if (!analysis.steps.length) return bad("No steps were found in this SOP, so there is nothing to promote.");
  const uc = toUseCase(analysis, input);
  const err = await importUnUseCases(who.org_id!, [uc]);
  if (err) return NextResponse.json({ error: err }, { status: 500 });
  const q = new URLSearchParams({ f: "1", j: "uae", ev: "none", step: "T1" });
  for (const id of ["UC02", uc.ext_id]) q.append("uc", id);
  return NextResponse.json({ ext_id: uc.ext_id, use_case: uc, compare_url: `/admin/federal/compare?${q}` });
}
