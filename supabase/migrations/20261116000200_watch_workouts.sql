-- Everything from Samsung Health / Health Connect, and daily summaries v2: the workouts recorded by the watch's own app (Samsung Health and others, read
-- from Health Connect as metric 'exercise_session') count as workouts, with the calories the watch
-- measured. New columns: watch_workouts, watch_active_s, watch_kcal, watch_unmeasured_s.

-- exercise_session: value = active minutes, start/end required, at most 24 h;
-- details: { exercise_type, title, kcal (active, measured), kcal_from_total }.
alter table public.health_observations drop constraint health_observations_check1;
alter table public.health_observations add constraint health_observations_check1 check (
  metric not in ('sleep_session', 'steps', 'distance_m', 'active_energy_kcal', 'active_minutes', 'exercise_session') or end_at is not null);
alter table public.health_observations add constraint health_observations_exercise_check check (
  metric <> 'exercise_session' or (value between 0 and 1440 and end_at - start_at <= interval '24 hours'
    and (details->>'kcal' is null or (jsonb_typeof(details->'kcal') = 'number' and (details->>'kcal')::numeric between 0 and 10000))));

-- Ranges of the new metrics (the original CASE lets unknown metrics through, so they are checked here).
alter table public.health_observations add constraint health_observations_more_check check (case metric
  when 'total_energy_kcal' then end_at is not null and value between 0 and 30000
  when 'floors' then end_at is not null and value between 0 and 2000
  when 'heart_rate_bpm' then end_at is not null and value between 20 and 250
  when 'blood_pressure_mmhg' then value between 50 and 260
    and coalesce(jsonb_typeof(details->'diastolic') = 'number' and (details->>'diastolic')::numeric between 20 and 200, false)
  when 'blood_glucose_mgdl' then value between 10 and 1000
  when 'spo2_pct' then value between 50 and 100
  when 'respiratory_rate' then value between 3 and 80
  when 'vo2max' then value between 5 and 100
  when 'hydration_ml' then end_at is not null and value between 0 and 10000
  when 'skin_temp_delta_c' then end_at is not null and value between -10 and 10
  when 'body_temp_c' then value between 30 and 45
  else true end);

-- Body: the old CASE sends unknown metrics to 10-250, which does not fit bone mass or BMR.
alter table public.body_measurements drop constraint body_measurements_check;
alter table public.body_measurements add constraint body_measurements_check check (case metric
  when 'weight_kg' then value between 20 and 400
  when 'body_fat_pct' then value between 2 and 75
  when 'muscle_mass_kg' then value between 5 and 150
  when 'lean_mass_kg' then value between 10 and 250
  when 'body_water_kg' then value between 5 and 200
  when 'bone_mass_kg' then value between 0.5 and 15
  when 'height_cm' then value between 50 and 250
  when 'bmr_kcal' then value between 500 and 5000
  else value between 10 and 250 end);

drop function public.daily_summaries(date, date);
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
  mood numeric,
  watch_workouts integer,
  watch_active_s integer,
  watch_kcal numeric,
  watch_unmeasured_s integer
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
    2::smallint,
    coalesce(w.n, 0) + coalesce(wx.n, 0),
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
    md.value,
    coalesce(wx.n, 0),
    coalesce(wx.active_s, 0),
    wx.kcal,
    coalesce(wx.unmeasured_s, 0)
  from days d
  -- Workouts: completed sessions of that day (plus the watch's own, below: workouts_completed counts both).
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
  -- Workouts from the watch's own app (Health Connect), minus the ones that overlap a Kova session
  -- (the same workout recorded twice). kcal: the active calories the watch measured; sessions without
  -- them are counted in unmeasured_s and estimated by the client from their minutes.
  left join lateral (
    select count(*)::integer as n, sum(o.value * 60)::integer as active_s,
           sum((o.details->>'kcal')::numeric) as kcal,
           coalesce(sum(o.value * 60) filter (where o.details->>'kcal' is null), 0)::integer as unmeasured_s
    from public.health_observations o
    where o.user_id = uid and o.metric = 'exercise_session' and o.local_date = d.day and o.deleted_at is null
      and not exists (
        select 1 from public.workout_sessions ws
        where ws.user_id = uid and ws.status = 'completed' and ws.deleted_at is null
          and ws.started_at < o.end_at and coalesce(ws.ended_at, ws.started_at) > o.start_at)
  ) wx on true
  order by d.day;
end $$;

revoke all on function public.daily_summaries(date, date) from public, anon;
grant execute on function public.daily_summaries(date, date) to authenticated;

-- What the watch and the health apps measured on a day, for «Del reloj»: the day's totals (largest
-- source wins, as with steps), the day's average pulse, and the latest value of the rest (last 30
-- days, with when it was taken).
create function public.health_day(p_day date)
returns table (metric text, value numeric, extra jsonb, at timestamptz)
language sql stable security invoker set search_path = '' as $$
  with obs as (
    select * from public.health_observations o
    where o.user_id = (select auth.uid()) and o.deleted_at is null
  ),
  totals as (
    select t.metric::text, max(t.s), null::jsonb, max(t.last_at) from (
      select o.metric, o.source, o.source_app, sum(o.value) as s, max(coalesce(o.end_at, o.start_at)) as last_at from obs o
      where o.local_date = p_day and o.metric in ('distance_m', 'active_energy_kcal', 'total_energy_kcal', 'floors', 'hydration_ml')
      group by o.metric, o.source, o.source_app
    ) t group by t.metric
  ),
  pulse as (
    select 'heart_rate_bpm'::text,
           round(sum(o.value * coalesce((o.details->>'samples')::numeric, 1)) / nullif(sum(coalesce((o.details->>'samples')::numeric, 1)), 0)),
           jsonb_build_object('min', min((o.details->>'min')::numeric), 'max', max((o.details->>'max')::numeric)), max(o.end_at)
    from obs o where o.local_date = p_day and o.metric = 'heart_rate_bpm'
    having count(*) > 0
  ),
  latest as (
    select distinct on (o.metric) o.metric::text, o.value, nullif(o.details, '{}'::jsonb), coalesce(o.end_at, o.start_at)
    from obs o
    where o.local_date between p_day - 30 and p_day
      and o.metric in ('blood_pressure_mmhg', 'blood_glucose_mgdl', 'spo2_pct', 'respiratory_rate', 'vo2max', 'skin_temp_delta_c', 'body_temp_c')
    order by o.metric, coalesce(o.end_at, o.start_at) desc
  ),
  body as (
    select distinct on (b.metric) b.metric::text, b.value, null::jsonb, b.measured_at
    from public.body_measurements b
    where b.user_id = (select auth.uid()) and b.deleted_at is null and b.local_date <= p_day
      and b.metric in ('lean_mass_kg', 'muscle_mass_kg', 'body_water_kg', 'bone_mass_kg', 'height_cm', 'bmr_kcal')
    order by b.metric, b.measured_at desc
  )
  select * from totals union all select * from pulse union all select * from latest union all select * from body
$$;
revoke all on function public.health_day(date) from public, anon;
grant execute on function public.health_day(date) to authenticated;
