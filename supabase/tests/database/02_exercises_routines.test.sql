-- Exercise catalog visibility and routine ownership / versioning.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

insert into auth.users (id, instance_id, aud, role, email) values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local'),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local');

select is((select count(*)::int from public.exercises where owner_id is null), 5, 'system catalog seeded with the 5 prototype exercises');
select is((select count(*)::int from public.exercise_muscles m join public.exercises e on e.id = m.exercise_id
           where e.slug = 'sentadilla' and e.owner_id is null and m.role = 'primary'), 1, 'squat has one primary muscle');

-- ── A creates a private exercise and a routine ───────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

select lives_ok($$ insert into public.exercises (id, slug, name) values ('eeeeeeee-0000-4000-8000-00000000000a', 'hip-thrust', 'Hip thrust') $$,
  'A creates a private exercise');
select is((select owner_id from public.exercises where id = 'eeeeeeee-0000-4000-8000-00000000000a'),
  '11111111-1111-4111-8111-111111111111'::uuid, 'owner defaults to the caller');
select is((select count(*)::int from public.exercises), 6, 'A sees system + own exercises');

select is_empty($$ update public.exercises set name = 'x' where owner_id is null returning id $$, 'A cannot modify system exercises');
select throws_ok($$ insert into public.exercise_muscles (exercise_id, muscle_code)
                    select id, 'abs' from public.exercises where slug = 'sentadilla' and owner_id is null $$,
  '42501', null, 'A cannot change muscles of system exercises');
select throws_ok($$ insert into public.exercises (slug, name, owner_id) values ('x', 'X', null) $$,
  '42501', null, 'A cannot create system exercises');

select lives_ok($$ select public.save_routine(
    'aaaaaaaa-0000-4000-8000-0000000000a1', 'Fuerza A',
    jsonb_build_array(
      jsonb_build_object('exercise_id', (select id from public.exercises where slug = 'sentadilla' and owner_id is null), 'target_sets', 4, 'target_reps_min', 6, 'target_reps_max', 6),
      jsonb_build_object('exercise_id', 'eeeeeeee-0000-4000-8000-00000000000a', 'target_sets', 3)),
    '{1,4}') $$, 'A saves a routine with system + own exercises');

select is((select count(*)::int from public.routine_exercises where routine_id = 'aaaaaaaa-0000-4000-8000-0000000000a1'), 2, 'items stored in order');
select is((select (public.save_routine('aaaaaaaa-0000-4000-8000-0000000000a1', 'retry', '[]'::jsonb)).name), 'Fuerza A',
  'create is idempotent: a retry returns the stored routine unchanged');

select throws_ok($$ select public.save_routine('aaaaaaaa-0000-4000-8000-0000000000a1', 'stale', '[]'::jsonb, '{}', null, 1) $$,
  'VD002', null, 'stale expected_version → VERSION_CONFLICT');
select lives_ok($$ select public.save_routine('aaaaaaaa-0000-4000-8000-0000000000a1', 'Fuerza A+',
    jsonb_build_array(jsonb_build_object('exercise_id', 'eeeeeeee-0000-4000-8000-00000000000a', 'target_sets', 5)),
    '{1,4}', null, (select version from public.routines where id = 'aaaaaaaa-0000-4000-8000-0000000000a1')) $$,
  'current expected_version → saved');
select throws_ok($$ update public.routines set schedule_days = '{0,8}' where id = 'aaaaaaaa-0000-4000-8000-0000000000a1' $$,
  '23514', null, 'schedule days must be ISO weekdays');

-- ── B cannot see or use A's data ─────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);

select is((select count(*)::int from public.routines), 0, 'B sees no routines of A');
select throws_ok($$ insert into public.routine_exercises (routine_id, exercise_id, position, target_sets)
                    values ('aaaaaaaa-0000-4000-8000-0000000000a1', (select id from public.exercises where slug = 'curl' and owner_id is null), 9, 3) $$,
  '23503', null, 'B cannot attach items to A''s routine (composite FK)');
select throws_ok($$ select public.save_routine('bbbbbbbb-0000-4000-8000-0000000000b1', 'Mine',
    jsonb_build_array(jsonb_build_object('exercise_id', 'eeeeeeee-0000-4000-8000-00000000000a', 'target_sets', 3))) $$,
  'VD404', null, 'B cannot reference A''s private exercise');
select throws_ok($$ select public.duplicate_routine('aaaaaaaa-0000-4000-8000-0000000000a1', gen_random_uuid()) $$,
  'VD404', null, 'B cannot duplicate A''s routine');

select * from finish();
rollback;
