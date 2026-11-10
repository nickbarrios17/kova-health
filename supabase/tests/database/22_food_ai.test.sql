-- Comidas, etapa 1: the public catalog and its portions, accent-tolerant search, confirmed AI
-- estimates, the Open Food Facts cache and the AI call log.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (id, instance_id, aud, role, email) values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local'),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local');

select ok((select count(*) from public.foods where owner_id is null and source_ref like 'USDA FDC %') >= 150, 'the USDA catalog is loaded');
select ok((select count(*) from public.foods where owner_id is null and source_ref like 'Receta típica%') >= 10, 'typical Argentine dishes are loaded');
select is((select count(*)::int from public.foods where owner_id is null and data_source = 'verified' and source_ref like '%equivalente%'), 0,
  'close equivalents are never verified');
select ok((select count(*) from public.food_portions p join public.foods f on f.id = p.food_id where f.name = 'Empanada de carne (al horno)') = 1,
  'a dish has its household portion');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

select ok((select count(*) from public.search_foods('pure de papas')) >= 1, 'search ignores accents (pure → Puré)');
select is((select name from public.search_foods('empanada carne') limit 1), 'Empanada de carne (al horno)', 'every word counts, in any order');
select is((select count(*)::int from public.search_foods('')), 0, 'an empty search returns nothing');
select is((select name from public.search_foods('medialuna de manteca') limit 1), 'Medialuna / croissant',
  'the first word names the dish: medialuna before manteca');
select is((select name from public.search_foods('cafe con leche') limit 1), 'Café con leche', 'little words do not count');

-- A confirmed AI estimate is saved as 'estimated'; a manual entry stays 'user'.
select is((public.log_food('a1000000-0000-4000-8000-000000000001', '2026-11-10', 'lunch', 1,
  p_name => 'Guiso de la abuela', p_kcal => 620, p_protein_g => 30, p_carbs_g => 70, p_fat_g => 22, p_estimated => true)).data_source,
  'estimated'::public.nutrition_source, 'a confirmed estimate is marked estimated');
select is((public.log_food('a1000000-0000-4000-8000-000000000002', '2026-11-10', 'lunch', 1,
  p_name => 'Barrita', p_kcal => 120, p_protein_g => 3, p_carbs_g => 20, p_fat_g => 3)).data_source,
  'user'::public.nutrition_source, 'a manual entry is the user''s number');
select is((public.log_food('a1000000-0000-4000-8000-000000000003', '2026-11-10', 'dinner', 85,
  p_food_id => (select id from public.foods where name = 'Empanada de carne (al horno)'))).data_source,
  'estimated'::public.nutrition_source, 'a typical dish keeps its estimated source');

select throws_ok($$ insert into public.food_portions (food_id, label, grams)
  values ((select id from public.foods where name = 'Banana'), '1 gigante', 300) $$, '42501', null, 'nobody adds portions to the catalog');
select throws_ok($$ insert into public.off_products (barcode, found) values ('7790000000001', false) $$, '42501', null,
  'only the barcode function writes the Open Food Facts cache');
select throws_ok($$ insert into public.ai_requests (user_id, kind) values ('11111111-1111-4111-8111-111111111111', 'describe') $$, '42501', null,
  'only the functions log AI calls');

set local role anon;
select throws_ok($$ select * from public.search_foods('banana') $$, '42501', null, 'anonymous callers cannot search');

select * from finish();
rollback;
