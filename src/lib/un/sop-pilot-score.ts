import type { SopPilotRound } from "./sop-pilot.ts";

// The scoring of one round, apart from sop-pilot.ts so the pilot screen (a client component) can use it without pulling the model client into the browser bundle.
export function roundScore(round: SopPilotRound, caseCount: number) {
  const functional = round.results.filter((r) => r.sijil?.source !== "simulated");
  return {
    complete: caseCount > 0 && round.results.length === caseCount,
    passed: round.results.filter((r) => r.passed).length,
    score: caseCount ? round.results.filter((r) => r.passed).length / caseCount : 0,
    functionalScore: functional.length ? functional.filter((r) => r.passed).length / functional.length : 0,
    hardFailure: round.results.some((r) => r.hardFailure),
  };
}
