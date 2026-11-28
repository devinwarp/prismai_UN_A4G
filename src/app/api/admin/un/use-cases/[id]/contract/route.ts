import { NextResponse } from "next/server";
import { bad, forbidden, notFound, requirePermission } from "@/lib/api-auth";
import { approversForUseCase } from "@/lib/un/approvers-store";
import { holdersOfTitle } from "@/lib/un/authz";
import { loadPeople } from "@/lib/un/roles-store";
import { isUuid } from "@/lib/un/model";
import type { OutputContract } from "@/lib/un/output-contract";
import { appendContract, approvedContractMap, CONTRACT_AGENT, contractSigner, contractsDrifted, contractsHash, planContracts, replayContracts, validateContracts, verifyContracts, type ContractAction, type ContractEntry, type ContractState } from "@/lib/un/output-contract-log";
import { appendContractLog, loadContractLog } from "@/lib/un/output-contract-store";
import { loadAttachedSop, loadProfileRows } from "@/lib/un/profiles-store";
import { loadUseCase } from "@/lib/un/sijil-store";
import { rebuildSkill } from "@/lib/un/skill-engine";
import { loadSkillVersionLog } from "@/lib/un/skill-version-store";
import { replaySkillVersions, versionOfHash } from "@/lib/un/skill-versions";
import { sopTestContext, usesLicensingReference } from "@/lib/un/sop-test-context";
import { loadUseCaseSopDocument } from "@/lib/un/sop-version-store";

type Ctx = { params: Promise<{ id: string }> };
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** What the route needs about the profile: the use case, its attached SOP version, the job profile's tasks, and the contract the SOP's text gives for each task (the derived one). */
async function profileOf(orgId: string, id: string, profile: string) {
  const uc = await loadUseCase(orgId, id);
  if (!uc) return { error: "Use case not found", status: 404 as const };
  const sopId = await loadAttachedSop(orgId, id);
  if (!sopId) return { error: "Attach an SOP to this use case first", status: 409 as const };
  if (usesLicensingReference(uc.ext_id, sopId)) return { error: "This use case runs on the licence-renewal reference: its output format is part of the reference and is not set here.", status: 409 as const };
  const document = await loadUseCaseSopDocument(orgId, uc);
  const attached = document?.attached;
  const job = attached?.profiles.find((p) => p.name === profile);
  if (!attached || attached.sop_id !== sopId || !job?.tasks.length) return { error: `The attached SOP has no job profile "${profile}" with tasks`, status: 400 as const };
  const plain = sopTestContext(attached, uc, job);
  const derived: OutputContract[] = job.tasks.map((t) => plain.contractFor(t.id));
  return { uc, sopId, attached, job, taskIds: job.tasks.map((t) => t.id), derived, titles: Object.fromEntries(job.tasks.map((t) => [t.id, t.title])) };
}

/** The skill of the profile as stored (the hash recorded when it was ticked or re-extracted) and as it would be built now, with the contract in force. */
async function skillState(orgId: string, id: string, p: Exclude<Awaited<ReturnType<typeof profileOf>>, { error: string }>, profile: string, state: ContractState) {
  const stored = (await loadProfileRows(orgId, id, p.sopId)).find((r) => r.profile === profile && r.automate)?.skill_sha256 ?? null;
  const live = sopTestContext(p.attached, p.uc, p.job, approvedContractMap(state)).skill?.sha256 ?? null;
  // what the skill built from the contract in force says under each task, so a person sees that a change reaches the skill
  const markdown = sopTestContext(p.attached, p.uc, p.job, approvedContractMap(state)).skill?.markdown ?? "";
  const resultFormat: Record<string, string> = {};
  for (const section of markdown.split(/^### /m).slice(1)) { const task = section.split("\n")[0].trim(); const line = /^- \*\*Result format:\*\*\s*(.*)$/m.exec(section)?.[1]; if (line) resultFormat[task] = line; }
  return { ticked: stored !== null || !!(await loadProfileRows(orgId, id, p.sopId)).find((r) => r.profile === profile && r.automate), stored, live, current: !!stored && stored === live, resultFormat };
}

/** In what capacity the caller may change or approve this profile's output format: as the holder of its job (job title on their profile), or as the process owner. The process owner is
 * whoever may sign an agent version (tuning.approve), which a legacy administrator also holds under the transition rule. */
async function signerOf(orgId: string, useCaseId: string, profile: string, who: { id: string; decide: (a: "tuning.approve") => { ok: boolean } }) {
  const people = await loadPeople(orgId);
  const me = people.find((x) => x.id === who.id);
  const owner = (await approversForUseCase(orgId, useCaseId)).find((a) => a.source === "process_owner")?.title ?? null;
  return contractSigner({ profile, signerTitle: me?.job_title ?? null, isProcessOwner: who.decide("tuning.approve").ok, processOwnerTitle: owner });
}

/** GET ?profile=<job profile> → the output contract of that profile: what the SOP's text gives for each task, the proposal waiting, the approval in force, whether the SOP has
 * drifted from it, the approvers a person may choose, and whether the stored skill is the one built from the approved contract. Any signed-in role. */
export async function GET(request: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  // the use case is named so that the role checks (the process owner of THIS use case) are made where it happens
  const who = await requirePermission("view", { useCaseId: id });
  if (who instanceof NextResponse) return who;
  const profile = text(new URL(request.url).searchParams.get("profile"), 120);
  if (!profile) return bad("profile is required");
  const p = await profileOf(who.org_id!, id, profile);
  if ("error" in p) return NextResponse.json({ error: p.error }, { status: p.status });
  let log;
  try { log = await loadContractLog(who.org_id!, id, profile); } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "The contract log could not be read" }, { status: 503 }); }
  const state = replayContracts(log);
  // the versions the skill of this profile has been through (a log that cannot be read is an empty history, the migration being missing is said by the write)
  const versions = await loadSkillVersionLog(who.org_id!, id, profile).then(replaySkillVersions).catch(() => []);
  const asked = Number(new URL(request.url).searchParams.get("version"));
  if (asked) { const v = versions.find((x) => x.version === asked); return v ? NextResponse.json({ version: v }) : notFound(); }
  const skill = await skillState(who.org_id!, id, p, profile, state);
  return NextResponse.json({
    profile, titles: p.titles, derived: p.derived, state, chain: verifyContracts(log), drifted: contractsDrifted(p.derived, state),
    you: await signerOf(who.org_id!, id, profile, who),
    holders: holdersOfTitle(await loadPeople(who.org_id!), profile).map((x) => x.email ?? x.id),
    skill: { ...skill, version: versionOfHash(versions, skill.stored) },
    versions: versions.map((v) => ({ version: v.version, sha256: v.sha256, reason: v.reason, contract_version: v.contract_version, contract_hash: v.contract_hash, sop_id: v.sop_id, sop_version: v.sop_version, by: v.by, at: v.at, current: v.sha256 === skill.stored })),
  });
}

/** POST { profile, action, ... }
 *   reextract                       build this job profile's skill again from the SOP (with the approved contract, if there is one), record it on the profile, and put the contract the
 *                                   SOP's text gives in front of a person when none is waiting or approved, or the SOP has drifted from the approved one
 *   propose  { tasks, note? }       a person's version of what each task returns (every task, its output text, and its outcomes if it chooses between some)
 *   approve  { approver?, self_approval_reason? }   lock the proposal at its hash; the skill is then built again with it
 *   withdraw { reason }
 * Re-extracting needs contract.edit (any operator may rebuild the skill). Proposing, approving and withdrawing need contract.edit or contract.approve AND that the caller is the HOLDER of the
 * job (their job title is the profile's name) or the process owner (contractSigner). The approver recorded is the capacity they signed in, never typed or chosen from a list. Every change is one entry of a hash-chained log. The SOP is never changed. */
export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const who = await requirePermission(["contract.edit", "contract.approve"], { useCaseId: id });
  if (who instanceof NextResponse) return who;
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const act = b.action;
  if (!["reextract", "propose", "approve", "withdraw"].includes(String(act))) return bad("Unknown action");
  const may = act === "approve" || act === "withdraw" ? who.decide("contract.approve") : who.decide("contract.edit");
  if (!may.ok) return forbidden(may.reason);
  const profile = text(b.profile, 120);
  if (!profile) return bad("profile is required");
  const orgId = who.org_id!;
  const p = await profileOf(orgId, id, profile);
  if ("error" in p) return NextResponse.json({ error: p.error }, { status: p.status });

  // changing, approving or withdrawing the output format is for the holder of the job (or the process owner); re-extracting the skill is a technical step any operator may take
  const signer = act === "reextract" ? null : await signerOf(orgId, id, profile, who);
  if (signer && !signer.ok) return forbidden(signer.error);

  let log: ContractEntry[];
  try { log = await loadContractLog(orgId, id, profile); } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "The contract log could not be read" }, { status: 503 }); }
  const v = verifyContracts(log);
  if (!v.ok) return NextResponse.json({ error: `The output-contract log failed verification at entry ${v.broken_seq}: ${v.reason}` }, { status: 409 });
  const append = async (kind: "proposed" | "approved" | "withdrawn", actor: string, payload: Record<string, unknown>) => {
    const entry = appendContract(log[log.length - 1] ?? null, kind, actor, payload, new Date().toISOString());
    const err = await appendContractLog(orgId, id, profile, entry);
    if (err) return { err };
    log = [...log, entry];
    return { entry };
  };
  const fail = (err: string) => NextResponse.json({ error: err }, { status: /someone else/i.test(err) ? 409 : 500 });

  /** Build the skill again with the contract in force: this is what "re-extract" is. It is the one skill engine every caller uses (skill-engine.ts), so it is also kept as a version. */
  const rebuild = (state: ContractState, why: "reextracted" | "contract_approved" | "contract_withdrawn") =>
    rebuildSkill(orgId, p.uc, profile, { id: who.id, label: who.email ?? who.id }, why, { contractState: state });

  if (act === "reextract") {
    let state = replayContracts(log);
    // a contract for a person to check: the one the SOP's text gives, unless one is waiting or the approved one still matches it
    let proposed = false;
    if (!state.pending && (!state.approved || contractsDrifted(p.derived, state))) {
      const plan = planContracts(state, { type: "propose", tasks: p.derived, source: "derived", note: state.approved ? "The SOP's text now gives a different output for at least one task." : undefined }, CONTRACT_AGENT.id, p.taskIds);
      if (plan.ok) { const w = await append(plan.kind, CONTRACT_AGENT.email, plan.payload); if (w.err) return fail(w.err); proposed = true; state = replayContracts(log); }
    }
    const sk = await rebuild(state, "reextracted");
    return NextResponse.json({ ok: sk.ok, skill: sk, proposed, contract_approved: !!state.approved, pending: state.pending?.version ?? null }, { status: sk.ok ? 200 : 409 });
  }

  let state = replayContracts(log);
  // The holder of the job reviews the contract, may change what a task returns, and approves, in one step. What they changed is saved with the approval and goes straight into the
  // skill: it is not approved a second time. (Saving a draft without approving is the "propose" action.)
  if (act === "approve" && b.tasks !== undefined) {
    const v = validateContracts(b.tasks, p.taskIds);
    if (!v.ok) return bad(v.error);
    const same = state.pending && contractsHash(v.tasks) === contractsHash(state.pending.tasks);
    if (!same) {
      const prop = planContracts(state, { type: "propose", tasks: v.tasks, source: "person", note: text(b.note, 500) || undefined }, who.id, p.taskIds);
      if (!prop.ok) return bad(prop.error);
      const w1 = await append(prop.kind, who.email ?? who.id, prop.payload);
      if (w1.err) return fail(w1.err);
      state = replayContracts(log);
    }
  }
  let action: ContractAction;
  if (act === "propose") action = { type: "propose", tasks: b.tasks, source: "person", note: text(b.note, 500) || undefined };
  else if (act === "approve") {
    // the approver is who signs, in the capacity they signed in: never chosen from a list
    action = { type: "approve", approver: signer!.ok ? signer!.approver : { title: "", source: "" } };
  } else action = { type: "withdraw", reason: text(b.reason, 500) };

  const plan = planContracts(state, action, who.id, p.taskIds);
  if (!plan.ok) return bad(plan.error);
  const w = await append(plan.kind, who.email ?? who.id, plan.payload);
  if (w.err) return fail(w.err);
  const next = replayContracts(log);
  // an approval or a withdrawal changes the skill: build it again, so what is stored (and kept as a version) is what the contract in force says
  const sk = plan.kind === "proposed" ? null : await rebuild(next, plan.kind === "approved" ? "contract_approved" : "contract_withdrawn");
  return NextResponse.json({ ok: true, kind: plan.kind, hash: w.entry!.hash, version: next.approved?.version ?? 0, pending: next.pending?.version ?? null, ...(sk ? { skill: sk } : {}) });
}
