import { verifyLog, type TraceRecord, type Verification } from "./trace.ts";

// Tamper demo: edit a deep copy of the log and show the verifier name the
// record. The stored run is never touched (structuredClone, never saved).

export interface TamperDemo {
  /** The record that was edited, and what was changed, for display. */
  edited: { trace_id: string; field: string; before: string; after: string } | null;
  verification: Verification;
  /** trace_id the verifier named, if any. */
  named: string | null;
}

export function tamperLast(log: TraceRecord[]): TamperDemo {
  if (!log.length) return { edited: null, verification: verifyLog(log), named: null };
  const copy = structuredClone(log);
  const last = copy[copy.length - 1];
  const before = last.claims[0]?.text ?? "";
  const after = `${before} [edited after the fact]`;
  if (last.claims[0]) last.claims[0].text = after;
  else last.claims = [{ text: after, evidence: [] }];
  const verification = verifyLog(copy);
  return {
    edited: { trace_id: last.trace_id, field: "claims[0].text", before, after },
    verification,
    named: verification.brokenAt === null ? null : copy[verification.brokenAt]?.trace_id ?? null,
  };
}
