import { CaseMemory, type CaseState, type MemoryStore } from "./case-memory.ts";
import { addDays, CORE_CODES, CORE_DOC_TYPES, daysBetween, DOC_CODE, DOC_LABEL, readDocument, verifyDocument, type DocCode, type DocContext, type DocType, type Finding, type LicenceRecord, type OcrEngine } from "./doc-ocr.ts";
import { simulatedGate, type CallDecision } from "./sijil-calls.ts";
import type { Registry, Payment } from "./fixtures-uc02.ts";
import { reactAnswer, type OutsideRequest, type ReactResult, type Reasoner, type Reflector, type Retrieve } from "./react-sop.ts";
import { reasonerFromEnv } from "./react-llm.ts";
import { withTunedRules, type ReactConfig } from "./react-config.ts";
import { extractSkill, loadSop, type SkillFile } from "./sop-kb.ts";
import { loadRules, type Rules } from "./sop-rules.ts";
import { AI_OUTPUT_NOTICE, discloseAgentOutput } from "./ai-disclosure.ts";

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
  /** Is this translator on the Marsa register? Without it a translation cannot be verified. */
  translatorRegistered?: (registration: string) => boolean;
  retrieve: Retrieve;
  /** The required outside-information tool. */
  requestOutside?: (r: OutsideRequest) => Promise<string> | string;
  /** The approved glossary, routing and thresholds of the ReAct loop (tuned from the front end); the defaults when absent. */
  react?: ReactConfig;
  /** Reasoner for ReAct questions. Default: the model one if AGENT_REASONER=llm and an endpoint is set, else rule-based. */
  reasoner?: Reasoner;
  /** Reflection on a proposed finish of a ReAct question (see react-sop.ts); without it a supported citation is enough. */
  reflect?: Reflector;
}

export interface CaseRequest {
  licence_number: string; declared_activity_code: string; reply_to?: string;
  /** what the applicant asked for; anything but a renewal is out of scope (SOP section 2) */
  request_type?: "renewal" | "new_licence" | "change_of_owner" | "cancellation" | "appeal";
  /** the name of the person applying when it is not the licence owner: D5 is then required */
  representative?: string;
  /** free text on the request. Never a source of authority (rule R1). */
  note?: string;
}

/** Tasks that are decisions of the person holding the Licensing Supervisor role. The agent may summarise
 * the pack (T14) but never approves, decides an exception, issues or sends a decision (rule R1, control 1). */
export const HUMAN_ONLY = ["T15", "T16", "T17", "T18"];
/** The forged-document escalation of SOP section 8 has no task number in the SOP; it is X01 here, open to the
 * profiles that handle documents (T02 at the counter, T05 in verification), and it cites S8 and T05. */
export const FORGERY_TASK = "X01";

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

const same = (a: unknown, b: string) => String(a ?? "").trim().toLowerCase() === b.trim().toLowerCase();
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
  /** Every tool call this agent attempted, each decided by the (simulated) Sijil gate. */
  readonly calls: CallDecision[] = [];
  private toolAllow: string[];

  constructor(a: { sopId: string; profile: string; caseId: string; skill: SkillFile; rules: Rules; tools: Tools; memory: CaseMemory; today: string }) {
    this.sopId = a.sopId; this.profile = a.profile; this.caseId = a.caseId; this.skill = a.skill; this.rules = a.rules;
    this.tools = a.tools; this.memory = a.memory; this.today = a.today;
    const inSkill = [...a.skill.markdown.matchAll(SKILL_TASK)].map((m) => m[1]);
    this.allowed = [...inSkill.filter((t) => !HUMAN_ONLY.includes(t)), ...(inSkill.includes("T05") || inSkill.includes("T02") ? [FORGERY_TASK] : [])];
    this.toolAllow = ["ocr_read", "licence_record", "registry", "payments", "search_sop", "request_outside_information", "finish", ...this.allowed.map((t) => `task:${t}`)];
    this.actor = `agent:${a.skill.name}`;
  }

  private cite = (...k: string[]) => k.map((x) => `${this.sopId}#${x}`);
  private ruleCites = (...names: string[]) => names.flatMap((n) => this.rules.cited[n] ?? []);

  state(): CaseState { return this.memory.state(); }

  /** One tool call, decided by the Sijil gate (simulated here) against what this profile's skill allows. */
  private gate(tool: string, args: Record<string, string> = {}): boolean {
    const d = simulatedGate({ tool, args }, this.toolAllow);
    this.calls.push(d);
    return d.decision === "allow";
  }

  /** Open the case once; later sessions find it already open. */
  async openCase(req: CaseRequest): Promise<void> {
    if (this.memory.state().licence_number) return;
    await this.memory.write("case_opened", this.actor, { ...req });
  }

  /** The submit_document tool: read an uploaded image and remember what it was. A document that looks altered
   * or invented is not stored and not marked missing: the case stops and goes to Compliance (SOP section 8). */
  async receiveDocument(image: Buffer): Promise<{ stored: boolean; type: DocType | null; confidence: number; findings: Finding[]; forgery?: string[] }> {
    const f = this.facts();
    this.gate("ocr_read");
    const d = await readDocument(image, this.tools.ocr);
    if (!d.readable || !d.type) {
      await this.memory.write("note", this.actor, { note: "unreadable_upload", sha256: d.sha256, confidence: d.confidence, guess: d.type });
      return { stored: false, type: d.type, confidence: d.confidence, findings: [] };
    }
    if (d.forgery.length) {
      await this.memory.write("forgery_suspected", this.actor, { type: d.type, indicators: d.forgery, sha256: d.sha256 });
      return { stored: false, type: d.type, confidence: d.confidence, findings: [], forgery: d.forgery };
    }
    // a document in another language is kept as received; its contents are for a person to read, and D6 must accompany it
    const findings = d.foreign_language ? [] : verifyDocument(d.type, d.fields, f.record, this.rules, this.today, this.ctx(f));
    await this.memory.write("document_received", this.actor, { type: d.type, fields: d.fields, sha256: d.sha256, confidence: d.confidence, findings, language: d.foreign_language });
    return { stored: true, type: d.type, confidence: d.confidence, findings };
  }

  private ctx(f: Facts): DocContext {
    const rep = f.state.request?.representative;
    return { representative: rep ? String(rep) : null, translatorRegistered: this.tools.translatorRegistered };
  }

  /** Answer an applicant's question from the SOP, or make the required outside-information call. */
  async ask(question: string): Promise<ReactResult> {
    const prior = this.memory.state().outside.find((o) => o.question === question);
    if (prior?.answered) {
      // resumed from memory: a person answered this earlier, so the agent does not search or ask again
      return { status: "answered_by_person", steps: [], citations: [], answer: [], evidence: [], calls: [], person_answer: prior.answered };
    }
    if (prior) {
      return { status: "outside_kb", ai_disclosure: AI_OUTPUT_NOTICE, steps: [], citations: [], answer: [], evidence: [], calls: [], outside: { question, reason: prior.reason ?? "waiting for a person", tried: [] } };
    }
    const r = await reactAnswer(this.sopId, question, { retrieve: this.tools.retrieve, requestOutside: this.tools.requestOutside, reasoner: this.tools.reasoner ?? reasonerFromEnv(), reflect: this.tools.reflect, config: this.tools.react });
    for (const c of r.calls) this.calls.push(c);
    if (r.status === "outside_kb") await this.memory.write("outside_request", this.actor, { question, reason: r.outside?.reason ?? "", tried: r.outside?.tried ?? [] });
    return { ...r, ai_disclosure: AI_OUTPUT_NOTICE };
  }

  async run(task: string): Promise<TaskResult> {
    const result = await this.execute(task);
    return result.output.ai_disclosure === AI_OUTPUT_NOTICE ? result : { ...result, output: discloseAgentOutput(result.output) };
  }

  private async execute(task: string): Promise<TaskResult> {
    if (!this.gate(`task:${task}`)) {
      const owner = loadSop(this.sopId).chunks.find((c) => c.chunk_id === `${this.sopId}#${task}`)?.job_profile ?? "the role named in the SOP";
      if (HUMAN_ONLY.includes(task)) {
        return { task, ok: false, output: {}, citations: this.cite("R1", "S7"), refused: `${task} is a decision for the person holding the ${owner} role; no agent, request or note can take it over (rule R1)`, escalate: owner === this.profile ? `${owner} (a person)` : owner };
      }
      return { task, ok: false, output: {}, citations: [], refused: `${task} is not in the ${this.profile} skill`, escalate: owner };
    }
    const stopped = this.memory.state().forgery;
    if (stopped && task !== FORGERY_TASK && task !== "T01") {
      return { task, ok: false, output: {}, citations: this.cite("S8", "T05"), refused: "the case is stopped: a submitted document looked forged and went to Compliance", escalate: "Compliance, immediately" };
    }
    const result = await this.perform(task);
    const r = { ...result, output: discloseAgentOutput(result.output) };
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

  /** D5 is required when someone other than the owner applies; D6 for each stored document in another language. */
  private required(f: Facts): DocCode[] {
    const foreign = Object.values(f.state.documents).some((d) => d.language);
    return [...CORE_CODES, ...(f.state.request?.representative ? ["D5" as const] : []), ...(foreign ? ["D6" as const] : [])];
  }

  private docIssues(f: Facts, codes: DocCode[]): { doc: string; status: "missing" | "invalid"; reason: string }[] {
    const out: { doc: string; status: "missing" | "invalid"; reason: string }[] = [];
    const types = (Object.keys(DOC_CODE) as DocType[]).filter((x) => codes.includes(DOC_CODE[x]));
    for (const t of types) {
      const d = f.state.documents[t];
      if (!d) { out.push({ doc: DOC_CODE[t], status: "missing", reason: `${DOC_LABEL[t]}: not received` }); continue; }
      // re-checked against today's date and the current SOP figures, so a document that was valid
      // when it arrived is not trusted after it has expired
      if (!d.language) for (const x of verifyDocument(t, d.fields, f.record, this.rules, this.today, this.ctx(f))) out.push({ doc: DOC_CODE[t], status: "invalid", reason: `${DOC_LABEL[t]}: ${x.message}` });
    }
    // every document in another language needs a certified translation that names it (SOP D6)
    for (const t of Object.keys(f.state.documents) as DocType[]) {
      const d = f.state.documents[t]!;
      if (!d.language || !codes.includes("D6")) continue;
      const tr = f.state.documents.translation;
      if (!tr) out.push({ doc: "D6", status: "missing", reason: `${DOC_LABEL.translation} for the ${DOC_LABEL[t]} (${d.language}): not received` });
      else if (!same(tr.fields.document, DOC_CODE[t])) out.push({ doc: "D6", status: "invalid", reason: `${DOC_LABEL.translation}: does not name the ${DOC_CODE[t]} it translates` });
    }
    return out;
  }

  /** documents kept in another language: their contents are for a person to read */
  private foreignDocs(f: Facts): string[] {
    return (Object.keys(f.state.documents) as DocType[]).filter((t) => f.state.documents[t]?.language).map((t) => `${DOC_LABEL[t]} (${DOC_CODE[t]}) is in ${f.state.documents[t]!.language}; a person must read the original against its translation`);
  }

  private unreadable(missing: number): number {
    return missing ? this.memory.entriesOf("note").filter((e) => e.payload.note === "unreadable_upload").length : 0;
  }

  private assess(f: Facts) {
    const d = this.dates(f);
    const req = this.required(f);
    const present = this.docIssues(f, req).filter((i) => i.status === "missing");
    const t05 = [...this.docIssues(f, req.filter((c) => c !== "D2"))];
    const lease = this.docIssues(f, ["D2"]);
    const items: string[] = [...t05.map((i) => i.reason), ...lease.map((i) => i.reason)];
    const unread = this.unreadable(present.length);
    if (unread) items.push(`${unread} uploaded file(s) could not be read; please send a clearer copy`);
    const status = d.blocked ? "blocked" : items.length ? "on_hold" : "complete";
    return { d, items, status, unread, t05, lease };
  }

  private async perform(task: string): Promise<TaskResult> {
    if (task === "T01" && !this.memory.state().licence_number) throw new Error("case has no licence number");
    if (task === "T01" && !this.tools.licenceRecord(this.memory.state().licence_number!)) {
      return { task, ok: true, output: { found: false, in_scope: null, reason: "no licence with that number is on the system" }, citations: this.cite("T01"), needs_human: true, escalate: "Licensing Front-Desk Officer" };
    }
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
        const req = this.required(f);
        const status = Object.fromEntries(CORE_DOC_TYPES.map((t) => [DOC_CODE[t], f.state.documents[t] ? (t05.some((i) => i.doc === DOC_CODE[t]) ? "invalid" : "ok") : "missing"]));
        if (req.includes("D5")) status.D5 = f.state.documents.authorisation ? (t05.some((i) => i.doc === "D5") ? "invalid" : "ok") : "missing";
        if (req.includes("D6")) status.D6 = f.state.documents.translation ? (t05.some((i) => i.doc === "D6") ? "invalid" : "ok") : "missing";
        const person = this.foreignDocs(f);
        return base({ documents: status, issues: [...t05, ...this.docIssues(f, ["D2"]).filter((i) => i.status === "missing")].map((i) => i.reason), for_a_person: person },
          [...this.cite("T05", "D1", "D2", "D3", "D4", ...(req.includes("D5") ? ["D5"] : []), ...(req.includes("D6") ? ["D6"] : []), "VAL"), ...this.ruleCites("idValidDays", "minCover", ...(req.includes("D5") ? ["authLetterDays"] : []))], person.length ? { needs_human: true } : {});
      }
      case "T06": {
        const issues = this.docIssues(f, ["D2"]);
        const foreign = !!f.state.documents.lease?.language;
        return base({ lease: issues.length ? (issues[0].status === "missing" ? "not_received" : "issues") : foreign ? "in_other_language" : "ok", issues: issues.map((i) => i.reason) }, [...this.cite("T06", "D2"), ...this.ruleCites("leaseMonths")], foreign ? { needs_human: true } : {});
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
        const person = this.foreignDocs(f);
        return base({ status, missing: status === "on_hold" ? items : [], exceptions, late_fee_applies: d.late, for_a_person: person }, [...this.cite("T09", "R7")], person.length ? { needs_human: true } : {});
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
            "", "A member of staff reviews this draft before it is sent.",
          ].join("\n"),
          items,
        };
        return base({ email, ignored_reply_to: reply && reply !== f.record.registered_email ? reply : null }, cites, { needs_human: true });
      }
      case "T11": case "T12": case "T13": return this.fees(task, f);
      case "T01": return this.t01(f);
      case "T02": return this.t02(f);
      case "T03": return this.t03(f);
      case "T14": return this.t14(f);
      case FORGERY_TASK: {
        const fg = f.state.forgery;
        return base({ suspected: !!fg, document: fg ? DOC_CODE[fg.doc] : null, indicators: fg?.indicators ?? [], not_marked_missing: true, handled_by: "Compliance" },
          this.cite("S8", "T05"), fg ? { escalate: "Compliance, immediately", needs_human: true } : {});
      }
      default: return { task, ok: false, output: {}, citations: [], refused: `no behaviour defined for ${task}` };
    }
  }

  // ---- Front-Desk tasks (assist only: a person confirms identity and releases anything the applicant sees)

  private t01(f: Facts): TaskResult {
    const reqType = String(f.state.request?.request_type ?? "renewal");
    const cites = this.cite("T01", "S2");
    if (reqType !== "renewal") {
      const procedure = reqType === "appeal" ? "SOP-LIC-021" : null; // the SOP names only the appeals procedure
      return { task: "T01", ok: true, output: { in_scope: false, request_type: reqType, procedure, reason: "this procedure covers renewals only (section 2)" }, citations: cites, needs_human: true, ...(procedure ? {} : { escalate: "Licensing Supervisor (the SOP does not name the procedure that applies)" }) };
    }
    const email = f.record.registered_email;
    return { task: "T01", ok: true, output: { in_scope: true, case_number: this.caseId, acknowledgement: { to: email, body: `Your trade licence renewal has been opened as case ${this.caseId}. Please quote this number in every contact.` } }, citations: cites, needs_human: true };
  }

  private t02(f: Facts): TaskResult {
    const docs = f.state.documents;
    const rep = f.state.request?.representative ? String(f.state.request.representative) : null;
    const code = rep ? "D5" : "D3";
    const d = rep ? docs.authorisation : docs.owner_id;
    const cites = [...this.cite("T02", "D3", ...(rep ? ["D5"] : [])), ...this.ruleCites("idValidDays", ...(rep ? ["authLetterDays"] : []))];
    if (!d) return { task: "T02", ok: true, output: { identity: "not_confirmed", reason: `${DOC_LABEL[rep ? "authorisation" : "owner_id"]} (${code}) not received`, continue_case: false, representative: rep }, citations: cites, needs_human: true };
    const issues = this.docIssues(f, [code]).map((i) => i.reason);
    if (rep && !issues.length) { /* D5 names the representative and carries the copy of their own identity document */ }
    return { task: "T02", ok: true, output: { identity: issues.length ? "not_confirmed" : "confirmed", reason: issues.join("; ") || null, continue_case: !issues.length, representative: rep }, citations: cites, needs_human: true };
  }

  private t03(f: Facts): TaskResult {
    const id = f.state.checks.T02?.output.identity;
    const cites = [...this.cite("T03", "S10", "S5", "S6"), this.rules.submitChunk];
    if (id !== "confirmed") return { task: "T03", ok: false, output: {}, citations: this.cite("T03"), refused: "identity is not confirmed (T02), so the applicant is not told what to send yet", escalate: "Licensing Front-Desk Officer (T02)" };
    const d = this.dates(f);
    if (d.blocked) return { task: "T03", ok: true, output: { message: null, reason: "outside the grace period: not renewable through this procedure" }, citations: this.cite("T03", "R6"), needs_human: true, escalate: "Licensing Supervisor (T16)" };
    // documents still valid on the file are not asked for again (VAL)
    const onFile = this.required(f).filter((c) => !this.docIssues(f, [c]).length);
    const needed = this.required(f).filter((c) => !onFile.includes(c));
    const base = this.rules.baseFees[f.record.activity_group];
    if (base === undefined) return { task: "T03", ok: false, output: {}, citations: this.cite("S6"), refused: `no base fee for "${f.record.activity_group}" in the fee table`, needs_human: true };
    const late = d.late ? Math.round((base * this.rules.lateFeePct) / 100) : 0;
    const when = ["D5 if someone other than the owner applies", "D6 for any document not in Arabic or English"];
    if (f.record.language !== "en") return { task: "T03", ok: true, output: { message: null, reason: "an Arabic message needs a person; no draft was written", documents_needed: needed }, citations: cites, needs_human: true };
    const body = [
      `Dear ${f.record.holder},`, "",
      "To renew your trade licence we need:", ...needed.map((c) => `- ${DOC_LABEL[(Object.keys(DOC_CODE) as DocType[]).find((t) => DOC_CODE[t] === c)!]} (${c})`),
      ...(needed.length ? [] : ["- nothing further: the documents on file are still valid"]), "",
      `Also: ${when.join("; ")}.`,
      "Submit on the portal case page, at the counter, or by replying to our email with the case number in the subject.",
      `The renewal fee is ${base}${late ? `, plus a late fee of ${late}` : ""}.`,
      "Next steps and timings: first reply within 1 working day, pre-check within 2 working days of a complete file, decision within 1 working day after payment.",
    ].join("\n");
    return { task: "T03", ok: true, output: { message: { to: f.record.registered_email, body }, documents_needed: needed, fee: base, late_fee: late }, citations: cites, needs_human: true };
  }

  // ---- Supervisor task the agent may do: summarise the pack. It never decides.

  private t14(f: Facts): TaskResult {
    const c = f.state.checks;
    const pay = c.T13?.output;
    if (f.state.status !== "complete" || pay?.status !== "matched") {
      return { task: "T14", ok: false, output: {}, citations: this.cite("T14"), refused: "the file is not complete or the payment is not matched, so there is no pack to review yet", escalate: f.state.status !== "complete" ? "Document Verification Analyst" : "Fee and Payment Officer" };
    }
    const exceptions = [
      ...(c.T04?.output.blocked ? ["outside the grace period"] : []),
      ...((c.T07?.output.exception as boolean) ? ["unpaid fine or inspection hold"] : []),
      ...(c.T08?.output.changed ? ["activity code changed"] : []),
      ...(c.T02?.output.identity !== "confirmed" ? ["identity not confirmed"] : []),
    ];
    return { task: "T14", ok: true, output: { ready_for_decision: !exceptions.length, exceptions, route: exceptions.length ? "T16" : "T15", pack: { identity: c.T02?.output.identity ?? "not recorded", documents: c.T05?.output.documents, registry: c.T07?.output.exception ? "exception" : "clear", activity: c.T08?.output.changed ? "changed" : "unchanged", fee: c.T11?.output.total ?? null, payment: pay.status }, decision: null }, citations: this.cite("T14", "R2"), needs_human: true };
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

export interface OpenOptions { sopId: string; profile: string; caseId: string; today: string; tools: Tools; store: MemoryStore; actorClock?: () => string; /** person-approved rule lines appended to the skill */ skillRules?: string[] }

/** Open an agent for one job profile and one case. Refuses if the SOP is not vectorised, and
 * throws OutsideInformationRequired if the SOP cannot supply a figure the agent needs. */
export async function openAgent(o: OpenOptions): Promise<Agent> {
  const skill = withTunedRules(extractSkill(o.sopId, o.profile), o.skillRules ?? []);
  const rules = await loadRules(o.sopId, o.tools.retrieve, o.tools.requestOutside, o.tools.react);
  const memory = new CaseMemory(o.caseId, o.store, o.actorClock);
  await memory.open();
  return new Agent({ sopId: o.sopId, profile: o.profile, caseId: o.caseId, skill, rules, tools: o.tools, memory, today: o.today });
}
