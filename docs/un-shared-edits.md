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
