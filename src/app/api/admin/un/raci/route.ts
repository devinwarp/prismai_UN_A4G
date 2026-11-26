import { NextResponse } from "next/server";
import { bad, forbidden, notFound, requirePermission } from "@/lib/api-auth";
import { can } from "@/lib/un/authz";
import { holdersOf } from "@/lib/un/inbox-routing";
import { clearRaciOverride, loadRaciOverrides, setRaciOverride } from "@/lib/un/inbox-store";
import { checkOverride, defaultLetter, DEFAULT_RACI, effectiveLetters, STEPS, STEP_LABELS, type Letter, type Step } from "@/lib/un/raci";
import { isUuid } from "@/lib/un/model";
import { loadAssignmentRows, loadAssignments, loadPeople } from "@/lib/un/roles-store";
import { contextOfUseCase } from "@/lib/un/scope-context";
import { loadUseCase } from "@/lib/un/sijil-store";

const LETTERS: readonly Letter[] = ["R", "A", "C", "I", "AR"];

/** The steps whose Accountable person must be someone who may take that decision, or the request would be handed to a person who cannot act on it. */
const DECIDES: Partial<Record<Step, "scenario.approve">> = { targets: "scenario.approve", tests: "scenario.approve" };

async function snapshot(orgId: string, useCaseId: string) {
  const ctx = await contextOfUseCase(orgId, useCaseId);
  const [people, rows, overrides] = await Promise.all([loadPeople(orgId), loadAssignmentRows(orgId), loadRaciOverrides(orgId)]);
  const place = { entity: ctx.entity ?? null, country: ctx.country ?? null, use_case_id: useCaseId };
  const holders = holdersOf(people, rows, place);
  const mine = overrides.filter((o) => o.use_case_id === useCaseId);
  return { ctx, people, rows, holders, overrides: mine };
}

/**
 * GET ?use_case=<id> -> the RACI of one use case: for each step and each person involved, the default letter (from their position), the override if there is one, and
 * the letter that applies; and whether this caller may change it (an administrator, or the entity admin of its entity).
 */
export async function GET(request: Request) {
  const useCaseId = new URL(request.url).searchParams.get("use_case") ?? "";
  if (!isUuid(useCaseId)) return bad("Name a use case");
  const who = await requirePermission("view", { useCaseId });
  if (who instanceof NextResponse) return who;
  const orgId = who.org_id!;
  const uc = await loadUseCase(orgId, useCaseId);
  if (!uc) return notFound();
  const { holders, people, overrides } = await snapshot(orgId, useCaseId);
  const involved = new Set([...holders.map((h) => h.user_id), ...overrides.map((o) => o.user_id)]);
  const cols = people.filter((p) => involved.has(p.id)).map((p) => ({ id: p.id, name: p.full_name ?? p.email ?? p.id, job_title: p.job_title, positions: holders.find((h) => h.user_id === p.id)?.positions ?? [] }));
  const steps = STEPS.map((step) => {
    const eff = effectiveLetters(step, holders, overrides.filter((o) => o.step === step));
    const cells = Object.fromEntries(cols.map((c) => {
      const over = overrides.find((o) => o.step === step && o.user_id === c.id);
      return [c.id, { default: defaultLetter(step, c.positions), override: over?.letter ?? null, override_id: over?.id ?? null, effective: eff.get(c.id) ?? null }];
    }));
    const letters = [...eff.values()];
    return { id: step, label: STEP_LABELS[step], cells, accountable: letters.filter((l) => l === "A" || l === "AR").length, responsible: letters.filter((l) => l === "R" || l === "AR").length };
  });
  const mayEdit = who.decide("users.manage").ok || who.decide("entity.people").ok;
  const candidates = who.decide("users.manage").ok ? people.filter((p) => !involved.has(p.id)).map((p) => ({ id: p.id, name: p.full_name ?? p.email ?? p.id, job_title: p.job_title })) : [];
  return NextResponse.json({ use_case: { id: uc.id, ext_id: uc.ext_id, title: uc.title, entity: uc.entity }, columns: cols, steps, mayEdit, candidates, defaults: DEFAULT_RACI });
}

/**
 * POST { action: "set", use_case_id, user_id, step, letter } or { action: "clear", use_case_id, id } -> change one person's letter for one step of one use case.
 * An administrator may do it for anyone; the entity admin of the use case's entity may do it for the people already involved. The step must stay sensible: someone
 * Responsible and exactly one Accountable, and for targets and test sets the Accountable must be someone who may approve them.
 */
export async function POST(request: Request) {
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const useCaseId = typeof b.use_case_id === "string" ? b.use_case_id : "";
  if (!isUuid(useCaseId)) return bad("Name a use case");
  const who = await requirePermission(["users.manage", "entity.people"], { useCaseId });
  if (who instanceof NextResponse) return who;
  const orgId = who.org_id!;
  const { ctx, people, holders, overrides } = await snapshot(orgId, useCaseId);
  const admin = who.decide("users.manage").ok;
  if (b.action === "clear") {
    const row = overrides.find((o) => o.id === b.id);
    if (!row) return notFound();
    const error = await clearRaciOverride(orgId, row.id);
    return error ? NextResponse.json({ error }, { status: 500 }) : NextResponse.json({ ok: true });
  }
  if (b.action !== "set") return bad("Unknown action");
  const step = b.step as Step;
  const letter = b.letter as Letter;
  const userId = typeof b.user_id === "string" ? b.user_id : "";
  if (!(STEPS as readonly string[]).includes(step)) return bad("Unknown step");
  if (!LETTERS.includes(letter)) return bad("A letter is R, A, C, I or AR");
  const person = people.find((p) => p.id === userId);
  if (!person) return bad("That person is not in this organisation");
  if (!admin && !holders.some((h) => h.user_id === userId)) return forbidden("An entity admin changes the letters of the people already involved in the use case");
  const others = overrides.filter((o) => o.step === step).map((o) => ({ user_id: o.user_id, letter: o.letter }));
  const problem = checkOverride(step, holders, others, { user_id: userId, letter });
  if (problem) return bad(problem);
  const needs = DECIDES[step];
  if ((letter === "A" || letter === "AR") && needs) {
    const may = can({ legacyRole: person.legacy_role, assignments: await loadAssignments(orgId, userId) }, needs, ctx);
    if (!may.ok) return bad(`${person.full_name ?? person.email} cannot approve ${STEP_LABELS[step].toLowerCase()}: only a governance admin of the country can, so they cannot be Accountable for it`);
  }
  const error = await setRaciOverride(orgId, { user_id: userId, step, letter, use_case_id: useCaseId, entity: ctx.entity ?? null, by: who.id });
  return error ? NextResponse.json({ error }, { status: 500 }) : NextResponse.json({ ok: true });
}
