// Federal intake model for the UN entry. Pure: no I/O, so it is testable and
// portable to the main repo by copying src/lib/un/.
export const QUADRANTS = [
  "Internal Agents",
  "Internal RAG",
  "External Agents",
  "External RAG",
] as const;
export type Quadrant = (typeof QUADRANTS)[number];

export const VERDICTS = [
  "GO_AUTONOMOUS",
  "GO_SUPERVISED",
  "ASSISTANT_ONLY",
  "NO_GO",
  "ESCALATE",
] as const;
export type Verdict = (typeof VERDICTS)[number];

export const STAGES = [
  "intake",
  "sop",
  "org",
  "scout",
  "pilot",
  "approved",
  "deployed",
] as const;
export type Stage = (typeof STAGES)[number];

export interface UnUseCase {
  ext_id: string;
  entity: string;
  entity_sector: string | null;
  title: string;
  quadrant: Quadrant;
  matrix_examples: string | null;
  departments: string | null;
  client_facing: boolean;
  hitl_rule: string | null;
  description: string | null;
  /** Optional: absent in old CSVs and rows. */
  affects_rights?: boolean;
  irreversible?: boolean;
}

export interface UnUseCaseState extends UnUseCase {
  id: string;
  stage: Stage;
  verdict: Verdict | null;
  /** Latest attestation passes all hard gates (Sijil, simulated until live). */
  compliant: boolean;
  /** Provenance (I-1, I-4). verdict is engine-written: a completed scenario
   * run (run id + head hash) plus a human signature. compliant comes only
   * from a passing Sijil report. See guard.ts. */
  verdict_run_id?: string | null;
  verdict_head_hash?: string | null;
  verdict_signed_by?: string | null;
  verdict_signed_at?: string | null;
  compliant_report_id?: string | null;
}

export interface Policy {
  name: string;
  jurisdiction: string;
  source_url: string | null;
  target_percent: number;
  deadline: string | null;
  /** Which verdicts count a use case as "deployed". Explicit and editable:
   * the federal framework has not defined the metric. */
  counting_verdicts: Verdict[];
}

export const DEFAULT_POLICY: Policy = {
  name: "UAE Federal Agentic AI framework",
  jurisdiction: "UAE-federal",
  source_url:
    "https://uaecabinet.ae/en/news/under-directives-of-uae-president-and-in-world-first-mohammed-bin-rashid-reveals-new-uae-government-framework-to-deploy-agentic-ai-across-50-of-government-sectors-operations-within-two-years",
  target_percent: 50,
  // ASSUMED: the Cabinet said on 23 Apr 2026 "within two years"; no date was
  // published. Shown as "about April 2028 (assumed)". Editable.
  deadline: "2028-04-30",
  counting_verdicts: ["GO_AUTONOMOUS", "GO_SUPERVISED"],
};

/** "by 2028-04-30", except for the shipped default: the date was never
 * published (Cabinet, 23 Apr 2026: "within two years"), so say so (I-5). */
export function deadlineText(p: Pick<Policy, "deadline" | "source_url">): string {
  if (!p.deadline) return "";
  const assumed = p.deadline === DEFAULT_POLICY.deadline && p.source_url === DEFAULT_POLICY.source_url;
  return assumed ? " by about April 2028 (two years from 23 Apr 2026, assumed)" : ` by ${p.deadline}`;
}

// --- CSV --------------------------------------------------------------------

/** RFC-4180-ish: quoted cells, escaped quotes, CRLF, BOM. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const REQUIRED = ["id", "entity", "use_case", "quadrant"] as const;
const TRUE = new Set(["true", "yes", "y", "1", "partly", "partial"]);
const FALSE = new Set(["", "false", "no", "n", "0"]);
const FLAGS = ["client_facing", "affects_rights", "irreversible"] as const;

export interface ParseResult {
  useCases: UnUseCase[];
  errors: string[];
}

/** Header-driven (column order is free). All-or-nothing: any error → no rows. */
export function parseUseCases(text: string): ParseResult {
  const rows = parseCsv(text);
  const errors: string[] = [];
  if (!rows.length) return { useCases: [], errors: ["The file is empty."] };
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const missing = REQUIRED.filter((k) => !head.includes(k));
  if (missing.length) {
    return {
      useCases: [],
      errors: [`Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.`],
    };
  }
  const col = (r: string[], k: string) => {
    const i = head.indexOf(k);
    return i < 0 ? "" : (r[i] ?? "").trim();
  };
  const seen = new Set<string>();
  const useCases: UnUseCase[] = [];
  rows.slice(1).forEach((r, n) => {
    const line = n + 2;
    const id = col(r, "id");
    const quadrant = QUADRANTS.find(
      (q) => q.toLowerCase() === col(r, "quadrant").toLowerCase(),
    );
    if (!id) errors.push(`Line ${line}: id is empty.`);
    else if (seen.has(id)) errors.push(`Line ${line}: duplicate id ${id}.`);
    seen.add(id);
    if (!col(r, "entity")) errors.push(`Line ${line}: entity is empty.`);
    if (!col(r, "use_case")) errors.push(`Line ${line}: use_case is empty.`);
    if (!quadrant) {
      errors.push(
        `Line ${line}: quadrant "${col(r, "quadrant")}" must be one of ${QUADRANTS.join(", ")}.`,
      );
    }
    // A typo ("ye") must not silently read as "no": client_facing caps autonomy.
    for (const f of FLAGS) {
      const v = col(r, f).toLowerCase();
      if (!TRUE.has(v) && !FALSE.has(v)) errors.push(`Line ${line}: ${f} "${col(r, f)}" must be yes or no.`);
    }
    if (!quadrant) return;
    useCases.push({
      ext_id: id,
      entity: col(r, "entity"),
      entity_sector: col(r, "entity_sector") || null,
      title: col(r, "use_case"),
      quadrant,
      matrix_examples: col(r, "matrix_examples_bundled") || null,
      departments: col(r, "departments_in_scope") || null,
      client_facing: TRUE.has(col(r, "client_facing").toLowerCase()),
      hitl_rule: col(r, "human_in_the_loop_rule") || null,
      description: col(r, "description") || null,
      // Only when the column exists, so re-importing an old CSV keeps stored values.
      ...(head.includes("affects_rights") && { affects_rights: TRUE.has(col(r, "affects_rights").toLowerCase()) }),
      ...(head.includes("irreversible") && { irreversible: TRUE.has(col(r, "irreversible").toLowerCase()) }),
    });
  });
  return errors.length ? { useCases: [], errors } : { useCases, errors };
}

// --- Dashboard --------------------------------------------------------------

export interface Tally {
  key: string;
  total: number;
  deployed: number;
  compliant: number;
}

export interface Dashboard {
  total: number;
  targetPercent: number;
  /** Use cases needed to meet the target (rounded up). */
  targetCount: number;
  deployed: number;
  compliant: number;
  deployedPct: number;
  compliantPct: number;
  /** Use cases still to deploy to reach the target. */
  gap: number;
  byEntity: Tally[];
  byQuadrant: Tally[];
  byStage: { stage: Stage; count: number }[];
}

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);

/** deployed = verdict is in the policy's counting set.
 * compliant = deployed AND latest attestation passes. Reported beside, never
 * merged into, deployed % so speed can't hide a safety failure. */
export function computeDashboard(policy: Policy, ucs: UnUseCaseState[]): Dashboard {
  const counts = new Set<string>(policy.counting_verdicts);
  const isDeployed = (u: UnUseCaseState) => !!u.verdict && counts.has(u.verdict);
  const tally = (keyOf: (u: UnUseCaseState) => string): Tally[] => {
    const m = new Map<string, Tally>();
    for (const u of ucs) {
      const k = keyOf(u);
      const t = m.get(k) ?? { key: k, total: 0, deployed: 0, compliant: 0 };
      t.total++;
      if (isDeployed(u)) {
        t.deployed++;
        if (u.compliant) t.compliant++;
      }
      m.set(k, t);
    }
    return [...m.values()].sort((a, b) => a.key.localeCompare(b.key));
  };
  const deployed = ucs.filter(isDeployed).length;
  const compliant = ucs.filter((u) => isDeployed(u) && u.compliant).length;
  const targetCount = Math.ceil((ucs.length * policy.target_percent) / 100);
  return {
    total: ucs.length,
    targetPercent: policy.target_percent,
    targetCount,
    deployed,
    compliant,
    deployedPct: pct(deployed, ucs.length),
    compliantPct: pct(compliant, ucs.length),
    gap: Math.max(0, targetCount - deployed),
    byEntity: tally((u) => u.entity),
    byQuadrant: tally((u) => u.quadrant),
    byStage: STAGES.map((stage) => ({
      stage,
      count: ucs.filter((u) => u.stage === stage).length,
    })),
  };
}

/** Route ids are uuids; anything else is a 404, not a database error. */
export const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
