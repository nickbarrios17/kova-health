-- Routines: the plan. Sessions snapshot the plan at start, so nothing here can rewrite history.

create table public.routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  notes text check (notes is null or char_length(notes) <= 2000),
  -- ISO weekdays, 1 = Monday … 7 = Sunday (prototype order L M X J V S D).
  schedule_days smallint[] not null default '{}'
    check (schedule_days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[] and cardinality(schedule_days) <= 7),
  -- Monotonic change counter for optimistic concurrency. Compare for equality only.
  version integer not null default 1,
  archived_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create index routines_user_sync_idx on public.routines (user_id, updated_at, id);

create function private.bump_version() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.version := old.version + 1;
  return new;
end $$;

create trigger routines_bump_version before update on public.routines
  for each row execute function private.bump_version();
create trigger routines_updated_at before update on public.routines
  for each row execute function private.set_updated_at();
create trigger routines_owner_immutable before update on public.routines
  for each row execute function private.prevent_owner_change('user_id');

create table public.routine_exercises (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null,
  user_id uuid not null default auth.uid(),
  exercise_id uuid not null references public.exercises (id),
  position smallint not null check (position between 0 and 99),
  target_sets smallint not null check (target_sets between 1 and 20),
  target_reps_min smallint check (target_reps_min between 1 and 100),
  target_reps_max smallint check (target_reps_max between 1 and 100),
  target_duration_s integer check (target_duration_s between 1 and 86400),
  target_rest_s smallint check (target_rest_s between 0 and 1800),
  target_load_kg numeric(6, 2) check (target_load_kg between 0 and 1000),
  notes text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (target_reps_min is null or target_reps_max is null or target_reps_max >= target_reps_min),
  foreign key (routine_id, user_id) references public.routines (id, user_id) on delete cascade,
  constraint routine_exercises_position_key unique (routine_id, position) deferrable initially immediate
);
create index routine_exercises_exercise_idx on public.routine_exercises (exercise_id);

create trigger routine_exercises_updated_at before update on public.routine_exercises
  for each row execute function private.set_updated_at();
create trigger routine_exercises_owner_immutable before update on public.routine_exercises
  for each row execute function private.prevent_owner_change('user_id');
create trigger routine_exercises_exercise_visible before insert or update of exercise_id on public.routine_exercises
  for each row execute function private.assert_exercise_visible('exercise_id');

-- Any item change counts as a routine change (version + updated_at for sync pull).
create function private.touch_parent_routine() returns trigger
language plpgsql set search_path = '' as $$
begin
  update public.routines set updated_at = now()
  where id = coalesce(new.routine_id, old.routine_id);
  return null;
end $$;

create trigger routine_exercises_touch_parent after insert or update or delete on public.routine_exercises
  for each row execute function private.touch_parent_routine();

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.routines enable row level security;
alter table public.routine_exercises enable row level security;

create policy routines_select_own on public.routines for select to authenticated
  using (user_id = (select auth.uid()));
create policy routines_insert_own on public.routines for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy routines_update_own on public.routines for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy routines_delete_own on public.routines for delete to authenticated
  using (user_id = (select auth.uid()));

create policy routine_exercises_select_own on public.routine_exercises for select to authenticated
  using (user_id = (select auth.uid()));
create policy routine_exercises_insert_own on public.routine_exercises for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy routine_exercises_update_own on public.routine_exercises for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy routine_exercises_delete_own on public.routine_exercises for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.routines, public.routine_exercises from anon, authenticated;
grant select, insert, delete on public.routines to authenticated;
-- `version` is server-managed (trigger), so it is not in the updatable column list.
-- `updated_at` is listed because item triggers touch it; its value is always overwritten by trigger.
grant update (name, notes, schedule_days, archived_at, deleted_at, updated_at) on public.routines to authenticated;
grant select, insert, update, delete on public.routine_exercises to authenticated;

-- ── RPCs (security invoker → RLS still applies) ──────────────────────────────

-- Create or fully replace a routine and its ordered items in one transaction.
-- p_expected_version: null = create (idempotent on p_id); otherwise must equal the stored version.
-- p_items: [{ exercise_id, target_sets, target_reps_min?, target_reps_max?, target_duration_s?,
--             target_rest_s?, target_load_kg?, notes? }] in display order.
create function public.save_routine(
  p_id uuid,
  p_name text,
  p_items jsonb,
  p_schedule_days smallint[] default '{}',
  p_notes text default null,
  p_expected_version integer default null
) returns public.routines
language plpgsql security invoker set search_path = '' as $$
declare
  r public.routines;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 50 then
    raise exception 'INVALID_INPUT' using errcode = 'VD005', detail = 'items must be an array of at most 50';
  end if;

  select * into r from public.routines where id = p_id for update;

  if not found then
    if p_expected_version is not null then
      raise exception 'NOT_FOUND' using errcode = 'VD404';
    end if;
    insert into public.routines (id, name, notes, schedule_days)
    values (p_id, btrim(p_name), p_notes, coalesce(p_schedule_days, '{}'));
  elsif r.deleted_at is not null then
    raise exception 'NOT_FOUND' using errcode = 'VD404';
  elsif p_expected_version is null then
    return r; -- create retried: already exists, return as stored
  elsif p_expected_version <> r.version then
    raise exception 'VERSION_CONFLICT' using errcode = 'VD002', detail = 'current version ' || r.version;
  end if;

  delete from public.routine_exercises where routine_id = p_id;

  insert into public.routine_exercises (
    routine_id, exercise_id, position, target_sets, target_reps_min, target_reps_max,
    target_duration_s, target_rest_s, target_load_kg, notes)
  select p_id, i.exercise_id, (o.ord - 1)::smallint, i.target_sets, i.target_reps_min, i.target_reps_max,
         i.target_duration_s, i.target_rest_s, i.target_load_kg, i.notes
  from jsonb_array_elements(p_items) with ordinality as o(item, ord)
  cross join lateral jsonb_to_record(o.item) as i(
    exercise_id uuid, target_sets smallint, target_reps_min smallint, target_reps_max smallint,
    target_duration_s integer, target_rest_s smallint, target_load_kg numeric, notes text);

  update public.routines
  set name = btrim(p_name), notes = p_notes, schedule_days = coalesce(p_schedule_days, '{}')
  where id = p_id
  returning * into r;

  return r;
end $$;

-- Idempotent on p_new_id.
create function public.duplicate_routine(p_source_id uuid, p_new_id uuid, p_name text default null)
returns public.routines
language plpgsql security invoker set search_path = '' as $$
declare
  src public.routines;
  r public.routines;
begin
  select * into r from public.routines where id = p_new_id;
  if found then
    return r;
  end if;

  select * into src from public.routines where id = p_source_id and deleted_at is null;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'VD404';
  end if;

  insert into public.routines (id, name, notes, schedule_days)
  values (p_new_id, coalesce(nullif(btrim(p_name), ''), left(src.name, 72) || ' (copia)'), src.notes, src.schedule_days);

  insert into public.routine_exercises (
    routine_id, exercise_id, position, target_sets, target_reps_min, target_reps_max,
    target_duration_s, target_rest_s, target_load_kg, notes)
  select p_new_id, exercise_id, position, target_sets, target_reps_min, target_reps_max,
         target_duration_s, target_rest_s, target_load_kg, notes
  from public.routine_exercises where routine_id = p_source_id;

  select * into r from public.routines where id = p_new_id;
  return r;
end $$;

revoke all on function public.save_routine(uuid, text, jsonb, smallint[], text, integer) from public, anon;
revoke all on function public.duplicate_routine(uuid, uuid, text) from public, anon;
grant execute on function public.save_routine(uuid, text, jsonb, smallint[], text, integer) to authenticated;
grant execute on function public.duplicate_routine(uuid, uuid, text) to authenticated;
