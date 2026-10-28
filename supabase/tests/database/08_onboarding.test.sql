-- Onboarding: profile fields, complete_onboarding RPC (atomic, idempotent, validated), RLS.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (id, instance_id, aud, role, email) values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local'),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local');
update public.user_preferences set time_zone = 'America/Argentina/Buenos_Aires' where user_id = '11111111-1111-4111-8111-111111111111';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

select is((select onboarding_state::text from public.profiles), 'new', 'a new account starts with onboarding pending');

select is((public.complete_onboarding('Nico', 1996, 175, 'male', 'moderate', 'lose', 'moderate', 78,
  'e1000000-0000-4000-8000-000000000001', 2350, 156, 236, 65)).onboarding_state::text, 'done', 'completing onboarding marks it done');
select results_eq($$ select display_name, birth_year, height_cm, sex::text, activity_level::text, weight_goal::text, goal_pace::text from public.profiles $$,
  $$ values ('Nico'::text, 1996::smallint, 175.0::numeric(5,1), 'male'::text, 'moderate'::text, 'lose'::text, 'moderate'::text) $$,
  'profile fields are stored');
select is((select value from public.body_measurements where id = 'e1000000-0000-4000-8000-000000000001'), 78.00::numeric(6,2),
  'starting weight is recorded as a measurement');
select results_eq($$ select effective_from, kcal, protein_g, carbs_g, fat_g, is_estimated from public.nutrition_goals $$,
  $$ values ((now() at time zone 'America/Argentina/Buenos_Aires')::date, 2350::numeric(6,0), 156::numeric(5,0), 236::numeric(5,0), 65::numeric(5,0), true) $$,
  'nutrition target starts on the user''s local today and is flagged as an estimate');

-- Recalculating the same day: same measurement id is not duplicated, the target is replaced.
select lives_ok($$ select public.complete_onboarding(null, 1996, 175, 'male', 'moderate', 'maintain', 'aggressive', 78,
  'e1000000-0000-4000-8000-000000000001', 2750, 140, 375, 76, false) $$, 'recalculating is allowed');
select is((select count(*)::int from public.body_measurements), 1, 'replaying the same weight id does not duplicate it');
select is((select count(*)::int from public.nutrition_goals), 1, 'same-day recalculation replaces the target');
select results_eq($$ select kcal, is_estimated from public.nutrition_goals $$, $$ values (2750::numeric(6,0), false) $$,
  'a target typed by the user is not flagged as an estimate');
select is((select goal_pace from public.profiles), null, 'maintain stores no pace even if one is sent');
select is((select display_name from public.profiles), 'Nico', 'an empty name keeps the existing one');

-- Validation.
select throws_ok($$ select public.complete_onboarding('X', 1996, 175, null, 'moderate', 'maintain', null, 78,
  'e1000000-0000-4000-8000-000000000002', 2500, 140, 300, 70) $$, 'VD005', null, 'sex is required');
select throws_ok($$ select public.complete_onboarding('X', 2020, 175, 'female', 'moderate', 'maintain', null, 78,
  'e1000000-0000-4000-8000-000000000003', 2500, 140, 300, 70) $$, 'VD005', null, 'too young is rejected');
select throws_ok($$ update public.profiles set weight_goal = 'lose', goal_pace = null $$, '23514', null,
  'losing weight without a pace violates the check');

-- Isolation: user B cannot see A's onboarding data and starts pending.
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select is((select count(*)::int from public.profiles where id = '11111111-1111-4111-8111-111111111111'), 0, 'other users cannot read the profile');
select is((select onboarding_state::text from public.profiles), 'new', 'user B still has onboarding pending');

select * from finish();
rollback;
