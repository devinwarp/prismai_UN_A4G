import { parseCsv } from "./model.ts";
import { CHECK_CRITERIA, CHECK_SCOPES, validateTargets, type Target } from "./targets.ts";
import type { EntityGoal } from "./goals.ts";

// The optional second file of the use-case upload: one row per process target, keyed by the use case's id. Pure: no I/O.
//
// Columns (order is free): use_case_id, id, kind, goal_id, statement, comparator, value, unit, measured_by, evidence,
// and optionally param_key, check_criterion, check_scope. The file only PROPOSES targets: nothing in it is approved, and
// the use case's targets still need a second person to approve them (targets.ts).

export const TARGET_COLUMNS: { name: string; required: boolean; note: string }[] = [
  { name: "use_case_id", required: true, note: "The id of the use case, as in the use-case file, e.g. UC09" },
  { name: "id", required: true, note: "Target id, unique within the use case, e.g. T1" },
  { name: "kind", required: false, note: "outcome (default) or control" },
  { name: "goal_id", required: false, note: "The entity goal an outcome target contributes to; empty for a control" },
  { name: "statement", required: true, note: "The commitment in words" },
  { name: "comparator", required: true, note: "min or max" },
  { name: "value", required: true, note: "A number" },
  { name: "unit", required: true, note: "percent, business_hours, minutes or count" },
  { name: "measured_by", required: true, note: "pilot or go_live" },
  { name: "evidence", required: true, note: "How and from what it is measured" },
  { name: "param_key", required: false, note: "The verdict parameter a pilot target feeds" },
  { name: "check_criterion", required: false, note: "accuracy, hallucination, human_final_approval or ai_disclosure" },
  { name: "check_scope", required: false, note: "all or client_facing (with check_criterion)" },
];

export interface ParsedTargets {
  /** The proposed targets of each use case, keyed by use-case id, in file order. */
  byUseCase: Map<string, Target[]>;
  errors: string[];
}

/** Header-driven and all-or-nothing, like the use-case file: any error means no rows. Values are read, not judged: the
 * rules in validateTargets (goals, units, ranges) are applied by checkTargets once the entity's goals are known. */
export function parseTargetsCsv(text: string): ParsedTargets {
  const byUseCase = new Map<string, Target[]>();
  const rows = parseCsv(text);
  if (!rows.length) return { byUseCase, errors: ["The targets file is empty."] };
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const missing = TARGET_COLUMNS.filter((c) => c.required && !head.includes(c.name)).map((c) => c.name);
  if (missing.length) return { byUseCase, errors: [`The targets file is missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.`] };
  const unknown = head.filter((h) => h && !TARGET_COLUMNS.some((c) => c.name === h));
  if (unknown.length) return { byUseCase, errors: [`The targets file has unknown column${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}.`] };
  const col = (r: string[], k: string) => { const i = head.indexOf(k); return i < 0 ? "" : (r[i] ?? "").trim(); };
  const errors: string[] = [];
  rows.slice(1).forEach((r, n) => {
    const at = `Targets line ${n + 2}`;
    const uc = col(r, "use_case_id");
    if (!uc) { errors.push(`${at}: use_case_id is empty.`); return; }
    const raw = col(r, "value");
    const value = raw === "" ? NaN : Number(raw);
    const t: Record<string, unknown> = {
      id: col(r, "id"), statement: col(r, "statement"), comparator: col(r, "comparator").toLowerCase(), value,
      unit: col(r, "unit").toLowerCase(), measured_by: col(r, "measured_by").toLowerCase(), evidence: col(r, "evidence"),
    };
    const kind = col(r, "kind").toLowerCase();
    if (kind) t.kind = kind;
    const goal = col(r, "goal_id");
    if (goal) t.goal_id = goal;
    const param = col(r, "param_key");
    if (param) t.param_key = param;
    const criterion = col(r, "check_criterion").toLowerCase();
    const scope = col(r, "check_scope").toLowerCase();
    if (criterion || scope) {
      if (!criterion) errors.push(`${at}: check_scope needs a check_criterion.`);
      else if (!(CHECK_CRITERIA as readonly string[]).includes(criterion)) errors.push(`${at}: check_criterion must be one of ${CHECK_CRITERIA.join(", ")}.`);
      if (scope && !(CHECK_SCOPES as readonly string[]).includes(scope)) errors.push(`${at}: check_scope must be one of ${CHECK_SCOPES.join(", ")}.`);
      t.check = { criterion, scope: scope || "all" };
    }
    byUseCase.set(uc, [...(byUseCase.get(uc) ?? []), t as unknown as Target]);
  });
  return errors.length ? { byUseCase: new Map(), errors } : { byUseCase, errors };
}

/** Apply the targets rules to every use case's proposal, against the goals of the entity that use case belongs to.
 * `entityOf` gives the entity of a use-case id (from the same upload or already stored), or undefined when there is none. */
export function checkTargets(byUseCase: Map<string, Target[]>, entityOf: (useCaseId: string) => string | undefined, goalsOf: (entity: string) => EntityGoal[]): string[] {
  const errors: string[] = [];
  for (const [uc, targets] of byUseCase) {
    const entity = entityOf(uc);
    if (!entity) { errors.push(`Targets for ${uc}: no use case with this id is in the use-case file or already registered.`); continue; }
    for (const e of validateTargets(targets, goalsOf(entity))) errors.push(`Targets for ${uc}: ${e}`);
  }
  return errors;
}
