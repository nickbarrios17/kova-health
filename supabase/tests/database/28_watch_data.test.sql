-- Samsung Health / Health Connect: watch workouts count as workouts (unless Kova recorded the same one),
-- with the calories the watch measured; the rest of the watch's data is stored with its ranges.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, instance_id, aud, role, email) values
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reloj@test.local');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);

-- A gym session at 10:00 recorded by the watch (55 min, 410 kcal) and a run at 18:00 recorded by both
-- the watch and Kova: only the gym one is a watch workout.
select is(public.record_observations(jsonb_build_array(
  jsonb_build_object('metric', 'exercise_session', 'value', 55, 'start_at', '2026-11-12T13:00:00Z', 'end_at', '2026-11-12T13:58:00Z',
    'time_zone', 'America/Argentina/Buenos_Aires', 'source', 'health_connect', 'source_app', 'com.sec.android.app.shealth', 'external_id', 'ex-1',
    'details', jsonb_build_object('exercise_type', 81, 'title', 'Pesas', 'kcal', 410)),
  jsonb_build_object('metric', 'exercise_session', 'value', 30, 'start_at', '2026-11-12T21:00:00Z', 'end_at', '2026-11-12T21:30:00Z',
    'time_zone', 'America/Argentina/Buenos_Aires', 'source', 'health_connect', 'source_app', 'com.sec.android.app.shealth', 'external_id', 'ex-2',
    'details', jsonb_build_object('exercise_type', 56, 'kcal', 300)),
  jsonb_build_object('metric', 'exercise_session', 'value', 20, 'start_at', '2026-11-12T15:00:00Z', 'end_at', '2026-11-12T15:20:00Z',
    'time_zone', 'America/Argentina/Buenos_Aires', 'source', 'health_connect', 'source_app', 'com.sec.android.app.shealth', 'external_id', 'ex-3',
    'details', jsonb_build_object('exercise_type', 79))
)), 3, 'watch workouts are imported');
select public.log_foot_activity('a8000000-0000-4000-8000-000000000001', 'run', 'Trote', '2026-11-12T21:00:00Z', '2026-11-12T21:31:00Z', 1800, 5000, 'America/Argentina/Buenos_Aires');

select results_eq($$ select workouts_completed, watch_workouts, watch_active_s, watch_kcal, watch_unmeasured_s from public.daily_summaries('2026-11-12', '2026-11-12') $$,
  $$ values (3, 2, 4500, 410::numeric, 1200) $$, 'three workouts: the run once (Kova), the gym session and the walk from the watch');
select is(public.record_observations(jsonb_build_array(jsonb_build_object('metric', 'exercise_session', 'value', 55, 'start_at', '2026-11-12T13:00:00Z',
  'end_at', '2026-11-12T13:58:00Z', 'time_zone', 'UTC', 'source', 'health_connect', 'external_id', 'ex-1'))), 0, 're-syncing does not duplicate');
select throws_ok($$ select public.record_observations(jsonb_build_array(jsonb_build_object('metric', 'exercise_session', 'value', 30,
  'start_at', '2026-11-12T10:00:00Z', 'time_zone', 'UTC', 'external_id', 'ex-x'))) $$, '23514', null, 'a workout needs its end');

-- The rest of the watch's data.
select is(public.record_observations(jsonb_build_array(
  jsonb_build_object('metric', 'blood_pressure_mmhg', 'value', 118, 'start_at', '2026-11-12T12:00:00Z', 'time_zone', 'UTC', 'external_id', 'bp', 'details', jsonb_build_object('diastolic', 76)),
  jsonb_build_object('metric', 'spo2_pct', 'value', 97, 'start_at', '2026-11-12T08:00:00Z', 'time_zone', 'UTC', 'external_id', 'o2'),
  jsonb_build_object('metric', 'heart_rate_bpm', 'value', 70, 'start_at', '2026-11-12T10:00:00Z', 'end_at', '2026-11-12T11:00:00Z', 'time_zone', 'UTC', 'external_id', 'hr1', 'details', jsonb_build_object('min', 60, 'max', 90, 'samples', 3)),
  jsonb_build_object('metric', 'heart_rate_bpm', 'value', 110, 'start_at', '2026-11-12T13:00:00Z', 'end_at', '2026-11-12T14:00:00Z', 'time_zone', 'UTC', 'external_id', 'hr2', 'details', jsonb_build_object('min', 95, 'max', 150, 'samples', 1)),
  jsonb_build_object('metric', 'floors', 'value', 8, 'start_at', '2026-11-12T10:00:00Z', 'end_at', '2026-11-12T20:00:00Z', 'time_zone', 'UTC', 'external_id', 'fl')
)), 5, 'pressure, oxygen, pulse and floors are imported');
select throws_ok($$ select public.record_observations(jsonb_build_array(jsonb_build_object('metric', 'blood_pressure_mmhg', 'value', 118,
  'start_at', '2026-11-12T12:00:00Z', 'time_zone', 'UTC', 'external_id', 'bp2'))) $$, '23514', null, 'pressure needs the diastolic');
select throws_ok($$ select public.record_observations(jsonb_build_array(jsonb_build_object('metric', 'spo2_pct', 'value', 140,
  'start_at', '2026-11-12T12:00:00Z', 'time_zone', 'UTC', 'external_id', 'o2b'))) $$, '23514', null, 'oxygen over 100 % is rejected');

select is(public.record_body_measurements(jsonb_build_array(
  jsonb_build_object('metric', 'bone_mass_kg', 'value', 3.1, 'measured_at', '2026-11-12T09:00:00Z', 'time_zone', 'UTC', 'external_id', 'bm'),
  jsonb_build_object('metric', 'bmr_kcal', 'value', 1720, 'measured_at', '2026-11-12T09:00:00Z', 'time_zone', 'UTC', 'external_id', 'bmr'),
  jsonb_build_object('metric', 'body_water_kg', 'value', 44, 'measured_at', '2026-11-12T09:00:00Z', 'time_zone', 'UTC', 'external_id', 'bw')
)), 3, 'bone mass, BMR and body water fit their ranges');

select is((select value from public.health_day('2026-11-12') where metric = 'heart_rate_bpm'), 80::numeric, 'the day''s pulse is weighted by samples');
select is((select extra->>'max' from public.health_day('2026-11-12') where metric = 'heart_rate_bpm'), '150', 'with the day''s max');
select is((select extra->>'diastolic' from public.health_day('2026-11-12') where metric = 'blood_pressure_mmhg'), '76', 'pressure with its diastolic');
select is((select count(*)::int from public.health_day('2026-11-12') where metric in ('floors', 'spo2_pct', 'bone_mass_kg', 'bmr_kcal', 'body_water_kg')), 5,
  'floors, oxygen and body composition are in the day');

select * from finish();
rollback;
