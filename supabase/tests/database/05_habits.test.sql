-- Habits: dated schedule versions keep history intact; targets; isolation.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, instance_id, aud, role, email) values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local'),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

-- Mon/Wed/Fri from Monday 2025-10-20; done Monday and Wednesday.
select lives_ok($$ select public.save_habit('b0000000-0000-4000-8000-000000000001', 'Movilidad', '2025-10-20',
                     p_days => '{1,3,5}') $$, 'A creates a Mon/Wed/Fri habit');
do $setup$ begin
  insert into public.habit_logs (habit_id, local_date) values
    ('b0000000-0000-4000-8000-000000000001', '2025-10-20'),
    ('b0000000-0000-4000-8000-000000000001', '2025-10-22');
end $setup$;

select results_eq($$ select local_date, scheduled, completed from public.habit_days('2025-10-20', '2025-10-26') order by local_date $$,
  $$ values ('2025-10-20'::date, true, true), ('2025-10-21'::date, false, false), ('2025-10-22'::date, true, true),
            ('2025-10-23'::date, false, false), ('2025-10-24'::date, true, false), ('2025-10-25'::date, false, false),
            ('2025-10-26'::date, false, false) $$,
  'each day is judged by its schedule');

-- From Monday 2025-10-27: every day, target 2 (e.g. two sessions).
select lives_ok($$ select public.save_habit('b0000000-0000-4000-8000-000000000001', 'Movilidad', '2025-10-27',
                     p_kind => 'count', p_target_value => 2) $$, 'schedule changed from a later date');
select results_eq($$ select local_date, scheduled, completed from public.habit_days('2025-10-20', '2025-10-22') order by local_date $$,
  $$ values ('2025-10-20'::date, true, true), ('2025-10-21'::date, false, false), ('2025-10-22'::date, true, true) $$,
  'the old week is unchanged by the new schedule');

insert into public.habit_logs (id, habit_id, local_date) values ('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', '2025-10-28');
select is((select completed from public.habit_days('2025-10-28', '2025-10-28')), false, 'one of two is not complete');
insert into public.habit_logs (habit_id, local_date, value) values ('b0000000-0000-4000-8000-000000000001', '2025-10-28', 1);
select results_eq($$ select scheduled, value, completed from public.habit_days('2025-10-28', '2025-10-28') $$,
  $$ values (true, 2::numeric, true) $$, 'logs add up to the target (Tuesday now scheduled)');

select throws_ok($$ select public.save_habit('b0000000-0000-4000-8000-000000000001', 'Movilidad', '2025-10-01') $$,
  'VD005', null, 'a schedule cannot start before the habit');
select throws_ok($$ select public.save_habit(gen_random_uuid(), 'Yoga', '2025-10-20', p_frequency => 'weekly') $$,
  '23514', null, 'weekly habits need times_per_week');
select throws_ok($$ select * from public.habit_days('2025-01-01', '2026-06-01') $$, 'VD005', null, 'range is limited');

-- ── B is isolated ────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select is((select count(*)::int from public.habit_days('2025-10-20', '2025-10-26')), 0, 'B sees none of A''s habit days');
select throws_ok($$ insert into public.habit_logs (habit_id, local_date) values ('b0000000-0000-4000-8000-000000000001', '2025-10-24') $$,
  '23503', null, 'B cannot log A''s habit');

select * from finish();
rollback;
