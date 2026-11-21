# Shared-file edits (journey bar and job profiles)

- `src/app/admin/federal/use-cases/[id]/{page,evals/page,tuning/page,production/page}.tsx`: AdminHeader and the page wrapper moved into the new `layout.tsx` (which adds the journey bar); the redundant evals/tuning text links on `page.tsx` removed.
- `src/app/admin/federal/_components/Lang.tsx`: one line, fires a `prism-un-lang` event so the bar (outside the page's LangShell) follows the language toggle.
- `src/app/admin/federal/FederalPanel.tsx`, `federal/page.tsx`, `federal/evals/page.tsx`: compact journey line (new Journey column and prop).
- `src/app/admin/federal/sop/{page,SopWorkbench}.tsx`: attach SOP-LIC-014 to UC02.
- `src/lib/un/i18n/dict.ts`: spreads `JOURNEY_AR`.
- `src/lib/un/sop/{data,reference}.ts`, `data/sop-baseline.json`: SOP-LIC-014 as a fourth sample (Annex excluded); `flagsOfText` export and the cue "tell".
- `scripts/extract_skill.ts`: now calls `src/lib/un/skill-extract.ts`.
- `tests/un-sop.test.ts`: four samples.
- New SQL: `supabase/un-profiles.sql` (not applied).
