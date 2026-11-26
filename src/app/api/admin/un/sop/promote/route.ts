import { NextResponse } from "next/server";
import { bad, requireAdmin } from "@/lib/api-auth";
import { loadCountrySop } from "@/lib/un/federal-country";
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
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return bad("Invalid JSON");
  }
  const context = await loadCountrySop(who.org_id!, body?.country, true);
  const input = inputFromBody(body, context.country.currency ?? null, !context.uc02);
  if (typeof input === "string") return bad(input);
  const { country, entities, uc02 } = context;
  const requestedEntity = typeof body.entity === "string" ? body.entity.trim() : "";
  const entity = requestedEntity || uc02?.entity;
  if (!entity || !entities.includes(entity)) return bad("Choose an entity linked to this country.");
  input.metadata.entity = entity;
  if (country.id !== "UAE") input.sop_id = country.id.toLowerCase() + "-" + input.sop_id;
  const analysis = await ruleAnalyzer.analyze(input);
  if (!analysis.steps.length) return bad("No steps were found in this SOP, so there is nothing to promote.");
  const uc = toUseCase(analysis, input);
  const err = await importUnUseCases(who.org_id!, [uc]);
  if (err) return NextResponse.json({ error: err }, { status: 500 });
  const q = new URLSearchParams({ f: "1", country: country.id, ev: "none", step: "T1" });
  if (uc02) q.append("uc", uc02.ext_id);
  q.append("uc", uc.ext_id);
  return NextResponse.json({ ext_id: uc.ext_id, use_case: uc, compare_url: `/admin/federal/compare?${q}` });
}
