-- Nutrition: provenance rules, snapshots, idempotent logging, recipes, isolation.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

insert into auth.users (id, instance_id, aud, role, email) values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local'),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

-- Foods (prototype values, entered by the user → data_source 'user')
select lives_ok($$ insert into public.foods (id, name, ref_amount, ref_unit, kcal, protein_g, carbs_g, fat_g)
                   values ('f0000000-0000-4000-8000-000000000001', 'Pechuga de pollo', 150, 'g', 248, 47, 0, 5),
                          ('f0000000-0000-4000-8000-000000000002', 'Arroz blanco cocido', 200, 'g', 260, 5, 57, 1),
                          ('f0000000-0000-4000-8000-000000000003', 'Plátano', 1, 'serving', 105, 1, 27, 0) $$,
  'A creates foods');
select is((select data_source from public.foods where id = 'f0000000-0000-4000-8000-000000000001'),
  'user'::public.nutrition_source, 'user foods default to data_source user');
select throws_ok($$ insert into public.foods (name, ref_amount, ref_unit, kcal, protein_g, carbs_g, fat_g, data_source, source_ref)
                    values ('Fake', 100, 'g', 100, 10, 10, 1, 'verified', 'trust me') $$,
  '23514', null, 'users cannot claim verified data');
select throws_ok($$ insert into public.foods (name, ref_amount, ref_unit, kcal, protein_g, carbs_g, fat_g)
                    values ('Imposible', 100, 'g', 500, 60, 60, 10) $$,
  '23514', null, 'macros cannot exceed the reference mass');

-- Logging with snapshots
select is((public.log_food('a0000000-0000-4000-8000-000000000001', '2025-10-24', 'lunch', 180,
            p_food_id => 'f0000000-0000-4000-8000-000000000001')).kcal,
  297.6, 'log_food scales 150 g → 180 g (248 kcal → 297.6)');
select is((public.log_food('a0000000-0000-4000-8000-000000000001', '2025-10-24', 'lunch', 999,
            p_food_id => 'f0000000-0000-4000-8000-000000000001')).quantity,
  180.00, 'a retried log returns the stored item unchanged');
select lives_ok($$ select public.log_food('a0000000-0000-4000-8000-000000000002', '2025-10-24', 'lunch', 200,
                     p_food_id => 'f0000000-0000-4000-8000-000000000002') $$, 'second item in the same slot');
select is((select count(*)::int from public.meals where local_date = '2025-10-24' and slot = 'lunch'), 1,
  'one meal per day and slot');

update public.foods set kcal = 999 where id = 'f0000000-0000-4000-8000-000000000001';
select is((select kcal from public.meal_items where id = 'a0000000-0000-4000-8000-000000000001'), 297.6,
  'editing the food does not rewrite the logged snapshot');
select throws_ok($$ update public.meal_items set kcal = 1 where id = 'a0000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'snapshot values cannot be edited directly');

select is((public.log_food('a0000000-0000-4000-8000-000000000003', '2025-10-24', 'snack', 1,
            p_name => 'Tapas', p_kcal => 400, p_protein_g => 20, p_carbs_g => 30, p_fat_g => 20)).data_source,
  'user'::public.nutrition_source, 'manual entries are recorded as user data');
select throws_ok($$ select public.log_food(gen_random_uuid(), '2025-10-24', 'snack', 1, p_name => 'Sin macros', p_kcal => 100) $$,
  'VD005', null, 'manual entries need all macros');
select throws_ok($$ select public.log_food(gen_random_uuid(), '2025-10-24', 'snack', 1,
                     p_food_id => 'f0000000-0000-4000-8000-000000000003', p_name => 'x', p_kcal => 1, p_protein_g => 0, p_carbs_g => 0, p_fat_g => 0) $$,
  'VD005', null, 'exactly one source per item');

-- Recipe: 2 servings of (150 g chicken + 400 g rice) → 1 serving = (248 + 520) / 2 kcal
insert into public.recipes (id, name, servings) values ('e0000000-0000-4000-8000-000000000001', 'Pollo con arroz', 2);
insert into public.recipe_ingredients (recipe_id, food_id, quantity, position) values
  ('e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002', 400, 1);
update public.foods set kcal = 248 where id = 'f0000000-0000-4000-8000-000000000001';
insert into public.recipe_ingredients (recipe_id, food_id, quantity, position) values
  ('e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 150, 0);
select is((public.log_food('a0000000-0000-4000-8000-000000000004', '2025-10-24', 'dinner', 1,
            p_recipe_id => 'e0000000-0000-4000-8000-000000000001')).kcal,
  384.0, 'recipe logged per serving: (248 + 520) / 2 = 384 kcal');

select results_eq($$ select kcal, protein_g, items::int from public.nutrition_daily where local_date = '2025-10-24' $$,
  $$ values (297.6 + 260 + 400 + 384.0, 56.40 + 5 + 20 + 28.50, 4) $$, 'daily totals sum the snapshots');

-- ── B is isolated ────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select is((select count(*)::int from public.foods where owner_id is not null), 0, 'B cannot see A''s foods');
select throws_ok($$ select public.log_food(gen_random_uuid(), '2025-10-24', 'lunch', 100, p_food_id => 'f0000000-0000-4000-8000-000000000001') $$,
  'VD404', null, 'B cannot log A''s private food');
select throws_ok($$ insert into public.meal_items (meal_id, name, quantity, unit, kcal, protein_g, carbs_g, fat_g, data_source)
                    select '00000000-0000-4000-8000-000000000000', 'x', 1, 'serving', 1, 0, 0, 0, 'user' $$,
  '23503', null, 'B cannot add items to a meal that is not theirs');

select * from finish();
rollback;
