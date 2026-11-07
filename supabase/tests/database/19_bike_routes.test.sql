-- Saved bike routes: only the owner sees and changes them; soft delete; the owner never changes.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (id, instance_id, aud, role, email) values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ciclista@test.local'),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'otro@test.local');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select lives_ok($$ insert into public.bike_routes (id, name, kind, route, distance_m, duration_s)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'Vuelta al lago', 'loop', '{"coords":[]}', 20000, 3600) $$, 'the owner saves a route');
select is((select count(*)::int from public.bike_routes), 1, 'and sees it');
select throws_ok($$ update public.bike_routes set user_id = '22222222-2222-4222-8222-222222222222' $$, '42501', null, 'the owner column cannot be updated');

select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select is((select count(*)::int from public.bike_routes), 0, 'another account does not see it');
select throws_ok($$ insert into public.bike_routes (name, kind, route, distance_m, duration_s, user_id)
  values ('x', 'ab', '{}', 1, 1, '11111111-1111-4111-8111-111111111111') $$, '42501', null, 'nobody saves a route for someone else');
update public.bike_routes set deleted_at = now();
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select is((select count(*)::int from public.bike_routes where deleted_at is null), 1, 'another account cannot delete it');

select * from finish();
rollback;
