-- Fast IANA time zone check (cached names, catalog fallback).
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);
select ok(private.is_valid_time_zone('America/Argentina/Buenos_Aires'), 'a real IANA zone is valid');
select ok(private.is_valid_time_zone('UTC'), 'UTC is valid');
select ok(not private.is_valid_time_zone('Mars/Olympus_Mons'), 'an unknown zone is invalid');
select ok(not coalesce(private.is_valid_time_zone(null), false), 'null is not a valid zone');

-- As a signed-in user (the local_date triggers run as the user).
insert into auth.users (id, instance_id, aud, role, email) values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select ok(private.is_valid_time_zone('Europe/Madrid'), 'works for a signed-in user');
select throws_ok($$ select * from private.time_zone_names $$, '42501', null, 'users cannot read the cache table directly');
select * from finish();
rollback;
