import { regionalCurrency } from "./country-context.ts";
import data from "../../../data/un-countries.json" with { type: "json" };
import { effectiveGates, EMPTY_GOV, type GovState } from "./gates.ts";
import { hitlConfigFor, RULESETS } from "./rulesets.ts";
import { type HitlFacts } from "./hitl.ts";
import { warmIndex, type Chunk } from "./kb.ts";
import { nextStep, startRun } from "./scenario.ts";
import { S1 } from "./scenarios.ts";
import { appendEntry, verifyChain, type ChainEntry } from "./tuning.ts";
import type { Policy } from "./model.ts";
import type { VectorFile } from "./vector.ts";

// Country and knowledge base. A country is DATA (data/un-countries.json): the knowledge-base jurisdictions its
// retrieval covers (its own sources plus international standards) and the rule set that judges its verdicts.
// Switching the country re-runs the whole staged process for the licence-renewal use case under that country's
// rule set and sources. Everything here is pure; storage is country-store.ts, the actions are country-actions.ts.
// The rule sets are SIMPLIFIED DEMO ENCODINGS, not legal advice; retrieval is lexical BM25 (plus vectors where built).

export interface Country { id: string; name: string; ruleset: string; currency?: string; home: string[]; international: string[]; built: "precomputed" | "on_demand"; stage?: string;
  /** Created by an admin on the screen (not in data/un-countries.json): its policy documents are stored, not staged on disk. */
  custom?: boolean;
  /** Hidden by an admin: out of the country switch and the pickers, with all its data and history kept. Reversible. */
  hidden?: boolean }
/** What an admin can change on any country, built-in or created. Applied over the country's own data when the log is replayed. */
export interface CountryPatch { name?: string; ruleset?: string; currency?: string; hidden?: boolean }
/** A country's own deployment target. The UAE's lives in the organisation's policy row; every other country's is in the log. */
export type CountryTarget = Policy;
export interface BuiltinCompany { id: string; name: string; country: string; sop_id: string; sop_file: string }
export const COUNTRIES = data.countries as Country[];
export const BUILTIN_COMPANIES = data.companies as BuiltinCompany[];
export const countryOf = (id: string) => COUNTRIES.find((c) => c.id === id);
/** A country by id, including the ones an admin created (they live in the replayed state). */
export const countryIn = (state: { countries: Record<string, Country>; overrides?: Record<string, CountryPatch> }, id: string): Country | undefined => {
  const base = countryOf(id) ?? (Object.hasOwn(state.countries, id) ? state.countries[id] : undefined);
  if (!base) return undefined;
  const country = { ...base, ...state.overrides?.[id] };
  return { ...country, currency: country.currency ?? regionalCurrency(id) };
};
/** The country every entity belongs to unless an admin links it elsewhere: all the entities the app ships with are UAE federal entities. */
export const DEFAULT_ENTITY_COUNTRY = "UAE";
export const entityCountryOf = (state: { entityCountries: Record<string, string> }, entity: string): string => state.entityCountries[entity] ?? DEFAULT_ENTITY_COUNTRY;
/** The use cases of the entities linked to one country: what that country's dashboard counts. */
export const entityUseCases = <T extends { entity: string }>(state: { entityCountries: Record<string, string> }, ucs: T[], country: string): T[] => ucs.filter((u) => entityCountryOf(state, u.entity) === country);
/** Every country: the built-in ones, then the ones an admin created. */
export const allCountries = (state: { countries: Record<string, Country>; overrides?: Record<string, CountryPatch> }): Country[] =>
  [...COUNTRIES, ...Object.values(state.countries)].map((c) => countryIn(state, c.id)!);
/** The countries an admin has not hidden: what the country switch and the pickers offer. */
export const visibleCountries = (state: { countries: Record<string, Country>; overrides?: Record<string, CountryPatch> }): Country[] => allCountries(state).filter((c) => !c.hidden);
export const rulesetOf = (c: Country) => RULESETS.find((r) => r.id === c.ruleset)!;

/** Runs are deterministic in their inputs: the clock inside a run is fixed, so the same country, rule set,
 * sources and SOP give the same head hash on every machine and on every switch back. Real times are on the log entries. */
export const RUN_EPOCH = "2026-11-21T00:00:00.000Z";

// ---- scope -----------------------------------------------------------------------------------

export const inScope = (c: Chunk, k: Country) => k.home.includes(c.jurisdiction) || k.international.includes(c.jurisdiction);
export const scopeChunks = (all: Chunk[], k: Country, extra: Chunk[] = []): Chunk[] => [...all.filter((c) => inScope(c, k)), ...extra];

export interface SourceCount { source_id: string; title: string; jurisdiction: string; url: string; chunks: number }
export function sourceCounts(chunks: Chunk[]): SourceCount[] {
  const m = new Map<string, SourceCount>();
  for (const c of chunks) {
    const s = m.get(c.source_id) ?? { source_id: c.source_id, title: c.title, jurisdiction: c.jurisdiction, url: c.url, chunks: 0 };
    s.chunks++;
    m.set(c.source_id, s);
  }
  return [...m.values()].sort((a, b) => a.jurisdiction.localeCompare(b.jurisdiction) || a.source_id.localeCompare(b.source_id));
}

export interface IndexInfo {
  chunks: number; sources: number; byJurisdiction: Record<string, number>;
  bm25: { docs: number; terms: number; ms: number };
  vectors: { have: number; of: number; dim: number; model: string; built: string | null } | null;
}
/** What an index over this scope looks like. Builds the in-memory BM25 index (and times it) if it is not built yet. */
export function indexInfo(chunks: Chunk[], vectors: (VectorFile & { meta?: Record<string, unknown> }) | null): IndexInfo {
  const t0 = performance.now();
  const b = warmIndex(chunks);
  const ms = Math.round((performance.now() - t0) * 10) / 10;
  const byJurisdiction: Record<string, number> = {};
  for (const c of chunks) byJurisdiction[c.jurisdiction] = (byJurisdiction[c.jurisdiction] ?? 0) + 1;
  const ids = vectors ? new Set(vectors.ids) : null;
  const meta = vectors?.meta;
  return {
    chunks: chunks.length, sources: new Set(chunks.map((c) => c.source_id)).size, byJurisdiction,
    bm25: { docs: b.docs, terms: b.terms, ms },
    vectors: vectors && ids ? { have: chunks.filter((c) => ids.has(c.chunk_id)).length, of: chunks.length, dim: vectors.dim, model: vectors.model, built: (meta?.extended_on ?? meta?.embedded_on ?? null) as string | null } : null,
  };
}

// ---- one run of the staged process -----------------------------------------------------------

export interface RunResult {
  key: string; company: string; company_name: string; country: string; ruleset: string; ruleset_name: string;
  sop_id: string | null; ext_id: string;
  steps: { step: string; verdict: string; expected: string; reasons: string[] }[];
  final: string;
  required: { id: string; label: string; status: string }[];
  cited: { chunk_id: string; source_id: string; title: string; url: string; jurisdiction: string; quote: string; step: string; from: "policy" | "company_sop" }[];
  corpus: { policy_chunks: number; policy_sources: number; sop_chunks: number };
  head_hash: string; records: number; ms: number;
  /** A fingerprint of everything the run depended on (rule set, policy sources, the company's SOP and facts, the gate state). Switching back to a
   * country re-runs only when this has changed; absent on runs stored before it was recorded. */
  inputs_hash?: string;
}

export interface RunInput {
  company: { id: string; name: string; sop_id: string | null; ext_id: string };
  country: Country;
  /** The country's scoped knowledge base (policy sources) and the company's own SOP chunks. */
  policy: Chunk[];
  sop: Chunk[];
  facts: HitlFacts;
  entity: string;
  gov?: GovState;
}

/** Runs the staged UC02 process (scenario S1, five steps) under the country's rule set, retrieving from the
 * country's sources and the company's SOP. Deterministic (no model call, fixed clock). */
export async function runProcess(i: RunInput): Promise<RunResult> {
  const t0 = performance.now();
  const rs = rulesetOf(i.country);
  const eff = effectiveGates({ ext: i.company.ext_id, facts: i.facts, ruleset: rs, gov: i.gov ?? EMPTY_GOV });
  const chunks = [...i.policy, ...i.sop];
  const home = [...i.country.home, ...new Set(i.sop.map((c) => c.jurisdiction))];
  const env = { now: () => RUN_EPOCH, chunks, home, ruleset: eff.ruleset_effective, effective: eff, hitl: { config: hitlConfigFor(rs, i.entity), entity: i.entity, facts: i.facts } };
  let st = startRun(S1, `${i.company.id}-${i.country.id}`);
  for (let n = 0; n < S1.steps.length; n++) st = await nextStep(S1, st, env);
  const byId = new Map(chunks.map((c) => [c.chunk_id, c]));
  const sopIds = new Set(i.sop.map((c) => c.chunk_id));
  const cited: RunResult["cited"] = [];
  for (const r of st.log) {
    if (r.disposition !== "accepted") continue;
    for (const k of r.kb_citations) {
      const c = byId.get(k.chunk_id);
      if (c && !cited.some((x) => x.chunk_id === k.chunk_id)) cited.push({ chunk_id: c.chunk_id, source_id: c.source_id, title: c.title, url: c.url, jurisdiction: c.jurisdiction, quote: k.quote, step: r.step, from: sopIds.has(c.chunk_id) ? "company_sop" : "policy" });
    }
  }
  const last = st.steps[st.steps.length - 1];
  return {
    key: `${i.company.id}:${i.country.id}`, company: i.company.id, company_name: i.company.name, country: i.country.id, ruleset: rs.id, ruleset_name: rs.name,
    sop_id: i.company.sop_id, ext_id: i.company.ext_id,
    steps: st.steps.map((s) => ({ step: s.step, verdict: s.outcome, expected: s.expected, reasons: s.reasons })),
    final: last?.outcome ?? "NONE",
    required: eff.gates.filter((g) => !g.waiver).map((g) => ({ id: g.id, label: g.label, status: st.state?.gates[g.id] ?? "unknown" })),
    cited,
    corpus: { policy_chunks: i.policy.length, policy_sources: new Set(i.policy.map((c) => c.source_id)).size, sop_chunks: i.sop.length },
    head_hash: st.log[st.log.length - 1]?.hash ?? "", records: st.log.length, ms: Math.round(performance.now() - t0),
  };
}

// ---- the hash-chained log and the state replayed from it -------------------------------------

export type CountryKind = "switch" | "policy_added" | "company_onboarded" | "run" | "reset" | "country_added" | "entity_country" | "country_updated" | "country_target"
  // an admin's changes to entities and people: the data is in its own tables, the log is the tamper-evident record of who changed what and when
  | "entity_added" | "entity_goals" | "entity_hidden" | "federal_member" | "person_title" | "sop_changed" | "profile_changed" | "rerun_requested" | "rerun_done" | "sop_version" | "sop_change_requested" | "sop_change_applied" | "sop_change_declined";
export type CountryEntry = ChainEntry<CountryKind>;

export interface Timing { stage: string; ms: number; detail: string }
export interface PolicyRec {
  country: string; ruleset: string; at: string; by: string;
  sources: { id: string; title: string; url: string; sha256: string; words: number; chunks: number }[];
  chunks: number; vectors: { have: number; model: string } | null; vectors_note: string; timings: Timing[]; total_ms: number;
}
export interface CompanyRec {
  id: string; name: string; country: string; sop_id: string; ext_id: string; at: string; by: string;
  sop: { title: string; chunks: number; words: number; sha256: string; vectors: boolean };
  steps: { id: string; text: string; actor: string | null }[];
  profiles: { name: string; tasks: string[] }[];
  figures: { baseline_hours: number; hours_saved: number; vs_baseline_pct: number; cases_per_year: number; currency: string };
  flags: { client_facing: boolean; affects_rights: boolean; irreversible: boolean };
  timings: Timing[]; total_ms: number;
}
export interface CountryState {
  active: { company: string; country: string };
  /** Countries an admin created, by id. */
  countries: Record<string, Country>;
  /** The country each entity is linked to, where an admin set it. An entity with no link is in the default country (UAE). */
  entityCountries: Record<string, string>;
  /** What an admin changed on a country (name, rule set, hidden), by id. */
  overrides: Record<string, CountryPatch>;
  /** The deployment target an admin set for a country other than the UAE, by id. */
  targets: Record<string, CountryTarget>;
  policies: Record<string, PolicyRec>;
  companies: Record<string, CompanyRec>;
  runs: Record<string, RunResult & { at: string; by: string }>;
  switches: { at: string; by: string; company: string; from: string; to: string }[];
  resets: number;
}
export const START_STATE = (): CountryState => ({ active: { company: BUILTIN_COMPANIES[0].id, country: BUILTIN_COMPANIES[0].country }, policies: {}, companies: {}, runs: {}, switches: [], resets: 0, countries: {}, entityCountries: {}, overrides: {}, targets: {} });

/** Replays the log. A `reset` entry returns the state to the start (the log itself is never edited or shortened). */
export function replayCountry(entries: CountryEntry[]): CountryState {
  let s = START_STATE();
  for (const e of entries) {
    const p = e.payload as Record<string, unknown>;
    if (e.kind === "reset") s = { ...START_STATE(), resets: s.resets + 1 };
    else if (e.kind === "switch") {
      const sw = { at: e.at, by: e.actor, company: String(p.company), from: String(p.from), to: String(p.to) };
      s = { ...s, active: { company: sw.company, country: sw.to }, switches: [...s.switches, sw] };
    } else if (e.kind === "entity_country") { s = { ...s, entityCountries: { ...s.entityCountries, [String(p.entity)]: String(p.country) } }; }
    else if (e.kind === "country_updated") { const id = String(p.id); s = { ...s, overrides: { ...s.overrides, [id]: { ...s.overrides[id], ...(p.patch as CountryPatch) } } }; }
    else if (e.kind === "country_target") { s = { ...s, targets: { ...s.targets, [String(p.id)]: p.policy as CountryTarget } }; }
    else if (e.kind === "country_added") { const c = p.country as Country; s = { ...s, countries: { ...s.countries, [c.id]: c } }; }
    else if (e.kind === "policy_added") { const r = p.policy as PolicyRec; s = { ...s, policies: { ...s.policies, [r.country]: r } }; }
    else if (e.kind === "company_onboarded") { const c = p.company as CompanyRec; s = { ...s, companies: { ...s.companies, [c.id]: c }, active: { company: c.id, country: c.country } }; }
    else if (e.kind === "run") { const r = p.result as RunResult; s = { ...s, runs: { ...s.runs, [r.key]: { ...r, at: e.at, by: e.actor } } }; }
  }
  return s;
}
export const appendCountry = (prev: CountryEntry | null, kind: CountryKind, actor: string, payload: Record<string, unknown>, at: string): CountryEntry => appendEntry<CountryKind>(prev, kind, actor, payload, at);
export const verifyCountry = (entries: CountryEntry[]) => verifyChain(entries);

// ---- the plain diff of two runs ---------------------------------------------------------------

export interface RunDiff {
  steps: { step: string; a: string; b: string; differs: boolean }[];
  gates: { onlyA: string[]; onlyB: string[]; both: string[] };
  verdict: { a: string; b: string; differs: boolean };
  sources: { onlyA: string[]; onlyB: string[]; both: string[] };
}
export function diffRuns(a: RunResult, b: RunResult): RunDiff {
  const ga = a.required.map((g) => g.id), gb = b.required.map((g) => g.id);
  const sa = [...new Set(a.cited.map((c) => c.source_id))], sb = [...new Set(b.cited.map((c) => c.source_id))];
  const steps = a.steps.map((s, i) => ({ step: s.step, a: s.verdict, b: b.steps[i]?.verdict ?? "-", differs: s.verdict !== b.steps[i]?.verdict }));
  return {
    steps,
    gates: { onlyA: ga.filter((g) => !gb.includes(g)), onlyB: gb.filter((g) => !ga.includes(g)), both: ga.filter((g) => gb.includes(g)) },
    verdict: { a: a.final, b: b.final, differs: a.final !== b.final },
    sources: { onlyA: sa.filter((x) => !sb.includes(x)), onlyB: sb.filter((x) => !sa.includes(x)), both: sa.filter((x) => sb.includes(x)) },
  };
}

/** The lines of a SOP's chunks with company names and SOP ids replaced by placeholders, so that only a real change shows. */
export function sopLines(chunks: Chunk[], names: string[]): string[] {
  const norm = (t: string) => names.reduce((x, n) => x.split(n).join("{org}"), t).replace(/SOP-[A-Z]+-(?:SG-)?\d+/g, "{sop}").replace(/\s+/g, " ").trim();
  return chunks.flatMap((c) => c.text.split("\n").slice(1)).map(norm).filter((l) => l.length > 3 && !/^\|[-| ]+\|?$/.test(l) && !l.startsWith("#"));
}
/** Lines only in one of the two SOPs (set difference, capped). */
export function diffSops(a: string[], b: string[], cap = 24): { removed: string[]; added: string[] } {
  const A = new Set(a), B = new Set(b);
  return { removed: [...new Set(a.filter((l) => !B.has(l)))].slice(0, cap), added: [...new Set(b.filter((l) => !A.has(l)))].slice(0, cap) };
}
export function diffProfiles(a: CompanyRec["profiles"], b: CompanyRec["profiles"]) {
  const an = new Map(a.map((p) => [p.name.toLowerCase(), p])), bn = new Map(b.map((p) => [p.name.toLowerCase(), p]));
  return {
    onlyA: a.filter((p) => !bn.has(p.name.toLowerCase())).map((p) => p.name),
    onlyB: b.filter((p) => !an.has(p.name.toLowerCase())).map((p) => p.name),
    changed: b.filter((p) => an.has(p.name.toLowerCase()) && an.get(p.name.toLowerCase())!.tasks.length !== p.tasks.length).map((p) => ({ name: p.name, a: an.get(p.name.toLowerCase())!.tasks.length, b: p.tasks.length })),
  };
}
