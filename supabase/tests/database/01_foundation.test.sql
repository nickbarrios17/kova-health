-- Foundation: schema, RLS coverage, profiles/preferences, devices, entitlements, anon access.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

-- Fake users (rolled back at the end).
insert into auth.users (id, instance_id, aud, role, email) values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local'),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local');

-- ── Schema ────────────────────────────────────────────────────────────────
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  0, 'every public table has RLS enabled');

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
     and not exists (select 1 from pg_policy p where p.polrelid = c.oid)),
  0, 'every RLS-enabled table has at least one explicit policy');

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'v')
     and has_table_privilege('anon', c.oid, 'select')),
  0, 'anon cannot read any public table or view');

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'v'
     and not coalesce('security_invoker=true' = any (c.reloptions), false)),
  0, 'every public view is security_invoker');

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef),
  0, 'no SECURITY DEFINER functions are exposed in public');

-- ── Bootstrap trigger ─────────────────────────────────────────────────────
select is((select count(*)::int from public.profiles where id in ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222')),
  2, 'sign-up creates a profile');
select is((select time_zone from public.user_preferences where user_id = '11111111-1111-4111-8111-111111111111'),
  'UTC', 'sign-up creates default preferences');

-- ── As user A ─────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

select results_eq($$ select id from public.profiles $$,
  $$ values ('11111111-1111-4111-8111-111111111111'::uuid) $$, 'A sees only their own profile');

select lives_ok($$ update public.profiles set display_name = 'Ana' where id = '11111111-1111-4111-8111-111111111111' $$,
  'A can update their profile');

select lives_ok($$ update public.profiles set display_name = 'pwned' where id = '22222222-2222-4222-8222-222222222222' $$,
  'updating another profile is silently a no-op (checked below)');

select throws_ok($$ insert into public.profiles (id) values (gen_random_uuid()) $$,
  '42501', null, 'clients cannot insert profiles');

select throws_ok($$ update public.user_preferences set time_zone = 'Mars/Olympus' $$,
  'VD005', null, 'invalid time zones are rejected');

select lives_ok($$ update public.user_preferences set time_zone = 'Europe/Madrid', weight_unit = 'lb' $$,
  'valid preference update works');

select lives_ok($$ insert into public.devices (id, kind, label) values ('aaaaaaaa-0000-4000-8000-000000000001', 'watch', 'Galaxy Watch6') $$,
  'A can register a device');

select throws_ok($$ update public.devices set user_id = '22222222-2222-4222-8222-222222222222' where id = 'aaaaaaaa-0000-4000-8000-000000000001' $$,
  null, null, 'a device cannot be reassigned to another user');

select throws_ok($$ insert into public.devices (kind, user_id) values ('web', '22222222-2222-4222-8222-222222222222') $$,
  '42501', null, 'A cannot create rows owned by B');

select throws_ok($$ insert into public.user_entitlements (user_id, entitlement, source) values ('11111111-1111-4111-8111-111111111111', 'premium', 'manual') $$,
  '42501', null, 'users cannot grant themselves entitlements');

select is(public.has_entitlement('premium'), false, 'no premium by default');

-- ── Trusted server grants an entitlement ─────────────────────────────────
reset role;
insert into public.user_entitlements (user_id, entitlement, source)
values ('11111111-1111-4111-8111-111111111111', 'premium', 'manual');
select is((select display_name from public.profiles where id = '22222222-2222-4222-8222-222222222222'),
  null, 'B''s profile was not modified by A');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select is(public.has_entitlement('premium'), true, 'server-granted entitlement is visible to its owner');

select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select is(public.has_entitlement('premium'), false, 'and not to anyone else');

-- ── anon ──────────────────────────────────────────────────────────────────
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select * from public.profiles $$, '42501', null, 'anon is denied');

select * from finish();
rollback;
