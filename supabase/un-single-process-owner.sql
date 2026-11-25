-- Apply after un-roles.sql and before deploying the corresponding app changes.
-- If this returns rows, confirm who should remain owner and resolve the extras first.
-- select use_case_id, array_agg(id order by granted_at) as assignment_ids
-- from public.un_role_assignments
-- where role = 'process_owner' and use_case_id is not null and revoked_at is null
-- group by use_case_id having count(*) > 1;

begin;

create unique index if not exists un_role_assignments_one_process_owner_idx
  on public.un_role_assignments (use_case_id)
  where role = 'process_owner' and use_case_id is not null and revoked_at is null;

create or replace function public.un_replace_process_owner(
  p_org_id uuid, p_assignment_id uuid, p_user_id uuid, p_actor_id uuid
) returns void
language plpgsql
set search_path = ''
as $$
declare
  previous_use_case_id uuid;
  changed_at timestamptz := now();
begin
  if p_user_id = p_actor_id or not exists (
    select 1 from public.profiles where id = p_user_id and org_id = p_org_id
  ) then
    raise exception 'Choose a different successor from this organisation.';
  end if;

  update public.un_role_assignments
     set revoked_at = changed_at, revoked_by = p_actor_id
   where id = p_assignment_id and org_id = p_org_id and role = 'process_owner'
     and revoked_at is null and user_id <> p_user_id and user_id <> p_actor_id
  returning use_case_id into previous_use_case_id;

  if not found then
    raise exception 'The owner assignment changed. Refresh and try again.';
  end if;

  insert into public.un_role_assignments (org_id, user_id, role, use_case_id, granted_by, granted_at)
  values (p_org_id, p_user_id, 'process_owner', previous_use_case_id, p_actor_id, changed_at);
end;
$$;

revoke execute on function public.un_replace_process_owner(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.un_replace_process_owner(uuid, uuid, uuid, uuid) to service_role;

commit;
