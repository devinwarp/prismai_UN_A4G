import { CaseMemory, type CaseState, type MemoryStore } from "./case-memory.ts";
import { addDays, daysBetween, DOC_CODE, DOC_LABEL, DOC_TYPES, readDocument, verifyDocument, type DocType, type Finding, type LicenceRecord, type OcrEngine } from "./doc-ocr.ts";
import type { Registry, Payment } from "./fixtures-uc02.ts";
import { reactAnswer, type OutsideRequest, type ReactResult, type Retrieve } from "./react-sop.ts";
import { extractSkill, loadSop, type SkillFile } from "./sop-kb.ts";
import { loadRules, type Rules } from "./sop-rules.ts";

// The licence-renewal agent: the job profile's own skill file is its authority, the SOP knowledge
// base (through ReAct) is where every figure comes from, uploaded documents arrive through OCR,
// and case memory carries state between sessions and from one agent to the next. It is a
// deterministic, rule-based executor, not a language model: what it shows is that the pieces
// (skill, KB, ReAct, OCR, memory) are wired into one working path that the per-task evals test.

export interface Tools {
  licenceRecord(licenceNumber: string): LicenceRecord | null;
  registry(licenceNumber: string): Registry;
  payments(caseId: string): Payment[];
  ocr: OcrEngine;
  retrieve: Retrieve;
  /** The required outside-information tool. */
  requestOutside?: (r: OutsideRequest) => Promise<string> | string;
}

export interface CaseRequest { licence_number: string; declared_activity_code: string; reply_to?: string }

export interface TaskResult {
  task: string;
  ok: boolean;
  output: Record<string, unknown>;
  /** chunk ids of the SOP passages the result rests on */
  citations: string[];
  /** a person must release or decide this */
  needs_human?: boolean;
  escalate?: string;
  /** set when the task is not this profile's to do */
  refused?: string;
}

interface Facts { record: LicenceRecord; state: CaseState }

const SKILL_TASK = /^### (T\d{2})$/gm;

export class Agent {
  readonly sopId: string;
  readonly profile: string;
  readonly caseId: string;
  readonly skill: SkillFile;
  /** tasks this profile may do, read from its skill file */
  readonly allowed: string[];
  readonly rules: Rules;
  private tools: Tools;
  private memory: CaseMemory;
  private today: string;
  private actor: string;

  constructor(a: { sopId: string; profile: string; caseId: string; skill: SkillFile; rules: Rules; tools: Tools; memory: CaseMemory; today: string }) {
    this.sopId = a.sopId; this.profile = a.profile; this.caseId = a.caseId; this.skill = a.skill; this.rules = a.rules;
    this.tools = a.tools; this.memory = a.memory; this.today = a.today;
    this.allowed = [...a.skill.markdown.matchAll(SKILL_TASK)].map((m) => m[1]);
    this.actor = `agent:${a.skill.name}`;
  }

  private cite = (...k: string[]) => k.map((x) => `${this.sopId}#${x}`);
  private ruleCites = (...names: string[]) => names.flatMap((n) => this.rules.cited[n] ?? []);

  state(): CaseState { return this.memory.state(); }

  /** Open the case once; later sessions find it already open. */
  async openCase(req: CaseRequest): Promise<void> {
    if (this.memory.state().licence_number) return;
    await this.memory.write("case_opened", this.actor, { ...req });
  }

  /** The submit_document tool: read an uploaded image and remember what it was. */
  async receiveDocument(image: Buffer): Promise<{ stored: boolean; type: DocType | null; confidence: number; findings: Finding[] }> {
    const f = this.facts();
    const d = await readDocument(image, this.tools.ocr);
    if (!d.readable || !d.type) {
      await this.memory.write("note", this.actor, { note: "unreadable_upload", sha256: d.sha256, confidence: d.confidence, guess: d.type });
      return { stored: false, type: d.type, confidence: d.confidence, findings: [] };
    }
    const findings = verifyDocument(d.type, d.fields, f.record, this.rules, this.today);
    await this.memory.write("document_received", this.actor, { type: d.type, fields: d.fields, sha256: d.sha256, confidence: d.confidence, findings });
    return { stored: true, type: d.type, confidence: d.confidence, findings };
  }

  /** Answer an applicant's question from the SOP, or make the required outside-information call. */
  async ask(question: string): Promise<ReactResult> {
    const r = await reactAnswer(this.sopId, question, { retrieve: this.tools.retrieve, requestOutside: this.tools.requestOutside });
    if (r.status === "outside_kb") await this.memory.write("outside_request", this.actor, { question, tried: r.outside?.tried ?? [] });
    return r;
  }

  async run(task: string): Promise<TaskResult> {
    if (!this.allowed.includes(task)) {
      const owner = loadSop(this.sopId).chunks.find((c) => c.chunk_id === `${this.sopId}#${task}`)?.job_profile ?? "the role named in the SOP";
      return { task, ok: false, output: {}, citations: [], refused: `${task} is not in the ${this.profile} skill`, escalate: owner };
    }
    const r = await this.perform(task);
    await this.memory.write("check", this.actor, { task, output: r.output, citations: r.citations });
    if (task === "T09" && r.ok) await this.memory.write("status", this.actor, { status: r.output.status });
    const draft = task === "T10" ? r.output.email : task === "T12" ? r.output.notice : null;
    if (draft) await this.memory.write("draft", this.actor, { task, draft });
    return r;
  }

  private facts(): Facts {
    const state = this.memory.state();
    const record = state.licence_number ? this.tools.licenceRecord(state.licence_number) : null;
    if (!record) throw new Error("case has no licence on record; the Front-Desk Officer must open it (T01)");
    return { record, state };
  }

  // ---- computations (pure over facts; written to memory by run) -------------------------------

  private dates(f: Facts) {
    const days = daysBetween(f.record.expiry, this.today);
    return { days, blocked: days > this.rules.graceDays, late: days >= 1 && days <= this.rules.graceDays };
  }

  private docIssues(f: Facts, codes: ("D1" | "D2" | "D3" | "D4")[]): { doc: string; status: "missing" | "invalid"; reason: string }[] {
    const out: { doc: string; status: "missing" | "invalid"; reason: string }[] = [];
    for (const t of DOC_TYPES.filter((x) => codes.includes(DOC_CODE[x]))) {
      const d = f.state.documents[t];
      if (!d) { out.push({ doc: DOC_CODE[t], status: "missing", reason: `${DOC_LABEL[t]}: not received` }); continue; }
      // re-checked against today's date and the current SOP figures, so a document that was valid
      // when it arrived is not trusted after it has expired
      for (const x of verifyDocument(t, d.fields, f.record, this.rules, this.today)) out.push({ doc: DOC_CODE[t], status: "invalid", reason: `${DOC_LABEL[t]}: ${x.message}` });
    }
    return out;
  }

  private unreadable(missing: number): number {
    return missing ? this.memory.entriesOf("note").filter((e) => e.payload.note === "unreadable_upload").length : 0;
  }

  private assess(f: Facts) {
    const d = this.dates(f);
    const present = this.docIssues(f, ["D1", "D2", "D3", "D4"]).filter((i) => i.status === "missing");
    const t05 = [...this.docIssues(f, ["D1", "D3", "D4"])];
    const lease = this.docIssues(f, ["D2"]);
    const items: string[] = [...t05.map((i) => i.reason), ...lease.map((i) => i.reason)];
    const unread = this.unreadable(present.length);
    if (unread) items.push(`${unread} uploaded file(s) could not be read; please send a clearer copy`);
    const status = d.blocked ? "blocked" : items.length ? "on_hold" : "complete";
    return { d, items, status, unread, t05, lease };
  }

  private async perform(task: string): Promise<TaskResult> {
    const f = this.facts();
    const base = (output: Record<string, unknown>, citations: string[], extra: Partial<TaskResult> = {}): TaskResult => ({ task, ok: true, output, citations, ...extra });
    const a = () => this.assess(f);
    switch (task) {
      case "T04": {
        const { d } = a();
        return base({ expiry: f.record.expiry, days_expired: d.days, late_fee_applies: d.late, blocked: d.blocked, label: d.blocked ? "blocked: outside grace period" : null },
          [...this.cite("T04"), ...this.ruleCites("graceDays")], d.blocked ? { escalate: "Licensing Supervisor (T16), then Head of Licensing" } : {});
      }
      case "T05": {
        const { t05 } = a();
        const status = Object.fromEntries(DOC_TYPES.map((t) => [DOC_CODE[t], f.state.documents[t] ? (t05.some((i) => i.doc === DOC_CODE[t]) ? "invalid" : "ok") : "missing"]));
        return base({ documents: status, issues: [...t05, ...this.docIssues(f, ["D2"]).filter((i) => i.status === "missing")].map((i) => i.reason), not_checked: ["D5", "D6"] },
          [...this.cite("T05", "D1", "D2", "D3", "D4", "VAL"), ...this.ruleCites("idValidDays", "minCover")]);
      }
      case "T06": {
        const issues = this.docIssues(f, ["D2"]);
        return base({ lease: issues.length ? (issues[0].status === "missing" ? "not_received" : "issues") : "ok", issues: issues.map((i) => i.reason) }, [...this.cite("T06", "D2"), ...this.ruleCites("leaseMonths")]);
      }
      case "T07": {
        const r = this.tools.registry(f.record.licence_number);
        const exception = r.fines.length > 0 || r.inspectionHold !== null;
        return base({ fines: r.fines, inspection_hold: r.inspectionHold, exception }, this.cite("T07", "S8"), exception ? { escalate: "Licensing Supervisor (T16), then Compliance" } : {});
      }
      case "T08": {
        const declared = String(f.state.request?.declared_activity_code ?? "");
        const changed = declared !== f.record.activity_code;
        return base({ recorded: f.record.activity_code, declared, changed, activity_group: f.record.activity_group }, this.cite("T08", "S6"), changed ? { escalate: "Licensing Supervisor (T16), then Head of Licensing" } : {});
      }
      case "T09": {
        const { status, items, d } = a();
        const reg = this.tools.registry(f.record.licence_number);
        const exceptions = [
          ...(reg.fines.length ? ["unpaid fine"] : []), ...(reg.inspectionHold ? ["inspection hold"] : []),
          ...(String(f.state.request?.declared_activity_code ?? "") !== f.record.activity_code ? ["activity code changed"] : []),
        ];
        return base({ status, missing: status === "on_hold" ? items : [], exceptions, late_fee_applies: d.late }, [...this.cite("T09", "R7")]);
      }
      case "T10": {
        const { status, items } = a();
        if (status !== "on_hold") return base({ email: null, reason: `file is ${status}, not on hold` }, this.cite("T10"));
        const cites = [...this.cite("T10", "S7"), this.rules.submitChunk];
        if (f.record.language !== "en") return base({ email: null, reason: "an Arabic draft needs a person; no draft was written" }, cites, { needs_human: true });
        const reply = f.state.request?.reply_to ? String(f.state.request.reply_to) : null;
        const email = {
          to: f.record.registered_email,
          subject: `Renewal ${this.caseId}: application on hold`,
          body: [
            `Dear ${f.record.holder},`, "",
            `Your trade licence renewal (case ${this.caseId}) is on hold because of missing information until it is received.`,
            "Please send:", ...items.map((i) => `- ${i}`), "",
            "You can submit documents on the case page of the portal, at the counter, or by replying to this email with the case number in the subject.",
          ].join("\n"),
          items,
        };
        return base({ email, ignored_reply_to: reply && reply !== f.record.registered_email ? reply : null }, cites, { needs_human: true });
      }
      case "T11": case "T12": case "T13": return this.fees(task, f);
      default: return { task, ok: false, output: {}, citations: [], refused: `no behaviour defined for ${task}` };
    }
  }

  private fees(task: string, f: Facts): TaskResult {
    const t04 = f.state.checks.T04?.output, t08 = f.state.checks.T08?.output;
    if (f.state.status !== "complete" || !t04 || !t08) {
      return { task, ok: false, output: {}, citations: this.cite(task), refused: "the file is not marked complete in case memory", escalate: "Document Verification Analyst" };
    }
    const group = String(t08.activity_group);
    const base = this.rules.baseFees[group];
    if (base === undefined) return { task, ok: false, output: {}, citations: this.cite("S6"), refused: `no base fee for "${group}" in the fee table`, needs_human: true };
    const late = t04.late_fee_applies ? Math.round((base * this.rules.lateFeePct) / 100) : 0;
    const total = base + late;
    const cites = [...this.cite(task, "S6"), ...this.ruleCites("baseFees", "lateFeePct")];
    if (task === "T11") return { task, ok: true, output: { group, base, late, total }, citations: cites };
    if (task === "T12") {
      if (f.record.language !== "en") return { task, ok: true, output: { notice: null, reason: "an Arabic notice needs a person" }, citations: cites, needs_human: true };
      const notice = { to: f.record.registered_email, amount: total, due: addDays(this.today, this.rules.noticeDays), pay_by: ["card on the portal", "bank transfer quoting the case number as the reference", "card at the counter"], case: this.caseId };
      return { task, ok: true, output: { notice }, citations: [...cites, ...this.ruleCites("noticeDays")], needs_human: true };
    }
    const paid = this.tools.payments(this.caseId);
    const exact = paid.some((p) => p.amount === total && p.reference === this.caseId);
    const status = exact ? "matched" : paid.length ? "mismatch" : "pending";
    return { task, ok: true, output: { expected: total, status, received: paid }, citations: cites, ...(status === "mismatch" ? { escalate: "Licensing Supervisor (T16), then Finance" } : {}) };
  }
}

export interface OpenOptions { sopId: string; profile: string; caseId: string; today: string; tools: Tools; store: MemoryStore; actorClock?: () => string }

/** Open an agent for one job profile and one case. Refuses if the SOP is not vectorised, and
 * throws OutsideInformationRequired if the SOP cannot supply a figure the agent needs. */
export async function openAgent(o: OpenOptions): Promise<Agent> {
  const skill = extractSkill(o.sopId, o.profile);
  const rules = await loadRules(o.sopId, o.tools.retrieve, o.tools.requestOutside);
  const memory = new CaseMemory(o.caseId, o.store, o.actorClock);
  await memory.open();
  return new Agent({ sopId: o.sopId, profile: o.profile, caseId: o.caseId, skill, rules, tools: o.tools, memory, today: o.today });
}
