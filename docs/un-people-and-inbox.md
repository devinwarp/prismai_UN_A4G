# People, roles and the agent inbox: runbook for the hosted project

This is for whoever applies the database changes and creates the test accounts on the hosted Supabase project (Shameer), and for the person who then tests the process (the owner of the repo). Nothing here has been run against the hosted project yet: the hosted project has not had the two SQL files applied, and it has none of the test accounts. The code works without the SQL (it reads every column, treats a missing table as empty, and never throws because of it), so merging the code before the SQL is safe, but the new features do nothing until the SQL is applied.

## 1. What this adds

- **Scoped roles.** A role can be held for the whole organisation, a **country**, an **entity** (in its country) or one **use case**. New role `entity_admin`.
- **Approval moves.** Approving process targets, test sets and verdict parameters (`scenario.approve`) belongs to the **governance admin** of the country. The business (process) owner proposes and can no longer approve. A legacy `admin` login still holds every role, so nobody is locked out.
- **Agent inbox.** Every user has an inbox and an agent. Information is for people. An explicit decision (approve targets, test sets or the agent version, sign a verdict, deploy, waive or accept a gate, approve goal judgments, request a rerun) is always a person's. The agent does the Responsible work inside the person's permissions; anything it is refused, or fails three times, goes to the person with the reason. An unanswered human item escalates after two working days.
- **People agent.** After SOP intake it finds positions nobody holds (process owner, operator, SOP job profiles by job title) and countries with entities but no governance admin, and raises an item to the entity admin (action) and the platform admin (information), or to the platform admin as an action when there is no entity admin.

### Roles and where they can be held

| Role | May be held for | What it does |
|---|---|---|
| `platform_admin` | the organisation | assigns roles anywhere; informed of everything; takes a request when no one else can |
| `governance_admin` | the organisation, a country or an entity | approves targets, test sets and verdict parameters; its job title must be exactly **Head of AI governance** |
| `entity_admin` | one entity (in its country) | sets up the entity (goals and criteria, use case list, SOPs), creates users and gives process owner, test author, operator and viewer roles for its own entity, runs everything under it; approves nothing |
| `process_owner` | the organisation or one use case | proposes targets and test sets; approves the agent version, goal judgments, verdicts, deployment (people decide) |
| `operator` | the organisation, an entity or one use case | runs pilots, tuning, deployment steps |
| `test_author` | the organisation, an entity or one use case | proposes scenarios and tuning changes |
| `viewer` | the organisation | read only (the judge) |

## 2. Before you start

1. **Take a backup** (Supabase dashboard, Database, Backups, or a point-in-time marker). Both SQL files only add; nothing existing is changed or removed, but the accounts step creates real sign-in users.
2. The two SQL files are in `supabase/`. They have been checked by reading, by tests that read the text, and against the offline store. **They have not been run on Postgres.** Read them once before applying (about 100 lines in all).
3. Apply them in this order. Both are idempotent (`if not exists`, `drop ... if exists`), so a second run is harmless.

## 3. Step 1: apply the SQL

Run in the Supabase SQL editor (or `supabase db push` if you use migrations), in order:

1. `supabase/un-scoped-roles.sql`: adds `scope_country` and `scope_entity` to `un_role_assignments`, adds `entity_admin` to the role list, allows one scope per assignment, and rebuilds the live-assignment unique index so it knows the new columns.
2. `supabase/un-agent-inbox.sql`: creates `un_inbox_items`, `un_raci_overrides`, `un_agent_settings` and `un_agent_log` (all with row level security on, service role only, like the other `un_` tables).

Check it took, read-only, from the repo:

```
node scripts/seed-test-accounts.mts --hosted --check
```

It prints `SQL applied: ...` or lists exactly what is missing. (Before the SQL it prints the missing columns and tables.) You can also confirm in SQL:

```sql
select column_name from information_schema.columns
 where table_name = 'un_role_assignments' and column_name in ('scope_country','scope_entity');   -- 2 rows
select count(*) from information_schema.tables
 where table_name in ('un_inbox_items','un_raci_overrides','un_agent_settings','un_agent_log');   -- 4
select conname from pg_constraint where conname in ('un_role_assignments_role_check','un_role_assignments_one_scope_check');   -- 2 rows
```

## 4. Step 2: create the test accounts

The roster is in `src/lib/un/test-roster.ts` (print it with `node scripts/seed-test-accounts.mts --plan`): **29 new fictitious accounts** (`*.example` addresses) and, optionally, new passwords for the 20 existing process owners.

| Who | How many | Job position (how the SOPs and approver lists match them) |
|---|---|---|
| Federal super admin (`super.admin@federal.example`) | 1 | Director, Federal AI Governance; login role `platform`, federal member, `platform_admin` |
| Platform admin | 1 | Platform Administrator |
| Governance admin for the UAE | 1 | **Head of AI governance** (exact) |
| Judge (read-only demo account) | 1 | Demo Judge |
| Entity admin, one per entity | 5 | AI Programme Director |
| Test author, one per entity | 5 | AI Quality and Test Lead |
| Operators | 15 | the position of each use case (for example UC02: Licensing Supervisor) |

**Five operator positions are left unfilled on purpose** (UC04, UC07, UC11, UC15, UC19), so the People agent has something to raise to the entity admins and the platform admin.

Run it in three steps. It uses the service role key in `.env.local` and never prints a key or a password.

```
# 1. read-only: is the SQL there, and what would change?
node scripts/seed-test-accounts.mts --hosted --check

# 2. dry run (the default): prints exactly what --apply would do, writes nothing
node scripts/seed-test-accounts.mts --hosted --reset-owners

# 3. apply. The credentials file must be OUTSIDE this repository and must not exist yet.
node scripts/seed-test-accounts.mts --hosted --apply --reset-owners --credentials-out "C:/Users/<you>/Documents/prism-test-credentials.csv"
```

What `--apply` does, in order: creates each missing account in the sign-in service (email confirmed, random password), upserts its profile (job position, login role, organisation), grants the roles at the right scope, adds the federal member, then (with `--reset-owners`) sets a new random password on each of the 20 process owners. Passwords are written to the CSV **only**, one line at a time as they are made. It refuses to run unless the SQL is applied and the credentials path is outside the repo.

It is safe to run again: people who exist are kept (their login role is never changed; a missing job position is filled in), a role already held is not granted twice, and a failed run says where it stopped; re-run with a **new** `--credentials-out` file and it picks up from there. The CSV file has columns `email,password,job_title,roles`. Give it only to the people who test, then delete it.

## 5. Step 3: host settings

Set these where the app is hosted (they are not in the repository):

| Setting | Value | Why |
|---|---|---|
| `FEDERAL_SUPER_USER_ID` | the user id of `super.admin@federal.example` (`select id from profiles where email = 'super.admin@federal.example'`) | the one person who opens Federal Compare as the designated super user (needs login role `platform`, which the seed sets) |
| `JUDGE_LOGIN_EMAIL` and `JUDGE_LOGIN_PASSWORD` | `judge@demo.example` and its password from the CSV | the one-click "Enter the live demo" entry; until set, that button opens the sign-in dialog |
| `JUDGE_EMAILS` | `judge@demo.example` | makes the judge a read-only viewer in the demo workspace |
| `JUDGE_ORG_ID` | the organisation id (`select id from organizations`) | the workspace the judge enters |
| `ADMIN_EMAILS` | unchanged | legacy administrators keep working |

## 6. Step 4: check it works (sign in with the CSV passwords)

| Sign in as | Expect |
|---|---|
| the Marsa entity admin (`ai.director@marsa.example`) | the inbox shows "Appoint an operator for UC04"; the entity admin can create that user for Marsa only, and cannot give a governance or platform role; refused for another entity |
| a process owner (for example UC02's Head of Licensing) | proposes process targets for their use case; approving is refused ("Your role does not allow: approve and lock ...") |
| the UAE governance admin | gets a decision in the inbox for each proposal, approves it (a person decides), and the owner is told |
| the super admin | informed of unfilled positions and of what others did; opens Federal Compare |
| the judge | can open Compare and browse countries; every write is refused; the people directory stays closed |

If a country has entities and no governance admin, the Country screen shows "appoint a governance admin" under Required actions, and a request for approval goes to the platform admin as an action until one is appointed.

## 7. Undoing it

- **Role assignments and the federal member of the test people** (the 20 process-owner roles are untouched): `node scripts/seed-test-accounts.mts --revoke-sql` prints the exact SQL for the roster's emails; read it and run it in the SQL editor. It only sets `revoked_at` / `removed_at`: the history stays.
- **The accounts:** delete them in the dashboard (Authentication, Users); the profiles go with them (cascade). The role history stays, revoked.
- **The owners' passwords** cannot be put back (nobody knew them); a reset only gave them a known one.
- **The SQL** is additive. To remove the inbox tables: `drop table public.un_agent_log, public.un_agent_settings, public.un_raci_overrides, public.un_inbox_items;`. The scope columns can stay.

## 8. What is real and what is simulated

- Real: the role and scope checks (every route), the inbox, the People agent's findings, the agent's log (hash-chained per user), the escalation rule, the accounts and their passwords.
- The agents are deterministic: they stage a user, draft a consult reply from the item's context, and hand over what they cannot do. No model call is made by the inbox yet (so the cost ledger does not move); a model-written draft can replace the template later.
- Production, Sijil attestation and the pilot agent remain as before (simulated where they were simulated).

## 9. Not built yet

RACI overrides screen, the People page options for a country or entity scope and the agent switch for other people, consult items from real events, and more events (pilots, goal judgments, rerun requests, tuning proposals). The description of the pull request lists them in order.
