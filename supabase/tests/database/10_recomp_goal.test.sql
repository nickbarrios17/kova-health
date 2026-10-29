-- Body recomposition goal: accepted by onboarding, stored without a pace.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users (id, instance_id, aud, role, email) values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

select is((public.complete_onboarding('Ana', 1994, 165, 'female', 'moderate', 'recomp', 'aggressive', 68,
  'e2000000-0000-4000-8000-000000000001', 1950, 150, 190, 60)).weight_goal::text, 'recomp', 'recomposition is a valid goal');
select is((select goal_pace from public.profiles), null, 'recomposition stores no pace even if one is sent');
select throws_ok($$ update public.profiles set goal_pace = 'light' $$, '23514', null, 'a pace is rejected for recomposition');
select lives_ok($$ update public.profiles set weight_goal = 'lose', goal_pace = 'light' $$, 'lose still takes a pace');

select * from finish();
rollback;
