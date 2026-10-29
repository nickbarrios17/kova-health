-- Body recomposition goal, part 2 (the enum value is added in 20261028000300_recomp_enum.sql):
-- like maintain, it has no pace; only lose and gain do.

alter table public.profiles drop constraint profiles_goal_pace_check;
alter table public.profiles add constraint profiles_goal_pace_check check (
  (goal_pace is null or weight_goal in ('lose', 'gain'))
  and (weight_goal is null or weight_goal not in ('lose', 'gain') or goal_pace is not null)
);

-- Same as in 20261028000100_onboarding.sql, except that only lose and gain keep a pace.
create or replace function public.complete_onboarding(
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
    goal_pace = case when p_weight_goal in ('lose', 'gain') then p_goal_pace end,
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
