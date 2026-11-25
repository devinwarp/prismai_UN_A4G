import { NextResponse } from "next/server";
import { createClient } from "./supabase/server";
import { can, type ActionId, type Assignment, type Decision } from "./un/authz";
import { loadAssignments } from "./un/roles-store";
import { mayReadUseCase } from "./un/federal-read-access";

// Session + role helpers shared by the /api/admin/un routes.
export interface Caller {
  id: string;
  email: string | null;
  role: string | null;
  org_id: string | null;
}

/** The signed-in caller with role + org, or null. */
export async function caller(): Promise<Caller | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, org_id")
    .eq("id", user.id)
    .maybeSingle();
  return {
    id: user.id,
    email: user.email ?? null,
    role: profile?.role ?? null,
    org_id: profile?.org_id ?? null,
  };
}

/** Admin of an org, or the error response to return. Viewers can't write
 * (they may only decide their own sign-offs — see signoffs/[sid]). */
export async function requireAdmin(): Promise<Caller | NextResponse> {
  const who = await caller();
  if (!who) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (who.role !== "admin" || !who.org_id) {
    // Judges and other viewers are read-only: every mutating un route calls this guard.
    return NextResponse.json({ error: who.role === "viewer" ? "Read-only access (judge/viewer)" : "Forbidden" }, { status: 403 });
  }
  return who;
}

/** A caller who passed requirePermission, with a way to check the other actions the route can perform. */
export interface Authorised extends Caller {
  assignments: Assignment[];
  /** May this caller do `action` here? A route that serves several actions guards for all of them, then checks each. */
  decide: (action: ActionId) => Decision;
}

export const forbidden = (reason: string) => NextResponse.json({ error: reason }, { status: 403 });

/** The caller if they may do ANY of the actions (on this use case, for a use-case action), or the error response.
 * Replaces requireAdmin where the action is known; a legacy admin still passes everything (see authz.ts). */
export async function requirePermission(actions: ActionId | ActionId[], ctx: { useCaseId?: string } = {}): Promise<Authorised | NextResponse> {
  const who = await caller();
  if (!who) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!who.org_id) return forbidden("Forbidden");
  if (ctx.useCaseId && !(await mayReadUseCase(who.org_id, who.id, who.role, ctx.useCaseId))) return forbidden("This use case is outside your assignments.");
  const assignments = await loadAssignments(who.org_id, who.id);
  const decide = (action: ActionId) => can({ legacyRole: who.role, assignments }, action, { use_case_id: ctx.useCaseId });
  const list = Array.isArray(actions) ? actions : [actions];
  const results = list.map(decide);
  if (!results.some((d) => d.ok)) return forbidden((results.find((d) => !d.ok) as { reason: string }).reason);
  return { ...who, assignments, decide };
}

export const notFound = () =>
  NextResponse.json({ error: "Use case not found" }, { status: 404 });
export const bad = (error: string) => NextResponse.json({ error }, { status: 400 });
