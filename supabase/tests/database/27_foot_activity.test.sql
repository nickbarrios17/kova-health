-- Correr y caminar: routes say their sport, and a run or a walk is saved as a workout with its exercise.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, instance_id, aud, role, email) values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'corredora@test.local');

select is((select count(*)::int from public.exercises where owner_id is null and slug in ('correr', 'caminata') and measurement_type = 'distance_duration'), 2,
  'the Correr and Caminata exercises exist');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

select lives_ok($$ insert into public.bike_routes (id, name, kind, route, distance_m, duration_s, sport)
  values ('a7000000-0000-4000-8000-000000000001', 'Vuelta al parque', 'loop', '{}', 5000, 1800, 'run') $$, 'a route planned for running');
select is((select sport from public.bike_routes where id = 'a7000000-0000-4000-8000-000000000001'), 'run', 'keeps its sport');
select throws_ok($$ insert into public.bike_routes (name, kind, route, distance_m, duration_s, sport) values ('x', 'loop', '{}', 1, 1, 'swim') $$,
  '23514', null, 'an unknown sport is rejected');

select lives_ok($$ select public.log_foot_activity('a7000000-0000-4000-8000-000000000002', 'run', 'Fondo',
  now() - interval '40 minutes', now() - interval '2 minutes', 2160, 6200, 'America/Argentina/Buenos_Aires') $$, 'a run is saved');
select is((select e.slug || ' ' || s.distance_m || ' ' || s.duration_s from public.workout_sets s
  join public.workout_session_exercises w on w.id = s.session_exercise_id join public.exercises e on e.id = w.exercise_id
  where s.session_id = 'a7000000-0000-4000-8000-000000000002'), 'correr 6200.0 2160', 'with the Correr exercise, distance and time');
select is((select tags[1] from public.workout_sessions where id = 'a7000000-0000-4000-8000-000000000002'), 'correr', 'tagged as a run');
select throws_ok($$ select public.log_foot_activity('a7000000-0000-4000-8000-000000000003', 'bike', 'x', now() - interval '1 hour', now(), 3600, 1000, null) $$,
  'VD005', null, 'only run or walk');

select * from finish();
rollback;
