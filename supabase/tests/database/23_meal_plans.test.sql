-- Comidas, etapa 2: preferences, weekly plans with their meals, and events. Everything is the person's own;
-- plan meals keep their computed nutrients (only marking them eaten is an update).
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, instance_id, aud, role, email) values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local'),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

select lives_ok($$ insert into public.food_preferences (diet, dislikes, allergies, meals_per_day) values ('vegetariana', '{hígado}', '{maní}', 4) $$,
  'A saves preferences');
select throws_ok($$ update public.food_preferences set meals_per_day = 8 $$, '23514', null, 'meals per day stay between 3 and 5');

select lives_ok($$ insert into public.meal_plans (id, week_start) values ('a2000000-0000-4000-8000-000000000001', '2026-11-09') $$, 'A creates a plan');
select lives_ok($$ insert into public.meal_plan_items (id, plan_id, local_date, slot, title, ingredients, kcal, protein_g, carbs_g, fat_g)
  values ('a2000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000001', '2026-11-09', 'lunch', 'Guiso',
          '[{"food_id":"x","grams":200}]', 600, 30, 70, 20) $$, 'with a meal');
select throws_ok($$ insert into public.meal_plans (week_start) values ('2026-11-09') $$, '23505', null, 'one active plan per week');
select throws_ok($$ update public.meal_plan_items set kcal = 100 $$, '42501', null, 'the computed nutrients cannot be edited');
select lives_ok($$ update public.meal_plan_items set logged_at = now() $$, 'but a meal can be marked as eaten');
select lives_ok($$ insert into public.meal_events (local_date, kind) values ('2026-11-14', 'asado') $$, 'A marks an asado');

select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select is((select count(*)::int from public.meal_plan_items) + (select count(*)::int from public.food_preferences) + (select count(*)::int from public.meal_events), 0,
  'B sees none of it');
select throws_ok($$ insert into public.meal_plan_items (plan_id, local_date, slot, title, ingredients, kcal, protein_g, carbs_g, fat_g)
  values ('a2000000-0000-4000-8000-000000000001', '2026-11-10', 'dinner', 'Intruso', '[{"food_id":"x","grams":1}]', 1, 0, 0, 0) $$,
  '23503', null, 'B cannot add meals to A''s plan (the plan must be theirs)');

select * from finish();
rollback;
