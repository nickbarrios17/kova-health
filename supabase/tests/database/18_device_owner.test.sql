-- A device id stored on a phone can already belong to another account that signed in there first:
-- the new account cannot take the row, and rows recorded with that id are rejected until the app
-- switches to a fresh id (claimDevice in packages/api-client/src/devices.ts).
begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

insert into auth.users (id, instance_id, aud, role, email) values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'primera@test.local'),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'segunda@test.local');
insert into public.devices (id, user_id, kind) values
  ('dddddddd-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'mobile');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);

select throws_ok($$ insert into public.devices (id, kind) values ('dddddddd-0000-4000-8000-000000000001', 'mobile')
  on conflict (id) do update set last_seen_at = now() $$, '42501', null, 'another account cannot take the device row');
select throws_ok($$ select public.record_observations(jsonb_build_array(jsonb_build_object(
  'id', 'aaaaaaaa-0000-4000-8000-000000000001', 'metric', 'steps', 'value', 100, 'start_at', '2026-11-05T10:00:00Z', 'end_at', '2026-11-05T11:00:00Z',
  'time_zone', 'UTC', 'source', 'health_connect', 'external_id', 'x1', 'device_id', 'dddddddd-0000-4000-8000-000000000001'))) $$,
  '23503', null, 'data recorded with that id is rejected');
select lives_ok($$ insert into public.devices (id, kind) values ('dddddddd-0000-4000-8000-000000000002', 'mobile') $$, 'a fresh id works');

select * from finish();
rollback;
