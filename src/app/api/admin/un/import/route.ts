import { NextResponse } from "next/server";
import { bad, requireAdmin } from "@/lib/api-auth";
import { entityRegistrationReady, loadState } from "@/lib/un/country-actions";
import { appCountryDeps } from "@/lib/un/country-app";
import { countryIn, entityCountryOf } from "@/lib/un/country";
import { loadHiddenEntities } from "@/lib/un/entity-store";
import { hasMeasuredGoals } from "@/lib/un/goals";
import { parseUseCases } from "@/lib/un/model";
import { importUnUseCases, loadUnUseCases } from "@/lib/un/store";
import { loadGoalsResolved } from "@/lib/un/target-store";

/** POST text/csv body (or { csv }) → { imported } | 400 { error, errors[] } */
export async function POST(request: Request) {
  const who = await requireAdmin();
  if (who instanceof NextResponse) return who;
  const raw = await request.text();
  if (raw.length > 1_000_000) return bad("File is too large");
  let csv = raw;
  let scope: { country: string; entity: string } | undefined;
  if (raw.trimStart().startsWith("{")) {
    try {
      const body = JSON.parse(raw);
      csv = String(body.csv ?? "");
      if (body.scope !== undefined) {
        if (typeof body.scope?.country !== "string" || typeof body.scope?.entity !== "string" || !body.scope.entity.trim()) return bad("Select a country and entity.");
        scope = { country: body.scope.country, entity: body.scope.entity };
      }
    } catch {
      return bad("Invalid JSON");
    }
  }
  const { useCases, errors } = parseUseCases(csv);
  if (errors.length) {
    return NextResponse.json({ error: errors[0], errors: errors.slice(0, 20) }, { status: 400 });
  }
  const orgId = who.org_id!;
  if (scope) {
    const { country: id, entity } = scope;
    if (useCases.some((useCase) => useCase.entity !== entity)) return bad("Every CSV row must belong to the selected entity.");
    const deps = appCountryDeps(orgId);
    const [{ state }, { goals }, hidden, existing] = await Promise.all([
      loadState(deps), loadGoalsResolved(orgId, entity), loadHiddenEntities(orgId), loadUnUseCases(orgId),
    ]);
    const country = countryIn(state, id);
    if (!country || entityCountryOf(state, entity) !== id || hidden.has(entity)) return bad("The entity is unavailable in the selected country.");
    if (!(await entityRegistrationReady(deps, state, country)) || !hasMeasuredGoals(goals)) {
      return NextResponse.json({ error: "Complete country setup and the entity’s measured goals before importing use cases here." }, { status: 409 });
    }
    const incoming = new Set(useCases.map((useCase) => useCase.ext_id));
    if (existing.some((useCase) => incoming.has(useCase.ext_id) && useCase.entity !== entity)) {
      return NextResponse.json({ error: "A CSV use-case ID already belongs to a different entity." }, { status: 409 });
    }
  }
  const err = await importUnUseCases(orgId, useCases);
  if (err) return NextResponse.json({ error: err }, { status: 500 });
  return NextResponse.json({ imported: useCases.length });
}
