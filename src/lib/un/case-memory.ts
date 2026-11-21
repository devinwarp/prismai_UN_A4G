import { appendEntry, verifyChain, type ChainEntry } from "./tuning.ts";
import type { DocType, Fields, Finding } from "./doc-ocr.ts";

// Persistent memory for one renewal case. The agent writes what it learned and did into an
// append-only, hash-chained log; everything it "remembers" is replayed from that log, so the
// memory survives a restart, can be handed to the next agent (the Fee and Payment Officer reads
// what the Verification Analyst found), and cannot be rewritten without breaking the chain.
//
// Control 4 of SOP-LIC-014 (personal data is used only for this renewal and the audit record)
// shapes what is stored: the extracted fields, the image's SHA-256 and the OCR confidence, never
// the image itself, and everything is scoped to one case id.

export type MemoryKind = "case_opened" | "document_received" | "check" | "status" | "draft" | "outside_request" | "note";
export type MemoryEntry = ChainEntry<MemoryKind>;

export interface MemoryStore {
  load(caseId: string): Promise<MemoryEntry[]>;
  /** Appends entries that already extend the loaded chain. */
  append(caseId: string, entries: MemoryEntry[]): Promise<void>;
}

export function inMemoryStore(): MemoryStore {
  const m = new Map<string, MemoryEntry[]>();
  return {
    async load(id) { return [...(m.get(id) ?? [])]; },
    async append(id, entries) { m.set(id, [...(m.get(id) ?? []), ...entries]); },
  };
}

export interface StoredDocument {
  type: DocType;
  fields: Fields;
  sha256: string;
  confidence: number;
  findings: Finding[];
  received_at: string;
}

export interface CaseState {
  caseId: string;
  licence_number: string | null;
  /** what the applicant asked for when the case was opened */
  request: Record<string, unknown> | null;
  documents: Partial<Record<DocType, StoredDocument>>;
  /** latest recorded output of each task */
  checks: Record<string, { output: Record<string, unknown>; citations: string[]; at: string }>;
  status: "complete" | "on_hold" | "blocked" | null;
  drafts: { task: string; at: string; payload: Record<string, unknown> }[];
  outside: { question: string; at: string }[];
  chain: ReturnType<typeof verifyChain>;
}

export function replayCase(caseId: string, entries: MemoryEntry[]): CaseState {
  const s: CaseState = { caseId, licence_number: null, request: null, documents: {}, checks: {}, status: null, drafts: [], outside: [], chain: verifyChain(entries) };
  for (const e of entries) {
    const p = e.payload;
    if (e.kind === "case_opened") { s.licence_number = String(p.licence_number); s.request = p; }
    else if (e.kind === "document_received") s.documents[p.type as DocType] = { ...(p as unknown as Omit<StoredDocument, "received_at">), received_at: e.at };
    else if (e.kind === "check") s.checks[String(p.task)] = { output: p.output as Record<string, unknown>, citations: p.citations as string[], at: e.at };
    else if (e.kind === "status") s.status = p.status as CaseState["status"];
    else if (e.kind === "draft") s.drafts.push({ task: String(p.task), at: e.at, payload: p });
    else if (e.kind === "outside_request") s.outside.push({ question: String(p.question), at: e.at });
  }
  return s;
}

/** Read-modify-append handle over one case. */
export class CaseMemory {
  readonly caseId: string;
  private entries: MemoryEntry[] = [];
  private store: MemoryStore;
  private clock: () => string;
  constructor(caseId: string, store: MemoryStore, clock: () => string = () => new Date().toISOString()) {
    this.caseId = caseId;
    this.store = store;
    this.clock = clock;
  }

  async open(): Promise<CaseState> {
    this.entries = await this.store.load(this.caseId);
    return this.state();
  }

  state(): CaseState { return replayCase(this.caseId, this.entries); }

  entriesOf(kind: MemoryKind): MemoryEntry[] { return this.entries.filter((e) => e.kind === kind); }

  async write(kind: MemoryKind, actor: string, payload: Record<string, unknown>): Promise<void> {
    const e = appendEntry<MemoryKind>(this.entries[this.entries.length - 1] ?? null, kind, actor, payload, this.clock());
    await this.store.append(this.caseId, [e]);
    this.entries.push(e);
  }
}
