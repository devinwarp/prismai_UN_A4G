# Shared-file edits (gates and governance as data)

New code lives in `src/lib/un/gates*.ts`, `src/lib/un/governance.ts`, `src/app/admin/federal/gates/`, `data/un-governance.json`, `supabase/un-gates.sql`. Edits to existing files:

- `src/lib/un/policy.ts`: `GATES` now seeded from `data/un-governance.json`; `GateId` is `string`; `decide()` gains optional `catalog`, `useCaseGates`, `waived` (old calls unchanged); `applicableGates` gains optional `catalog`.
- `src/lib/un/rulesets.ts`: the three rule sets are seeded from the same file.
- `src/lib/un/protocol.ts`, `round.ts`, `scenario.ts`, `trace.ts`: optional added/waived gates on `CaseState`, `RunEnv.effective`, `effective_gates` on verdict trace records (only when a use case adds or waives gates, so existing logs and hashes are unchanged).
- `src/lib/un/compare.ts`, `src/app/admin/federal/compare/page.tsx`: "N gates added" per process.
- `src/app/admin/federal/page.tsx`, `FederalPanel.tsx`: "N gates added" on the dashboard; link to the gates page.
- `src/app/admin/federal/use-cases/[id]/page.tsx`: gates section.
- `src/app/admin/federal/_components/ui.tsx`: `Section` eyebrow/title accept nodes.
- `src/app/api/admin/un/runs/[id]/route.ts`, `runs/[id]/adhoc/route.ts`: pass the effective gates into the run.
- `src/app/api/admin/un/use-cases/[id]/tuning/approve/route.ts`: approval also needs every effective gate to pass when the use case has added gates.
- `src/lib/un/i18n/dict.ts`: spreads `gates-ar.ts`.
- `src/lib/supabase/offline.ts`: minimal `like()` so the use-case page loads offline.
# Shared-file edits (journey bar and job profiles)

- `src/app/admin/federal/use-cases/[id]/{page,evals/page,tuning/page,production/page}.tsx`: AdminHeader and the page wrapper moved into the new `layout.tsx` (which adds the journey bar); the redundant evals/tuning text links on `page.tsx` removed.
- `src/app/admin/federal/_components/Lang.tsx`: one line, fires a `prism-un-lang` event so the bar (outside the page's LangShell) follows the language toggle.
- `src/app/admin/federal/FederalPanel.tsx`, `federal/page.tsx`, `federal/evals/page.tsx`: compact journey line (new Journey column and prop).
- `src/app/admin/federal/sop/{page,SopWorkbench}.tsx`: attach SOP-LIC-014 to UC02.
- `src/lib/un/i18n/dict.ts`: spreads `JOURNEY_AR`.
- `src/lib/un/sop/{data,reference}.ts`, `data/sop-baseline.json`: SOP-LIC-014 as a fourth sample (Annex excluded); `flagsOfText` export and the cue "tell".
- `scripts/extract_skill.ts`: now calls `src/lib/un/skill-extract.ts`.
- `tests/un-sop.test.ts`: four samples.
- New SQL: `supabase/un-profiles.sql` (applied to the hackathon Supabase project on 21 Nov 2026; not yet exercised by the app).
# Edits to shared files (tuning workstream)

New code lives in `src/lib/un/` (react-config, tuning-bank, tuning-fix, tuning-versions, tuning-service, kb-store*), `src/app/admin/federal/tuning/`, `src/app/api/admin/un/tuning/`, `supabase/un-sop-kb.sql` and `docs/sop-kb-hosting.md`. Edits to files that already existed:

- `src/lib/un/react-sop.ts`: glossary, routing and thresholds read from a `ReactConfig` (default reproduces the old constants); `ruleReasoner` kept, `makeRuleReasoner` added; `ReactOptions.config`.
- `src/lib/un/sop-rules.ts`: `loadRules` takes an optional config.
- `src/lib/un/analyst-agent.ts`: `Tools.react`, `OpenOptions.skillRules` (rule lines appended to the skill after extraction).
- `src/lib/un/task-evals.ts`: `EvalEnv.react` and `EvalEnv.skillRules`.
- `src/lib/un/i18n/dict.ts`: spreads `TUNING_AR` (draft Arabic).
- `src/app/admin/federal/FederalPanel.tsx`: one entry in `GO` linking the tuning screen.
- `src/app/admin/federal/use-cases/[id]/tuning/page.tsx`: a "real agent" section for UC02.
# Edits to shared files (agent-runtime area)

Files that existed before the agent-runtime work and were edited. Everything else is new.

- `src/lib/un/i18n/dict.ts`: imports and spreads `AGENT_RUNTIME_AR` (two lines).
- `src/app/admin/federal/FederalPanel.tsx`: one entry in the `GO` list linking to `/admin/federal/outside`.
- `src/app/admin/federal/use-cases/[id]/evals/page.tsx` and `.../production/page.tsx`: render `AgentRuntimePanel` for use cases that have an SOP-driven agent (UC02).
- `src/lib/un/react-sop.ts`, `analyst-agent.ts`, `doc-ocr.ts`, `case-memory.ts`, `sop-rules.ts`, `task-evals.ts`, `fixtures-uc02.ts`, `scripts/make_synthetic_docs.ts` (agent-runtime code written by the earlier branch, extended here).
- `data/sops/fixtures/uc02/docs/ocr-cache.json`: new entries for the new synthetic images (existing entries untouched).

New migration: `supabase/un-outside-queue.sql` (applied to the hackathon Supabase project on 21 Nov 2026). `supabase/schema.sql` is untouched.
