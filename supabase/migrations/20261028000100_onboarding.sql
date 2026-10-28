-- Onboarding (mandatory first run): body data, activity and weight goal, plus the estimated
-- daily nutrition target. The calculation is pure and lives in @vida/domain (energyTarget);
-- this migration stores its inputs and result atomically and marks onboarding done.

-- ── Enums ────────────────────────────────────────────────────────────────────
-- Sex is collected only because the energy estimate (Mifflin-St Jeor) differs by sex.
create type public.biological_sex as enum ('male', 'female');
create type public.activity_level as enum ('sedentary', 'light', 'moderate', 'very_active');
create type public.weight_goal as enum ('lose', 'maintain', 'gain');
create type public.goal_pace as enum ('light', 'moderate', 'aggressive');

-- ── profiles ─────────────────────────────────────────────────────────────────
alter table public.profiles
  add column sex public.biological_sex,
  add column activity_level public.activity_level,
  add column weight_goal public.weight_goal,
  add column goal_pace public.goal_pace,
  -- A pace only makes sense when losing or gaining; losing or gaining always has one.
  add constraint profiles_goal_pace_check check (
    (goal_pace is null or weight_goal in ('lose', 'gain'))
    and (weight_goal is null or weight_goal = 'maintain' or goal_pace is not null)
  );

comment on column public.profiles.sex is 'Only used for the energy estimate (Mifflin-St Jeor).';

grant update (sex, activity_level, weight_goal, goal_pace) on public.profiles to authenticated;

-- ── nutrition_goals ─────────────────────────────────────────────────────────
-- true = calculated by VIDA (shown as an estimate); false = typed by the user.
alter table public.nutrition_goals add column is_estimated boolean not null default false;

-- ── complete_onboarding ─────────────────────────────────────────────────────
-- Saves the profile, today's weight (idempotent on p_measurement_id) and the nutrition target
-- effective from the user's local today (earlier days keep their goal), then sets onboarding done.
-- Re-running it recalculates: same day replaces the target, a later day adds a new one.
create function public.complete_onboarding(
  p_display_name text,
  p_birth_year integer,
  p_height_cm numeric,
  p_sex public.biological_sex,
  p_activity_level public.activity_level,
  p_weight_goal public.weight_goal,
  p_goal_pace public.goal_pace,
  p_weight_kg numeric,
  p_measurement_id uuid,
  p_kcal numeric,
  p_protein_g numeric,
  p_carbs_g numeric,
  p_fat_g numeric,
  p_is_estimated boolean default true,
  p_time_zone text default null
) returns public.profiles
language plpgsql security invoker set search_path = '' as $$
declare
  uid uuid := auth.uid();
  tz text;
  age integer;
  result public.profiles;
begin
  if uid is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;
  if p_birth_year is null or p_height_cm is null or p_sex is null or p_activity_level is null
     or p_weight_goal is null or p_weight_kg is null or p_measurement_id is null or p_kcal is null then
    raise exception 'INVALID_INPUT' using errcode = 'VD005', detail = 'missing onboarding fields';
  end if;

  select coalesce(p_time_zone, p.time_zone, 'UTC') into tz from public.user_preferences p where p.user_id = uid;
  tz := coalesce(tz, p_time_zone, 'UTC');
  if not private.is_valid_time_zone(tz) then
    raise exception 'INVALID_INPUT' using errcode = 'VD005', detail = 'unknown time zone';
  end if;

  age := extract(year from (now() at time zone tz))::integer - p_birth_year;
  if age not between 14 and 100 then
    raise exception 'INVALID_INPUT' using errcode = 'VD005', detail = 'age must be between 14 and 100';
  end if;
  if p_weight_kg not between 30 and 300 then
    raise exception 'INVALID_INPUT' using errcode = 'VD005', detail = 'weight out of range';
  end if;

  update public.profiles set
    display_name = coalesce(nullif(btrim(p_display_name), ''), display_name),
    birth_year = p_birth_year,
    height_cm = p_height_cm,
    sex = p_sex,
    activity_level = p_activity_level,
    weight_goal = p_weight_goal,
    goal_pace = case when p_weight_goal = 'maintain' then null else p_goal_pace end,
    onboarding_state = 'done'
  where id = uid
  returning * into result;

  insert into public.body_measurements (id, metric, value, measured_at, time_zone, source)
  values (p_measurement_id, 'weight_kg', p_weight_kg, clock_timestamp(), tz, 'manual')
  on conflict do nothing;

  insert into public.nutrition_goals (effective_from, kcal, protein_g, carbs_g, fat_g, is_estimated)
  values ((now() at time zone tz)::date, p_kcal, p_protein_g, p_carbs_g, p_fat_g, coalesce(p_is_estimated, true))
  on conflict (user_id, effective_from) do update set
    kcal = excluded.kcal, protein_g = excluded.protein_g, carbs_g = excluded.carbs_g,
    fat_g = excluded.fat_g, is_estimated = excluded.is_estimated;

  return result;
end $$;

revoke all on function public.complete_onboarding(text, integer, numeric, public.biological_sex, public.activity_level,
  public.weight_goal, public.goal_pace, numeric, uuid, numeric, numeric, numeric, numeric, boolean, text) from public, anon;
grant execute on function public.complete_onboarding(text, integer, numeric, public.biological_sex, public.activity_level,
  public.weight_goal, public.goal_pace, numeric, uuid, numeric, numeric, numeric, numeric, boolean, text) to authenticated;
