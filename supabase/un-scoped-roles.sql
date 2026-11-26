-- Scoped roles: a role can be held for the organisation, a country, an entity (in its country) or one use case; and a new role, entity_admin.
-- Run after supabase/un-roles.sql. NOT APPLIED to any database: Shameer applies it. It only adds: no row is changed or removed, so every existing
-- assignment keeps working exactly as before (use_case_id null = organisation, set = one use case).
--
--   scope_country   the country the role is held for (a country scope, or the country of an entity scope)
--   scope_entity    the entity the role is held for (entity scope)
--   A role is held at ONE scope: use_case_id, or scope_entity (with its country), or scope_country alone, or none of them (the whole organisation).
--
-- The role list gains entity_admin: it sets up one entity (goals and criteria, use case list, SOPs) and runs everything under it except the sign-offs.
-- The governance admin is now held for a country (one person covers many entities); approving targets, test sets and verdict parameters is theirs.
alter table public.un_role_assignments add column if not exists scope_country text;
alter table public.un_role_assignments add column if not exists scope_entity text;

-- the role list, with entity_admin (the original check is un_role_assignments_role_check)
alter table public.un_role_assignments drop constraint if exists un_role_assignments_role_check;
alter table public.un_role_assignments add constraint un_role_assignments_role_check
  check (role in ('platform_admin','governance_admin','entity_admin','process_owner','test_author','operator','viewer'));

-- one scope per assignment
alter table public.un_role_assignments drop constraint if exists un_role_assignments_one_scope_check;
alter table public.un_role_assignments add constraint un_role_assignments_one_scope_check
  check (use_case_id is null or (scope_country is null and scope_entity is null));

-- one live assignment per person, role and scope (the original index did not know the new columns)
drop index if exists public.un_role_assignments_live_idx;
create unique index if not exists un_role_assignments_live_idx
  on public.un_role_assignments (org_id, user_id, role,
    coalesce(use_case_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(scope_country, ''), coalesce(scope_entity, ''))
  where revoked_at is null;
create index if not exists un_role_assignments_scope_idx on public.un_role_assignments (org_id, scope_country, scope_entity) where revoked_at is null;
