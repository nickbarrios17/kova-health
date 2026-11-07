-- Coach routines: only the coach of a student reads and edits them; they stay the student's rows.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (id, instance_id, aud, role, email) values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'coach@test.local'),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'alumno@test.local'),
  ('33333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'amigo@test.local');
insert into public.people_links (viewer_id, owner_id, kind) values
  ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'coach'),
  ('33333333-3333-4333-8333-333333333333', '22222222-2222-4222-8222-222222222222', 'friend');
-- A private exercise of the coach (must not be usable in the student's routine).
insert into public.exercises (id, owner_id, slug, name) values
  ('cccccccc-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'privado-coach', 'Ejercicio del coach');

create temp table t (k text primary key, v text);
grant all on t to authenticated;
insert into t select 'bench', id::text from public.exercises where owner_id is null and slug = 'press-banca';

set local role authenticated;

-- ── Coach ────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select is((select r.user_id::text from public.coach_save_routine('22222222-2222-4222-8222-222222222222', 'aaaaaaaa-0000-4000-8000-0000000000a1', 'Pecho A',
  jsonb_build_array(jsonb_build_object('exercise_id', (select v from t where k = 'bench'), 'target_sets', 4, 'target_reps_min', 8, 'target_reps_max', 10))) r),
  '22222222-2222-4222-8222-222222222222', 'the coach creates a routine owned by the student');
select is(jsonb_array_length(public.coach_routines('22222222-2222-4222-8222-222222222222')), 1, 'the coach lists the student routines');
select is(public.coach_routines('22222222-2222-4222-8222-222222222222') -> 0 -> 'routine_exercises' -> 0 ->> 'exercise_name', 'Press banca', 'items carry the exercise name');
select is((select count(*)::int from public.routines), 0, 'the coach still gets no student routines through RLS');
select throws_ok($$ select public.coach_save_routine('22222222-2222-4222-8222-222222222222', 'aaaaaaaa-0000-4000-8000-0000000000a2', 'X',
  '[{"exercise_id":"cccccccc-0000-4000-8000-000000000001","target_sets":3}]'::jsonb) $$, 'VD404', null, 'the coach cannot put his private exercise in the student routine');
select throws_ok($$ select public.coach_save_routine('22222222-2222-4222-8222-222222222222', 'aaaaaaaa-0000-4000-8000-0000000000a1', 'Pecho A', '[]'::jsonb, '{}', null, 99) $$,
  'VD002', null, 'stale edits are rejected (version)');
select lives_ok($$ select public.coach_create_exercise('22222222-2222-4222-8222-222222222222', 'dddddddd-0000-4000-8000-000000000001', 'Press con pausa', 'press-con-pausa-dddd') $$,
  'the coach creates an exercise for the student');
select is((select count(*)::int from public.coach_exercises('22222222-2222-4222-8222-222222222222')), 1, 'it shows among the student exercises');

-- ── Student ──────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select is((select assigned_by::text from public.routines where id = 'aaaaaaaa-0000-4000-8000-0000000000a1'), '11111111-1111-4111-8111-111111111111', 'the student sees the routine, marked as from the coach');
select is((select owner_id::text from public.exercises where id = 'dddddddd-0000-4000-8000-000000000001'), '22222222-2222-4222-8222-222222222222', 'the new exercise belongs to the student');
select throws_ok($$ select public.coach_routines('11111111-1111-4111-8111-111111111111') $$, '42501', null, 'a student is not the coach of the coach');

-- ── Friend and strangers ─────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
select throws_ok($$ select public.coach_routines('22222222-2222-4222-8222-222222222222') $$, '42501', null, 'a friend cannot read routines');
select throws_ok($$ select public.coach_delete_routine('22222222-2222-4222-8222-222222222222', 'aaaaaaaa-0000-4000-8000-0000000000a1') $$, '42501', null, 'a friend cannot delete routines');

select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select lives_ok($$ select public.coach_delete_routine('22222222-2222-4222-8222-222222222222', 'aaaaaaaa-0000-4000-8000-0000000000a1') $$, 'the coach deletes (soft) a student routine');

select * from finish();
rollback;
