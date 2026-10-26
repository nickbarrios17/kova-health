-- Account data export (GDPR-style portability). Runs as the caller; RLS + explicit filters apply.
-- Account deletion is the `delete-account` Edge Function (needs the service role); all user data
-- is removed by `on delete cascade` from auth.users.

create function public.export_my_data() returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'NOT_FOUND' using errcode = 'VD404';
  end if;

  return jsonb_build_object(
    'format', 'vida-export/1',
    'exported_at', now(),
    'user_id', uid,
    'profile', (select to_jsonb(p) from public.profiles p where p.id = uid),
    'preferences', (select to_jsonb(p) from public.user_preferences p where p.user_id = uid),
    'devices', (select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) from public.devices d where d.user_id = uid),
    'entitlements', (select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb) from public.user_entitlements e where e.user_id = uid),
    'exercises', (
      select coalesce(jsonb_agg(to_jsonb(x) || jsonb_build_object(
        'muscles', (select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) from public.exercise_muscles m where m.exercise_id = x.id),
        'equipment', (select coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb) from public.exercise_equipment q where q.exercise_id = x.id))), '[]'::jsonb)
      from public.exercises x where x.owner_id = uid),
    'routines', (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from public.routines r where r.user_id = uid),
    'routine_exercises', (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from public.routine_exercises r where r.user_id = uid),
    'workout_sessions', (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from public.workout_sessions s where s.user_id = uid),
    'workout_session_exercises', (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from public.workout_session_exercises s where s.user_id = uid),
    'workout_sets', (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from public.workout_sets s where s.user_id = uid)
  );
end $$;

revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;
