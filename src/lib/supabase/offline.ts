import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseUseCases } from "../un/model.ts";

// Offline mode (see offline-flag.ts): a tiny file-backed stand-in for the slice
// of the Supabase query builder this app uses, so the demo runs with no network
// and no database.
// ponytail: whole-file JSON rewrite per write, single process; fine for a demo.

type Row = Record<string, unknown>;
type Db = Record<string, Row[]>;
type Result = { data: unknown; error: { message: string } | null };

export const OFFLINE_ORG = "00000000-0000-4000-8000-000000000001";
export const OFFLINE_USER = { id: "00000000-0000-4000-8000-000000000002", email: "offline@example.invalid" };
// resolve, not join: OFFLINE_DB may be an absolute path (tests use a temp folder), and join would glue it onto the working directory
const FILE = () => path.resolve(process.cwd(), process.env.OFFLINE_DB ?? ".data/offline-db.json");

let mem: Db | null = null;

function seed(): Db {
  const csv = readFileSync(path.join(process.cwd(), "data/un-use-cases.csv"), "utf8");
  const now = new Date().toISOString();
  const ucs = parseUseCases(csv).useCases.map((u) => ({ ...u, id: randomUUID(), org_id: OFFLINE_ORG, stage: "intake", verdict: null, compliant: false, created_at: now, updated_at: now }));
  return {
    organizations: [{ id: OFFLINE_ORG, name: "Offline demo entity", status: "active" }],
    profiles: [{ id: OFFLINE_USER.id, email: OFFLINE_USER.email, role: "admin", org_id: OFFLINE_ORG }],
    un_use_cases: ucs,
  };
}

function db(): Db {
  // Re-read the file on every call: Next bundles route handlers and pages as separate
  // module instances, so an in-memory copy goes stale after the other side writes.
  const f = FILE();
  if (existsSync(f)) mem = JSON.parse(readFileSync(f, "utf8")) as Db;
  else {
    // Persist the seed at once. Seeded use cases get random ids, so without this every module
    // instance (each page, each route) would seed different ids and a route could not find a
    // use case a page had just listed.
    mem ??= seed();
    save();
  }
  return mem;
}
const save = () => {
  const f = FILE();
  mkdirSync(path.dirname(f), { recursive: true });
  writeFileSync(f, JSON.stringify(mem));
};

class Query implements PromiseLike<Result> {
  private filters: ((r: Row) => boolean)[] = [];
  private op: "select" | "insert" | "upsert" | "update" | "delete" = "select";
  private payload: Row | Row[] = [];
  private conflict: string[] = [];
  private ignoreDup = false;
  private ord: [string, boolean] | null = null;
  private lim = Infinity;
  private shape: "many" | "one" | "maybe" = "many";
  private returning = false;
  private table: string;
  constructor(table: string) { this.table = table; }

  /** Column lists are ignored: rows come back whole. */
  select(...cols: unknown[]) { void cols; this.returning = true; return this; }
  insert(p: Row | Row[]) { this.op = "insert"; this.payload = p; return this; }
  upsert(p: Row | Row[], o: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    this.op = "upsert"; this.payload = p; this.conflict = (o.onConflict ?? "id").split(","); this.ignoreDup = !!o.ignoreDuplicates; return this;
  }
  update(p: Row) { this.op = "update"; this.payload = p; return this; }
  delete() { this.op = "delete"; return this; }
  eq(k: string, v: unknown) { this.filters.push((r) => r[k] === v); return this; }
  neq(k: string, v: unknown) { this.filters.push((r) => r[k] !== v); return this; }
  in(k: string, v: unknown[]) { this.filters.push((r) => v.includes(r[k])); return this; }
  is(k: string, v: unknown) { this.filters.push((r) => (r[k] ?? null) === v); return this; }
  like(k: string, pat: string) { const re = new RegExp(`^${pat.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".")}$`); this.filters.push((r) => re.test(String(r[k] ?? ""))); return this; }
  order(k: string, o: { ascending?: boolean } = {}) { this.ord = [k, o.ascending !== false]; return this; }
  limit(n: number) { this.lim = n; return this; }
  maybeSingle() { this.shape = "maybe"; return this; }
  single() { this.shape = "one"; return this; }

  private run(): Result {
    const rows = (db()[this.table] ??= []);
    const now = new Date().toISOString();
    const match = (r: Row) => this.filters.every((f) => f(r));
    let out: Row[];
    if (this.op === "insert" || this.op === "upsert") {
      out = [];
      for (const p of Array.isArray(this.payload) ? this.payload : [this.payload]) {
        const hit = this.op === "upsert" ? rows.find((r) => this.conflict.every((k) => r[k] === p[k])) : undefined;
        if (hit) {
          if (!this.ignoreDup) { Object.assign(hit, p, { updated_at: now }); out.push(hit); }
        } else {
          const extra = this.table === "un_use_cases" ? { stage: "intake", verdict: null, compliant: false } : {};
          const row = { id: randomUUID(), created_at: now, updated_at: now, ...extra, ...p };
          rows.push(row); out.push(row);
        }
      }
    } else if (this.op === "update") {
      out = rows.filter(match);
      out.forEach((r) => Object.assign(r, this.payload));
    } else if (this.op === "delete") {
      out = rows.filter(match);
      mem![this.table] = rows.filter((r) => !match(r));
    } else out = rows.filter(match);
    if (this.op !== "select") save();
    if (this.ord) {
      const [k, asc] = this.ord;
      const key = (r: Row) => String(r[k] ?? "");
      out = [...out].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0) * (asc ? 1 : -1));
    }
    out = out.slice(0, this.lim).map((r) => ({ ...r }));
    // OFFLINE_ROLE=viewer previews the read-only judge experience.
    if (this.table === "profiles" && process.env.OFFLINE_ROLE) out.forEach((r) => (r.role = process.env.OFFLINE_ROLE));
    if (this.op !== "select" && !this.returning) return { data: null, error: null };
    if (this.shape === "many") return { data: out, error: null };
    if (this.shape === "one" && out.length !== 1) return { data: null, error: { message: "expected one row" } };
    return { data: out[0] ?? null, error: null };
  }
  then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, no?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return Promise.resolve().then(() => this.run()).then(ok, no);
  }
}

/** Stands in for both the admin client and the cookie (user) client. */
export function offlineClient() {
  return {
    from: (t: string) => new Query(t),
    rpc: async () => ({ data: null, error: null }),
    auth: { getUser: async () => ({ data: { user: { ...OFFLINE_USER, user_metadata: {} } }, error: null }) },
  };
}
