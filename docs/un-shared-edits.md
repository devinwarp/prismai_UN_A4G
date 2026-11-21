# Edits to shared files (agent-runtime area)

Files that existed before the agent-runtime work and were edited. Everything else is new.

- `src/lib/un/i18n/dict.ts`: imports and spreads `AGENT_RUNTIME_AR` (two lines).
- `src/app/admin/federal/FederalPanel.tsx`: one entry in the `GO` list linking to `/admin/federal/outside`.
- `src/app/admin/federal/use-cases/[id]/evals/page.tsx` and `.../production/page.tsx`: render `AgentRuntimePanel` for use cases that have an SOP-driven agent (UC02).
- `src/lib/un/react-sop.ts`, `analyst-agent.ts`, `doc-ocr.ts`, `case-memory.ts`, `sop-rules.ts`, `task-evals.ts`, `fixtures-uc02.ts`, `scripts/make_synthetic_docs.ts` (agent-runtime code written by the earlier branch, extended here).
- `data/sops/fixtures/uc02/docs/ocr-cache.json`: new entries for the new synthetic images (existing entries untouched).

New migration: `supabase/un-outside-queue.sql` (not applied anywhere). `supabase/schema.sql` is untouched.
