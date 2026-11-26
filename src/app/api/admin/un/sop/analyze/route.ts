import { NextResponse } from "next/server";
import { bad, requireAdmin, requirePermission } from "@/lib/api-auth";
import { loadCountrySop } from "@/lib/un/federal-country";
import { inputFromBody } from "@/lib/un/sop/data";
import { llmAnalyzer } from "@/lib/un/sop/llm";
import { ruleAnalyzer } from "@/lib/un/sop/reference";

/** POST { sample } | { text, title?, entity? , use_model? } -> SopAnalysis. Pure: nothing is stored.
 * Admin only (uploads cost compute and may call a model); viewers read the precomputed samples on the page. */
export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > 400_000) return bad("The SOP is too large (200 KB limit).");
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return bad("Invalid JSON");
  }
  // an SOP for one entity is that entity admin's to upload; one that names no entity is an administrator's
  const forEntity = typeof body?.entity === "string" ? body.entity.trim() : "";
  const who = forEntity ? await requirePermission("entity.setup", { entity: forEntity }) : await requireAdmin();
  if (who instanceof NextResponse) return who;
  const context = await loadCountrySop(who.org_id!, body?.country, true);
  const input = inputFromBody(body, context.country.currency ?? null, !context.uc02);
  if (typeof input === "string") return bad(input);
  const analysis = await (body.use_model === true ? llmAnalyzer() : ruleAnalyzer).analyze(input, request.signal);
  return NextResponse.json({ input: { sop_id: input.sop_id, title: input.title, text: input.text }, analysis });
}
