import { createHash } from "node:crypto";
import { buildPolicy, type Embed, type StagedFile } from "./country-build.ts";
import type { CountryStore } from "./country-store.ts";
import {
  allCountries, appendCountry, BUILTIN_COMPANIES, countryIn, entityCountryOf, indexInfo, replayCountry, rulesetOf, runProcess, scopeChunks, verifyCountry,
  DEFAULT_ENTITY_COUNTRY, type CompanyRec, type Country, type CountryEntry, type CountryKind, type CountryPatch, type CountryState, type CountryTarget, type IndexInfo, type RunResult, type Timing,
} from "./country.ts";
import type { GovState } from "./gates.ts";
import type { HitlFacts } from "./hitl.ts";
import type { Chunk } from "./kb.ts";
import { chunkSop, retrievablePart, sopMetaFrom, type SopChunk, type SopMeta } from "./sop-kb.ts";
import { deriveProfiles } from "./sop/profiles.ts";
import { sopLines, START_STATE } from "./country.ts";
import { RULESETS } from "./rulesets.ts";
import { slug, toUseCase } from "./sop/promote.ts";
import { ruleAnalyzer } from "./sop/reference.ts";
import type { SyntheticBaseline } from "./sop/types.ts";
import { DEFAULT_POLICY, VERDICTS, type UnUseCase } from "./model.ts";
import type { VectorFile } from "./vector.ts";

// The actions behind the "Country and knowledge base" screen. All I/O comes in through Deps, so the same code runs
// offline, on Supabase and in the tests. Every write is admin-only (the route checks) and goes into the hash-chained
// country log; nothing here edits the policy engine, a gate or an earlier log entry.

export interface Deps {
  store: CountryStore;
  now: () => string;
  clock: () => number;
  /** kb/chunks.json and kb/vectors.json (precomputed). */
  corpus: Chunk[];
  vectors: (VectorFile & { meta?: Record<string, unknown> }) | null;
  /** Pre-fetched policy files for an on-demand scope (kb/stage/<scope>/). */
  staged: (dir: string) => StagedFile[];
  /** Local document embedder; null = BM25 only. */
  embed: Embed | null;
  /** The built-in company: its SOP markdown and SOP chunks, and UC02's facts. */
  marsa: () => Promise<{ sopMarkdown: string; sopChunks: Chunk[]; facts: HitlFacts; entity: string }>;
  /** The staged SOP of the synthetic Singapore company, offered as a sample. */
  sample: (id: string) => string | null;
  baseline: () => SyntheticBaseline;
  useCases: { upsert: (uc: UnUseCase) => Promise<string | null>; remove: (ext: string) => Promise<void> };
  gov: () => Promise<GovState>;
}
export type Fail = { ok: false; status: number; error: string };
const fail = (status: number, error: string): Fail => ({ ok: false, status, error });
export const MAX_COMPANIES = 4;
export const SAMPLE_SOP = "sg-mbla";
export const SAMPLE_NAME = "Marina Bay Licensing Authority (synthetic)";

// ---- state and the log ------------------------------------------------------------------------

export async function loadState(d: Deps) {
  const entries = await d.store.log();
  return { entries, state: replayCountry(entries), verified: verifyCountry(entries) };
}

/** Appends entries to the chain. Refuses if the stored log does not verify. */
async function commit(d: Deps, entries: CountryEntry[], drafts: { kind: CountryKind; payload: Record<string, unknown> }[], actor: string): Promise<CountryEntry[] | Fail> {
  const v = verifyCountry(entries);
  if (!v.ok) return fail(409, `The country log failed verification at entry ${v.broken_seq}: ${v.reason}`);
  const out: CountryEntry[] = [];
  let prev = entries[entries.length - 1] ?? null;
  for (const x of drafts) { prev = appendCountry(prev, x.kind, actor, x.payload, d.now()); out.push(prev); }
  try { await d.store.append(out); } catch (e) { return fail(409, (e as Error).message); }
  return out;
}

// ---- scopes and companies ---------------------------------------------------------------------

const policyCache = new Map<string, Chunk[]>();
/** Chunks of a live-built scope: rebuilt from the staged files (deterministic), so any instance can serve it. */
async function stagedChunks(d: Deps, c: Country): Promise<Chunk[]> {
  const files = c.custom ? (((await d.store.getBlob(`policydocs:${c.id}`)) as { files?: StagedFile[] } | null)?.files ?? []) : d.staged(c.stage!);
  const key = `${c.id}:${files.map((f) => f.source_sha256).join(",")}`;
  const hit = policyCache.get(key);
  if (hit) return hit;
  const { chunks } = await buildPolicy(files, { embed: null });
  policyCache.set(key, chunks);
  return chunks;
}
const scopeCache = new Map<string, Chunk[]>();
/** The country's scoped knowledge base, or null if it has not been built (an on-demand scope before the admin adds it). */
export async function scopeOf(d: Deps, state: CountryState, id: string): Promise<Chunk[] | null> {
  const c = countryIn(state, id);
  if (!c) return null;
  if (c.built === "on_demand" && !state.policies[id]) return null;
  const extra = c.built === "on_demand" ? await stagedChunks(d, c) : [];
  const key = `${id}:${d.corpus.length}:${extra.length}`;
  let s = scopeCache.get(key);
  if (!s) { s = scopeChunks(d.corpus, c, extra); scopeCache.set(key, s); }
  return s;
}

interface CompanyCtx { id: string; name: string; sop_id: string; ext_id: string; facts: HitlFacts; entity: string; sop: Chunk[] }
async function companyCtx(d: Deps, state: CountryState, id: string): Promise<CompanyCtx | null> {
  const b = BUILTIN_COMPANIES.find((x) => x.id === id);
  if (b) { const m = await d.marsa(); return { id, name: b.name, sop_id: b.sop_id, ext_id: "UC02", facts: m.facts, entity: m.entity, sop: m.sopChunks }; }
  const rec = state.companies[id];
  if (!rec) return null;
  const blob = (await d.store.getBlob(`sop:${id}`)) as { chunks?: Chunk[] } | null;
  return { id, name: rec.name, sop_id: rec.sop_id, ext_id: rec.ext_id, facts: rec.flags, entity: rec.name, sop: blob?.chunks ?? [] };
}

/** A fingerprint of everything a run depends on: the country's rule set, its policy sources, the company's SOP and facts, and the gate state. */
const fingerprint = (c: Country, policy: Chunk[], co: CompanyCtx, gov: GovState): string =>
  createHash("sha256").update(JSON.stringify({ country: c.id, ruleset: rulesetOf(c), policy: policy.map((x) => [x.chunk_id, x.text]), sop: co.sop.map((x) => [x.chunk_id, x.text]), facts: co.facts, entity: co.entity, gov })).digest("hex");

/** Everything one run needs, or why it cannot run. */
async function inputsFor(d: Deps, state: CountryState, companyId: string, countryId: string) {
  const c = countryIn(state, countryId);
  if (!c) return fail(400, "Unknown country");
  const policy = await scopeOf(d, state, countryId);
  if (!policy) return fail(409, `${c.name} has no knowledge-base index yet: add its policy first`);
  const co = await companyCtx(d, state, companyId);
  if (!co) return fail(404, "Unknown company");
  const gov = await d.gov();
  return { c, policy, co, gov, hash: fingerprint(c, policy, co, gov) };
}

/** The fingerprint of the inputs a run of this company under this country would use now, without running it. */
export async function inputsHashFor(d: Deps, state: CountryState, companyId: string, countryId: string): Promise<string | Fail> {
  const i = await inputsFor(d, state, companyId, countryId);
  return isFail(i) ? i : i.hash;
}

export async function runFor(d: Deps, state: CountryState, companyId: string, countryId: string): Promise<RunResult | Fail> {
  const i = await inputsFor(d, state, companyId, countryId);
  if (isFail(i)) return i;
  const run = await runProcess({ company: i.co, country: i.c, policy: i.policy, sop: i.co.sop, facts: i.co.facts, entity: i.co.entity, gov: i.gov });
  return { ...run, inputs_hash: i.hash };
}
const isFail = (x: unknown): x is Fail => !!x && typeof x === "object" && (x as Fail).ok === false;

/** The baseline run of the built-in company under a precomputed country: the stored one if logged, else computed now. */
export async function baselineRun(d: Deps, state: CountryState, country: string): Promise<{ run: RunResult; logged: boolean } | null> {
  const stored = state.runs[`marsa:${country}`];
  if (stored) return { run: stored, logged: true };
  const r = await runFor(d, state, "marsa", country);
  return isFail(r) ? null : { run: r, logged: false };
}

export async function indexOfCountry(d: Deps, state: CountryState, id: string): Promise<IndexInfo | null> {
  const s = await scopeOf(d, state, id);
  if (!s) return null;
  const info = indexInfo(s, d.vectors);
  const pol = state.policies[id];
  // a live-built scope: the staged chunks carry their own vectors (stored when built), the corpus chunks use kb/vectors.json
  // Count each chunk once: a staged chunk may also be in kb/vectors.json, so adding the live count to the file count double-counts.
  if (pol && info.vectors) {
    const c = countryIn(state, id);
    const live = pol.vectors && c ? new Set((await stagedChunks(d, c)).map((x) => x.chunk_id)) : new Set<string>();
    const inFile = new Set(d.vectors?.ids ?? []);
    info.vectors = { ...info.vectors, have: s.filter((x) => inFile.has(x.chunk_id) || live.has(x.chunk_id)).length, built: pol.vectors ? pol.at.slice(0, 10) : info.vectors.built };
  }
  return info;
}

// ---- actions ----------------------------------------------------------------------------------

export type Ok<T> = { ok: true } & T;

/** Switch a company's country. Instant for precomputed scopes: nothing is built, the whole process is re-run. */
/** Switch the active country. This does not re-run the process by itself: the stored result is used when the rules, sources, SOP and gates it was
 * run under are unchanged. A run happens only when there is no stored result for this company under the country yet (rules entered for the first
 * time, or a new company), or when what it depended on has changed since (`reran` says which, and `why` says why). */
export async function switchCountry(d: Deps, actor: string, to: string, company = "marsa"): Promise<Ok<{ run: RunResult; before: string; matchesStored: boolean | null; ms: number; reran: boolean; why: "unchanged" | "first_run" | "inputs_changed" | "no_fingerprint" }> | Fail> {
  const t0 = d.clock();
  const { entries, state } = await loadState(d);
  const c = countryIn(state, to);
  if (!c) return fail(400, "Unknown country");
  if (c.hidden) return fail(409, `${c.name} is hidden. Unhide it before switching to it.`);
  const before = state.active.country;
  if (!(await companyCtx(d, state, company))) return fail(404, "Unknown company");
  const stored = state.runs[`${company}:${to}`];
  const now = await inputsHashFor(d, state, company, to);
  if (isFail(now)) return now;
  const why = !stored ? "first_run" : !stored.inputs_hash ? "no_fingerprint" : stored.inputs_hash !== now ? "inputs_changed" : "unchanged";
  const reran = why !== "unchanged";
  const run = reran ? await runFor(d, state, company, to) : stored;
  if (isFail(run)) return run;
  const drafts: { kind: CountryKind; payload: Record<string, unknown> }[] = [];
  // the country we leave gets its result stored first, so switching back can be checked against it
  const fromRun = state.runs[`${company}:${before}`] ? null : await runFor(d, state, company, before);
  if (fromRun && !isFail(fromRun)) drafts.push({ kind: "run", payload: { result: fromRun } });
  drafts.push({ kind: "switch", payload: { company, from: before, to, ruleset: c.ruleset, reran, why, index: { chunks: run.corpus.policy_chunks, sources: run.corpus.policy_sources } } });
  if (reran) drafts.push({ kind: "run", payload: { result: run, matches_stored: stored ? stored.head_hash === run.head_hash : null } });
  const w = await commit(d, entries, drafts, actor);
  if (isFail(w)) return w;
  return { ok: true, run, before, matchesStored: reran && stored ? stored.head_hash === run.head_hash : null, ms: Math.round(d.clock() - t0), reran, why };
}

/** Step A: build the EU scope live from the staged policy files, register it with its rule set, and run the process under it. */
export async function addPolicy(d: Deps, actor: string, id: string, onStage?: (t: Timing) => void): Promise<Ok<{ timings: Timing[]; total_ms: number; run: RunResult; chunks: number; vectors: boolean }> | Fail> {
  const { entries, state } = await loadState(d);
  const c = countryIn(state, id);
  if (!c || c.built !== "on_demand") return fail(400, "That country's index is precomputed; there is nothing to add");
  if (c.custom) return fail(400, `${c.name} was created on the screen: add its policy documents instead`);
  if (state.policies[id]) return fail(409, `${c.name} is already built. Reset the demo to build it again.`);
  let files: StagedFile[];
  try { files = d.staged(c.stage!); } catch { return fail(500, `The staged files for ${c.name} are missing (${c.stage})`); }
  const built = await buildPolicy(files, { embed: d.embed, clock: d.clock, onStage });
  const rec = { ...built.rec, country: id, ruleset: c.ruleset, at: d.now(), by: actor };
  if (built.vectors) await d.store.putBlob(`vectors:${id}`, built.vectors);
  const reg0 = d.clock();
  const next = { ...state, policies: { ...state.policies, [id]: rec } };
  const run = await runFor(d, next, "marsa", id);
  if (isFail(run)) return run;
  const regTiming: Timing = { stage: "register scope and rule set", ms: Math.round(d.clock() - reg0), detail: `${c.ruleset} registered; the process re-run under it: ${run.final}` };
  onStage?.(regTiming);
  rec.timings = [...rec.timings, regTiming];
  rec.total_ms += regTiming.ms;
  const w = await commit(d, entries, [{ kind: "policy_added", payload: { policy: rec } }, { kind: "run", payload: { result: run } }], actor);
  if (isFail(w)) return w;
  return { ok: true, timings: rec.timings, total_ms: rec.total_ms, run, chunks: rec.chunks, vectors: !!built.vectors };
}

// ---- countries an admin creates ---------------------------------------------------------------------------------------------------

export interface PolicyDocIn { title?: unknown; text?: unknown; url?: unknown }
const MAX_DOCS = 10, MAX_DOC_CHARS = 120_000, MIN_DOC_CHARS = 200;

/** Creates a country profile: an id, a name and the rule set that judges its verdicts. It exists (and shows in the country switch) from this
 * point, marked as needing its policy documents until `addPolicyDocs` builds its knowledge base. Admin only (the route checks); logged. */
export async function addCountry(d: Deps, actor: string, b: { id?: unknown; name?: unknown; ruleset?: unknown }): Promise<Ok<{ country: Country }> | Fail> {
  const id = typeof b.id === "string" ? b.id.trim().toUpperCase() : "";
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const ruleset = typeof b.ruleset === "string" ? b.ruleset : "";
  if (!/^[A-Z]{2,6}$/.test(id)) return fail(400, "The country code is 2 to 6 letters, for example NZ.");
  if (name.length < 2 || name.length > 80) return fail(400, "The country name is 2 to 80 characters.");
  if (!RULESETS.some((r) => r.id === ruleset)) return fail(400, "Choose one of the available rule sets.");
  const { entries, state } = await loadState(d);
  if (countryIn(state, id)) return fail(409, `A country with the code ${id} already exists.`);
  if (allCountries(state).some((c) => c.name.toLowerCase() === name.toLowerCase())) return fail(409, `A country named ${name} already exists.`);
  const country: Country = { id, name, ruleset, home: [id], international: ["international"], built: "on_demand", custom: true };
  const w = await commit(d, entries, [{ kind: "country_added", payload: { country } }], actor);
  if (isFail(w)) return w;
  return { ok: true, country };
}

/** Builds the knowledge base of a country an admin created, from policy documents pasted in, and runs the process under its rule set. */
export async function addPolicyDocs(d: Deps, actor: string, id: string, docs: PolicyDocIn[], onStage?: (t: Timing) => void): Promise<Ok<{ timings: Timing[]; total_ms: number; run: RunResult; chunks: number; vectors: boolean }> | Fail> {
  const { entries, state } = await loadState(d);
  const c = countryIn(state, id);
  if (!c || !c.custom) return fail(400, "Policy documents can be added to a country created on the screen. The built-in countries have their own sources.");
  if (!Array.isArray(docs) || docs.length < 1 || docs.length > MAX_DOCS) return fail(400, `Add 1 to ${MAX_DOCS} policy documents.`);
  const files: StagedFile[] = [];
  for (const [i, x] of docs.entries()) {
    const title = typeof x?.title === "string" ? x.title.trim() : "";
    const text = typeof x?.text === "string" ? x.text.trim() : "";
    const url = typeof x?.url === "string" ? x.url.trim().slice(0, 300) : "";
    if (!title || title.length > 200) return fail(400, `Document ${i + 1}: a title of up to 200 characters is needed.`);
    if (text.length < MIN_DOC_CHARS) return fail(400, `Document ${i + 1}: the text is too short to be a policy (at least ${MIN_DOC_CHARS} characters).`);
    if (text.length > MAX_DOC_CHARS) return fail(400, `Document ${i + 1}: the text is too long (${MAX_DOC_CHARS / 1000} KB limit).`);
    files.push({ id: `${id.toLowerCase()}-doc${i + 1}`, title, url, issuer: c.name, jurisdiction: id, instrument_type: "policy", binding: false, date: d.now().slice(0, 10), topics: [], source_sha256: createHash("sha256").update(text).digest("hex"), text });
  }
  // Replacing a built country's documents: keep what was there so a failed rebuild puts it back.
  const prevDocs = await d.store.getBlob(`policydocs:${id}`);
  const prevVectors = await d.store.getBlob(`vectors:${id}`);
  const restore = async () => {
    if (prevDocs) await d.store.putBlob(`policydocs:${id}`, prevDocs); else await d.store.delBlob(`policydocs:${id}`);
    if (prevVectors) await d.store.putBlob(`vectors:${id}`, prevVectors); else await d.store.delBlob(`vectors:${id}`);
  };
  await d.store.putBlob(`policydocs:${id}`, { files });
  const built = await buildPolicy(files, { embed: d.embed, clock: d.clock, onStage });
  const rec = { ...built.rec, country: id, ruleset: c.ruleset, at: d.now(), by: actor };
  if (built.vectors) await d.store.putBlob(`vectors:${id}`, built.vectors); else await d.store.delBlob(`vectors:${id}`);
  const replaced = !!state.policies[id];
  const next = { ...state, policies: { ...state.policies, [id]: rec } };
  const run = await runFor(d, next, "marsa", id);
  if (isFail(run)) { await restore(); return run; }
  // First build: the run is logged, so the country can be switched to. Replacing the documents of a built country logs only the new documents: the
  // stored results and the deployed agents stay as they were until an admin reruns them (the use cases are marked out of date).
  const w = await commit(d, entries, replaced ? [{ kind: "policy_added", payload: { policy: rec, replaced } }] : [{ kind: "policy_added", payload: { policy: rec, replaced } }, { kind: "run", payload: { result: run } }], actor);
  if (isFail(w)) { await restore(); return w; }
  scopeCache.clear(); // the cache key is the chunk count, which a replacement can leave unchanged
  return { ok: true, timings: rec.timings, total_ms: rec.total_ms, run, chunks: rec.chunks, vectors: !!built.vectors };
}

/** Records an admin's change to an entity, a person or a use case's SOP in the hash-chained log (the data itself lives in its own tables).
 * Never throws: false means it could not be recorded (the change itself already happened). */
export async function recordChange(d: Deps, actor: string, kind: CountryKind, payload: Record<string, unknown>): Promise<boolean> {
  try { const { entries } = await loadState(d); return !isFail(await commit(d, entries, [{ kind, payload }], actor)); } catch { return false; }
}

/** The pasted policy documents of a country an admin created (title, url, text), so they can be edited and rebuilt. Null for a built-in country. */
export async function policyDocsOf(d: Deps, id: string): Promise<{ title: string; url: string; text: string }[] | null> {
  const { state } = await loadState(d);
  const c = countryIn(state, id);
  if (!c || !c.custom) return null;
  const blob = (await d.store.getBlob(`policydocs:${id}`)) as { files?: StagedFile[] } | null;
  return (blob?.files ?? []).map((f) => ({ title: f.title, url: f.url, text: f.text }));
}

/** Changes a country's name, the rule set that judges its verdicts, or whether it is hidden. Works on built-in and created countries (the
 * change is a log entry applied over the country's own data). Changing the rule set re-runs the process under the new one when the country is
 * built. Hiding takes a country out of the country switch and the pickers and keeps everything else; the active country cannot be hidden. Admin only; logged. */
export async function updateCountry(d: Deps, actor: string, id: string, b: { name?: unknown; ruleset?: unknown; hidden?: unknown }): Promise<Ok<{ country: Country; changed: string[]; stale?: boolean }> | Fail> {
  const { entries, state } = await loadState(d);
  const c = countryIn(state, id);
  if (!c) return fail(404, "Unknown country");
  const patch: CountryPatch = {};
  if (b.name !== undefined) {
    const name = typeof b.name === "string" ? b.name.trim() : "";
    if (name.length < 2 || name.length > 80) return fail(400, "The country name is 2 to 80 characters.");
    if (name !== c.name) {
      if (allCountries(state).some((x) => x.id !== id && x.name.toLowerCase() === name.toLowerCase())) return fail(409, `A country named ${name} already exists.`);
      patch.name = name;
    }
  }
  if (b.ruleset !== undefined) {
    if (typeof b.ruleset !== "string" || !RULESETS.some((r) => r.id === b.ruleset)) return fail(400, "Choose one of the available rule sets.");
    if (b.ruleset !== c.ruleset) patch.ruleset = b.ruleset;
  }
  if (b.hidden !== undefined) {
    if (typeof b.hidden !== "boolean") return fail(400, "Hidden is true or false.");
    if (b.hidden !== !!c.hidden) {
      if (b.hidden && state.active.country === id) return fail(409, `${c.name} is the active country. Switch to another country before hiding it.`);
      patch.hidden = b.hidden;
    }
  }
  const changed = Object.keys(patch);
  if (!changed.length) return { ok: true, country: c, changed };
  const drafts: { kind: CountryKind; payload: Record<string, unknown> }[] = [{ kind: "country_updated", payload: { id, patch, from: { name: c.name, ruleset: c.ruleset, hidden: !!c.hidden } } }];
  // Nothing is re-run here. A rule set change leaves every stored result and every deployed agent as it was; the use cases of this country are marked
  // out of date on the dashboard (rerun.ts) and an admin reruns them from there, a deployed one after its process owner has asked.
  const w = await commit(d, entries, drafts, actor);
  if (isFail(w)) return w;
  return { ok: true, country: { ...c, ...patch }, changed, stale: !!patch.ruleset };
}

const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
/** Sets (or changes) the deployment target of a country other than the UAE: the percentage, the deadline, and which verdicts count as deployed.
 * Fields left out keep their current value, so one field can be edited alone. The UAE's target is the organisation's policy row (the Policy form). Admin only; logged. */
export async function setCountryTarget(d: Deps, actor: string, id: string, b: Record<string, unknown>): Promise<Ok<{ target: CountryTarget; noop?: true }> | Fail> {
  const { entries, state } = await loadState(d);
  const c = countryIn(state, id);
  if (!c) return fail(404, "Unknown country");
  if (id === DEFAULT_ENTITY_COUNTRY) return fail(400, "The UAE target is edited in the Policy form on the dashboard.");
  const cur: CountryTarget = state.targets[id] ?? { ...DEFAULT_POLICY, name: `${c.name}: agentic AI deployment`, jurisdiction: c.name, source_url: null, deadline: null };
  const t: CountryTarget = { ...cur, counting_verdicts: [...cur.counting_verdicts] };
  if (b.target_percent !== undefined) {
    if (typeof b.target_percent !== "number" || !Number.isInteger(b.target_percent) || b.target_percent < 0 || b.target_percent > 100) return fail(400, "The target is a whole number from 0 to 100.");
    t.target_percent = b.target_percent;
  }
  if (b.deadline !== undefined) {
    if (b.deadline === null || b.deadline === "") t.deadline = null;
    else if (typeof b.deadline === "string" && isDate(b.deadline)) t.deadline = b.deadline;
    else return fail(400, "The deadline is a date (YYYY-MM-DD) or empty.");
  }
  if (b.counting_verdicts !== undefined) {
    const v = b.counting_verdicts;
    if (!Array.isArray(v) || !v.length || !v.every((x) => (VERDICTS as readonly string[]).includes(x as string))) return fail(400, "Pick at least one verdict that counts as deployed.");
    t.counting_verdicts = VERDICTS.filter((x) => v.includes(x));
  }
  if (b.name !== undefined) {
    const name = typeof b.name === "string" ? b.name.trim() : "";
    if (!name || name.length > 120) return fail(400, "A policy needs a name of up to 120 characters.");
    t.name = name;
  }
  if (b.jurisdiction !== undefined) {
    const j = typeof b.jurisdiction === "string" ? b.jurisdiction.trim() : "";
    if (!j || j.length > 80) return fail(400, "A jurisdiction of up to 80 characters is needed.");
    t.jurisdiction = j;
  }
  if (b.source_url !== undefined) {
    if (b.source_url === null || b.source_url === "") t.source_url = null;
    else if (typeof b.source_url === "string" && /^https?:\/\/\S+$/.test(b.source_url) && b.source_url.length <= 300) t.source_url = b.source_url;
    else return fail(400, "The source is a web address starting with http:// or https://.");
  }
  if (state.targets[id] && JSON.stringify(state.targets[id]) === JSON.stringify(t)) return { ok: true, target: t, noop: true };
  const w = await commit(d, entries, [{ kind: "country_target", payload: { id, policy: t, from: state.targets[id] ?? null } }], actor);
  if (isFail(w)) return w;
  return { ok: true, target: t };
}

/** Links an entity to a country: from then on the entity's use cases are counted on that country's dashboard (and on no other). Admin only; logged. */
export async function linkEntity(d: Deps, actor: string, entityIn: unknown, countryIn_: unknown): Promise<Ok<{ entity: string; country: string }> | Fail> {
  const entity = typeof entityIn === "string" ? entityIn.trim() : "";
  const country = typeof countryIn_ === "string" ? countryIn_ : "";
  if (!entity || entity.length > 120) return fail(400, "An entity name is needed.");
  const { entries, state } = await loadState(d);
  const target = countryIn(state, country);
  if (!target) return fail(400, "Unknown country");
  if (target.hidden) return fail(409, `${target.name} is hidden. Unhide it before linking an entity to it.`);
  if (entityCountryOf(state, entity) === country) return fail(409, `${entity} is already linked to that country.`);
  const w = await commit(d, entries, [{ kind: "entity_country", payload: { entity, country, from: entityCountryOf(state, entity) } }], actor);
  if (isFail(w)) return w;
  return { ok: true, entity, country };
}

interface OnboardIn { name?: unknown; country?: unknown; sop_text?: unknown; sample?: unknown; title?: unknown }

/** Step B: add a synthetic company with its own SOP for the same use case, create everything the run needs, and run it. */
export async function onboardCompany(d: Deps, actor: string, b: OnboardIn, onStage?: (t: Timing) => void): Promise<Ok<{ company: CompanyRec; run: RunResult; timings: Timing[]; total_ms: number }> | Fail> {
  const T0 = d.clock();
  const { entries, state } = await loadState(d);
  const sample = typeof b.sample === "string" ? d.sample(b.sample) : null;
  const text = sample ?? (typeof b.sop_text === "string" ? b.sop_text : "");
  if (!text.trim()) return fail(400, "The SOP text is empty.");
  if (text.length > 200_000) return fail(400, "The SOP is too large (200 KB limit).");
  let name = (typeof b.name === "string" ? b.name : sample ? SAMPLE_NAME : "").trim().slice(0, 80);
  if (name.length < 3) return fail(400, "Give the company a name.");
  if (!/\((synthetic|fictitious)\)/i.test(name)) name = `${name} (synthetic)`;
  const country = typeof b.country === "string" ? b.country : "SG";
  const c = countryIn(state, country);
  if (!c) return fail(400, "Unknown country");
  if (!(await scopeOf(d, state, country))) return fail(409, `${c.name} has no knowledge-base index yet: add its policy first`);
  const id = slug(name);
  if (BUILTIN_COMPANIES.some((x) => x.id === id)) return fail(400, "That name is taken by the built-in company.");
  if (!state.companies[id] && Object.keys(state.companies).length >= MAX_COMPANIES) return fail(400, `At most ${MAX_COMPANIES} companies in the demo; reset to start again.`);

  const timings: Timing[] = [];
  const step = (stage: string, t0: number, detail: string) => { const t = { stage, ms: Math.round(d.clock() - t0), detail }; timings.push(t); onStage?.(t); };

  let t = d.clock();
  const body = retrievablePart(text);
  const title = (typeof b.title === "string" && b.title.trim()) || body.match(/^#\s+(.+)$/m)?.[1]?.trim() || `${name} SOP`;
  let meta: SopMeta;
  try { meta = { ...sopMetaFrom(text, `company SOP: ${name}`), entity: name }; } catch { meta = { sopId: slug(title).toUpperCase() || "COMPANY-SOP", version: "1", useCaseId: "UC02", entity: name, sourcePath: `company SOP: ${name}` }; }
  const words = body.split(/\s+/).filter(Boolean).length;
  step("parse SOP", t, `${words} words, document ${meta.sopId} v${meta.version}`);

  t = d.clock();
  const analysis = await ruleAnalyzer.analyze({ sop_id: meta.sopId, title: title.slice(0, 120), text: body, baseline: d.baseline(), metadata: { entity: name, entity_sector: "Public services", departments: [] } });
  if (!analysis.steps.length) return fail(400, "No steps were found in this SOP.");
  const profiles = deriveProfiles(analysis, body);
  step("analyse (steps, profiles, baseline and volume)", t, `${analysis.steps.length} steps, ${profiles.length} job profiles, ${analysis.totals.hours_saved_per_year} h/year could be saved of ${analysis.totals.baseline_hours_per_year} h (synthetic baseline)`);

  t = d.clock();
  const chunks: SopChunk[] = chunkSop(text, meta).map((x) => ({ ...x, jurisdiction: name, issuer: name, url: meta.sourcePath }));
  step("chunk SOP", t, `${chunks.length} chunks (one per task, document, rule, question, role or section)`);

  t = d.clock();
  const ix = (await import("./kb.ts")).warmIndex(chunks);
  step("index (BM25)", t, `${ix.docs} documents, ${ix.terms} terms, in memory`);

  t = d.clock();
  const vecs = d.embed ? await d.embed(chunks.map((x) => x.text)) : null;
  step("vectors", t, vecs ? `${vecs.length} vectors (local nomic-embed-text-v1.5, no API key)` : "skipped: the local embedder is not available here; retrieval is BM25 only");

  t = d.clock();
  const made = toUseCase(analysis, { title: title.slice(0, 120), metadata: { entity: name, entity_sector: "Public services" } });
  const uc = { ...made, entity: name, ext_id: meta.sopId.startsWith("SOP-") ? meta.sopId : made.ext_id }; // the SOP's own id, not SOP-SOP-...
  const err = await d.useCases.upsert(uc);
  if (err) return fail(500, err);
  await d.store.putBlob(`sop:${id}`, { chunks, vectors: vecs ? { model: "nomic-embed-text-v1.5", ids: chunks.map((x) => x.chunk_id), vectors: vecs } : null });
  step("register (organisation, country scope, rule set, use case row, SOP knowledge base)", t, `${uc.ext_id} created; ${c.name} scope, rule set ${c.ruleset}; gates come from the rule set`);

  const rec: CompanyRec = {
    id, name, country, sop_id: meta.sopId, ext_id: uc.ext_id, at: d.now(), by: actor,
    sop: { title: title.slice(0, 120), chunks: chunks.length, words, sha256: chunks[0]?.sha256 ?? "", vectors: !!vecs },
    steps: analysis.steps.map((s) => ({ id: s.id, text: s.text, actor: s.actor })),
    profiles: profiles.map((p) => ({ name: p.name, tasks: p.tasks.map((x) => x.id) })),
    figures: { baseline_hours: analysis.totals.baseline_hours_per_year, hours_saved: analysis.totals.hours_saved_per_year, vs_baseline_pct: analysis.totals.vs_baseline_pct, cases_per_year: analysis.totals.cases_per_year, currency: analysis.totals.currency },
    flags: { client_facing: analysis.flags.client_facing, affects_rights: analysis.flags.affects_rights, irreversible: analysis.flags.irreversible },
    timings, total_ms: 0,
  };
  const next = { ...state, companies: { ...state.companies, [id]: rec } };
  t = d.clock();
  const run = await runFor(d, next, id, country);
  if (isFail(run)) return run;
  step("run the use case", t, `${run.steps.length} steps, verdict ${run.final}, ${run.cited.length} sources cited`);
  rec.total_ms = Math.round(d.clock() - T0);
  const w = await commit(d, entries, [{ kind: "company_onboarded", payload: { company: rec } }, { kind: "run", payload: { result: run } }], actor);
  if (isFail(w)) return w;
  return { ok: true, company: rec, run, timings, total_ms: rec.total_ms };
}

/** Re-run and record one company under one country (also used to refresh a stored result). */
export async function recordRun(d: Deps, actor: string, company: string, country: string): Promise<Ok<{ run: RunResult; matchesStored: boolean | null }> | Fail> {
  const { entries, state } = await loadState(d);
  const run = await runFor(d, state, company, country);
  if (isFail(run)) return run;
  const stored = state.runs[run.key];
  const w = await commit(d, entries, [{ kind: "run", payload: { result: run, matches_stored: stored ? stored.head_hash === run.head_hash : null } }], actor);
  if (isFail(w)) return w;
  return { ok: true, run, matchesStored: stored ? stored.head_hash === run.head_hash : null };
}

/** Returns the demo to its starting state: no live-built scope, no new company. Deletes only what this feature wrote
 * (its blobs and the use case rows of the companies it created) and appends a `reset` entry; the log is never shortened. */
export type ResetResult = Ok<{ removed: { blobs: string[]; use_cases: string[] }; noop?: true }> | Fail;
const resetting = new Map<string, Promise<ResetResult>>();

/** `key` (the organisation) lets a repeated or double-clicked request join the one in flight instead of logging twice
 * (ponytail: in-process only; across instances the store's append-only check still refuses the second write). */
export async function resetDemo(d: Deps, actor: string, key?: string): Promise<ResetResult> {
  const inflight = key ? resetting.get(key) : undefined;
  if (inflight) { const r = await inflight; return r.ok ? { ok: true, removed: { blobs: [], use_cases: [] }, noop: true } : r; }
  const p = doReset(d, actor);
  if (key) resetting.set(key, p);
  try { return await p; } finally { if (key) resetting.delete(key); }
}

async function doReset(d: Deps, actor: string): Promise<ResetResult> {
  const { entries, state } = await loadState(d);
  const start = START_STATE();
  // already at the starting state: nothing to undo, so no log entry
  if (!Object.keys(state.policies).length && !Object.keys(state.companies).length && !Object.keys(state.runs).length && !state.switches.length && !Object.keys(state.countries).length && !Object.keys(state.entityCountries).length && !Object.keys(state.overrides).length && !Object.keys(state.targets).length
    && state.active.company === start.active.company && state.active.country === start.active.country) return { ok: true, removed: { blobs: [], use_cases: [] }, noop: true };
  const blobs = [...Object.keys(state.policies).map((k) => `vectors:${k}`), ...Object.keys(state.countries).map((k) => `policydocs:${k}`), ...Object.keys(state.companies).map((k) => `sop:${k}`)];
  const ucs = Object.values(state.companies).map((c) => c.ext_id);
  for (const k of blobs) await d.store.delBlob(k);
  for (const e of ucs) await d.useCases.remove(e);
  const w = await commit(d, entries, [{ kind: "reset", payload: { removed: { blobs, use_cases: ucs } } }], actor);
  if (isFail(w)) return w;
  policyCache.clear();
  scopeCache.clear();
  return { ok: true, removed: { blobs, use_cases: ucs } };
}



/** What the compare view needs about a company: its job profiles and its SOP lines (names and ids neutralised). */
export async function companyView(d: Deps, state: CountryState, id: string): Promise<{ name: string; sop_id: string; profiles: CompanyRec["profiles"]; lines: string[] } | null> {
  const co = await companyCtx(d, state, id);
  if (!co) return null;
  const rec = state.companies[id];
  let profiles = rec?.profiles;
  if (!profiles) {
    const m = await d.marsa();
    const body = retrievablePart(m.sopMarkdown);
    const a = await ruleAnalyzer.analyze({ sop_id: co.sop_id, title: co.name, text: body, baseline: d.baseline(), metadata: { entity: co.entity } });
    profiles = deriveProfiles(a, body).map((p) => ({ name: p.name, tasks: p.tasks.map((x) => x.id) }));
  }
  return { name: co.name, sop_id: co.sop_id, profiles, lines: sopLines(co.sop, [co.name, co.name.replace(/ \((fictitious|synthetic)\)$/, ""), "Marsa Public Services Authority", "Marsa"]) };
}
