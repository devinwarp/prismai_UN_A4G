import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";

// Document intake for the licence-renewal agent: read an uploaded image with OCR, say what
// kind of document it is (D1 to D4 of SOP-LIC-014), pull out the fields, and check them
// against the licence record using rule values the caller took from the SOP knowledge base.
// OCR is a tool, not a judge: a low-confidence or unrecognised read is "unreadable" and goes
// to a person via T10; the checker never guesses a field it could not read.

export type DocType = "trade_name" | "lease" | "owner_id" | "insurance";
export const DOC_CODE: Record<DocType, "D1" | "D2" | "D3" | "D4"> = { trade_name: "D1", lease: "D2", owner_id: "D3", insurance: "D4" };
export const DOC_LABEL: Record<DocType, string> = { trade_name: "Trade name certificate", lease: "Current lease", owner_id: "Owner identity", insurance: "Insurance certificate" };
export const DOC_TYPES = Object.keys(DOC_CODE) as DocType[];

export interface OcrResult { text: string; confidence: number }
export type OcrEngine = (image: Buffer) => Promise<OcrResult>;

/** A read below this mean confidence (0 to 100) is not trusted. */
export const MIN_OCR_CONFIDENCE = 80;

export const imageSha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

interface TessWorker { recognize: (img: Buffer) => Promise<{ data: { text: string; confidence: number } }>; terminate: () => Promise<unknown> }
let worker: Promise<TessWorker> | undefined;

/** Real OCR with tesseract.js (English model, downloaded on first use into the OS temp folder).
 * Loaded by name at run time so the web bundle does not include it. */
export const tesseractOcr: OcrEngine = async (image) => {
  worker ??= (async () => {
    const pkg = "tesseract.js";
    const t = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ pkg)) as {
      createWorker: (l: string, o: number, opts: object) => Promise<TessWorker>;
    };
    return t.createWorker("eng", 1, { cachePath: path.join(os.tmpdir(), "tess-cache") });
  })();
  const r = await (await worker).recognize(image);
  return { text: r.data.text, confidence: r.data.confidence };
};

export async function closeOcr(): Promise<void> {
  if (worker) await (await worker).terminate();
  worker = undefined;
}

/** OCR output recorded from a real run, keyed by the image's SHA-256. Lets tests and CI run
 * offline and deterministically; a live run refreshes it, and a changed image misses the cache. */
export function cachedOcr(cache: Record<string, OcrResult>, fallback?: OcrEngine): OcrEngine {
  return async (image) => {
    const hit = cache[imageSha(image)];
    if (hit) return hit;
    if (fallback) return fallback(image);
    throw new Error("no recorded OCR output for this image and no live OCR engine");
  };
}

export function classify(text: string): DocType | null {
  const t = text.toUpperCase();
  if (t.includes("TRADE NAME CERTIFICATE")) return "trade_name";
  if (t.includes("TENANCY CONTRACT")) return "lease";
  if (t.includes("IDENTITY CARD") || t.includes("PASSPORT")) return "owner_id";
  if (t.includes("CERTIFICATE OF INSURANCE")) return "insurance";
  return null;
}

const kv = (text: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const m = /^\s*([A-Za-z][A-Za-z ]{1,30}?)\s*:\s*(.+?)\s*$/.exec(line);
    if (m) out[m[1].toLowerCase()] = m[2];
  }
  return out;
};

export type Fields = Record<string, string | number | null>;

const FIELD_MAP: Record<DocType, Record<string, string>> = {
  trade_name: { trade_name: "trade name", licence_number: "licence number", valid_until: "valid until" },
  lease: { registry_reference: "registry reference", tenant: "tenant", premises: "premises", start: "start date", end: "end date" },
  owner_id: { holder: "name", document: "document type", number: "number", expires: "expiry date" },
  insurance: { insured: "insured", premises: "premises", activity: "activity", cover: "cover", valid_from: "valid from", valid_to: "valid to" },
};

/** Fields read from the OCR text. A field that is not on the page is null, never guessed. */
export function extractFields(type: DocType, text: string): Fields {
  const k = kv(text);
  const out: Fields = {};
  for (const [name, label] of Object.entries(FIELD_MAP[type])) {
    const v = k[label] ?? null;
    out[name] = name === "cover" && v ? Number(v.replace(/[^0-9]/g, "")) || null : v;
  }
  return out;
}

export interface Finding { code: string; doc: "D1" | "D2" | "D3" | "D4"; message: string }

export interface LicenceRecord {
  licence_number: string; trade_name: string; holder: string; address: string;
  activity_code: string; activity_group: string; expiry: string;
  registered_email: string; language: "en" | "ar";
}

/** Values the checks need. The agent reads them from the SOP knowledge base; none is built in here. */
export interface DocRules { leaseMonths: number; idValidDays: number; minCover: number }

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const day = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 864e5;
export const addDays = (iso: string, n: number) => new Date((day(iso) + n) * 864e5).toISOString().slice(0, 10);
export function addMonths(iso: string, n: number): string {
  const d = new Date(day(iso) * 864e5);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}
export const daysBetween = (from: string, to: string) => day(to) - day(from);
const same = (a: unknown, b: string) => String(a ?? "").trim().toLowerCase() === b.trim().toLowerCase();

/** What is wrong with a document, from the fields read and the licence record. Empty means it meets the SOP. */
export function verifyDocument(type: DocType, f: Fields, rec: LicenceRecord, rules: DocRules, today: string): Finding[] {
  const out: Finding[] = [];
  const code = DOC_CODE[type];
  const add = (c: string, message: string) => out.push({ code: c, doc: code, message });
  const missing = Object.entries(f).filter(([, v]) => v === null).map(([n]) => n);
  if (missing.length) { add("field_unreadable", `could not read: ${missing.join(", ")}`); return out; }
  const renewalStart = addDays(rec.expiry, 1);
  const date = (k: string) => (ISO.test(String(f[k])) ? String(f[k]) : null);
  if (type === "trade_name") {
    if (!same(f.licence_number, rec.licence_number)) add("licence_number_mismatch", `licence number ${f.licence_number} does not match the record`);
    if (!same(f.trade_name, rec.trade_name)) add("trade_name_mismatch", `trade name "${f.trade_name}" does not match the record`);
    const v = date("valid_until");
    if (!v) add("date_unreadable", "valid until date not readable");
    else if (v < today) add("expired", `expired on ${v}`);
  } else if (type === "lease") {
    if (!same(f.tenant, rec.holder)) add("tenant_mismatch", `tenant "${f.tenant}" is not the licence holder`);
    if (!same(f.premises, rec.address)) add("address_mismatch", `premises "${f.premises}" do not match the licensed address`);
    const end = date("end");
    if (!end) add("date_unreadable", "lease end date not readable");
    else if (end < addMonths(renewalStart, rules.leaseMonths)) add("lease_too_short", `lease ends ${end}; it must run at least ${rules.leaseMonths} months from ${renewalStart}`);
  } else if (type === "owner_id") {
    if (!same(f.holder, rec.holder)) add("holder_mismatch", `identity is for "${f.holder}", not the licence holder`);
    const e = date("expires");
    if (!e) add("date_unreadable", "expiry date not readable");
    else if (e < addDays(today, rules.idValidDays)) add("id_expiring", `expires ${e}; it must be valid at least ${rules.idValidDays} days after submission`);
  } else {
    if (!same(f.insured, rec.holder)) add("insured_mismatch", `insured "${f.insured}" is not the licence holder`);
    if (!same(f.premises, rec.address)) add("address_mismatch", `premises "${f.premises}" do not match the licensed address`);
    if (!same(f.activity, rec.activity_group)) add("activity_mismatch", `activity "${f.activity}" is not the licensed activity`);
    if (Number(f.cover) < rules.minCover) add("cover_too_low", `cover ${f.cover} is below the minimum ${rules.minCover}`);
    const from = date("valid_from");
    const to = date("valid_to");
    if (!from || !to) add("date_unreadable", "validity dates not readable");
    else if (from > renewalStart || to < renewalStart) add("not_valid_at_renewal", `valid ${from} to ${to}; it must be valid on the renewal start date ${renewalStart}`);
  }
  return out;
}

export interface ReadDocument {
  type: DocType | null;
  fields: Fields;
  confidence: number;
  readable: boolean;
  sha256: string;
}

/** The submit_document tool: OCR an image, classify it, extract its fields. No verification here. */
export async function readDocument(image: Buffer, ocr: OcrEngine): Promise<ReadDocument> {
  const r = await ocr(image);
  const type = classify(r.text);
  const readable = type !== null && r.confidence >= MIN_OCR_CONFIDENCE;
  return { type, fields: type ? extractFields(type, r.text) : {}, confidence: Math.round(r.confidence), readable, sha256: imageSha(image) };
}
