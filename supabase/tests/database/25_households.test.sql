-- Comidas, etapa 4: a household shares its shopping list and nothing else; joining is by code.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, instance_id, aud, role, email) values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local'),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local'),
  ('33333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@test.local');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
create temp table h on commit drop as select * from public.create_household('Casa');
grant select on h to authenticated;
select ok((select code from h) ~ '^[A-HJ-NP-Z2-9]{6}$', 'A creates a household with a code');
select lives_ok($$ insert into public.shopping_lists (id, title, household_id) values ('a4000000-0000-4000-8000-000000000001', 'Compras', (select id from h)) $$, 'A shares a list with the house');
select lives_ok($$ insert into public.shopping_items (list_id, name) values ('a4000000-0000-4000-8000-000000000001', 'Leche') $$, 'and adds an item');
select lives_ok($$ insert into public.shopping_lists (id, title) values ('a4000000-0000-4000-8000-000000000002', 'Privada') $$, 'A also has a private list');

select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select throws_ok($$ select public.join_household('ZZZZZZ') $$, 'VD006', null, 'a wrong code does not join');
select lives_ok(format($$ select public.join_household(%L) $$, (select code from h)), 'B joins with the code');
select is((select count(*)::int from public.shopping_items), 1, 'B sees the shared list''s item');
select is((select count(*)::int from public.shopping_lists where title = 'Privada'), 0, 'but not A''s private list');
select lives_ok($$ insert into public.shopping_items (list_id, name) values ('a4000000-0000-4000-8000-000000000001', 'Pan') $$, 'B adds to the shared list');

select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
select throws_ok(format($$ select public.join_household(%L) $$, (select code from h)), 'VD006', null, 'the used code no longer works');
select is((select count(*)::int from public.shopping_items), 0, 'C, outside the house, sees nothing');

select * from finish();
rollback;
