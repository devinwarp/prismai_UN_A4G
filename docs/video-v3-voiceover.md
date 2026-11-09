# Live-demo video v3: voiceover and captions (about 4 minutes)

For ITU AI for Good (UAE). Trimmed from the section 9 storyboard of `docs/IMPROVEMENT_PLAN.md`. Shameer records from the deployed app after the Monday merge (screen at 1080p, browser zoom 125–150%, cursor highlight, burned-in captions). If the recording is not done by the submission cut-off, submit without it or with the current video plus the two caption fixes below; v3 is for the 18 Nov shortlist.

All entities and data are fictitious. Sijil is simulated.

## Caption fixes for the current video (do these regardless)

1. Wherever a caption reads "policer", change it to **"policy (P)"**. In ITU-T Y.3172 the P node is the policy node.
2. Wherever the video says "by 30 April 2028", change it to **"≈ April 2028 (two years from 23 Apr 2026, assumed)"**. The Cabinet said "within two years"; no date was published.

## Do not show yet

Shameer has applied the database migration and tested it (a manual verdict, a manual compliant flag and TRUNCATE are all rejected), and the live app at https://prismai-un.vercel.app now shows UC01 and UC02 as signed and attested. So these are safe to show on the live app:

- **Sign / Withhold** button (D-2): the live dashboard's 2 of 20 deployed and 2 of 20 compliant come from signed runs. You may show the button on a finished S1 run, but sign only on a rehearsal copy: do not sign a new use case on camera, because it changes the dashboard numbers quoted in the voiceover.
- HITL rules loading into runs (D-4): the run page can cite the entity's rule id at T2, as the T2 row says.

Still do not show, or confirm on screen before you say it (cut the line if the control is not there):

- Goal list on the use-case page and goal-based alignment: needs `supabase/seed-entities.sql` to have been run. Check the use-case page first.
- The knowledge-base explorer page and the gap page do not exist yet (plan C1-9, C3-1). The KB is shown through its JSON endpoint; the gaps are shown from the report.
- Vector search: it is off in the live app and BM25 is the default. Do not say or imply that retrieval is vector or hybrid.

## Script

Words are spoken at about 150 per minute. Captions are the bold line; keep each under 12 words.

| Time | Screen | Caption | Voiceover |
|---|---|---|---|
| 0:00–0:20 | Title card, then the live federal dashboard (2 of 20 deployed, 2 of 20 compliant) | **Deploying agents is easy. Proving them safe is hard.** | "The UAE aims to run agentic AI across half of government within about two years. Deploying an agent is easy. Proving it is safe is hard. Prism is the approval and assurance layer between the two. On the live dashboard today, two of twenty use cases are deployed and two are compliant. The target is ten." |
| 0:20–0:40 | README architecture diagram (Y.3172 nodes) | **Built on ITU-T Y.3172 · runs with no paid keys** | "Prism follows the Y.3172 pipeline. Role agents are the model node. The policy engine is the P node, the policy node, and it alone decides. It runs in deterministic mode with no paid keys." |
| 0:40–1:05 | Federal > Policy, then Import (drop `data/un-use-cases.csv`) | **Policy is configuration. Target 50%, deadline ≈ April 2028 (assumed).** | "The policy sets the target, the counting rule and the deadline, which is our assumption, two years from the Cabinet's twenty-third of April announcement. We import twenty fictitious use cases from five entities. Importing keeps the two signed verdicts: two deployed, two compliant, UC01 and UC02, against a target of ten." |
| 1:05–1:25 | Tab: `/api/admin/un/kb?q=...` | **Retrieval returns source, link, hash and quote** | "The knowledge base is built with ITU's pipeline. Each hit carries its source link, a SHA-256 of the source and a verbatim quote. **[Check the query before recording; use one whose top hit is a UAE source.]**" |
| 1:25–2:35 | Scenarios > S1 run: release T0 to T4 | **S1: client-facing, autonomy requested** | "Scenario one is a trade licence pre-check. Autonomy is requested for a citizen-facing case." |
| | Run page: Expected vs actual, then "What each agent knows" | **Each agent sees only some events** | "Each step releases events to only some agents. This panel shows what each one knows. Security never sees the approval failure." |
| | T0, then T1 | **T0 ESCALATE · T1 NO_GO** | "At T0 the coordinator asks the owners for missing evidence. The verdict is escalate. At T1 the model endpoint is not on certified hosting. A challenge goes to the affected roles. Failed gate, so no go." |
| | T2: trace record citing the HITL rule id | **T2: human-in-the-loop rule breached → NO_GO** | "At T2 the agent sends messages without an officer. That breaches the entity's rule, a hard failure of the human approval gate. Two open failures, so the case is escalated to a person." |
| | T3, T4, then expected-vs-actual table | **T3 ASSISTANT_ONLY · T4 GO_SUPERVISED · 5 of 5 match** | "Fixes declared but not retested give assistant only. Both retests pass and the case lands at supervised, the ceiling for citizen-facing use. Five of five steps match the expected outcome." |
| 2:35–3:00 | S2 run, steps released quickly | **S2: every event changes the outcome** | "Scenario two is a live voice pilot. A hallucination alert is contained and the case drops to assistant only. A complaint adds a fee accuracy gate and fails. A transparency requirement re-tests disclosure and fails. Fixes, retests, and it returns to supervised with the new gates permanent." |
| 3:00–3:20 | S3 run, T1 to T3 | **Sandbox scenario: 6/20 deployed · 4/20 compliant · target 10** | "Scenario three is the federal view, run on a sandbox copy of the data, not the live numbers. In the scenario, six are reported deployed and four attested compliant. Deployed and compliant are never merged. A policy update flags four use cases for re-scoring. The live dashboard is unchanged: two of twenty deployed, two compliant." |
| 3:20–3:40 | Terminal: `npm run verify-log run.json` (good export, then an edited copy) | **Tamper with one record: the verifier names it** | "Every record is hash-chained. This verifier runs offline, with no database. On an untouched export it passes. Change one word and it names the broken record." |
| 3:40–3:55 | Report page with the gap table (six categories) | **Gaps from the mapping, with global examples** | "Where UAE material is silent, we record the gap and attach a global example: oversight levels, approval authority, citizen recourse, measurement, and cross-entity data sharing." |
| 3:55–4:15 | Honest-limits slide, repository URL | **Sijil simulated · deterministic mode · AGPL-3.0** | "Limits: Sijil is simulated. Agents were evaluated in deterministic mode. Retrieval is lexical for now. All data is synthetic. The code is open source under AGPL." |

## Before recording

- `npm test` is green and `npm run verify-log` works on an export you saved from a finished S1 run.
- The deployed site is the post-merge build; the migration is applied; run S1, S2 and S3 once to rehearse, then start the take on fresh runs.
- Say "Sijil is simulated" aloud; never imply a live attestation.
- Keep one clean take of each section as backup footage.
