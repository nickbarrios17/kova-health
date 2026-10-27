-- Fix: account deletion failed ("Database error deleting user").
-- GoTrue deletes auth.users as `supabase_auth_admin`; the cascade removes routine_exercises and
-- fires touch_parent_routine() as that role, which has no privileges on public.routines.
-- The trigger only bumps updated_at on the parent of a row the caller was already allowed to
-- change (RLS on routine_exercises + composite FK guarantee the same owner), so running it with
-- the owner's privileges is safe. It lives in `private` and cannot be called outside a trigger.

create or replace function private.touch_parent_routine() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.routines set updated_at = now()
  where id = coalesce(new.routine_id, old.routine_id);
  return null;
end $$;

revoke all on function private.touch_parent_routine() from public, anon, authenticated;
