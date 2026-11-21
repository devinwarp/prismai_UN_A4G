# Edits to shared files (tuning workstream)

New code lives in `src/lib/un/` (react-config, tuning-bank, tuning-fix, tuning-versions, tuning-service, kb-store*), `src/app/admin/federal/tuning/`, `src/app/api/admin/un/tuning/`, `supabase/un-sop-kb.sql` and `docs/sop-kb-hosting.md`. Edits to files that already existed:

- `src/lib/un/react-sop.ts`: glossary, routing and thresholds read from a `ReactConfig` (default reproduces the old constants); `ruleReasoner` kept, `makeRuleReasoner` added; `ReactOptions.config`.
- `src/lib/un/sop-rules.ts`: `loadRules` takes an optional config.
- `src/lib/un/analyst-agent.ts`: `Tools.react`, `OpenOptions.skillRules` (rule lines appended to the skill after extraction).
- `src/lib/un/task-evals.ts`: `EvalEnv.react` and `EvalEnv.skillRules`.
- `src/lib/un/i18n/dict.ts`: spreads `TUNING_AR` (draft Arabic).
- `src/app/admin/federal/FederalPanel.tsx`: one entry in `GO` linking the tuning screen.
- `src/app/admin/federal/use-cases/[id]/tuning/page.tsx`: a "real agent" section for UC02.
