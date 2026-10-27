-- Habits: definition, dated schedule versions, and completion logs — three separate entities.
-- Changing a schedule or target adds a new version from a date onwards, so past days keep being
-- evaluated against the rules that applied then (master prompt §5.6).

create type public.habit_kind as enum ('check', 'count', 'duration');
create type public.habit_frequency as enum ('daily', 'weekly');

create table public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  kind public.habit_kind not null default 'check',
  unit text check (unit is null or char_length(unit) <= 20), -- 'vasos', 'min', 'páginas'
  icon text check (icon is null or icon ~ '^[a-z0-9-]{1,40}$'), -- Phosphor icon name
  start_date date not null check (start_date >= date '2000-01-01'),
  position smallint not null default 0 check (position between 0 and 999),
  archived_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create index habits_user_sync_idx on public.habits (user_id, updated_at, id);
create trigger habits_updated_at before update on public.habits
  for each row execute function private.set_updated_at();
create trigger habits_owner_immutable before update on public.habits
  for each row execute function private.prevent_owner_change('user_id');

create table public.habit_schedules (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null,
  user_id uuid not null default auth.uid(),
  effective_from date not null,
  frequency public.habit_frequency not null default 'daily',
  -- daily: ISO weekdays it applies to (empty = every day). weekly: ignored.
  days smallint[] not null default '{}'
    check (days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[] and cardinality(days) <= 7),
  times_per_week smallint check (times_per_week between 1 and 7),
  target_value numeric(9, 2) check (target_value > 0 and target_value <= 100000), -- null = 1 (done/not done)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (habit_id, effective_from),
  check ((frequency = 'weekly') = (times_per_week is not null)),
  foreign key (habit_id, user_id) references public.habits (id, user_id) on delete cascade
);
create index habit_schedules_user_sync_idx on public.habit_schedules (user_id, updated_at, id);
create trigger habit_schedules_updated_at before update on public.habit_schedules
  for each row execute function private.set_updated_at();
create trigger habit_schedules_owner_immutable before update on public.habit_schedules
  for each row execute function private.prevent_owner_change('user_id');

-- Several logs per day are allowed (e.g. one per glass of water); the day's value is their sum.
create table public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null,
  user_id uuid not null default auth.uid(),
  local_date date not null check (local_date >= date '2000-01-01'),
  value numeric(9, 2) not null default 1 check (value > 0 and value <= 100000),
  note text check (note is null or char_length(note) <= 500),
  logged_at timestamptz not null default now(),
  device_id uuid,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (habit_id, user_id) references public.habits (id, user_id) on delete cascade,
  foreign key (device_id, user_id) references public.devices (id, user_id) on delete set null (device_id)
);
create index habit_logs_habit_day_idx on public.habit_logs (habit_id, local_date);
create index habit_logs_user_sync_idx on public.habit_logs (user_id, updated_at, id);
create trigger habit_logs_updated_at before update on public.habit_logs
  for each row execute function private.set_updated_at();
create trigger habit_logs_owner_immutable before update on public.habit_logs
  for each row execute function private.prevent_owner_change('user_id');

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.habits enable row level security;
alter table public.habit_schedules enable row level security;
alter table public.habit_logs enable row level security;

do $$
declare t text;
begin
  foreach t in array array['habits', 'habit_schedules', 'habit_logs'] loop
    execute format('create policy %1$s_select_own on public.%1$I for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format('create policy %1$s_insert_own on public.%1$I for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format('create policy %1$s_update_own on public.%1$I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('create policy %1$s_delete_own on public.%1$I for delete to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
end $$;

revoke all on public.habits, public.habit_schedules, public.habit_logs from anon, authenticated;
grant select, insert, update, delete on public.habits, public.habit_schedules, public.habit_logs to authenticated;

-- ── RPC: save_habit ──────────────────────────────────────────────────────────
-- Creates the habit (idempotent on p_id) and sets the schedule version that starts on
-- p_effective_from. Earlier versions are untouched.
create function public.save_habit(
  p_id uuid,
  p_name text,
  p_effective_from date,
  p_kind public.habit_kind default 'check',
  p_unit text default null,
  p_icon text default null,
  p_frequency public.habit_frequency default 'daily',
  p_days smallint[] default '{}',
  p_times_per_week smallint default null,
  p_target_value numeric default null
) returns public.habits
language plpgsql security invoker set search_path = '' as $$
declare
  h public.habits;
begin
  select * into h from public.habits where id = p_id;
  if not found then
    insert into public.habits (id, name, kind, unit, icon, start_date)
    values (p_id, btrim(p_name), p_kind, p_unit, p_icon, p_effective_from)
    returning * into h;
  elsif h.deleted_at is not null then
    raise exception 'NOT_FOUND' using errcode = 'VD404';
  else
    if p_effective_from < h.start_date then
      raise exception 'INVALID_INPUT' using errcode = 'VD005', detail = 'schedule cannot start before the habit';
    end if;
    update public.habits set name = btrim(p_name), unit = p_unit, icon = p_icon
    where id = p_id returning * into h;
  end if;

  insert into public.habit_schedules (habit_id, effective_from, frequency, days, times_per_week, target_value)
  values (p_id, p_effective_from, p_frequency, coalesce(p_days, '{}'),
          case when p_frequency = 'weekly' then p_times_per_week end, p_target_value)
  on conflict (habit_id, effective_from) do update
    set frequency = excluded.frequency, days = excluded.days,
        times_per_week = excluded.times_per_week, target_value = excluded.target_value;

  return h;
end $$;

-- ── habit_days: one row per habit and day, evaluated with the schedule in force that day ──
-- Range limited to 366 days. Weekly habits report daily values; weekly completion and streaks
-- are computed in @vida/domain (habitStreak / weeklyProgress).
create function public.habit_days(p_from date, p_to date)
returns table (
  habit_id uuid,
  local_date date,
  frequency public.habit_frequency,
  scheduled boolean,
  times_per_week smallint,
  target_value numeric,
  value numeric,
  completed boolean
)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'INVALID_INPUT' using errcode = 'VD005', detail = 'range must be 0..366 days';
  end if;
  return query
  select
    h.id,
    d.day,
    s.frequency,
    case when s.frequency = 'daily'
         then cardinality(s.days) = 0 or extract(isodow from d.day)::smallint = any (s.days)
         else true end,
    s.times_per_week,
    coalesce(s.target_value, 1),
    coalesce(l.total, 0),
    coalesce(l.total, 0) >= coalesce(s.target_value, 1)
  from public.habits h
  -- timestamp (without time zone) series, so ::date never depends on the session time zone
  cross join lateral generate_series(greatest(p_from, h.start_date)::timestamp, p_to::timestamp, interval '1 day') as g(ts)
  cross join lateral (select g.ts::date as day) d
  join lateral (
    select hs.* from public.habit_schedules hs
    where hs.habit_id = h.id and hs.effective_from <= d.day
    order by hs.effective_from desc limit 1
  ) s on true
  left join lateral (
    select sum(hl.value) as total from public.habit_logs hl
    where hl.habit_id = h.id and hl.local_date = d.day and hl.deleted_at is null
  ) l on true
  where h.deleted_at is null
    and (h.archived_at is null or d.day <= (h.archived_at at time zone 'UTC')::date)
  order by h.position, h.id, d.day;
end $$;

revoke all on function public.save_habit(uuid, text, date, public.habit_kind, text, text, public.habit_frequency, smallint[], smallint, numeric) from public, anon;
grant execute on function public.save_habit(uuid, text, date, public.habit_kind, text, text, public.habit_frequency, smallint[], smallint, numeric) to authenticated;
revoke all on function public.habit_days(date, date) from public, anon;
grant execute on function public.habit_days(date, date) to authenticated;
