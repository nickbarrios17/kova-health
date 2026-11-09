-- A navigated bike ride saved as a workout: one completed session with the Ciclismo exercise and one
-- distance/time set; idempotent; only for yourself; bad numbers rejected.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, instance_id, aud, role, email) values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ciclista@test.local'),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'otro@test.local');

select is((select measurement_type::text from public.exercises where owner_id is null and slug = 'ciclismo'), 'distance_duration', 'the Ciclismo exercise exists');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

select lives_ok($$ select public.log_bike_ride('bbbbbbbb-0000-4000-8000-000000000001', 'Vuelta al lago',
  now() - interval '50 minutes', now() - interval '5 minutes', 2400, 12000.4, 'America/Argentina/Buenos_Aires') $$, 'a ride is saved');
select is((select status::text || ' ' || total_paused_s from public.workout_sessions where id = 'bbbbbbbb-0000-4000-8000-000000000001'),
  'completed 300', 'as a completed session; the time stopped counts as paused');
select is((select distance_m || ' ' || duration_s from public.workout_sets where session_id = 'bbbbbbbb-0000-4000-8000-000000000001'),
  '12000.4 2400', 'with one set: distance and time moving');

select lives_ok($$ select public.log_bike_ride('bbbbbbbb-0000-4000-8000-000000000001', 'Otra vez',
  now() - interval '50 minutes', now(), 2400, 12000, null) $$, 'saving it again is fine');
select is((select count(*)::int from public.workout_sets where session_id = 'bbbbbbbb-0000-4000-8000-000000000001'), 1, 'and keeps one ride');

select throws_ok($$ select public.log_bike_ride('bbbbbbbb-0000-4000-8000-000000000002', 'x', now() - interval '1 hour', now(), 3600, -5, null) $$,
  'VD005', null, 'a negative distance is rejected');

select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select is((select count(*)::int from public.workout_sessions), 0, 'another account does not see the ride');

select * from finish();
rollback;
