-- Daily summaries: derived on read from the source records (nothing stored, nothing to
-- invalidate). Calculation rules are documented in docs/api.md §Daily summaries; bump
-- calc_version when a rule changes. Missing data stays NULL — it is never filled with defaults.

create function public.daily_summaries(p_from date, p_to date)
returns table (
  local_date date,
  calc_version smallint,
  workouts_completed integer,
  workout_active_s integer,
  workout_volume_kg numeric,
  kcal numeric,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  nutrition_items integer,
  nutrition_has_unverified boolean,
  kcal_goal numeric,
  protein_goal_g numeric,
  carbs_goal_g numeric,
  fat_goal_g numeric,
  habits_scheduled integer,
  habits_completed integer,
  weight_kg numeric,
  steps integer,
  sleep_min numeric,
  resting_hr_bpm numeric,
  hrv_rmssd_ms numeric,
  mood numeric
)
language plpgsql stable security invoker set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'NOT_FOUND' using errcode = 'VD404';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 92 then
    raise exception 'INVALID_INPUT' using errcode = 'VD005', detail = 'range must be 0..92 days';
  end if;

  return query
  with days as (
    select g.ts::date as day
    from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') as g(ts)
  ),
  habit as (
    select hd.local_date as day,
           count(*) filter (where hd.frequency = 'daily' and hd.scheduled)::integer as scheduled,
           count(*) filter (where hd.frequency = 'daily' and hd.scheduled and hd.completed)::integer as completed
    from public.habit_days(p_from, p_to) hd
    group by hd.local_date
  )
  select
    d.day,
    1::smallint,
    coalesce(w.n, 0),
    coalesce(w.active_s, 0),
    coalesce(w.volume, 0),
    nd.kcal, nd.protein_g, nd.carbs_g, nd.fat_g,
    coalesce(nd.items, 0)::integer,
    coalesce(nd.has_unverified_values, false),
    ng.kcal, ng.protein_g, ng.carbs_g, ng.fat_g,
    coalesce(hb.scheduled, 0),
    coalesce(hb.completed, 0),
    wt.value,
    st.total::integer,
    sl.total,
    rhr.avg_value,
    hrv.avg_value,
    md.value
  from days d
  -- Workouts: completed sessions of that day.
  left join lateral (
    select count(*)::integer as n, sum(ss.active_duration_s)::integer as active_s, sum(ss.volume_kg) as volume
    from public.session_summaries ss
    where ss.user_id = uid and ss.local_date = d.day and ss.status = 'completed'
  ) w on true
  -- Nutrition totals and the goal in force that day.
  left join public.nutrition_daily nd on nd.user_id = uid and nd.local_date = d.day
  left join lateral (
    select g.* from public.nutrition_goals g
    where g.user_id = uid and g.effective_from <= d.day
    order by g.effective_from desc limit 1
  ) ng on true
  left join habit hb on hb.day = d.day
  -- Weight: last measurement of the day.
  left join lateral (
    select bm.value from public.body_measurements bm
    where bm.user_id = uid and bm.metric = 'weight_kg' and bm.local_date = d.day and bm.deleted_at is null
    order by bm.measured_at desc limit 1
  ) wt on true
  -- Steps and sleep: summed per source, then the largest source total is used, so the phone and
  -- the watch reporting the same walk are not double-counted.
  left join lateral (
    select max(t.s) as total from (
      select sum(o.value) as s from public.health_observations o
      where o.user_id = uid and o.metric = 'steps' and o.local_date = d.day and o.deleted_at is null
      group by o.source, o.source_app
    ) t
  ) st on true
  left join lateral (
    select max(t.s) as total from (
      select sum(o.value) as s from public.health_observations o
      where o.user_id = uid and o.metric = 'sleep_session' and o.local_date = d.day and o.deleted_at is null
      group by o.source, o.source_app
    ) t
  ) sl on true
  left join lateral (
    select round(avg(o.value), 1) as avg_value from public.health_observations o
    where o.user_id = uid and o.metric = 'resting_hr_bpm' and o.local_date = d.day and o.deleted_at is null
  ) rhr on true
  left join lateral (
    select round(avg(o.value), 1) as avg_value from public.health_observations o
    where o.user_id = uid and o.metric = 'hrv_rmssd_ms' and o.local_date = d.day and o.deleted_at is null
  ) hrv on true
  -- Mood: the latest check-in of the day.
  left join lateral (
    select o.value from public.health_observations o
    where o.user_id = uid and o.metric = 'mood' and o.local_date = d.day and o.deleted_at is null
    order by o.start_at desc limit 1
  ) md on true
  order by d.day;
end $$;

revoke all on function public.daily_summaries(date, date) from public, anon;
grant execute on function public.daily_summaries(date, date) to authenticated;

-- ── Export now covers every user-owned table ────────────────────────────────
create or replace function public.export_my_data() returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'NOT_FOUND' using errcode = 'VD404';
  end if;

  -- Built in two halves: jsonb_build_object accepts at most 100 arguments.
  return jsonb_build_object(
    'format', 'vida-export/2',
    'exported_at', now(),
    'user_id', uid,
    'profile', (select to_jsonb(p) from public.profiles p where p.id = uid),
    'preferences', (select to_jsonb(p) from public.user_preferences p where p.user_id = uid),
    'exercises', (
      select coalesce(jsonb_agg(to_jsonb(x) || jsonb_build_object(
        'muscles', (select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) from public.exercise_muscles m where m.exercise_id = x.id),
        'equipment', (select coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb) from public.exercise_equipment q where q.exercise_id = x.id))), '[]'::jsonb)
      from public.exercises x where x.owner_id = uid),
    'foods', (select coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb) from public.foods f where f.owner_id = uid)
  ) || jsonb_build_object(
    'devices', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.devices x where x.user_id = uid),
    'user_entitlements', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.user_entitlements x where x.user_id = uid),
    'routines', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.routines x where x.user_id = uid),
    'routine_exercises', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.routine_exercises x where x.user_id = uid),
    'workout_sessions', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.workout_sessions x where x.user_id = uid),
    'workout_session_exercises', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.workout_session_exercises x where x.user_id = uid),
    'workout_sets', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.workout_sets x where x.user_id = uid),
    'recipes', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.recipes x where x.user_id = uid),
    'recipe_ingredients', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.recipe_ingredients x where x.user_id = uid),
    'meals', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.meals x where x.user_id = uid),
    'meal_items', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.meal_items x where x.user_id = uid),
    'nutrition_goals', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.nutrition_goals x where x.user_id = uid),
    'habits', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.habits x where x.user_id = uid),
    'habit_schedules', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.habit_schedules x where x.user_id = uid),
    'habit_logs', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.habit_logs x where x.user_id = uid),
    'body_measurements', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.body_measurements x where x.user_id = uid),
    'health_observations', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.health_observations x where x.user_id = uid),
    'goals', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.goals x where x.user_id = uid)
  );
end $$;
