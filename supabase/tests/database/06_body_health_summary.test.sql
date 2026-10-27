-- Body measurements, health observations, goals and daily summaries.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

insert into auth.users (id, instance_id, aud, role, email) values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local'),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local');
update public.user_preferences set time_zone = 'Europe/Madrid' where user_id = '11111111-1111-4111-8111-111111111111';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

-- ── Body ─────────────────────────────────────────────────────────────────
select is(public.record_body_measurements($$[
  {"id":"d1000000-0000-4000-8000-000000000001","metric":"weight_kg","value":78.6,"measured_at":"2025-10-25T06:00:00Z"},
  {"id":"d1000000-0000-4000-8000-000000000002","metric":"weight_kg","value":78.4,"measured_at":"2025-10-25T06:30:00Z",
   "source":"health_connect","source_app":"Samsung Health","external_id":"hc-w-1"}]$$::jsonb),
  2, 'two measurements stored');
select is(public.record_body_measurements($$[
  {"id":"d1000000-0000-4000-8000-000000000001","metric":"weight_kg","value":78.6,"measured_at":"2025-10-25T06:00:00Z"},
  {"id":"d1000000-0000-4000-8000-000000000099","metric":"weight_kg","value":78.4,"measured_at":"2025-10-25T06:30:00Z",
   "source":"health_connect","external_id":"hc-w-1"}]$$::jsonb),
  0, 'replays (same id, or same source + external_id) are skipped');
select throws_ok($$ select public.record_body_measurements('[{"metric":"body_fat_pct","value":90,"measured_at":"2025-10-25T06:00:00Z"}]') $$,
  '23514', null, 'out-of-range values are rejected');
select lives_ok($$ select public.record_body_measurements('[{"id":"d1000000-0000-4000-8000-000000000003","metric":"waist_cm","value":84,"measured_at":"2025-10-24T22:30:00Z"}]') $$,
  'partial measurements are fine (only waist)');
select is((select local_date from public.body_measurements where id = 'd1000000-0000-4000-8000-000000000003'), '2025-10-25'::date,
  '22:30 UTC is already the 25th in Madrid');

-- ── Health observations ─────────────────────────────────────────────────
select is(public.record_observations($$[
  {"metric":"sleep_session","value":432,"start_at":"2025-10-24T21:48:00Z","end_at":"2025-10-25T05:20:00Z",
   "source":"health_connect","source_app":"Samsung Health","external_id":"hc-s-1",
   "details":{"stages_min":{"deep":78,"rem":96,"light":238,"awake":20},"vendor_score":76}},
  {"metric":"steps","value":7000,"start_at":"2025-10-25T06:00:00Z","end_at":"2025-10-25T20:00:00Z","source":"health_connect","source_app":"Google Fit","external_id":"hc-st-phone"},
  {"metric":"steps","value":7842,"start_at":"2025-10-25T06:00:00Z","end_at":"2025-10-25T20:00:00Z","source":"health_connect","source_app":"Samsung Health","external_id":"hc-st-watch"},
  {"metric":"resting_hr_bpm","value":59,"start_at":"2025-10-25T05:00:00Z"},
  {"metric":"hrv_rmssd_ms","value":51,"start_at":"2025-10-25T05:00:00Z"},
  {"metric":"mood","value":2,"start_at":"2025-10-25T08:00:00Z"},
  {"metric":"mood","value":3,"start_at":"2025-10-25T19:00:00Z"}]$$::jsonb),
  7, 'observations imported');
select is((select local_date from public.health_observations where external_id = 'hc-s-1'), '2025-10-25'::date,
  'sleep belongs to the wake-up day');
select throws_ok($$ select public.record_observations('[{"metric":"sleep_session","value":600,"start_at":"2025-10-24T22:00:00Z","end_at":"2025-10-25T06:00:00Z"}]') $$,
  '23514', null, 'sleep cannot exceed time in bed');
select throws_ok($$ select public.record_observations('[{"metric":"mood","value":3.5,"start_at":"2025-10-25T08:00:00Z"}]') $$,
  '23514', null, 'mood is an integer 1–5');
select throws_ok($$ select public.record_observations('[{"metric":"steps","value":100,"start_at":"2025-10-25T08:00:00Z"}]') $$,
  '23514', null, 'interval metrics need end_at');

-- ── Goals ────────────────────────────────────────────────────────────────
select lives_ok($$ insert into public.goals (kind, title, target_value, start_value, unit, start_date, target_date)
                   values ('weight', 'Llegar a 76 kg', 76, 78.4, 'kg', '2025-10-25', '2026-03-01') $$, 'A sets a weight goal');
select throws_ok($$ insert into public.goals (kind, title, target_value, start_date, status) values ('steps_daily', 'x', 10000, '2025-10-25', 'achieved') $$,
  '23514', null, 'achieved goals need achieved_at');

-- ── Daily summary ───────────────────────────────────────────────────────
do $setup$ begin
  insert into public.nutrition_goals (effective_from, kcal, protein_g) values ('2025-10-01', 2300, 150);
  insert into public.foods (id, name, ref_amount, ref_unit, kcal, protein_g, carbs_g, fat_g)
  values ('f0000000-0000-4000-8000-000000000009', 'Yogur griego', 170, 'g', 165, 15, 6, 9);
  perform public.log_food(gen_random_uuid(), '2025-10-25', 'afternoon_snack', 170, p_food_id => 'f0000000-0000-4000-8000-000000000009');
  perform public.save_habit('b0000000-0000-4000-8000-000000000009', 'Agua', '2025-10-20');
  insert into public.habit_logs (habit_id, local_date) values ('b0000000-0000-4000-8000-000000000009', '2025-10-25');
end $setup$;

select results_eq($$ select weight_kg, steps, sleep_min, resting_hr_bpm, hrv_rmssd_ms, mood, kcal, protein_g,
                            kcal_goal, protein_goal_g, habits_scheduled, habits_completed, workouts_completed
                     from public.daily_summaries('2025-10-25', '2025-10-25') $$,
  $$ values (78.40::numeric, 7842, 432.00::numeric, 59.0::numeric, 51.0::numeric, 3.00::numeric, 165.0::numeric,
             15.00::numeric, 2300::numeric, 150::numeric, 1, 1, 0) $$,
  'summary: latest weight, steps from the largest source (no double count), sleep, latest mood, food vs goal, habits');
select results_eq($$ select weight_kg, steps, kcal, kcal_goal, habits_scheduled from public.daily_summaries('2025-10-26', '2025-10-26') $$,
  $$ values (null::numeric, null::integer, null::numeric, 2300::numeric, 1) $$,
  'a day without data stays empty (no invented values)');
select throws_ok($$ select * from public.daily_summaries('2025-01-01', '2025-12-31') $$, 'VD005', null, 'range is limited');

select ok((select public.export_my_data() ?& array['meal_items', 'habit_logs', 'body_measurements', 'health_observations', 'goals', 'foods']),
  'export includes every phase 4 table');

-- ── B is isolated ────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select results_eq($$ select weight_kg, steps, sleep_min, kcal from public.daily_summaries('2025-10-25', '2025-10-25') $$,
  $$ values (null::numeric, null::integer, null::numeric, null::numeric) $$, 'B''s summary contains none of A''s data');

select * from finish();
rollback;
