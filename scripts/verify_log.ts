// Offline verifier for a Prism run export (C4-4). No database, no network:
//   node scripts/verify_log.ts <run-export.json>
// Accepts the run state saved from un_runs ({ state: { log } } or { log }), an
// audit bundle ({ records } or { run: ... }), or a bare array of trace records.
// Prints OK with the record count and head hash, or the first broken record.
// Exit code 0 = verified, 1 = broken, 2 = could not read the file.
import { readFileSync } from "node:fs";
import { GENESIS, verifyLog, type TraceRecord } from "../src/lib/un/trace.ts";

type Json = Record<string, unknown>;

/** Find the trace records and the stored head hash, if the export has one. */
export function extract(doc: unknown): { log: TraceRecord[]; head: string | null } | null {
  if (Array.isArray(doc)) return { log: doc as TraceRecord[], head: null };
  const o = doc as Json;
  if (!o || typeof o !== "object") return null;
  const head = typeof o.head_hash === "string" ? o.head_hash : null;
  if (Array.isArray(o.log)) return { log: o.log as TraceRecord[], head };
  if (Array.isArray(o.records)) return { log: o.records as TraceRecord[], head };
  for (const k of ["state", "run"]) {
    const inner = o[k] ? extract(o[k]) : null;
    if (inner) return { log: inner.log, head: head ?? inner.head };
  }
  return null;
}

export interface Report {
  ok: boolean;
  lines: string[];
}

export function verifyExport(doc: unknown): Report {
  const found = extract(doc);
  if (!found) return { ok: false, lines: ["BROKEN: no trace records found in the file"] };
  const v = verifyLog(found.log);
  if (!v.ok) {
    const at = v.brokenAt ?? 0;
    return { ok: false, lines: [`BROKEN at record ${at + 1} (${found.log[at]?.trace_id ?? "?"}): ${v.reason}`] };
  }
  const head = found.log.length ? found.log[found.log.length - 1].hash : GENESIS;
  if (found.head && found.head !== head) {
    return { ok: false, lines: [`BROKEN: the chain is intact but ends at ${head.slice(0, 12)}…, not the stored head ${found.head.slice(0, 12)}…: the log was truncated or extended`] };
  }
  const sig = found.log[found.log.length - 1]?.signature;
  return {
    ok: true,
    lines: [
      `OK: ${v.length} records, hash chain intact, head ${head}`,
      sig ? `Final record is a human ${sig.decision} by ${sig.signer_id} (${sig.role})` : "No human signature on this run",
    ],
  };
}

if (process.argv[1] && process.argv[1].endsWith("verify_log.ts")) {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: node scripts/verify_log.ts <run-export.json>");
    process.exit(2);
  }
  let doc: unknown;
  try {
    doc = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    console.error(`cannot read ${file}: ${e instanceof Error ? e.message : e}`);
    process.exit(2);
  }
  const r = verifyExport(doc);
  for (const l of r.lines) console.log(l);
  process.exit(r.ok ? 0 : 1);
}
