-- Comidas, etapa 5: water logs are private; a coach sees the student's plan only when nutrition is shared.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (id, instance_id, aud, role, email) values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'alumno@test.local'),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'coach@test.local'),
  ('33333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'otro@test.local');
insert into public.people_links (id, viewer_id, owner_id, kind) values
  ('a5000000-0000-4000-8000-000000000009', '22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'coach');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select lives_ok($$ insert into public.water_logs (local_date, ml) values ('2026-11-10', 250) $$, 'the student logs a glass of water');
select lives_ok($$ insert into public.meal_plans (id, week_start) values ('a5000000-0000-4000-8000-000000000001', '2026-11-09') $$, 'and has a plan');
select lives_ok($$ insert into public.meal_plan_items (plan_id, local_date, slot, title, ingredients, kcal, protein_g, carbs_g, fat_g)
  values ('a5000000-0000-4000-8000-000000000001', '2026-11-10', 'lunch', 'Guiso', '[{"food_id":"x","grams":200}]', 600, 30, 70, 20) $$, 'with a meal');

select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select is((select count(*)::int from public.person_meal_plan('11111111-1111-4111-8111-111111111111', '2026-11-09')), 0,
  'the coach does not see the plan while nutrition is not shared');
reset role;
update public.people_links set share_nutrition = true where id = 'a5000000-0000-4000-8000-000000000009';
set local role authenticated;
select is((select title from public.person_meal_plan('11111111-1111-4111-8111-111111111111', '2026-11-09')), 'Guiso', 'once shared, the coach sees it');
select is((select count(*)::int from public.water_logs), 0, 'the coach never sees the water logs');

select * from finish();
rollback;
