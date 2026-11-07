-- Coach and friends, phase 2 (docs/coach.md): a coach reads and edits the routines of a student.
-- The routines stay the student's rows (user_id = student), so the student's app and watch sync them
-- as usual; assigned_by marks the ones a coach wrote ("De tu coach"). The student can still edit them.
-- Same rules as save_routine (optimistic version, ≤ 50 items, atomic replace), checked against the link.

alter table public.routines add column assigned_by uuid references auth.users (id) on delete set null;

create function private.assert_coach_of(p_owner uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.can_view(p_owner, 'routines') then
    raise exception 'FORBIDDEN' using errcode = '42501', detail = 'not this person''s coach';
  end if;
end $$;

-- The student's routines with their items (in order) and exercise names.
create function private.coach_routines(p_owner uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_coach_of(p_owner);
  return coalesce((
    select jsonb_agg(to_jsonb(r) || jsonb_build_object('routine_exercises', coalesce((
      select jsonb_agg(to_jsonb(i) || jsonb_build_object('exercise_name', coalesce(e.short_name, e.name)) order by i.position)
      from public.routine_exercises i join public.exercises e on e.id = i.exercise_id
      where i.routine_id = r.id), '[]'::jsonb)) order by r.created_at)
    from public.routines r
    where r.user_id = p_owner and r.deleted_at is null and r.archived_at is null), '[]'::jsonb);
end $$;

-- The student's own exercises (the catalog is readable by everyone through the normal query).
create function private.coach_exercises(p_owner uuid) returns table (id uuid, name text, short_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_coach_of(p_owner);
  return query select e.id, e.name, e.short_name from public.exercises e
    where e.owner_id = p_owner and e.archived_at is null order by e.name;
end $$;

-- A new exercise owned by the student (when the coach types one that is not in the catalog).
-- Idempotent on p_id.
create function private.coach_create_exercise(p_owner uuid, p_id uuid, p_name text, p_slug text) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_coach_of(p_owner);
  insert into public.exercises (id, owner_id, slug, name) values (p_id, p_owner, p_slug, btrim(p_name))
  on conflict (id) do nothing;
  if not exists (select 1 from public.exercises where id = p_id and owner_id = p_owner) then
    raise exception 'CONFLICT' using errcode = '23505';
  end if;
  return p_id;
end $$;

create function private.coach_save_routine(
  p_owner uuid, p_id uuid, p_name text, p_items jsonb,
  p_schedule_days smallint[] default '{}', p_notes text default null, p_expected_version integer default null
) returns public.routines
language plpgsql security definer set search_path = '' as $$
declare
  r public.routines;
begin
  perform private.assert_coach_of(p_owner);
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 50 then
    raise exception 'INVALID_INPUT' using errcode = 'VD005', detail = 'items must be an array of at most 50';
  end if;
  -- Exercises: the catalog or the student's own (never the coach's private ones).
  if exists (
    select 1 from jsonb_array_elements(p_items) it
    left join public.exercises e on e.id = (it ->> 'exercise_id')::uuid
    where e.id is null or (e.owner_id is not null and e.owner_id <> p_owner)) then
    raise exception 'NOT_FOUND' using errcode = 'VD404', detail = 'exercise not found';
  end if;

  select * into r from public.routines where id = p_id for update;
  if not found then
    if p_expected_version is not null then raise exception 'NOT_FOUND' using errcode = 'VD404'; end if;
    insert into public.routines (id, user_id, name, notes, schedule_days, assigned_by)
    values (p_id, p_owner, btrim(p_name), p_notes, coalesce(p_schedule_days, '{}'), (select auth.uid()));
  elsif r.user_id <> p_owner or r.deleted_at is not null then
    raise exception 'NOT_FOUND' using errcode = 'VD404';
  elsif p_expected_version is null then
    return r; -- create retried
  elsif p_expected_version <> r.version then
    raise exception 'VERSION_CONFLICT' using errcode = 'VD002', detail = 'current version ' || r.version;
  end if;

  delete from public.routine_exercises where routine_id = p_id;
  insert into public.routine_exercises (
    routine_id, user_id, exercise_id, position, target_sets, target_reps_min, target_reps_max,
    target_duration_s, target_rest_s, target_load_kg, notes)
  select p_id, p_owner, i.exercise_id, (o.ord - 1)::smallint, i.target_sets, i.target_reps_min, i.target_reps_max,
         i.target_duration_s, i.target_rest_s, i.target_load_kg, i.notes
  from jsonb_array_elements(p_items) with ordinality as o(item, ord)
  cross join lateral jsonb_to_record(o.item) as i(
    exercise_id uuid, target_sets smallint, target_reps_min smallint, target_reps_max smallint,
    target_duration_s integer, target_rest_s smallint, target_load_kg numeric, notes text);

  update public.routines
  set name = btrim(p_name), notes = p_notes, schedule_days = coalesce(p_schedule_days, '{}'), assigned_by = (select auth.uid())
  where id = p_id
  returning * into r;
  return r;
end $$;

-- Soft delete, like the student's own delete (history keeps the snapshot).
create function private.coach_delete_routine(p_owner uuid, p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_coach_of(p_owner);
  update public.routines set deleted_at = now() where id = p_id and user_id = p_owner and deleted_at is null;
  if not found then raise exception 'NOT_FOUND' using errcode = 'VD404'; end if;
end $$;

revoke all on function private.assert_coach_of(uuid), private.coach_routines(uuid), private.coach_exercises(uuid),
  private.coach_create_exercise(uuid, uuid, text, text),
  private.coach_save_routine(uuid, uuid, text, jsonb, smallint[], text, integer), private.coach_delete_routine(uuid, uuid)
  from public, anon;
grant execute on function private.coach_routines(uuid), private.coach_exercises(uuid),
  private.coach_create_exercise(uuid, uuid, text, text),
  private.coach_save_routine(uuid, uuid, text, jsonb, smallint[], text, integer), private.coach_delete_routine(uuid, uuid)
  to authenticated;

-- ── Public API: invoker wrappers ─────────────────────────────────────────────
create function public.coach_routines(p_owner uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.coach_routines(p_owner) $$;
create function public.coach_exercises(p_owner uuid) returns table (id uuid, name text, short_name text)
language sql stable security invoker set search_path = '' as $$ select * from private.coach_exercises(p_owner) $$;
create function public.coach_create_exercise(p_owner uuid, p_id uuid, p_name text, p_slug text) returns uuid
language sql security invoker set search_path = '' as $$ select private.coach_create_exercise(p_owner, p_id, p_name, p_slug) $$;
create function public.coach_save_routine(
  p_owner uuid, p_id uuid, p_name text, p_items jsonb,
  p_schedule_days smallint[] default '{}', p_notes text default null, p_expected_version integer default null
) returns public.routines
language sql security invoker set search_path = '' as $$
  select private.coach_save_routine(p_owner, p_id, p_name, p_items, p_schedule_days, p_notes, p_expected_version) $$;
create function public.coach_delete_routine(p_owner uuid, p_id uuid) returns void
language sql security invoker set search_path = '' as $$ select private.coach_delete_routine(p_owner, p_id) $$;

revoke all on function public.coach_routines(uuid), public.coach_exercises(uuid), public.coach_create_exercise(uuid, uuid, text, text),
  public.coach_save_routine(uuid, uuid, text, jsonb, smallint[], text, integer), public.coach_delete_routine(uuid, uuid)
  from public, anon;
grant execute on function public.coach_routines(uuid), public.coach_exercises(uuid), public.coach_create_exercise(uuid, uuid, text, text),
  public.coach_save_routine(uuid, uuid, text, jsonb, smallint[], text, integer), public.coach_delete_routine(uuid, uuid)
  to authenticated;
