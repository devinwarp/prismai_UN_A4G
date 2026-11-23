import { NextResponse } from "next/server";
import { bad, forbidden, notFound, requirePermission } from "@/lib/api-auth";
import { isUuid } from "@/lib/un/model";
import { loadUseCase } from "@/lib/un/sijil-store";
import { appendTestLog, loadTestLog, requiredFor } from "@/lib/un/test-set-store";
import { appendTest, plan, replayTestSet, verifyTest } from "@/lib/un/test-sets";
import { metered } from "@/lib/un/cost";
import { loadPilots } from "@/lib/un/pilot-store";
import { appendGen, blueprintOf, cooldownLeft, describeStoreError, generate, planRuling, replayGen, verifyGen } from "@/lib/un/testgen";
import { appendGenLog, buildScenario, defaultChat, loadGenLog } from "@/lib/un/testgen-store";

type Ctx = { params: Promise<{ id: string }> };
/** A generation can make two model calls (generate + one repair), each up to its own timeout. */
export const maxDuration = 300;

/** Generations in flight in this server process, by use case and profile: a second click while one runs is refused. */
const running = new Set<string>();
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** GET ?profile=<job profile> → the generated proposals of that profile, each with its status (proposed, accepted into
 * the test set, rejected), the generator runs (model, rejections, coverage gaps) and the chain status. Any signed-in role. */
export async function GET(request: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const who = await requirePermission("view");
  if (who instanceof NextResponse) return who;
  const profile = text(new URL(request.url).searchParams.get("profile"), 120);
  if (!profile) return bad("profile is required");
  try {
    const [glog, tlog] = await Promise.all([loadGenLog(who.org_id!, id, profile), loadTestLog(who.org_id!, id, profile)]);
    return NextResponse.json({ ...replayGen(glog, replayTestSet(tlog).blueprints), chain: verifyGen(glog) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "The proposal log could not be read" }, { status: 503 });
  }
}

/** POST { profile, action, ... }
 *   generate { task }        a reasoning agent writes test cases for one task of the job profile from the skill, the risk,
 *                            the gates and SOP lines retrieved from the SOP knowledge base. Needs scenario.propose
 *                            (test author or process owner). The cases are PROPOSALS: nothing enters the test set.
 *   accept   { case_id }     add one proposal to the test set (the existing "add" path: the set becomes a draft and is
 *                            approved and locked as before). Needs scenario.edit.
 *   reject   { case_id, reason }   turn one proposal down; logged. Needs scenario.edit.
 * Permission is checked before any state is read. */
export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const who = await requirePermission(["scenario.propose", "scenario.edit", "goals.approve"], { useCaseId: id });
  if (who instanceof NextResponse) return who;
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const act = b.action;
  const profile = text(b.profile, 120);
  const may = who.decide(act === "generate" ? "scenario.propose" : act === "rule" ? "goals.approve" : "scenario.edit");
  if (!may.ok) return forbidden(may.reason);
  if (!profile) return bad("profile is required");
  if (!["generate", "accept", "reject", "rule"].includes(String(act))) return bad("Unknown action");
  if (!(await loadUseCase(who.org_id!, id))) return notFound();
  const need = await requiredFor(who.org_id!, id, profile);
  if (!need.ok) return NextResponse.json({ error: need.error }, { status: need.status });

  const tlog = await loadTestLog(who.org_id!, id, profile);
  if (!verifyTest(tlog).ok) return NextResponse.json({ error: "The test-set log failed verification" }, { status: 409 });
  const tstate = replayTestSet(tlog);
  const unreadable = (e: unknown) => NextResponse.json({ error: e instanceof Error ? e.message : "The proposal log could not be read" }, { status: 503 });
  let glog;
  try { glog = await loadGenLog(who.org_id!, id, profile); } catch (e) { return unreadable(e); }
  if (!verifyGen(glog).ok) return NextResponse.json({ error: "The proposal log failed verification" }, { status: 409 });
  const gstate = replayGen(glog, tstate.blueprints);
  const actor = who.email ?? who.id;

  // The log is read again at the moment of writing, so a slow model call does not leave a stale link in the chain:
  // otherwise another writer in the meantime would clash on the sequence number and the paid generation would be lost.
  const writeGen = async (kind: "generated" | "rejected" | "ruled", payload: Record<string, unknown>) => {
    let cur;
    try { cur = await loadGenLog(who.org_id!, id, profile); } catch (e) { return unreadable(e); }
    if (!verifyGen(cur).ok) return NextResponse.json({ error: "The proposal log failed verification" }, { status: 409 });
    const entry = appendGen(cur[cur.length - 1] ?? null, kind, actor, payload, new Date().toISOString());
    const err = await appendGenLog(who.org_id!, id, profile, entry);
    if (!err) return null;
    const clash = /duplicate|unique/i.test(err);
    return NextResponse.json({ error: clash ? "Someone else changed the proposals just now; reload and try again" : describeStoreError(err) }, { status: clash ? 409 : 500 });
  };

  if (act === "generate") {
    const task = text(b.task, 8);
    const built = buildScenario(need.sopId, profile, task, new Set(gstate.proposals.map((p) => p.case.id)));
    if (!built.ok) return NextResponse.json({ error: built.error }, { status: built.status });
    // generation is a slow, paid call: one at a time per profile, and not again straight after a logged run
    const key = `${id}:${profile}`;
    if (running.has(key)) return NextResponse.json({ error: "A generation is already running for this job profile; wait for it to finish" }, { status: 429 });
    const wait = cooldownLeft(gstate.runs, Date.now());
    if (wait > 0) return NextResponse.json({ error: `A generation finished moments ago; try again in ${Math.ceil(wait / 1000)} seconds` }, { status: 429, headers: { "Retry-After": String(Math.ceil(wait / 1000)) } });
    // a scenario with no skill (or no agent role) is refused
    running.add(key);
    let g, usage;
    // what the generation used (the model calls and tokens, repair call included) is kept with the run, for the cost ledger
    try { const m = await metered(() => generate(defaultChat(built.ctx.model), built.scenario, built.skill, built.lines, built.ctx)); g = m.result; usage = m.usage; } finally { running.delete(key); }
    if (g.refused) return NextResponse.json({ error: g.refused }, { status: 422 });
    const fail = await writeGen("generated", { scenario_id: built.scenario.id, model: built.ctx.model, prompt_hash: g.prompt_hash, calls: g.calls, usage, repair: g.repair, cases: g.cases, rejected: g.rejected, gaps: g.gaps, refused: null });
    if (fail) return fail;
    return NextResponse.json({ ok: true, model: built.ctx.model, cases: g.cases.length, calls: g.calls, repair: g.repair, rejected: g.rejected, gaps: g.gaps });
  }

  if (act === "rule") {
    // a person (goals.approve: the process owner) rules on a generated case that a pilot disputed
    const caseId = text(b.case_id, 120);
    const pilotId = text(b.pilot_id, 80);
    const pilot = (await loadPilots(who.org_id!, id, profile, true)).find((x) => x.id === pilotId);
    if (!pilot) return notFound();
    const disputed = [...new Set(pilot.run_records.filter((r) => r.generated && r.disputed && r.gen_case).map((r) => r.gen_case as string))];
    const rl = planRuling(gstate, { case_id: caseId, pilot_id: pilotId, ruling: String(b.ruling), reason: text(b.reason, 500) }, disputed, who.id);
    if (!rl.ok) return bad(rl.error);
    const fail = await writeGen("ruled", rl.payload);
    if (fail) return fail;
    // the expectation was wrong: the generated test is retired, so it no longer counts. That changes the test set, which then needs
    // approving again before the next pilot.
    let retired = false;
    if (b.ruling === "expectation_wrong") {
      const bp = tstate.blueprints.find((x) => x.gen?.case_id === caseId && x.status === "active");
      if (bp) {
        const rp = plan(tstate, need.required, { type: "retire", id: bp.id, reason: `Ruled: the expectation was wrong (${text(b.reason, 300)})` }, who.id);
        if (!rp.ok) return NextResponse.json({ ok: true, ruled: true, retired: false, error: `The ruling is recorded, but the test could not be retired: ${rp.error}` }, { status: 409 });
        const re = appendTest(tlog[tlog.length - 1] ?? null, rp.kind, actor, rp.payload, new Date().toISOString());
        const rerr = await appendTestLog(who.org_id!, id, profile, re);
        if (rerr) return NextResponse.json({ ok: true, ruled: true, retired: false, error: `The ruling is recorded, but the test could not be retired: ${rerr}` }, { status: 500 });
        retired = true;
      }
    }
    return NextResponse.json({ ok: true, ruled: true, retired, needs_reapproval: retired });
  }

  const caseId = text(b.case_id, 120);
  const prop = gstate.proposals.find((p) => p.case.id === caseId);
  if (!prop) return bad("No such proposal");
  if (prop.status !== "proposed") return bad(`This proposal is already ${prop.status}`);

  if (act === "reject") {
    const reason = text(b.reason, 500);
    if (reason.length < 3) return bad("Rejecting a proposal needs a reason");
    const fail = await writeGen("rejected", { case_id: caseId, reason });
    return fail ?? NextResponse.json({ ok: true });
  }

  const p = plan(tstate, need.required, { type: "add", blueprint: { ...blueprintOf(prop.case), task: null } }, who.id);
  if (!p.ok) return bad(p.error);
  const entry = appendTest(tlog[tlog.length - 1] ?? null, p.kind, actor, p.payload, new Date().toISOString());
  const err = await appendTestLog(who.org_id!, id, profile, entry);
  if (err) return NextResponse.json({ error: /duplicate|unique/i.test(err) ? "Someone else changed the test set just now; reload and try again" : err }, { status: /duplicate|unique/i.test(err) ? 409 : 500 });
  return NextResponse.json({ ok: true, hash: entry.hash, draft: true });
}
