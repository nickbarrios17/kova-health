-- Workout sessions: snapshotting, idempotency, state machine, isolation, late sets, views, cascade.
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

insert into auth.users (id, instance_id, aud, role, email) values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local'),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local');
update public.user_preferences set time_zone = 'Europe/Madrid' where user_id = '11111111-1111-4111-8111-111111111111';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

-- Setup (DO block so no result rows mix with TAP output).
do $setup$ begin
  perform public.save_routine('aaaaaaaa-0000-4000-8000-0000000000b1', 'Fuerza B', jsonb_build_array(
    jsonb_build_object('exercise_id', (select id from public.exercises where slug = 'peso-muerto' and owner_id is null), 'target_sets', 3, 'target_reps_min', 5, 'target_reps_max', 5, 'target_rest_s', 120),
    jsonb_build_object('exercise_id', (select id from public.exercises where slug = 'press-militar' and owner_id is null), 'target_sets', 4, 'target_reps_min', 8, 'target_reps_max', 8)));
  perform public.start_session('c0000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000b1', null, null, '2025-10-20T17:00:00Z');
  perform public.record_set('d0000000-0000-4000-8000-000000000001',
    (select id from public.workout_session_exercises where session_id = 'c0000000-0000-4000-8000-000000000001' and position = 0),
    0::smallint, 115, 5::smallint, p_completed_at => '2025-10-20T17:10:00Z');
  perform public.transition_session('c0000000-0000-4000-8000-000000000001', 'complete', '2025-10-20T18:00:00Z');
end $setup$;
-- (the earlier session above is the history baseline: deadlift 115 kg)

-- ── Today's session ──────────────────────────────────────────────────────
select lives_ok($$ select public.start_session('c0000000-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-0000000000b1',
                     p_started_at => '2025-10-24T21:45:00Z') $$, 'A starts a session from a routine');
select is((select local_date from public.workout_sessions where id = 'c0000000-0000-4000-8000-000000000002'),
  '2025-10-24'::date, 'local_date uses the user''s time zone (23:45 Madrid stays on the 24th)');
select is((select count(*)::int from public.workout_session_exercises where session_id = 'c0000000-0000-4000-8000-000000000002'),
  2, 'routine targets snapshotted into the session');
select is((select (public.start_session('c0000000-0000-4000-8000-000000000002')).id),
  'c0000000-0000-4000-8000-000000000002'::uuid, 'start_session is idempotent on id');
select is((select count(*)::int from public.workout_sessions), 2, 'retry did not create a duplicate');
select throws_ok($$ select public.start_session(gen_random_uuid()) $$, 'VD001', null, 'only one active session per user');

-- Sets
select lives_ok($$ select public.record_set('d0000000-0000-4000-8000-000000000002',
    (select id from public.workout_session_exercises where session_id = 'c0000000-0000-4000-8000-000000000002' and position = 0),
    0::smallint, 120, 5::smallint) $$, 'A records a set');
select lives_ok($$ select public.record_set('d0000000-0000-4000-8000-000000000002',
    (select id from public.workout_session_exercises where session_id = 'c0000000-0000-4000-8000-000000000002' and position = 0),
    0::smallint, 120, 5::smallint) $$, 'the same set retried does not fail');
select is((select count(*)::int from public.workout_sets where id = 'd0000000-0000-4000-8000-000000000002'), 1, '… and is stored once');
select throws_ok($$ select public.record_set(gen_random_uuid(),
    (select id from public.workout_session_exercises where session_id = 'c0000000-0000-4000-8000-000000000002' and position = 0),
    1::smallint, -5, 5::smallint) $$, '23514', null, 'negative weight rejected');
select throws_ok($$ select public.record_set(gen_random_uuid(),
    (select id from public.workout_session_exercises where session_id = 'c0000000-0000-4000-8000-000000000002' and position = 0),
    1::smallint, 100) $$, '23514', null, 'a set needs reps, duration or distance');

-- Editing the routine never rewrites the running/completed session
select lives_ok($$ select public.save_routine('aaaaaaaa-0000-4000-8000-0000000000b1', 'Fuerza B v2',
    jsonb_build_array(jsonb_build_object('exercise_id', (select id from public.exercises where slug = 'curl' and owner_id is null), 'target_sets', 9)),
    '{}', null, (select version from public.routines where id = 'aaaaaaaa-0000-4000-8000-0000000000b1')) $$, 'routine edited mid-session');
select results_eq($$ select planned_sets from public.workout_session_exercises
                     where session_id = 'c0000000-0000-4000-8000-000000000002' order by position $$,
  $$ values (3::smallint), (4::smallint) $$, 'session snapshot unchanged');

-- State machine
select is((public.transition_session('c0000000-0000-4000-8000-000000000002', 'pause')).status, 'paused'::public.session_status, 'pause');
select is((public.transition_session('c0000000-0000-4000-8000-000000000002', 'pause')).status, 'paused'::public.session_status, 'repeated pause is a no-op');
select is((public.transition_session('c0000000-0000-4000-8000-000000000002', 'resume')).status, 'in_progress'::public.session_status, 'resume');
select throws_ok($$ select public.transition_session('c0000000-0000-4000-8000-000000000002', 'finish') $$, 'VD005', null, 'unknown action rejected');

-- ── B is isolated ────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select is((select count(*)::int from public.workout_sessions), 0, 'B sees no sessions of A');
select throws_ok($$ select public.record_set(gen_random_uuid(),
    (select id from public.workout_session_exercises limit 1), 0::smallint, 10, 1::smallint) $$, null, null, 'B cannot record into A''s session');
select throws_ok($$ insert into public.workout_sets (session_id, session_exercise_id, set_index, reps)
    values ('c0000000-0000-4000-8000-000000000002', gen_random_uuid(), 0, 1) $$, '23503', null, 'B cannot insert sets against A''s session id');
select throws_ok($$ select public.transition_session('c0000000-0000-4000-8000-000000000002', 'abandon') $$, 'VD404', null, 'B cannot end A''s session');

-- ── Complete, late offline set, closed session ──────────────────────────
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select is((public.transition_session('c0000000-0000-4000-8000-000000000002', 'complete')).status, 'completed'::public.session_status, 'complete');
select lives_ok($$ select public.record_set(gen_random_uuid(),
    (select id from public.workout_session_exercises where session_id = 'c0000000-0000-4000-8000-000000000002' and position = 1),
    0::smallint, 45, 8::smallint, p_completed_at => (select ended_at - interval '1 minute' from public.workout_sessions where id = 'c0000000-0000-4000-8000-000000000002')) $$,
  'a set recorded offline before completion is still accepted');
select throws_ok($$ select public.record_set(gen_random_uuid(),
    (select id from public.workout_session_exercises where session_id = 'c0000000-0000-4000-8000-000000000002' and position = 1),
    1::smallint, 45, 8::smallint) $$, 'VD003', null, 'new sets after completion are rejected');
select throws_ok($$ update public.workout_sessions set status = 'in_progress', ended_at = null where id = 'c0000000-0000-4000-8000-000000000002' $$,
  'VD004', null, 'a completed session cannot be reopened, even by direct update');

-- ── Derived views ────────────────────────────────────────────────────────
select results_eq($$ select max_weight_kg, best_e1rm_kg from public.personal_records pr
                     join public.exercises e on e.id = pr.exercise_id where e.slug = 'peso-muerto' $$,
  $$ values (120.00::numeric, 140.00::numeric) $$, 'PR view: max weight and Epley e1RM (120 × (1 + 5/30))');
select results_eq($$ select working_sets::int, volume_kg, pr_count::int from public.session_summaries
                     where session_id = 'c0000000-0000-4000-8000-000000000002' $$,
  $$ values (2, (120 * 5 + 45 * 8)::numeric(10, 2), 1) $$, 'session summary: sets, volume, and one PR (120 > 115)');

-- ── Account deletion cascades everything ────────────────────────────────
reset role;
delete from auth.users where id = '11111111-1111-4111-8111-111111111111';
select is((select count(*)::int from public.workout_sets s
           where s.user_id = '11111111-1111-4111-8111-111111111111') +
          (select count(*)::int from public.workout_sessions where user_id = '11111111-1111-4111-8111-111111111111') +
          (select count(*)::int from public.routines where user_id = '11111111-1111-4111-8111-111111111111') +
          (select count(*)::int from public.profiles where id = '11111111-1111-4111-8111-111111111111'),
  0, 'deleting the auth user removes all of their data');

select * from finish();
rollback;
