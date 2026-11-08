import type { GateScenario, PortfolioScenario, Scenario } from "./scenario.ts";
import type { RoutedEvent } from "./round.ts";

// The submission's staged scenarios (audit 5.2). Synthetic, fictitious entities.
const ev = (id: string, recipients: RoutedEvent["recipients"], summary: string, gate?: RoutedEvent["gate"], status?: RoutedEvent["status"], hitl?: RoutedEvent["hitl"]): RoutedEvent =>
  ({ id, type: gate ? "gate_evidence" : "context", summary, recipients, gate, status, ...(hitl ? { hitl } : {}) });

/** S1: UC02 trade-licence renewal pre-check (Marsa PSA). Autonomy is requested
 * for a client-facing use case; two gates fail in turn; fixes are declared,
 * re-tested, and the case lands at the ceiling for client-facing: supervised. */
export const S1: GateScenario = {
  kind: "gate",
  id: "S1",
  title: "UC02 Trade licence renewal and permit pre-check",
  ext_id: "UC02",
  clientFacing: true,
  requested: "GO_AUTONOMOUS",
  steps: [
    { step: "T0", expected: "ESCALATE", events: [
      ev("S1-T0-baseline", ["innovator", "frontline", "policy_adviser"], "Verified pilot baseline: pre-check agrees with the officer's own check 96.8% of the time"),
      ev("S1-T0-audit", ["security"], "Audit log covers every action the agent takes", "audit_log", "pass"),
      ev("S1-T0-dpa", ["privacy"], "Data processing terms cover the licence data used", "data_lawful", "pass"),
      ev("S1-T0-disclosure", ["compliance"], "Citizens are told they are talking to an assistant", "ai_disclosure", "pass"),
    ] },
    { step: "T1", expected: "NO_GO", events: [
      ev("S1-T1-hosting", ["security"], "Hosting report: the model endpoint is not on DESC-certified infrastructure", "approved_infrastructure", "fail"),
    ] },
    { step: "T2", expected: "NO_GO", events: [
      ev("S1-T2-hitl", ["compliance"], "The agent sends customer messages directly, without an officer releasing them", "human_final_approval", "fail", { rule: "client_facing_final_approval", met: false }),
    ] },
    { step: "T3", expected: "ASSISTANT_ONLY", events: [
      ev("S1-T3-hosting-fix", ["innovator"], "Owner moved the model to approved hosting", "approved_infrastructure", "fix_declared"),
      ev("S1-T3-hitl-fix", ["innovator"], "Owner restored officer release of every customer message", "human_final_approval", "fix_declared", { rule: "client_facing_final_approval", met: true }),
    ] },
    { step: "T4", expected: "GO_SUPERVISED", events: [
      ev("S1-T4-hosting-retest", ["security"], "Re-test passed: the endpoint is on certified infrastructure", "approved_infrastructure", "pass"),
      ev("S1-T4-hitl-retest", ["compliance"], "Re-test passed: an officer releases every customer message", "human_final_approval", "pass", { rule: "client_facing_final_approval", met: true }),
    ] },
  ],
};

/** S2: UC01 voice contact centre. A live GO_SUPERVISED pilot meets a chain of
 * events, and every one changes the outcome (C2-3):
 *  T1 a Sijil hallucination alert, seen only by compliance, comes with the
 *     owner's immediate containment (fee answers restricted to the retrieved
 *     fee table): fix declared, not re-tested -> ASSISTANT_ONLY;
 *  T2 a citizen complaint (frontline only) that the assistant quoted a fee
 *     that does not exist; compliance links it to the T1 alert and adds the
 *     fee_accuracy gate, which fails -> NO_GO;
 *  T3 a transparency requirement (policy adviser only): compliance re-tests
 *     ai_disclosure against it and it fails; two open failures -> NO_GO and
 *     an ESCALATE to the human;
 *  T4 the owner declares fixes for both gates -> ASSISTANT_ONLY;
 *  T5 the re-tests pass, with hallucination_rate and fee_accuracy now
 *     permanent gates -> GO_SUPERVISED. */
export const S2: GateScenario = {
  kind: "gate",
  id: "S2",
  title: "UC01 Voice contact centre: hallucination alert on a live pilot",
  ext_id: "UC01",
  clientFacing: true,
  requested: "GO_SUPERVISED",
  steps: [
    { step: "T0", expected: "GO_SUPERVISED", events: [
      ev("S2-T0-live", ["innovator", "frontline"], "Pilot is live: the assistant answers licensing calls and an officer approves every written follow-up"),
      ev("S2-T0-hosting", ["security"], "Hosting report: the voice and model endpoints are on DESC-certified infrastructure", "approved_infrastructure", "pass"),
      ev("S2-T0-audit", ["security"], "Audit log covers every call the agent handles", "audit_log", "pass"),
      ev("S2-T0-dpa", ["privacy"], "Data processing terms cover the call recordings used", "data_lawful", "pass"),
      ev("S2-T0-release", ["compliance"], "An officer approves every written follow-up before it reaches a caller", "human_final_approval", "pass"),
      ev("S2-T0-disclosure", ["compliance"], "Every call opens with a message that the caller is speaking to an AI assistant", "ai_disclosure", "pass"),
    ] },
    { step: "T1", expected: "ASSISTANT_ONLY", events: [
      ev("S2-T1-alert", ["compliance"], "Sijil alert: hallucination rate 6.1% over the last 3 runs, above the 1% threshold"),
      ev("S2-T1-contain", ["innovator"], "Owner restricted fee answers to the retrieved fee table; the agent now drafts and an officer sends", "hallucination_rate", "fix_declared"),
    ] },
    { step: "T2", expected: "NO_GO", events: [
      ev("S2-T2-complaint", ["frontline"], "Complaint logged: the assistant quoted a licence fee that does not exist"),
      { ...ev("S2-T2-fee", ["compliance"], "The complaint matches the T1 alert: the assistant still invented a fee. Fee accuracy is added as a gate and fails", "fee_accuracy", "fail"), links: ["S2-T1-alert"] },
    ] },
    { step: "T3", expected: "NO_GO", events: [
      ev("S2-T3-kb", ["policy_adviser"], "Transparency requirement: users must be told when AI-generated information may be inaccurate"),
      ev("S2-T3-disclosure", ["compliance"], "Re-test against the new requirement: the call opening says it is an AI assistant but does not say its answers may be inaccurate", "ai_disclosure", "fail"),
    ] },
    { step: "T4", expected: "ASSISTANT_ONLY", events: [
      ev("S2-T4-fee-fix", ["innovator"], "Owner limited fee answers to the fee table and retuned retrieval", "fee_accuracy", "fix_declared"),
      ev("S2-T4-disclosure-fix", ["innovator"], "Owner added to the call opening that answers may be inaccurate and an officer should confirm fees", "ai_disclosure", "fix_declared"),
    ] },
    { step: "T5", expected: "GO_SUPERVISED", events: [
      ev("S2-T5-fee", ["compliance"], "Re-test passed: every fee quoted in 40 test calls matched the fee table", "fee_accuracy", "pass"),
      ev("S2-T5-disclosure", ["compliance"], "Re-test passed: the call opening carries the new inaccuracy notice", "ai_disclosure", "pass"),
      ev("S2-T5-retest", ["compliance"], "Re-test passed: hallucination rate 0.6% over 3 runs, under the 1% threshold", "hallucination_rate", "pass"),
    ] },
  ],
};

const line = (deployed: number, pct: number, comp: number, cpct: number, gap: number) =>
  `deployed ${deployed}/20 (${pct}%), compliant ${comp}/20 (${cpct}%), target 10, gap ${gap}`;

/** S3: the federal cascade over the 20-use-case dataset. Needs the
 * data/un-use-cases.csv ids; runs on a sandbox copy of the org's use cases. */
export const S3: PortfolioScenario = {
  kind: "portfolio",
  id: "S3",
  title: "Federal cascade: 50% target across 20 use cases in 5 entities",
  steps: [
    { step: "T0", recipients: ["coordinator"], action: { type: "policy_configured" }, expected: line(0, 0, 0, 0, 10) },
    { step: "T1", recipients: ["coordinator"], action: { type: "entity_reports", ids: ["UC02", "UC04", "UC06", "UC10", "UC14", "UC19"] }, expected: line(6, 30, 0, 0, 4) },
    { step: "T2", recipients: ["compliance"], action: { type: "attestation", failed: ["UC02", "UC06"] }, expected: line(6, 30, 4, 20, 4) },
    { step: "T3", recipients: ["policy_adviser"], action: { type: "policy_update", sector: "Transport", note: "a new Phase One service category (transport and mobility services) is added to the federal list" },
      expected: `${line(6, 30, 4, 20, 4)}; re-score UC13, UC14, UC15, UC16` },
  ],
};

export const SCENARIOS: Record<string, Scenario> = { S1, S2, S3 };
