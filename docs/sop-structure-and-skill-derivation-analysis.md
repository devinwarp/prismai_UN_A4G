# Can a loosely written SOP yield job profiles and skills? And what is in a skill?

Analysis of 2026-11-27 on `main` at 3df1079 (branch `analysis/sop-structure-and-skill-derivation`). Everything below was measured with the repo's own functions on synthetic text: `customSopFromText` (what the upload does), `liveChunks` (the knowledge base) and `skillFromChunks` (what ticking Automate builds). Nothing was written to any database.

## 1. Can job profiles and skills be derived from an SOP that is not well structured?

**Job profiles: sometimes, heuristically. Skills: no.** Eleven SOPs were tried.

| SOP | Profiles derived at upload | Skills built |
|---|---|---|
| UC09 official (strict Prism format) | 5 (tasks T01..T20) | 5 of 5 |
| UC12 official (strict format) | 4 | 4 of 4 |
| fee-waiver and records-archive samples (plain numbered steps) | 4 and 2 (tasks S2, S4, ...) | **0 of 4, 0 of 2** |
| Narrative prose | 6 (names drift: "Coordinator", "Approving officer", plus a profile for the requester "Hiring manager") | **0 of 6** |
| Numbered list, no headings | 5 | **0 of 5** |
| Who-does-what table | 5 (one task each; "HR" lost from "HR approving officer") | **0 of 5** |
| Role words outside the analyzer's vocabulary (recruiter, talent partner, hiring lead, HR specialist, assistant) | **upload refused**: "No job profiles could be found" | none |
| Near-strict ("T01 -" and a plain "Job profile:" line) | 2 | **0 of 2** |
| Strict, but one task has no `**Job profile:**` line | 2; **that task is silently dropped** from every profile | 1 of 2 (the other profile has no role section) |
| Headings "Step 1:" per phase | 3 | **0 of 3** |

Why:
- **Profiles** come from two paths (`sop/profiles.ts`). The strict path needs `### T01.` task sections with a bold `**Job profile:**` line. Anything else falls to the rule analyzer (`sop/reference.ts`), which finds actors with a fixed list of role words (clerk, officer, supervisor, manager, reviewer, inspector, committee, chair, analyst, coordinator, registrar, cashier, director) and treats each numbered line, bullet or sentence as a step. Derived tasks get ids `S1, S2, ...`, not `T01`.
- **Skills** are assembled from chunks (`sop-kb.ts` `skillFromChunks`): they need a role section (`### 3.x <Role>`) and task chunks (`### Txx.` with `**Job profile:**`), plus controls (section 7) and escalation (section 8). A loosely written SOP produces a knowledge base of only "overview" chunks, so every skill fails with "no job profile named X".
- The optional model pass (`sop/llm.ts`) can only fill a missing actor or system, and the upload does not use it at all.
- The user-facing result is confusing: the upload succeeds, the knowledge base reads "ready" (it has vectors), and only the tick fails, with an unexplained "no job profile named ...".

**So a structuring step is needed** for anything that is not already in the Prism format.

### A model-assisted restructuring works (prototype, scratch only)
A model (the configured Bedrock model) was told to rewrite the source into the canonical template using only what the source says, writing "Not stated in the source." for anything missing. Then the same derivation was run.

| Source | Time | Profiles | Skills |
|---|---|---|---|
| Narrative prose | 27 s | 7 | 7 of 7 |
| Numbered list | 19 s | 5 | 5 of 5 |
| Role words outside the vocabulary (refused before) | 7 s | 5 | 5 of 5 |

No invented figures (the only "new" numbers were section numbers). It is honest about gaps: 26 to 51 "Not stated in the source" placeholders per SOP (purpose, authority, controls, escalation). Faults seen: a spurious profile "Panel" next to "Panel chair" in the prose case, and the requester "Hiring manager" kept as a profile. So the restructured SOP must go to a person to review, like the targets draft: the model drafts, a person confirms.

Suggested design (not built): an SOP structuring step at upload. (1) Model proposes a structured model (roles, tasks with an id, exactly one job profile each, inputs, steps, outputs, problems, controls, escalation) constrained to quote the source. (2) Deterministic checks: every source step is assigned to one profile, names are canonical, ids unique, nothing silently dropped, a coverage figure. (3) A side-by-side review screen (source, extracted, gaps flagged); a person edits and approves. (4) The approved result is rendered as the canonical Markdown that the existing chunker already understands, and the original is kept. Without a model, at least: warn at upload when the SOP will not yield skills, expand the role vocabulary, and stop dropping tasks silently.

## 2. How skills are derived, and is a skill complete?

**What is derived (`extractSkill` / `skillFromChunks`).** Verbatim from the SOP's own chunks, deliberately with no wording of ours: front matter (name, SOP, version, source hash), a fixed "Before you act" procedure, the profile's role and authority section, each of its tasks (starts when, inputs, steps, output, problems), all the SOP's controls, the escalation table. The skill hash binds the tests and the pilot to the SOP version.

**Is it all the instructions the agent needs? Not on its own.**
- Missing from the skill: the output contract (the JSON structure, citation rule and `needs_human` live in the pilot runner's system prompt, `sop-pilot.ts`), language and tone, disclosure (appended by code), what to do under uncertainty beyond one sentence, and any statement of what the agent may call.
- **No tool allow-list in the skill.** The only tool named is `request_outside_information`; `search_sop` and `finish` are not mentioned. The only allow-list in the code is the constant `REACT_TOOLS` (`search_sop`, `request_outside_information`, `finish`) enforced by `checkAction` for UC02's ReAct answer loop, the same for every profile. UC02's executor has its own hard-wired capabilities (`Tools`: OCR, licence record, registry, payments). The new generic pilot gives the model passages and takes JSON back; it uses no tools and tells the model never to claim one. The systems an SOP names are detected per step (`detectSystems`) but are not used anywhere in skills.
- The skill and the runner can disagree: the skill tells the agent to call a tool and retrieve, while the generic pilot runs without tools. The pilot job pins the skill hash, tests, thresholds and model, but not the runner's system prompt, so a prompt change alters behaviour without changing any hash.
- Defect: the "Before you act" text is UC02's licensing vocabulary in every skill ("permit" is "licence", "papers" is "documents", "tenancy" is "lease", "the fee table"), even for recruitment.
- Task headings keep only the id (`### T04`); the title is dropped.
- A skill is only as good as the SOP's own role section: "Authority: may ... May not ..." is copied from section 3.x if it exists.

**Do we need a better process? Yes.** Proposed (not built): a skill compiler from a structured SOP model rather than from chunk text.
1. Identity and purpose, from the role description.
2. Authority as data: may, may not, human-only decisions (also the source for the `profile_task_authority` check that is hard-coded today).
3. Tasks with id, title, trigger, inputs, steps, output, problems, escalation target, flags.
4. A tool manifest, the allow-list: each tool with purpose, input and output, permission (read, write, send), whether a person must release its output, and the SOP line that justifies it. Defaults are read-only (`search_sop`, `request_outside_information`); a system the SOP names only becomes a tool when the entity registers an integration. One runtime gatekeeper (a generalised `checkAction`) enforces it; a denied call is logged.
5. Output contract, language, disclosure and uncertainty rules.
6. Controls and escalation (profile-scoped and global).
7. Provenance and a validation report: every task of the profile present, no empty authority, every tool justified. The rendered Markdown and the manifest are hashed together, and a person approves the skill before Automate counts.

## 3. Status: built on `analysis/sop-structuring-skill-compiler` (2026-11-27)

- **Structuring with a review screen.** `sop-structure.ts` (shape follows the process-doc skill's SOP template: purpose, scope, RACI, steps, exceptions, metrics, in the Prism task layout), `sop-structure-agent.ts` (the model drafts; **TESTGEN_MODEL**), `sop-structure-store.ts` + `supabase/un-sop-structure.sql` (append-only log, not applied), route `sop-structure`, and the review screen `SopStructure.tsx` on the use case's SOP page: source and structure side by side, checks against the source (quotes, figures, coverage), gaps shown as gaps, edit, then approval by a person. Approval publishes the canonical Prism Markdown as a new version (or the SOP, when none is attached); the original stays in the log.
- **Skill compiler** (`skill-compile.ts`): for an SOP that was structured and approved, a profile's skill is compiled (identity, authority as data, how to work, uncertainty, output contract, language and disclosure, tool allow-list, controls, escalation, provenance) with a validation report; a role with no stated authority gets no skill. The same TESTGEN_MODEL reviews each compiled skill against the structure (advisory). SOPs that were not structured keep their existing skills, so no existing hash changes.
- **Tool allow-list.** Each compiled skill carries a manifest (default: `search_sop`, `request_outside_information`, `finish`; extra tools only from registered integrations, a write or send tool must be released by a person). The pilot runner now checks every `output.tool_requests` against it (the default list for skills without a manifest); a denied request fails the test and is kept in the output.
- Not done: the upload still refuses text with no recognisable roles (it should offer structuring instead); the role vocabulary was not widened; entity-registered integrations that add tools; applying `un-sop-structure.sql` to the hosted database.
