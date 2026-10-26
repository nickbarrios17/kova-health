-- Workout sessions: what the user actually did. Planned targets are snapshotted per session.
-- Sync rules: docs/sync.md (client UUIDs, idempotent RPCs, monotonic status, append-only sets).

create type public.session_status as enum ('in_progress', 'paused', 'completed', 'abandoned');
create type public.set_type as enum ('warmup', 'working', 'drop', 'failure');

-- ── workout_sessions ─────────────────────────────────────────────────────────
create table public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  routine_id uuid,
  routine_version integer,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  status public.session_status not null default 'in_progress',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  paused_at timestamptz,
  total_paused_s integer not null default 0 check (total_paused_s >= 0),
  time_zone text not null,  -- trigger fills it from user_preferences when the client sends none
  local_date date not null, -- always computed by trigger from started_at + time_zone
  notes text check (notes is null or char_length(notes) <= 4000),
  tags text[] not null default '{}' check (cardinality(tags) <= 20),
  device_id uuid,
  energy_kcal numeric(7, 1) check (energy_kcal between 0 and 20000),
  energy_is_estimated boolean not null default true,
  avg_hr smallint check (avg_hr between 20 and 250),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (routine_id, user_id) references public.routines (id, user_id) on delete set null (routine_id),
  foreign key (device_id, user_id) references public.devices (id, user_id) on delete set null (device_id),
  check ((status in ('completed', 'abandoned')) = (ended_at is not null)),
  check ((status = 'paused') = (paused_at is not null)),
  check (ended_at is null or ended_at >= started_at)
);
-- One active workout per user, across all devices.
create unique index workout_sessions_one_active_key on public.workout_sessions (user_id)
  where status in ('in_progress', 'paused') and deleted_at is null;
create index workout_sessions_user_date_idx on public.workout_sessions (user_id, local_date desc);
create index workout_sessions_user_sync_idx on public.workout_sessions (user_id, updated_at, id);

create function private.workout_session_defaults() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.time_zone is null then
    select p.time_zone into new.time_zone from public.user_preferences p where p.user_id = new.user_id;
    new.time_zone := coalesce(new.time_zone, 'UTC');
  end if;
  if not private.is_valid_time_zone(new.time_zone) then
    raise exception 'INVALID_INPUT' using errcode = 'VD005', detail = 'unknown time zone';
  end if;
  new.local_date := (new.started_at at time zone new.time_zone)::date;
  return new;
end $$;

-- Status may only move along: in_progress ⇄ paused → completed | abandoned. Terminal states are final.
create function private.workout_session_transition_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status is distinct from old.status and not (
       (old.status = 'in_progress' and new.status in ('paused', 'completed', 'abandoned'))
    or (old.status = 'paused' and new.status in ('in_progress', 'completed', 'abandoned'))
  ) then
    raise exception 'INVALID_TRANSITION' using errcode = 'VD004',
      detail = old.status || ' -> ' || new.status;
  end if;
  if old.status in ('completed', 'abandoned') and new.started_at is distinct from old.started_at then
    raise exception 'SESSION_CLOSED' using errcode = 'VD003';
  end if;
  return new;
end $$;

create trigger workout_sessions_defaults before insert or update of started_at, time_zone on public.workout_sessions
  for each row execute function private.workout_session_defaults();
create trigger workout_sessions_transition_guard before update on public.workout_sessions
  for each row execute function private.workout_session_transition_guard();
create trigger workout_sessions_updated_at before update on public.workout_sessions
  for each row execute function private.set_updated_at();
create trigger workout_sessions_owner_immutable before update on public.workout_sessions
  for each row execute function private.prevent_owner_change('user_id');

-- ── workout_session_exercises (planned-target snapshot + ad-hoc additions) ───
create table public.workout_session_exercises (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  user_id uuid not null default auth.uid(),
  exercise_id uuid not null references public.exercises (id),
  position smallint not null check (position between 0 and 99),
  planned_sets smallint check (planned_sets between 1 and 20),
  planned_reps_min smallint check (planned_reps_min between 1 and 100),
  planned_reps_max smallint check (planned_reps_max between 1 and 100),
  planned_duration_s integer check (planned_duration_s between 1 and 86400),
  planned_rest_s smallint check (planned_rest_s between 0 and 1800),
  planned_load_kg numeric(6, 2) check (planned_load_kg between 0 and 1000),
  notes text check (notes is null or char_length(notes) <= 1000),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (id, session_id),
  foreign key (session_id, user_id) references public.workout_sessions (id, user_id) on delete cascade
);
create index workout_session_exercises_session_idx on public.workout_session_exercises (session_id, position);
create index workout_session_exercises_exercise_idx on public.workout_session_exercises (user_id, exercise_id);
create index workout_session_exercises_sync_idx on public.workout_session_exercises (user_id, updated_at, id);

create function private.assert_session_accepts_exercise() returns trigger
language plpgsql set search_path = '' as $$
declare
  st public.session_status;
begin
  select s.status into st from public.workout_sessions s where s.id = new.session_id;
  if st = 'abandoned' then
    raise exception 'SESSION_CLOSED' using errcode = 'VD003';
  end if;
  return new;
end $$;

create trigger workout_session_exercises_open before insert on public.workout_session_exercises
  for each row execute function private.assert_session_accepts_exercise();
create trigger workout_session_exercises_exercise_visible before insert or update of exercise_id on public.workout_session_exercises
  for each row execute function private.assert_exercise_visible('exercise_id');
create trigger workout_session_exercises_updated_at before update on public.workout_session_exercises
  for each row execute function private.set_updated_at();
create trigger workout_session_exercises_owner_immutable before update on public.workout_session_exercises
  for each row execute function private.prevent_owner_change('user_id');

-- ── workout_sets (append-only by client UUID) ────────────────────────────────
create table public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  session_exercise_id uuid not null,
  user_id uuid not null default auth.uid(),
  set_index smallint not null check (set_index between 0 and 99),
  set_type public.set_type not null default 'working',
  weight_kg numeric(6, 2) check (weight_kg between 0 and 1000),
  reps smallint check (reps between 0 and 1000),
  duration_s integer check (duration_s between 0 and 86400),
  distance_m numeric(9, 1) check (distance_m between 0 and 1000000),
  rpe numeric(3, 1) check (rpe between 1 and 10),
  rest_s integer check (rest_s between 0 and 7200),
  completed_at timestamptz not null default now(),
  client_recorded_at timestamptz,
  device_id uuid,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (reps is not null or duration_s is not null or distance_m is not null),
  foreign key (session_id, user_id) references public.workout_sessions (id, user_id) on delete cascade,
  foreign key (session_exercise_id, session_id) references public.workout_session_exercises (id, session_id) on delete cascade,
  foreign key (device_id, user_id) references public.devices (id, user_id) on delete set null (device_id)
);
create index workout_sets_session_idx on public.workout_sets (session_id, completed_at);
create index workout_sets_session_exercise_idx on public.workout_sets (session_exercise_id);
create index workout_sets_sync_idx on public.workout_sets (user_id, updated_at, id);

-- Sets are accepted while the session is open, and also *late* sets recorded offline before
-- the session ended (completed_at <= ended_at). Abandoned sessions accept nothing new.
create function private.assert_session_accepts_set() returns trigger
language plpgsql set search_path = '' as $$
declare
  s record;
begin
  select status, ended_at into s from public.workout_sessions where id = new.session_id;
  if s.status = 'abandoned'
     or (s.status = 'completed' and new.completed_at > s.ended_at) then
    raise exception 'SESSION_CLOSED' using errcode = 'VD003';
  end if;
  return new;
end $$;

create trigger workout_sets_open before insert on public.workout_sets
  for each row execute function private.assert_session_accepts_set();
create trigger workout_sets_updated_at before update on public.workout_sets
  for each row execute function private.set_updated_at();
create trigger workout_sets_owner_immutable before update on public.workout_sets
  for each row execute function private.prevent_owner_change('user_id');

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.workout_sessions enable row level security;
alter table public.workout_session_exercises enable row level security;
alter table public.workout_sets enable row level security;

create policy workout_sessions_select_own on public.workout_sessions for select to authenticated
  using (user_id = (select auth.uid()));
create policy workout_sessions_insert_own on public.workout_sessions for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy workout_sessions_update_own on public.workout_sessions for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy workout_sessions_delete_own on public.workout_sessions for delete to authenticated
  using (user_id = (select auth.uid()));

create policy wse_select_own on public.workout_session_exercises for select to authenticated
  using (user_id = (select auth.uid()));
create policy wse_insert_own on public.workout_session_exercises for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy wse_update_own on public.workout_session_exercises for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy wse_delete_own on public.workout_session_exercises for delete to authenticated
  using (user_id = (select auth.uid()));

create policy workout_sets_select_own on public.workout_sets for select to authenticated
  using (user_id = (select auth.uid()));
create policy workout_sets_insert_own on public.workout_sets for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy workout_sets_update_own on public.workout_sets for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy workout_sets_delete_own on public.workout_sets for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.workout_sessions, public.workout_session_exercises, public.workout_sets from anon, authenticated;
grant select, insert, update, delete on public.workout_sessions, public.workout_session_exercises,
  public.workout_sets to authenticated;

-- ── RPCs ─────────────────────────────────────────────────────────────────────

-- Idempotent on p_id. With p_routine_id and no p_exercises, the server snapshots the routine.
-- Offline clients pass p_exercises = [{ id, exercise_id, position, planned_* }] so the ids they
-- already used for sets stay valid.
create function public.start_session(
  p_id uuid,
  p_routine_id uuid default null,
  p_name text default null,
  p_exercises jsonb default null,
  p_started_at timestamptz default null,
  p_time_zone text default null,
  p_device_id uuid default null
) returns public.workout_sessions
language plpgsql security invoker set search_path = '' as $$
declare
  s public.workout_sessions;
  r public.routines;
begin
  select * into s from public.workout_sessions where id = p_id;
  if found then
    return s;
  end if;

  if p_routine_id is not null then
    select * into r from public.routines where id = p_routine_id and deleted_at is null;
    if not found then
      raise exception 'NOT_FOUND' using errcode = 'VD404', detail = 'routine';
    end if;
  end if;

  if p_exercises is not null and (jsonb_typeof(p_exercises) <> 'array' or jsonb_array_length(p_exercises) > 50) then
    raise exception 'INVALID_INPUT' using errcode = 'VD005', detail = 'exercises must be an array of at most 50';
  end if;

  begin
    insert into public.workout_sessions (id, routine_id, routine_version, name, started_at, time_zone, device_id)
    values (
      p_id, r.id, r.version,
      coalesce(nullif(btrim(p_name), ''), r.name, 'Entrenamiento libre'),
      least(coalesce(p_started_at, clock_timestamp()), clock_timestamp()),
      p_time_zone,
      p_device_id)
    returning * into s;
  exception when unique_violation then
    select * into s from public.workout_sessions where id = p_id;
    if found then
      return s; -- concurrent retry of the same start
    end if;
    raise exception 'ACTIVE_SESSION_EXISTS' using errcode = 'VD001';
  end;

  if p_exercises is not null then
    insert into public.workout_session_exercises (
      id, session_id, exercise_id, position, planned_sets, planned_reps_min, planned_reps_max,
      planned_duration_s, planned_rest_s, planned_load_kg)
    select coalesce(i.id, gen_random_uuid()), p_id, i.exercise_id, i.position, i.planned_sets, i.planned_reps_min,
           i.planned_reps_max, i.planned_duration_s, i.planned_rest_s, i.planned_load_kg
    from jsonb_to_recordset(p_exercises) as i(
      id uuid, exercise_id uuid, position smallint, planned_sets smallint, planned_reps_min smallint,
      planned_reps_max smallint, planned_duration_s integer, planned_rest_s smallint, planned_load_kg numeric);
  elsif r.id is not null then
    insert into public.workout_session_exercises (
      session_id, exercise_id, position, planned_sets, planned_reps_min, planned_reps_max,
      planned_duration_s, planned_rest_s, planned_load_kg)
    select p_id, re.exercise_id, re.position, re.target_sets, re.target_reps_min, re.target_reps_max,
           re.target_duration_s, re.target_rest_s, re.target_load_kg
    from public.routine_exercises re where re.routine_id = r.id order by re.position;
  end if;

  return s;
end $$;

-- Idempotent on p_id: a retry returns the stored row, never a duplicate.
create function public.record_set(
  p_id uuid,
  p_session_exercise_id uuid,
  p_set_index smallint,
  p_weight_kg numeric default null,
  p_reps smallint default null,
  p_duration_s integer default null,
  p_distance_m numeric default null,
  p_rpe numeric default null,
  p_rest_s integer default null,
  p_set_type public.set_type default 'working',
  p_completed_at timestamptz default null,
  p_device_id uuid default null
) returns public.workout_sets
language plpgsql security invoker set search_path = '' as $$
declare
  st public.workout_sets;
  v_session uuid;
begin
  select * into st from public.workout_sets where id = p_id;
  if found then
    return st;
  end if;

  select session_id into v_session from public.workout_session_exercises
  where id = p_session_exercise_id and deleted_at is null;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'VD404', detail = 'session exercise';
  end if;

  insert into public.workout_sets (
    id, session_id, session_exercise_id, set_index, set_type, weight_kg, reps, duration_s, distance_m,
    rpe, rest_s, completed_at, client_recorded_at, device_id)
  values (
    p_id, v_session, p_session_exercise_id, p_set_index, coalesce(p_set_type, 'working'), p_weight_kg, p_reps,
    p_duration_s, p_distance_m, p_rpe, p_rest_s, least(coalesce(p_completed_at, clock_timestamp()), clock_timestamp()),
    p_completed_at, p_device_id)
  on conflict (id) do nothing
  returning * into st;

  if st.id is null then
    select * into st from public.workout_sets where id = p_id;
    if not found then
      raise exception 'NOT_FOUND' using errcode = 'VD404'; -- id taken by a row the caller cannot see
    end if;
  end if;
  return st;
end $$;

-- p_action: pause | resume | complete | abandon. Repeating the current state is a no-op.
create function public.transition_session(p_id uuid, p_action text, p_at timestamptz default null)
returns public.workout_sessions
language plpgsql security invoker set search_path = '' as $$
declare
  s public.workout_sessions;
  at_ts timestamptz;
  pause_s integer;
begin
  select * into s from public.workout_sessions where id = p_id and deleted_at is null for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'VD404';
  end if;

  at_ts := greatest(least(coalesce(p_at, clock_timestamp()), clock_timestamp()), s.started_at, coalesce(s.paused_at, s.started_at));
  pause_s := case when s.status = 'paused'
                  then greatest(0, extract(epoch from at_ts - s.paused_at))::integer else 0 end;

  if (p_action = 'pause' and s.status = 'paused')
     or (p_action = 'resume' and s.status = 'in_progress')
     or (p_action = 'complete' and s.status = 'completed')
     or (p_action = 'abandon' and s.status = 'abandoned') then
    return s;
  end if;

  case p_action
    when 'pause' then
      update public.workout_sessions set status = 'paused', paused_at = at_ts where id = p_id returning * into s;
    when 'resume' then
      update public.workout_sessions
      set status = 'in_progress', paused_at = null, total_paused_s = total_paused_s + pause_s
      where id = p_id returning * into s;
    when 'complete', 'abandon' then
      update public.workout_sessions
      set status = case p_action when 'complete' then 'completed'::public.session_status
                                 else 'abandoned'::public.session_status end,
          ended_at = at_ts, paused_at = null, total_paused_s = total_paused_s + pause_s
      where id = p_id returning * into s;
    else
      raise exception 'INVALID_INPUT' using errcode = 'VD005', detail = 'unknown action';
  end case;
  return s;
end $$;

revoke all on function public.start_session(uuid, uuid, text, jsonb, timestamptz, text, uuid) from public, anon;
revoke all on function public.record_set(uuid, uuid, smallint, numeric, smallint, integer, numeric, numeric, integer, public.set_type, timestamptz, uuid) from public, anon;
revoke all on function public.transition_session(uuid, text, timestamptz) from public, anon;
grant execute on function public.start_session(uuid, uuid, text, jsonb, timestamptz, text, uuid) to authenticated;
grant execute on function public.record_set(uuid, uuid, smallint, numeric, smallint, integer, numeric, numeric, integer, public.set_type, timestamptz, uuid) to authenticated;
grant execute on function public.transition_session(uuid, text, timestamptz) to authenticated;

-- ── Derived views (computed on read; RLS of base tables applies) ─────────────

-- Working sets from completed sessions. e1RM: Epley, only for 1–12 reps (beyond that it is unreliable).
create view public.exercise_history with (security_invoker = true) as
select
  st.id as set_id,
  st.user_id,
  wse.exercise_id,
  st.session_id,
  s.local_date,
  st.completed_at,
  st.set_index,
  st.set_type,
  st.weight_kg,
  st.reps,
  st.duration_s,
  st.distance_m,
  st.rpe,
  case
    when st.weight_kg is null or st.reps is null or st.reps < 1 or st.reps > 12 then null
    when st.reps = 1 then st.weight_kg
    else round(st.weight_kg * (1 + st.reps / 30.0), 2)
  end as e1rm_kg
from public.workout_sets st
join public.workout_session_exercises wse on wse.id = st.session_exercise_id
join public.workout_sessions s on s.id = st.session_id
where st.deleted_at is null and wse.deleted_at is null and s.deleted_at is null
  and s.status = 'completed' and st.set_type <> 'warmup';

create view public.personal_records with (security_invoker = true) as
select
  user_id,
  exercise_id,
  max(weight_kg) as max_weight_kg,
  max(e1rm_kg) as best_e1rm_kg,
  max(reps) as max_reps,
  max(weight_kg * reps) as best_set_volume_kg,
  count(*) as total_sets,
  max(completed_at) as last_performed_at
from public.exercise_history
group by user_id, exercise_id;

-- pr_count: exercises whose top weight in this session beats every earlier completed session.
-- An exercise with no earlier history is not a PR (same rule as the prototype).
create view public.session_summaries with (security_invoker = true) as
select
  s.id as session_id,
  s.user_id,
  s.name,
  s.status,
  s.routine_id,
  s.local_date,
  s.started_at,
  s.ended_at,
  greatest(0,
    extract(epoch from coalesce(s.ended_at, now()) - s.started_at)::integer
    - s.total_paused_s
    - case when s.paused_at is not null then extract(epoch from now() - s.paused_at)::integer else 0 end
  ) as active_duration_s,
  coalesce(agg.working_sets, 0) as working_sets,
  coalesce(agg.volume_kg, 0) as volume_kg,
  s.energy_kcal,
  s.energy_is_estimated,
  (
    select count(*)
    from (
      select wse.exercise_id, max(st.weight_kg) as top
      from public.workout_sets st
      join public.workout_session_exercises wse on wse.id = st.session_exercise_id
      where st.session_id = s.id and st.deleted_at is null and st.set_type <> 'warmup'
      group by wse.exercise_id
    ) t
    where t.top > (
      select max(h.weight_kg) from public.exercise_history h
      where h.user_id = s.user_id and h.exercise_id = t.exercise_id
        and h.session_id <> s.id and h.completed_at < s.started_at
    )
  ) as pr_count
from public.workout_sessions s
left join lateral (
  select
    count(*) filter (where st.set_type <> 'warmup') as working_sets,
    sum(st.weight_kg * st.reps) filter (where st.set_type <> 'warmup') as volume_kg
  from public.workout_sets st
  where st.session_id = s.id and st.deleted_at is null
) agg on true
where s.deleted_at is null;

revoke all on public.exercise_history, public.personal_records, public.session_summaries from anon, authenticated;
grant select on public.exercise_history, public.personal_records, public.session_summaries to authenticated;
