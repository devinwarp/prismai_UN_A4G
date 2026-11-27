# Front-end journey check, 26 Nov 2026

Branch `feat/scoped-roles-agent-inbox` (up to date with origin). Unit tests: 793 run, 792 pass, 0 fail, 1 skipped. `tsc --noEmit` clean.

Where tested:
- `:3000` is `next dev` against the hosted project. Only the public pages were checked there, and nothing was written.
- `:3100` is `next start` offline, entered as the one-click judge.
- Another session was committing during the check, and `:3100` was rebuilt partway through.

## Contradictions on the federal dashboard (`/admin/federal`)

1. **UC02 journey disagrees with itself.** Stage is `approved`, and Pilot evals, Tuning and Approval show Done. But SOP intake and Verdict show "Needs you", and the summary reads "Journey: 3 of 9 · Next: SOP intake". A use case can't be approved while its first step is still open.
2. **Alignment headline vs column.** The headline says "Aligned 0% · 0 of 20 use cases", while the ALIGNED column shows ✓ on every row. The note under the table says alignment is assumed until Sijil is integrated. The headline and the column should use the same rule.
3. **Knowledge base numbers measure different scopes, and neither label says so.** Both numbers are correct; only the labels are missing.
   - The dashboard's "KB · 258 chunks · 21 sources" is the UAE view: UAE-federal (7 sources, 57 passages), Dubai (6, 40) and international (8, 161).
   - The landing's "40 sources, 457 passages" is the whole library. That adds Singapore (10, 77), EU (6, 35), US (1, 71), India (1, 9) and Africa-regional (1, 7).
   - UAE and Singapore together would be 31 sources and 335 passages.
   - Fix: on the dashboard, write "UAE knowledge base: 21 sources, 258 passages". On the landing, write "across 8 jurisdictions", or break it down per country.
4. **"Needs you" shown to a read-only judge.** The journey steps, "Add missing targets" in the setup journey, and "Run scenario S1" all invite actions the judge can't take.
5. **Start-here numbering.** Steps 1 and 2 are numbered, but the items after them ("Tune the agent", "Run a scenario", …) aren't, so it's unclear whether the list has 2 steps or 8. The copy also says "three steps".

## Other issues

6. **Demo entry on `:3000` asks for a password.** "Enter the live demo" promises "One click. No sign-up", but opens the email/password dialog with no explanation. The cause is that `JUDGE_LOGIN_EMAIL`/`PASSWORD` aren't set locally. The dialog should show the "one-click entry is not available" message and point to the replay. On the live site it depends on Shameer's hosting settings.
7. **Compare jurisdictions is a 404 for the judge.** The dashboard links it twice (the "Compare jurisdictions" tile and start-here step 3), but `canCompareCountries` only allows the super user or the `viewer` role, so the judge gets "404 This page could not be found". The commit says judges see every read-only feature.
8. **People page stuck on "Loading…"** as the judge on `:3100`. It made no API request and logged no console error after 6 seconds. Not yet diagnosed.
9. **Inbox shows write controls to the read-only judge.** These are "Put away", "Mark as read", the agent On switch, and "Daily limit … Save". It's not yet checked whether the API refuses them. The six items are all "For your information"; for the judge that's fine, but "Process targets: approval needed for UC02" is filed as Informed.

## Works

- The landing page loads with no console errors and no sideways scroll. It has one H1, and all its internal links return 200.
- The tamper demo breaks records 3–6 and offers "Restore the original".
- The one-click judge entry on `:3100` lands on the dashboard.
- These pages return 200 for the judge: inbox, country, goals, gates, sop, scenarios, kb, gaps, outside, tuning, evals, replay, and the use-case pages.

## Not yet covered

- Signed-in roles other than the judge (entity admin, governance admin, process owner) via the offline "Sign in as" picker.
- Arabic and RTL.
- Phone width on admin pages.
- The scenario run and sign flow.
- The RACI page added in `c09d058`.
