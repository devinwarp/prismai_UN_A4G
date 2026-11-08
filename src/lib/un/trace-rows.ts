import { GENESIS, verifyLog, type TraceRecord, type Verification } from "./trace.ts";

// Append-only storage of the trace (C4-2). One un_trace_records row per
// hash-chained record; the migration blocks UPDATE/DELETE on the table. The
// run's head hash is derived from the last row. The jsonb log in un_runs stays
// for display; where rows exist, they are the authority and the jsonb must
// match them. Pure: no I/O (runs.ts does the reads and inserts).

export interface TraceRow {
  run_id: string; // un_runs.id (uuid), not RunState.run_id
  seq: number; // 1-based, contiguous
  record: TraceRecord;
  prev_hash: string;
  hash: string;
}

/** Rows for the records not stored yet, given how many rows already exist. */
export function newTraceRows(runRowId: string, log: TraceRecord[], stored: number): TraceRow[] {
  return log.slice(stored).map((record, i) => ({ run_id: runRowId, seq: stored + i + 1, record, prev_hash: record.prev_hash, hash: record.hash }));
}

const bySeq = (rows: TraceRow[]) => [...rows].sort((a, b) => a.seq - b.seq);

/** The head hash, derived from the last row (GENESIS for an empty trace). */
export const headFromRows = (rows: TraceRow[]): string => (rows.length ? bySeq(rows)[rows.length - 1].hash : GENESIS);

/** Rows form an unbroken chain: contiguous seq, row hashes equal their record's
 * hashes, and the records verify as a hash chain. */
export function verifyRows(rows: TraceRow[]): Verification {
  const rs = bySeq(rows);
  for (let i = 0; i < rs.length; i++) {
    const r = rs[i];
    if (r.seq !== i + 1) return { ok: false, length: rs.length, brokenAt: i, reason: "row sequence has a gap or duplicate" };
    if (r.hash !== r.record.hash || r.prev_hash !== r.record.prev_hash) return { ok: false, length: rs.length, brokenAt: i, reason: "row hash columns do not match the stored record" };
  }
  return verifyLog(rs.map((r) => r.record));
}

/** The display copy (jsonb log) must be exactly the stored rows. */
export function rowsMatchLog(rows: TraceRow[], log: TraceRecord[]): Verification {
  const v = verifyRows(rows);
  if (!v.ok) return v;
  const shown = verifyLog(log); // recompute: a rewritten display copy must not pass on its stored hashes
  if (!shown.ok) return shown;
  const rs = bySeq(rows);
  if (rs.length !== log.length) return { ok: false, length: log.length, brokenAt: Math.min(rs.length, log.length), reason: `stored rows (${rs.length}) and the displayed log (${log.length}) differ in length` };
  const i = rs.findIndex((r, k) => r.hash !== log[k].hash);
  if (i >= 0) return { ok: false, length: log.length, brokenAt: i, reason: "the displayed log differs from the append-only rows" };
  return { ok: true, length: log.length, brokenAt: null, reason: null };
}
