-- Account deletion with user-owned exercises referenced by routines and workout history.
-- Regression test: the cascade used to fail with 23503 on routine_exercises_exercise_id_fkey.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (id, instance_id, aud, role, email) values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local'),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

-- Setup (DO block so no result rows mix with TAP output): an own exercise — like the ones the
-- routine importer creates — used by a routine and by a completed session with one set.
do $setup$ begin
  insert into public.exercises (id, slug, name) values ('eeeeeeee-0000-4000-8000-000000000001', 'hip-thrust', 'Hip thrust');
  perform public.save_routine('aaaaaaaa-0000-4000-8000-0000000000c1', 'Importada', jsonb_build_array(
    jsonb_build_object('exercise_id', 'eeeeeeee-0000-4000-8000-000000000001', 'target_sets', 4, 'target_reps_min', 8, 'target_reps_max', 8)));
  perform public.start_session('c0000000-0000-4000-8000-0000000000c1', 'aaaaaaaa-0000-4000-8000-0000000000c1', null, null, '2025-10-20T17:00:00Z');
  perform public.record_set('d0000000-0000-4000-8000-0000000000c1',
    (select id from public.workout_session_exercises where session_id = 'c0000000-0000-4000-8000-0000000000c1' and position = 0),
    0::smallint, 80, 8::smallint, p_completed_at => '2025-10-20T17:10:00Z');
  perform public.transition_session('c0000000-0000-4000-8000-0000000000c1', 'complete', '2025-10-20T18:00:00Z');
end $setup$;

-- An own exercise that is still in use cannot be deleted (checked at commit, forced here).
savepoint delete_in_use_exercise;
select lives_ok($$ delete from public.exercises where id = 'eeeeeeee-0000-4000-8000-000000000001' $$,
  'deleting an in-use own exercise is accepted until constraints are checked');
select throws_ok($$ set constraints all immediate $$, '23503', null,
  'an own exercise used by a routine and by history cannot be deleted');
rollback to savepoint delete_in_use_exercise;

-- B has data that must survive.
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
do $setup_b$ begin
  perform public.save_routine('aaaaaaaa-0000-4000-8000-0000000000c2', 'Rutina de B', '[]'::jsonb);
end $setup_b$;

-- ── Account deletion (what delete-account / GoTrue does) ────────────────
reset role;
select lives_ok($$ delete from auth.users where id = '11111111-1111-4111-8111-111111111111' $$,
  'a user who owns an exercise used by routines and history can be deleted');
-- Run the deferred checks now: a test transaction is rolled back, so commit-time checks would be skipped.
select lives_ok($$ set constraints all immediate $$, 'deferred foreign keys hold after the cascade');

select is((select count(*)::int from public.exercises where owner_id = '11111111-1111-4111-8111-111111111111') +
          (select count(*)::int from public.routine_exercises where user_id = '11111111-1111-4111-8111-111111111111') +
          (select count(*)::int from public.routines where user_id = '11111111-1111-4111-8111-111111111111') +
          (select count(*)::int from public.workout_session_exercises where user_id = '11111111-1111-4111-8111-111111111111') +
          (select count(*)::int from public.workout_sets where user_id = '11111111-1111-4111-8111-111111111111'),
  0, 'all of the deleted user''s exercises, routines and history are gone');
select is((select count(*)::int from public.routines where user_id = '22222222-2222-4222-8222-222222222222'),
  1, 'other users'' data is untouched');

select * from finish();
rollback;
