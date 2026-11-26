import { createAdminClient } from "@/lib/supabase/admin";
import { can, type Subject } from "./authz";
import { blockToHuman, dueForEscalation, escalateAtFor, isOpen, type InboxItem, type NewItem } from "./inbox";
import { holdersOf, type Place } from "./inbox-routing";
import { addItems, appendAgentLog, loadAgentLog, loadAgentSettings, loadItemsOf, loadOpenItems, loadRaciOverrides, updateItem } from "./inbox-store";
import { countriesNeedingGovernanceAdmin, missingPositions, needSubject, type PositionNeed } from "./people-agent";
import { route, STEP_LABELS, type Step } from "./raci";
import { loadAssignmentRows, loadAssignments, loadPeople, loadUseCaseChoices, type Person } from "./roles-store";
import { contextOfUseCase, scopeIndex } from "./scope-context";

// The service that fills the inbox and runs the agents. Events call notify(); the People agent sweeps for unfilled positions; unanswered human items
// escalate; and each user's agent works its own items, within that user's permissions. Nothing here signs anything: an explicit decision is always a
// person's, and an agent that is refused hands the item to the person with the reason.

export interface Notice {
  step: Step;
  /** the kind of the information and action items; the accountable (sign-off) item uses `decisionKind` */
  kind: string;
  decisionKind?: string;
  subject: string;
  body: string;
  place: Place;
  link?: string;
  payload?: Record<string, unknown>;
  /** one open item per recipient and key */
  dedupe: string;
  created_by?: string;
  /** people who must not be told (the person who did it) */
  exclude?: string[];
  /** tell everyone involved for information only (a decision has been made), instead of asking each by their RACI letter */
  inform?: boolean;
}

/** Tells the people who hold the positions of this step where it happened, each according to their RACI letter. Returns the items added. */
export async function notify(orgId: string, n: Notice, now = new Date()): Promise<InboxItem[]> {
  const [people, rows, overrides] = await Promise.all([loadPeople(orgId), loadAssignmentRows(orgId), loadRaciOverrides(orgId)]);
  const holders = holdersOf(people, rows, n.place);
  const mine = overrides.filter((o) => o.step === n.step && (o.use_case_id ? o.use_case_id === n.place.use_case_id : !o.entity || o.entity === n.place.entity));
  const recipients = route(n.step, holders, mine).filter((r) => !(n.exclude ?? []).includes(r.user_id)).map((r) => (n.inform ? { ...r, letter: "I" as const, escalated_from: undefined } : r));
  const items: NewItem[] = recipients.map((r) => ({
    kind: r.letter === "A" ? n.decisionKind ?? n.kind : n.kind,
    user_id: r.user_id,
    letter: r.letter,
    subject: n.subject,
    body: r.escalated_from ? `${n.body}\n\nThis came to you because nobody holds the position of ${r.escalated_from.replace("_", " ")} here.` : n.body,
    entity: n.place.entity ?? null, country: n.place.country ?? null, use_case_id: n.place.use_case_id ?? null, link: n.link ?? null,
    payload: { ...(n.payload ?? {}), step: n.step }, dedupe_key: n.dedupe, escalated_from: r.escalated_from ?? null, created_by: n.created_by ?? "system",
  }));
  return (await addItems(orgId, items, now)).added;
}

/** Notifies about a use case's event, working out its entity and country. */
export async function notifyUseCase(orgId: string, useCaseId: string, n: Omit<Notice, "place">, now = new Date()): Promise<InboxItem[]> {
  const c = await contextOfUseCase(orgId, useCaseId);
  return notify(orgId, { ...n, place: { entity: c.entity ?? null, country: c.country ?? null, use_case_id: useCaseId } }, now);
}

/** Closes every open item with this dedupe key (the thing it asked for has been dealt with). Returns how many. */
export async function resolveItems(orgId: string, dedupe: string, by: string | null, now = new Date()): Promise<number> {
  let n = 0;
  for (const i of await loadOpenItems(orgId)) {
    if (i.dedupe_key === dedupe && !(await updateItem(orgId, i.id, { status: "done", resolved_at: now.toISOString(), resolved_by: by }))) n++;
  }
  return n;
}

/**
 * An approval step of a use case (its process targets, or its test set and verdict parameters) moved. A request asks the people who must decide, each by their
 * RACI letter (the governance admin is Accountable, so it is a decision for a person). A decision closes that request and tells the others for information.
 * Never throws: a missing inbox must not stop the action that caused it.
 */
export async function noticeApproval(orgId: string, useCaseId: string, o: { step: "targets" | "tests"; what: string; event: "request" | "approved" | "withdrawn"; ext: string; by: string; link: string; ref: string }): Promise<void> {
  try {
    const key = `${o.step}:${useCaseId}:open`;
    if (o.event === "request") {
      await notifyUseCase(orgId, useCaseId, { step: o.step, kind: `${o.step}.proposed`, decisionKind: `${o.step}.approve`, subject: `${o.what}: approval needed for ${o.ext}`,
        body: `${o.what} for ${o.ext} are ready. The business owner proposes and the governance admin of the country approves: a person decides.`, link: o.link, dedupe: key, exclude: [o.by], created_by: "system" });
      return;
    }
    await resolveItems(orgId, key, o.by);
    await notifyUseCase(orgId, useCaseId, { step: o.step, kind: `${o.step}.${o.event}`, subject: `${o.what} ${o.event} for ${o.ext}`, body: `${o.what} for ${o.ext} were ${o.event}.`, link: o.link,
      dedupe: `${o.step}:${useCaseId}:${o.ref}:${o.event}`, exclude: [o.by], inform: true, created_by: "system" });
  } catch { /* the inbox is not there yet (its SQL is not applied) or failed: the action itself stands */ }
}

// ---- the People agent: positions nobody holds, and countries without a governance admin ---------------------------------------------------------------

async function tickedProfiles(orgId: string): Promise<Record<string, string[]>> {
  const { data } = await createAdminClient().from("un_job_profiles").select("*").eq("org_id", orgId).eq("automate", true);
  const out: Record<string, string[]> = {};
  for (const r of (data ?? []) as { use_case_id: string; profile: string }[]) (out[r.use_case_id] ??= []).push(String(r.profile));
  return out;
}

/** Raises an item for every position nobody holds (and every country with entities and no governance admin), and closes the ones that have been filled. */
export async function sweepPeople(orgId: string, now = new Date()): Promise<{ raised: number; closed: number }> {
  const [people, rows, ucs, profileTitles, index] = await Promise.all([loadPeople(orgId), loadAssignmentRows(orgId), loadUseCaseChoices(orgId), tickedProfiles(orgId), scopeIndex(orgId)]);
  const needs = missingPositions({ useCases: ucs.map((u) => ({ id: u.id, ext_id: u.ext_id, entity: u.entity, title: u.title })), assignments: rows, people: people.map((p) => ({ id: p.id, job_title: p.job_title })), profileTitles });
  let raised = 0;
  for (const need of needs) {
    const place: Place = { entity: need.entity, country: index.entity(need.entity).country ?? null, use_case_id: need.use_case_id };
    const added = await notify(orgId, {
      step: "people", kind: "people.position_missing", subject: needSubject(need), place, dedupe: need.key, created_by: "agent:people",
      body: need.kind === "job_profile"
        ? `The SOP's job profile "${need.title}" is ticked for automation, but nobody in the system holds that position. Create the user so the agent can be linked to the job.`
        : `${need.ext_id} has no ${need.title.toLowerCase()}. Appoint one so the process has someone responsible.`,
      link: `/admin/federal/people`, payload: { need },
    }, now);
    raised += added.length;
  }
  const countries = [...new Set(ucs.map((u) => index.entity(u.entity).country).filter((c): c is string => !!c))];
  for (const country of countriesNeedingGovernanceAdmin({ countriesWithEntities: countries, assignments: rows })) {
    const added = await notify(orgId, {
      step: "governance", kind: "governance.appoint", subject: `Appoint a governance admin for ${country}`, place: { country }, dedupe: `governance:${country}`, created_by: "agent:people",
      body: `${country} has entities but no governance admin. Targets and test sets cannot be approved there until one is appointed; a person must choose who.`,
      link: `/admin/federal/people`, payload: { country },
    }, now);
    raised += added.length;
  }
  // close what has been filled
  const live = new Set([...needs.map((n) => n.key), ...countriesNeedingGovernanceAdmin({ countriesWithEntities: countries, assignments: rows }).map((c) => `governance:${c}`)]);
  let closed = 0;
  for (const i of await loadOpenItems(orgId)) {
    if ((i.kind === "people.position_missing" || i.kind === "governance.appoint") && !live.has(i.dedupe_key)) {
      if (!(await updateItem(orgId, i.id, { status: "done", resolved_at: now.toISOString(), resolved_by: null, payload: { ...i.payload, closed_by: "system: the position is now filled" } }))) closed++;
    }
  }
  return { raised, closed };
}

// ---- escalation ------------------------------------------------------------------------------------------------------------------------------------

/** Hands every human item that has waited past its time one level up: to the platform and super admins as an action. Returns how many. */
export async function escalateDue(orgId: string, now = new Date()): Promise<number> {
  const due = dueForEscalation(await loadOpenItems(orgId), now);
  if (!due.length) return 0;
  const [people, rows] = await Promise.all([loadPeople(orgId), loadAssignmentRows(orgId)]);
  let n = 0;
  for (const item of due) {
    const platform = holdersOf(people, rows, { entity: item.entity, country: item.country, use_case_id: item.use_case_id }).filter((h) => h.positions.includes("platform") && h.user_id !== item.user_id);
    const who = people.find((p) => p.id === item.user_id);
    const up: NewItem[] = platform.map((h) => ({
      kind: item.kind, user_id: h.user_id, letter: "AR", subject: `Escalated: ${item.subject}`,
      body: `${who?.full_name ?? who?.email ?? "The person it was for"} has not dealt with this in two working days.\n\n${item.body}`,
      entity: item.entity, country: item.country, use_case_id: item.use_case_id, link: item.link, payload: { ...item.payload, escalated_item: item.id }, dedupe_key: `escalated:${item.id}`, created_by: "system", escalated_from: item.user_id,
    }));
    await addItems(orgId, up, now);
    if (!(await updateItem(orgId, item.id, { escalated_at: now.toISOString() }))) n++;
  }
  return n;
}

// ---- each user's agent ---------------------------------------------------------------------------------------------------------------------------------

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "");

/** A draft answer for a consulted item, with the context the agent has. A person reads, edits and sends it. */
export function draftConsult(item: InboxItem): string {
  const ctx = item.payload.context as Record<string, unknown> | undefined;
  return [
    `Re: ${item.subject}`,
    ``,
    `${item.entity ? `Entity: ${item.entity}. ` : ""}${item.use_case_id ? `Use case: ${(ctx?.ext_id as string | undefined) ?? item.use_case_id}. ` : ""}`.trim(),
    ctx?.summary ? String(ctx.summary) : item.body,
    ``,
    `My view: [your input here]`,
    ``,
    `(Drafted by your agent from the item and its context. It is not sent until you send it.)`,
  ].join("\n");
}

export interface AgentRun { handled: number; blocked: number; skipped: number }

/**
 * One user's agent works that user's agent items, with that user's permissions. A refusal or an off switch hands the item to the person with the reason;
 * an explicit decision is never taken. Every step is written to the agent's log.
 */
export async function runAgent(orgId: string, user: Pick<Person, "id" | "legacy_role">, now = new Date()): Promise<AgentRun> {
  const run: AgentRun = { handled: 0, blocked: 0, skipped: 0 };
  const items = (await loadItemsOf(orgId, user.id)).filter((i) => i.handler === "agent" && isOpen(i) && i.status !== "blocked_human");
  if (!items.length) return run;
  const settings = await loadAgentSettings(orgId, user.id);
  const today = now.toISOString().slice(0, 10);
  let used = (await loadAgentLog(orgId, user.id)).filter((e) => e.at.slice(0, 10) === today && e.outcome === "done").length;
  const subject: Subject = { legacyRole: user.legacy_role, assignments: await loadAssignments(orgId, user.id) };
  const hand = async (i: InboxItem, reason: string, action: string) => {
    await updateItem(orgId, i.id, { ...blockToHuman(i, reason, now) });
    await appendAgentLog(orgId, user.id, { item_id: i.id, action, outcome: "blocked", detail: { reason } }, now);
    run.blocked++;
  };
  for (const i of items) {
    if (!settings.enabled) { await hand(i, "Your agent is switched off, so this is yours to do.", "skipped_switched_off"); continue; }
    if (used >= settings.daily_cap) { await hand(i, `Your agent reached its daily limit of ${settings.daily_cap} actions.`, "skipped_daily_cap"); continue; }
    if (i.kind === "people.position_missing") {
      const place = { entity: i.entity ?? undefined, country: i.country ?? undefined };
      const may = can(subject, "user.create", place);
      if (!may.ok) { await hand(i, `${may.reason}. Staging a user needs the entity admin of ${i.entity ?? "this entity"}.`, "stage_user"); continue; }
      const need = i.payload.need as PositionNeed | undefined;
      const title = need?.title ?? "";
      const staged = { job_title: need?.kind === "operator" || need?.kind === "process_owner" ? null : title, role: need?.kind === "operator" ? "operator" : need?.kind === "process_owner" ? "process_owner" : null,
        entity: i.entity, use_case_id: i.use_case_id, ext_id: need?.ext_id ?? null, suggested_email: `${slug(title || need?.kind || "user")}.${slug((i.entity ?? "entity").split(" ")[0])}@${slug((i.entity ?? "entity").split(" ")[0])}.example` };
      await updateItem(orgId, i.id, { handler: "human", status: "open", payload: { ...i.payload, staged }, escalate_at: escalateAtFor(i.mode, now) });
      await appendAgentLog(orgId, user.id, { item_id: i.id, action: "staged_user", outcome: "done", detail: { staged } }, now);
      used++; run.handled++;
    } else if (i.mode === "consult") {
      await updateItem(orgId, i.id, { handler: "human", status: "open", payload: { ...i.payload, draft: draftConsult(i) }, escalate_at: escalateAtFor(i.mode, now) });
      await appendAgentLog(orgId, user.id, { item_id: i.id, action: "drafted_reply", outcome: "done" }, now);
      used++; run.handled++;
    } else if (i.kind === "governance.appoint") {
      const candidates = (await loadPeople(orgId)).filter((p) => /governance/i.test(p.job_title ?? "")).map((p) => ({ id: p.id, name: p.full_name ?? p.email, job_title: p.job_title }));
      await updateItem(orgId, i.id, { handler: "human", status: "open", payload: { ...i.payload, candidates }, escalate_at: escalateAtFor(i.mode, now) });
      await appendAgentLog(orgId, user.id, { item_id: i.id, action: "prepared_candidates", outcome: "done", detail: { candidates: candidates.length } }, now);
      used++; run.handled++;
    } else {
      await hand(i, `There is no agent action for "${i.kind}", so it is yours.`, "no_action");
    }
  }
  return run;
}

/** Everything that runs when a person opens their inbox: the People agent sweeps, unanswered items escalate, and their agent works its items. */
export async function refresh(orgId: string, user: Pick<Person, "id" | "legacy_role">, now = new Date()): Promise<{ raised: number; closed: number; escalated: number; agent: AgentRun }> {
  const swept = await sweepPeople(orgId, now);
  const escalated = await escalateDue(orgId, now);
  const agent = await runAgent(orgId, user, now);
  return { ...swept, escalated, agent };
}

export { STEP_LABELS };
