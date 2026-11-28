import { createAdminClient } from "@/lib/supabase/admin";
import type { InboxItem } from "./inbox";
import { nextActors, stepOfStage } from "./inbox-next";
import { holdersOf } from "./inbox-routing";
import { loadRaciOverrides } from "./inbox-store";
import type { ReasonCode } from "./journey";
import { loadJourneys } from "./journey-store";
import type { UnUseCaseState } from "./model";
import { loadAssignmentRows, type Person } from "./roles-store";
import { scopeIndex } from "./scope-context";

export interface NextWith { reason: ReasonCode | null; stopped: boolean; who: { name: string; job_title: string | null; letter: string; you: boolean; covering: string | null }[] }

/** For information items about a use case: its next journey step, and who holds that step where the use case is. Keyed by item id. */
export async function nextStepsFor(orgId: string, items: InboxItem[], people: Person[]): Promise<Record<string, NextWith>> {
  const ids = [...new Set(items.flatMap((i) => (i.use_case_id ? [i.use_case_id] : [])))];
  if (!ids.length) return {};
  const [{ data }, rows, overrides, index] = await Promise.all([
    createAdminClient().from("un_use_cases").select("id, ext_id, entity, verdict, verdict_run_id, client_facing, affects_rights, irreversible").eq("org_id", orgId).in("id", ids),
    loadAssignmentRows(orgId), loadRaciOverrides(orgId), scopeIndex(orgId),
  ]);
  const ucs = (data ?? []) as (UnUseCaseState & { entity: string })[];
  const journeys = await loadJourneys(orgId, ucs);
  const out: Record<string, NextWith> = {};
  for (const item of items) {
    const uc = ucs.find((u) => u.id === item.use_case_id);
    const journey = uc && journeys.get(uc.id);
    const stage = journey?.stages.find((s) => s.id === journey.next);
    if (!uc || !stage) continue;
    const stopped = stage.state === "stopped";
    const place = { entity: uc.entity ?? null, country: index.entity(uc.entity).country ?? null, use_case_id: uc.id };
    const step = stepOfStage(stage.id);
    const mine = overrides.filter((o) => o.step === step && (o.use_case_id ? o.use_case_id === uc.id : !o.entity || o.entity === uc.entity));
    const who = stopped ? [] : nextActors(stage.id, holdersOf(people, rows, place), mine).flatMap((r) => {
      const p = people.find((x) => x.id === r.user_id);
      return p ? [{ name: p.full_name ?? p.email ?? "Someone", job_title: p.job_title, letter: r.letter, you: p.id === item.user_id, covering: r.escalated_from ?? null }] : [];
    // the people who hold the work come before those covering a vacancy
    }).sort((a, b) => Number(!!a.covering) - Number(!!b.covering));
    out[item.id] = { reason: stage.reason, stopped, who };
  }
  return out;
}
