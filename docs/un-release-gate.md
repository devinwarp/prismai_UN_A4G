# The release gate: approval and go-live need a met pilot

Approval and production used to need only a certified agent version and passing gates. A stage could also be set by hand to "approved" or "deployed", and a pilot that escalated, with unmet goals, did not stop either. Now both need a **met pilot**.

## What "met" means

For every job profile ticked to be automated (`src/lib/un/release-gate.ts`, `releaseReadiness`; pure, loaded by `release-store.ts`):

1. A pilot exists and ran under the test set and verdict parameters that are approved **now** (a changed set or thresholds make it stale).
2. Goal alignment was judged and a person approved the judgments; the report recomputed with them is the one that counts.
3. The report is conclusive and no threshold fails.
4. No generated case is left disputed without a ruling, and none is ruled an agent failure.

And for the use case:

5. It has approved process targets (`src/lib/un/targets.ts`).
6. Every pilot-measured target can be proven by the pilot: it feeds a verdict parameter or carries a per-test check. A target only a live service can show (satisfaction) is marked go-live.
7. The approved parameters are at least as strict as the targets they feed (a 98% accuracy target cannot rest on a 90% threshold). Only percentage targets on rate parameters are compared.
8. Every control target (a compliance rule such as "an officer releases every message") was checked on the pilot's tests and held on all of them. A person's override of a test clears it; a control asked of no test is "not proven", never met.

## Where it is enforced

- **Approval** (`POST .../tuning/approve`, SIGN): refused with 409 and the blockers. The signature entry records the reports it covers (profile, report hash, test-set hash, parameters hash, pilot id) and the hash of the approved targets, so what the process owner signed is on the record.
- **Go-live** (`POST .../watchdog`, deploy): the same check again, since the pilot may have gone stale after the approval.
- **Manual stage change**: `PATCH .../use-cases/[id]` refuses `approved` and `deployed` (guard.ts); the dashboard menu does not offer them.
- **Journey bar**: a certified agent whose pilot is not met shows "needs you: the pilot is not met yet" instead of "sign". Worked out for a single use case's own pages only.
- **Screens**: the approval and production pages show the readiness with each blocker and a link to where it is fixed; `GET .../release` returns the same answer.

## Not covered

- A signed scenario run with a GO verdict still sets the stage label to "deployed" (`verdictPatch`, guard.ts). The production state itself (the watchdog log) is gated, and the journey reads that, not the label.
- A confirmed `agent_wrong` ruling does not yet feed the tuning cycle.
- The release approval is the existing tuning approval; there is no separate "report approved" record. A distinct signature of the final report by the process owner would need its own log.
- The gate reads what the pilot measured. A model-driven agent's pilot takes minutes and is not a background job yet.
