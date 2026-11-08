import { CRITERIA, type Criterion, type SijilRun } from "./sijil.ts";

// Entity goals feed Sijil "goal alignment" (C2-10). Deterministic, no random
// number. Each entity has 3-5 goals; every goal is tagged to one Prism
// criterion that the pilot's acceptance criteria already measure.
//
// FORMULA. For one run of N evaluated actions, a goal g tagged to criterion c
// is met by every action that did not fail c, i.e. its score is
//     met(g) = 1 - rejects[c] / N
// and the run's goal alignment is the mean of met(g) over the entity's goals:
//     alignment = (1 / |G|) * sum over g in G of (1 - rejects[c(g)] / N)
// that is, the share of run actions that meet the acceptance criteria tagged
// to an entity goal, with every goal weighted equally. Goals are never tagged
// to goal_alignment itself (that would be circular). With no goals on record
// the figure cannot be computed and the run keeps its simulated value.

export type GoalCriterion = Exclude<Criterion, "goal_alignment">;
export interface EntityGoal {
  id: string;
  text: string;
  criterion: GoalCriterion;
}

export const GOAL_ALIGNMENT_FORMULA =
  "goal alignment = mean over the entity's goals of (1 - rejects on the goal's criterion / actions in the run)";

const isGoalCriterion = (c: unknown): c is GoalCriterion => (CRITERIA as readonly string[]).includes(c as string) && c !== "goal_alignment";

/** Validate goals read from the database; anything malformed is dropped. */
export const parseGoals = (raw: unknown): EntityGoal[] =>
  (Array.isArray(raw) ? raw : []).flatMap((g) =>
    g && typeof g === "object" && typeof g.id === "string" && typeof g.text === "string" && isGoalCriterion(g.criterion)
      ? [{ id: g.id, text: g.text, criterion: g.criterion }]
      : [],
  );

const r4 = (x: number) => Math.round(x * 10000) / 10000;

/** Alignment of one run against the goals, or null when there are no goals. */
export function goalAlignment(run: Pick<SijilRun, "actions" | "rejects">, goals: EntityGoal[]): number | null {
  if (!goals.length || run.actions <= 0) return null;
  const sum = goals.reduce((s, g) => s + (1 - Math.min(1, run.rejects[g.criterion] / run.actions)), 0);
  return r4(sum / goals.length);
}

/** Replace the simulated goal-alignment figure of each run with the goal-based
 * one (and the matching reject count). Runs are returned unchanged when the
 * entity has no goals. */
export function withEntityGoals(runs: SijilRun[], goals: EntityGoal[]): SijilRun[] {
  if (!goals.length) return runs;
  return runs.map((r) => {
    const a = goalAlignment(r, goals);
    return a === null ? r : { ...r, goal_alignment: a, rejects: { ...r.rejects, goal_alignment: Math.round(r.actions * (1 - a)) } };
  });
}

/** Seed data: five fictitious entities (data/un-use-cases.csv), 3-5 goals each. */
export const ENTITY_GOALS: Record<string, EntityGoal[]> = {
  "Marsa Public Services Authority": [
    { id: "MARSA-G1", text: "Answer licence and permit questions correctly the first time", criterion: "accuracy" },
    { id: "MARSA-G2", text: "Never quote a fee that is not in the published fee table", criterion: "hallucination" },
    { id: "MARSA-G3", text: "An officer releases every message that reaches a citizen", criterion: "human_final_approval" },
    { id: "MARSA-G4", text: "Tell every citizen they are dealing with an AI assistant", criterion: "ai_disclosure" },
  ],
  "Qanat Transport and Mobility Agency": [
    { id: "QANAT-G1", text: "Route and permit answers match the current timetable and rules", criterion: "accuracy" },
    { id: "QANAT-G2", text: "Never invent a service, fare or closure", criterion: "hallucination" },
    { id: "QANAT-G3", text: "A person approves every enforcement or fine notice", criterion: "human_final_approval" },
  ],
  "Raya Education and Skills Council": [
    { id: "RAYA-G1", text: "Eligibility and enrolment guidance is correct", criterion: "accuracy" },
    { id: "RAYA-G2", text: "Never state an accreditation or deadline that does not exist", criterion: "hallucination" },
    { id: "RAYA-G3", text: "A named officer approves every decision about a learner's record", criterion: "human_final_approval" },
    { id: "RAYA-G4", text: "Parents and learners are told when an answer is AI-generated", criterion: "ai_disclosure" },
  ],
  "Sahel Federal Workforce Agency": [
    { id: "SAHEL-G1", text: "Job-matching and benefit-rule answers are accurate", criterion: "accuracy" },
    { id: "SAHEL-G2", text: "Never invent an entitlement or an employer", criterion: "hallucination" },
    { id: "SAHEL-G3", text: "A caseworker approves every decision that affects a benefit", criterion: "human_final_approval" },
  ],
  "Wahat Health Services Authority": [
    { id: "WAHAT-G1", text: "Appointment and service information is correct", criterion: "accuracy" },
    { id: "WAHAT-G2", text: "Never give clinical advice or invent a service", criterion: "hallucination" },
    { id: "WAHAT-G3", text: "A clinician or officer approves every patient-facing message", criterion: "human_final_approval" },
    { id: "WAHAT-G4", text: "Patients are told they are talking to an AI assistant", criterion: "ai_disclosure" },
  ],
};

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** The text of supabase/seed-entities.sql (a test keeps the file in step). */
export function seedEntitiesSql(): string {
  const rows = Object.entries(ENTITY_GOALS).map(([name, goals]) => `    (${q(name)}, ${q(JSON.stringify(goals))}::jsonb)`);
  return [
    "-- Seed: entity goals for goal alignment (C2-10). Generated from ENTITY_GOALS in",
    "-- src/lib/un/goals.ts (tests/un-goals.test.ts checks this file matches).",
    "-- Run after supabase/un-federal-t1.sql. Needs the use cases imported",
    "-- first: it adds one row per entity found in un_use_cases. NOT APPLIED.",
    "insert into public.un_entities (org_id, name, sector, goals)",
    "select distinct u.org_id, u.entity, u.entity_sector, g.goals",
    "from public.un_use_cases u",
    "join (values",
    rows.join(",\n"),
    ") as g(name, goals) on g.name = u.entity",
    "on conflict (org_id, name) do update set sector = excluded.sector, goals = excluded.goals;",
    "",
  ].join("\n");
}
