import type { Effective } from "./gates.ts";
import { evidenceFor } from "./gates.ts";
import { VERDICTS, type Verdict } from "./model.ts";
import type { GateStatus } from "./policy.ts";
import type { CaseState } from "./protocol.ts";
import { startRun, type AdhocInput, type GateScenario, type RunState, type Scenario } from "./scenario.ts";
import { SCENARIOS } from "./scenarios.ts";

// The verdict path of ANY use case. The staged scenarios (scenarios.ts) exist for three use cases only, so a use case without one could never accept gates or
// sign a verdict. An EVIDENCE scenario is generated for a use case instead: it has no staged steps; the people who own each gate record the evidence one gate at
// a time (an ad-hoc step of the ordinary round, so the same agents, the same policy engine and the same hash-chained trace), and a person signs the result.
// Pure: the route and the store do the reading and writing.

export const EVIDENCE_PREFIX = "E-";
export const evidenceScenarioId = (ext: string) => `${EVIDENCE_PREFIX}${ext}`;
export const isEvidenceScenario = (id: string) => id.startsWith(EVIDENCE_PREFIX) && id.length > EVIDENCE_PREFIX.length;

export function evidenceScenario(ext: string, clientFacing = false, requested: CaseState["requested"] = "ASSISTANT_ONLY"): GateScenario {
  return { kind: "gate", id: evidenceScenarioId(ext), title: `${ext} evidence and verdict`, ext_id: ext, clientFacing, requested, steps: [] };
}

/** The scenario a stored run was made from: a staged one, or the evidence scenario of its use case. */
export function scenarioFor(id: string): Scenario | undefined {
  return SCENARIOS[id] ?? (isEvidenceScenario(id) ? evidenceScenario(id.slice(EVIDENCE_PREFIX.length)) : undefined);
}

/** A new evidence run. It has no staged steps to release, so it is done from the start: it can be signed as soon as the evidence is in. */
export function startEvidenceRun(ext: string, runId: string, o: { clientFacing: boolean; requested: CaseState["requested"] }): RunState {
  const run = startRun(evidenceScenario(ext, o.clientFacing, o.requested), runId);
  return { ...run, done: true, state: { ...run.state!, clientFacing: o.clientFacing, requested: o.requested } };
}

export const REQUESTED_LEVELS: CaseState["requested"][] = ["ASSISTANT_ONLY", "GO_SUPERVISED", "GO_AUTONOMOUS"];

/** `change` is the change reference of a declared fix: what was changed and where its record is (a ticket, a change record, a report). */
export interface EvidenceInput { gate: string; status: string; note: string; change?: string }

/** The id the next ad-hoc step of a run will have (scenario.ts adhocStep), so a declared fix can cite the change record recorded just before it. */
export const nextAdhocEventId = (scenarioId: string, run: RunState) => `${scenarioId}-A${run.steps.filter((s) => s.adhoc).length + 1}-adhoc`;

/** The ad-hoc steps for one gate's evidence, in order, or the reason they are not acceptable.
 *  - pass / fail: addressed to the gate's owner.
 *  - fix_declared: only on a gate that now fails. Two steps: the change record (context, to the innovator), then the declaration citing it. The gate then reads "fix declared",
 *    which holds the verdict at ASSISTANT_ONLY until its owner re-tests.
 *  - a pass on a gate that fails now is refused: a failure is lifted by a declared fix and a re-test, never by a bare pass.
 *  `current` is the gate's status in the run now; `eventId` is the id the first step will get (nextAdhocEventId). */
export function evidenceSteps(i: EvidenceInput, eff: Effective, current: GateStatus, eventId: string): { ok: true; inputs: AdhocInput[] } | { ok: false; error: string } {
  const g = eff.gates.find((x) => x.id === i.gate);
  if (!g) return { ok: false, error: "That gate does not apply to this use case." };
  if (g.waiver) return { ok: false, error: "That gate is waived for this use case." };
  if (eff.catalog[i.gate]?.metric) return { ok: false, error: "That gate is measured, not recorded by a person." };
  if (i.status !== "pass" && i.status !== "fail" && i.status !== "fix_declared") return { ok: false, error: "Say whether the evidence passes or fails, or declare a fix." };
  const note = i.note.trim();
  if (!note) return { ok: false, error: i.status === "fix_declared" ? "Say what was fixed." : "Say what the evidence is: a sentence about what was checked and where it can be found." };
  if (note.length > 500) return { ok: false, error: "Keep the note to 500 characters." };
  if (i.status === "fix_declared") {
    if (current !== "fail" && current !== "fix_declared") return { ok: false, error: "A fix is declared only for a gate that fails." };
    const change = (i.change ?? "").trim();
    if (!change) return { ok: false, error: "A declared fix needs its change reference: what was changed, and where the record of the change is." };
    if (change.length > 300) return { ok: false, error: "Keep the change reference to 300 characters." };
    return { ok: true, inputs: [
      { summary: `Change record for ${eff.catalog[i.gate].label}: ${change}`, recipients: ["innovator"] },
      { summary: note, gate: i.gate, status: "fix_declared", recipients: ["innovator"], evidence: [eventId] },
    ] };
  }
  if (current === "fail" && i.status === "pass") return { ok: false, error: "This gate fails. Declare the fix, with its change reference, before it can be re-tested to pass." };
  return { ok: true, inputs: [{ summary: note, gate: i.gate, status: i.status as GateStatus, recipients: [eff.catalog[i.gate].owner] }] };
}

export interface GateLine {
  id: string; label: string; owner: string; why: string;
  /** "waived" and "measured" are not recorded by a person. */
  kind: "person" | "waived" | "measured";
  status: GateStatus;
  note: string;
}

/** One line per effective gate: what the run holds for it now, and the note that came with the latest evidence. */
export function evidenceLines(eff: Effective, run: RunState | null): GateLine[] {
  const status = evidenceFor(eff, run?.state?.ext_id ?? "", run?.state?.gates ?? {});
  return eff.gates.map((g) => {
    const events = (run?.steps ?? []).flatMap((s) => s.events).filter((e) => e.gate === g.id && e.status);
    const def = eff.catalog[g.id];
    return {
      id: g.id, label: g.label, owner: def.owner, why: g.reason,
      kind: g.waiver ? "waived" : def.metric ? "measured" : "person",
      status: status[g.id] ?? "unknown",
      note: events.length ? events[events.length - 1].summary : "",
    };
  });
}

/** Gates still waiting for a person's evidence. A run can be signed when this is empty; the verdict it carries may still be NO_GO, which is a result. */
export const missingEvidence = (lines: GateLine[]) => lines.filter((l) => l.kind === "person" && l.status === "unknown").map((l) => l.id);

/** The verdict the run has reached so far (the last judged step), or null before any evidence. */
export const currentVerdict = (run: RunState | null): { verdict: Verdict; reasons: string[] } | null => {
  const s = run?.steps[run.steps.length - 1];
  return s && (VERDICTS as readonly string[]).includes(s.outcome) ? { verdict: s.outcome as Verdict, reasons: s.reasons } : null;
};
