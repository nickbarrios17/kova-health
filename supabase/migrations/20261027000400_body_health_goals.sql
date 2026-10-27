-- Body measurements, health observations (sleep, HRV, heart rate, steps, mood…) and goals.
-- Every value records where it came from and whether it is an estimate; nothing is filled in
-- when data is missing (master prompt §5.7). Imports from Health Connect / HealthKit are
-- idempotent on (source, external_id).

create type public.data_origin as enum ('manual', 'health_connect', 'healthkit', 'wear_os', 'import');
create type public.body_metric as enum (
  'weight_kg', 'body_fat_pct', 'muscle_mass_kg', 'lean_mass_kg',
  'waist_cm', 'hip_cm', 'chest_cm', 'arm_cm', 'thigh_cm', 'neck_cm');
create type public.health_metric as enum (
  'sleep_session', 'resting_hr_bpm', 'hrv_rmssd_ms', 'steps', 'distance_m',
  'active_energy_kcal', 'active_minutes', 'mood', 'stress');
create type public.goal_kind as enum ('weight', 'steps_daily', 'sleep_minutes_daily', 'workouts_weekly', 'custom');
create type public.goal_status as enum ('active', 'achieved', 'abandoned');

-- Fills time_zone (from preferences when missing) and local_date from the timestamp column(s)
-- named in TG_ARGV (first non-null wins), as in ADR 0004.
create function private.fill_local_date() returns trigger
language plpgsql set search_path = '' as $$
declare
  j jsonb := to_jsonb(new);
  ts timestamptz := coalesce((j ->> tg_argv[0])::timestamptz, (j ->> coalesce(tg_argv[1], tg_argv[0]))::timestamptz);
begin
  if new.time_zone is null then
    select p.time_zone into new.time_zone from public.user_preferences p where p.user_id = new.user_id;
    new.time_zone := coalesce(new.time_zone, 'UTC');
  end if;
  if not private.is_valid_time_zone(new.time_zone) then
    raise exception 'INVALID_INPUT' using errcode = 'VD005', detail = 'unknown time zone';
  end if;
  new.local_date := (ts at time zone new.time_zone)::date;
  return new;
end $$;

-- ── body_measurements ────────────────────────────────────────────────────────
create table public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  metric public.body_metric not null,
  value numeric(6, 2) not null,
  measured_at timestamptz not null,
  time_zone text not null,
  local_date date not null,
  source public.data_origin not null default 'manual',
  source_app text check (source_app is null or char_length(source_app) <= 80),
  external_id text check (external_id is null or char_length(external_id) <= 200),
  is_estimated boolean not null default false, -- e.g. bioimpedance body fat
  device_id uuid,
  note text check (note is null or char_length(note) <= 500),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (case metric
    when 'weight_kg' then value between 20 and 400
    when 'body_fat_pct' then value between 2 and 75
    when 'muscle_mass_kg' then value between 5 and 150
    when 'lean_mass_kg' then value between 10 and 250
    else value between 10 and 250 end),
  foreign key (device_id, user_id) references public.devices (id, user_id) on delete set null (device_id)
);
create index body_measurements_user_metric_idx on public.body_measurements (user_id, metric, measured_at desc);
create index body_measurements_user_sync_idx on public.body_measurements (user_id, updated_at, id);
create unique index body_measurements_external_key on public.body_measurements (user_id, source, external_id)
  where external_id is not null;

create trigger body_measurements_local_date before insert or update of measured_at, time_zone on public.body_measurements
  for each row execute function private.fill_local_date('measured_at');
create trigger body_measurements_updated_at before update on public.body_measurements
  for each row execute function private.set_updated_at();
create trigger body_measurements_owner_immutable before update on public.body_measurements
  for each row execute function private.prevent_owner_change('user_id');

-- ── health_observations ──────────────────────────────────────────────────────
-- Units are fixed by metric: minutes (sleep, active_minutes), bpm, ms, steps, metres, kcal,
-- mood 1–5, stress 0–100. Sleep belongs to the day you wake up (local_date from end_at).
create table public.health_observations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  metric public.health_metric not null,
  value numeric(9, 2) not null,
  start_at timestamptz not null,
  end_at timestamptz,
  time_zone text not null,
  local_date date not null,
  source public.data_origin not null default 'manual',
  source_app text check (source_app is null or char_length(source_app) <= 80),
  external_id text check (external_id is null or char_length(external_id) <= 200),
  is_estimated boolean not null default false,
  -- sleep: { stages_min: {deep, rem, light, awake}, vendor_score } — stored only when provided.
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  device_id uuid,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at is null or end_at > start_at),
  check (metric not in ('sleep_session', 'steps', 'distance_m', 'active_energy_kcal', 'active_minutes') or end_at is not null),
  check (metric <> 'sleep_session' or (end_at - start_at <= interval '24 hours'
                                       and value <= extract(epoch from end_at - start_at) / 60)),
  check (case metric
    when 'sleep_session' then value between 0 and 1440
    when 'resting_hr_bpm' then value between 20 and 250
    when 'hrv_rmssd_ms' then value between 1 and 400
    when 'steps' then value between 0 and 200000 and value = trunc(value)
    when 'distance_m' then value between 0 and 500000
    when 'active_energy_kcal' then value between 0 and 20000
    when 'active_minutes' then value between 0 and 1440
    when 'mood' then value between 1 and 5 and value = trunc(value)
    when 'stress' then value between 0 and 100 end),
  foreign key (device_id, user_id) references public.devices (id, user_id) on delete set null (device_id)
);
create index health_observations_user_metric_idx on public.health_observations (user_id, metric, local_date desc);
create index health_observations_user_sync_idx on public.health_observations (user_id, updated_at, id);
create unique index health_observations_external_key on public.health_observations (user_id, source, external_id)
  where external_id is not null;

create trigger health_observations_local_date before insert or update of start_at, end_at, time_zone on public.health_observations
  for each row execute function private.fill_local_date('end_at', 'start_at');
create trigger health_observations_updated_at before update on public.health_observations
  for each row execute function private.set_updated_at();
create trigger health_observations_owner_immutable before update on public.health_observations
  for each row execute function private.prevent_owner_change('user_id');

-- ── goals ────────────────────────────────────────────────────────────────────
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind public.goal_kind not null,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  target_value numeric(10, 2) not null check (target_value >= 0),
  -- Baseline only if actually measured (e.g. latest weight); never back-filled.
  start_value numeric(10, 2),
  unit text check (unit is null or char_length(unit) <= 20), -- canonical: kg, steps, min, sessions
  start_date date not null,
  target_date date,
  status public.goal_status not null default 'active',
  achieved_at timestamptz,
  notes text check (notes is null or char_length(notes) <= 2000),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (target_date is null or target_date >= start_date),
  check ((status = 'achieved') = (achieved_at is not null))
);
create index goals_user_idx on public.goals (user_id, status);
create index goals_user_sync_idx on public.goals (user_id, updated_at, id);
create trigger goals_updated_at before update on public.goals
  for each row execute function private.set_updated_at();
create trigger goals_owner_immutable before update on public.goals
  for each row execute function private.prevent_owner_change('user_id');

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.body_measurements enable row level security;
alter table public.health_observations enable row level security;
alter table public.goals enable row level security;

do $$
declare t text;
begin
  foreach t in array array['body_measurements', 'health_observations', 'goals'] loop
    execute format('create policy %1$s_select_own on public.%1$I for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format('create policy %1$s_insert_own on public.%1$I for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format('create policy %1$s_update_own on public.%1$I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('create policy %1$s_delete_own on public.%1$I for delete to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
end $$;

revoke all on public.body_measurements, public.health_observations, public.goals from anon, authenticated;
grant select, insert, update, delete on public.body_measurements, public.health_observations, public.goals to authenticated;

-- ── Batch RPCs (idempotent on id and on (source, external_id)) ──────────────
-- Up to 500 rows per call. Rows already stored are skipped; returns how many were new.
create function public.record_body_measurements(p_rows jsonb) returns integer
language plpgsql security invoker set search_path = '' as $$
declare n integer;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then
    raise exception 'INVALID_INPUT' using errcode = 'VD005', detail = 'rows must be an array of at most 500';
  end if;
  insert into public.body_measurements (
    id, metric, value, measured_at, time_zone, source, source_app, external_id, is_estimated, device_id, note)
  select coalesce(r.id, gen_random_uuid()), r.metric, r.value,
         least(r.measured_at, clock_timestamp()), r.time_zone, coalesce(r.source, 'manual'),
         r.source_app, r.external_id, coalesce(r.is_estimated, false), r.device_id, r.note
  from jsonb_to_recordset(p_rows) as r(
    id uuid, metric public.body_metric, value numeric, measured_at timestamptz, time_zone text,
    source public.data_origin, source_app text, external_id text, is_estimated boolean, device_id uuid, note text)
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

create function public.record_observations(p_rows jsonb) returns integer
language plpgsql security invoker set search_path = '' as $$
declare n integer;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then
    raise exception 'INVALID_INPUT' using errcode = 'VD005', detail = 'rows must be an array of at most 500';
  end if;
  insert into public.health_observations (
    id, metric, value, start_at, end_at, time_zone, source, source_app, external_id, is_estimated, details, device_id)
  select coalesce(r.id, gen_random_uuid()), r.metric, r.value, r.start_at, r.end_at, r.time_zone,
         coalesce(r.source, 'manual'), r.source_app, r.external_id, coalesce(r.is_estimated, false),
         coalesce(r.details, '{}'::jsonb), r.device_id
  from jsonb_to_recordset(p_rows) as r(
    id uuid, metric public.health_metric, value numeric, start_at timestamptz, end_at timestamptz,
    time_zone text, source public.data_origin, source_app text, external_id text, is_estimated boolean,
    details jsonb, device_id uuid)
  where r.start_at <= clock_timestamp() + interval '5 minutes'
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.record_body_measurements(jsonb) from public, anon;
revoke all on function public.record_observations(jsonb) from public, anon;
grant execute on function public.record_body_measurements(jsonb) to authenticated;
grant execute on function public.record_observations(jsonb) to authenticated;
