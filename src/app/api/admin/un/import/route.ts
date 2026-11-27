import { NextResponse } from "next/server";
import { bad, requireAdmin, requirePermission } from "@/lib/api-auth";
import { entityRegistrationReady, loadState } from "@/lib/un/country-actions";
import { appCountryDeps } from "@/lib/un/country-app";
import { countryIn, entityCountryOf } from "@/lib/un/country";
import { loadHiddenEntities } from "@/lib/un/entity-store";
import { hasMeasuredGoals } from "@/lib/un/goals";
import { parseUseCases } from "@/lib/un/model";
import { importUnUseCases, loadUnUseCases } from "@/lib/un/store";
import { loadGoalsResolved } from "@/lib/un/target-store";
import { checkTargets, parseTargetsCsv } from "@/lib/un/targets-csv";
import { proposeTargetsFor, type ProposeResult } from "@/lib/un/targets-propose";
import { draftTargetsForAll } from "@/lib/un/targets-agent";

/** POST text/csv body (or { csv, targets_csv?, scope? }) → { imported, targets? } | 400 { error, errors[] }
 * targets_csv is the optional second file: one row per process target. It is checked with the use-case file before
 * anything is stored, and it only PROPOSES targets: a different person still approves them. */
export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > 1_000_000) return bad("File is too large");
  let csv = raw;
  let scope: { country: string; entity: string } | undefined;
  let targetsCsv = "";
  if (raw.trimStart().startsWith("{")) {
    try {
      const body = JSON.parse(raw);
      csv = String(body.csv ?? "");
      targetsCsv = typeof body.targets_csv === "string" ? body.targets_csv : "";
      if (body.scope !== undefined) {
        if (typeof body.scope?.country !== "string" || typeof body.scope?.entity !== "string" || !body.scope.entity.trim()) return bad("Select a country and entity.");
        scope = { country: body.scope.country, entity: body.scope.entity };
      }
    } catch {
      return bad("Invalid JSON");
    }
  }
  // a list for one entity is that entity admin's to import; a list that names no entity is an administrator's
  const who = scope ? await requirePermission("entity.setup", { entity: scope.entity }) : await requireAdmin();
  if (who instanceof NextResponse) return who;
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
  // the targets file is read and judged now, so that a bad row stops the whole upload before anything is stored
  const parsedTargets = targetsCsv.trim() ? parseTargetsCsv(targetsCsv) : null;
  if (parsedTargets?.errors.length) return NextResponse.json({ error: parsedTargets.errors[0], errors: parsedTargets.errors.slice(0, 20) }, { status: 400 });
  if (parsedTargets) {
    const stored = new Map((await loadUnUseCases(orgId)).map((u) => [u.ext_id, u.entity]));
    const incomingEntity = new Map(useCases.map((u) => [u.ext_id, u.entity]));
    const entityOf = (id: string) => incomingEntity.get(id) ?? stored.get(id);
    const names = new Set([...parsedTargets.byUseCase.keys()].map(entityOf).filter((n): n is string => !!n));
    const goals = new Map(await Promise.all([...names].map(async (n) => [n, (await loadGoalsResolved(orgId, n)).goals] as const)));
    const errs = checkTargets(parsedTargets.byUseCase, entityOf, (n) => goals.get(n) ?? []);
    if (errs.length) return NextResponse.json({ error: errs[0], errors: errs.slice(0, 20) }, { status: 400 });
  }
  const err = await importUnUseCases(orgId, useCases);
  if (err) return NextResponse.json({ error: err }, { status: 500 });
  const rows = new Map((await loadUnUseCases(orgId)).map((u) => [u.ext_id, u]));
  const results: ProposeResult[] = [];
  for (const [ext, targets] of parsedTargets?.byUseCase ?? []) {
    const row = rows.get(ext);
    results.push(row ? await proposeTargetsFor(orgId, { id: row.id, ext_id: ext, entity: row.entity }, targets, { id: who.id, email: who.email }, "Proposed from the use-case upload") : { ext_id: ext, outcome: "failed", error: "The use case could not be found after the upload." });
  }
  // every uploaded use case the targets file did not cover gets a draft from the targets agent (a pending proposal: a person edits and approves it)
  const covered = new Set(parsedTargets?.byUseCase.keys() ?? []);
  const drafts = await draftTargetsForAll(orgId, useCases.filter((u) => !covered.has(u.ext_id)).flatMap((u) => rows.get(u.ext_id) ?? []));
  return NextResponse.json({ imported: useCases.length, targets: {
    proposed: results.filter((r) => r.outcome === "proposed").map((r) => r.ext_id),
    unchanged: results.filter((r) => r.outcome === "unchanged").map((r) => r.ext_id),
    failed: [...results.flatMap((r) => (r.outcome === "failed" ? [{ ext_id: r.ext_id, error: r.error }] : [])), ...drafts.flatMap((d) => (d.outcome === "failed" ? [{ ext_id: d.ext_id, error: d.error }] : []))],
    drafted: drafts.filter((d) => d.outcome === "drafted").map((d) => d.ext_id),
    skipped: drafts.flatMap((d) => (d.outcome === "skipped" ? [{ ext_id: d.ext_id, reason: d.reason }] : [])),
  } });
}
