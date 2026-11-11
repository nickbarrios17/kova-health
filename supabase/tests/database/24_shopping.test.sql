-- Comidas, etapa 3: how catalog foods are bought, shopping lists and the pantry (all the person's own).
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, instance_id, aud, role, email) values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local'),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local');

select is((select count(*)::int from public.foods where owner_id is null and shop is null), 0, 'every catalog food says how it is bought');
select is((select shop->>'name' from public.foods where owner_id is null and name = 'Arroz blanco (cocido)'), 'Arroz blanco', 'cooked rice is bought as rice');
select ok((select jsonb_array_length(shop->'parts') from public.foods where owner_id is null and name = 'Choripán') = 2, 'a dish is bought as its ingredients');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select lives_ok($$ insert into public.shopping_lists (id, title) values ('a3000000-0000-4000-8000-000000000001', 'Compras') $$, 'A creates a list');
select lives_ok($$ insert into public.shopping_items (list_id, name, aisle, grams) values ('a3000000-0000-4000-8000-000000000001', 'Arroz blanco', 'Almacén', 1000) $$, 'with an item');
select lives_ok($$ insert into public.pantry_items (name, grams, source) values ('Huevos', 300, 'ticket') $$, 'A notes eggs at home');

select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select is((select count(*)::int from public.shopping_items) + (select count(*)::int from public.pantry_items), 0, 'B sees none of it');
select throws_ok($$ insert into public.shopping_items (list_id, name) values ('a3000000-0000-4000-8000-000000000001', 'Intruso') $$,
  '42501', null, 'B cannot add to A''s list');

select * from finish();
rollback;
