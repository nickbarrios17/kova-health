-- Admin panel: only admins list accounts and the summary; nobody removes their own role; admins
-- cannot be suspended; a suspension closes the account's sessions and can be undone.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (id, instance_id, aud, role, email) values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@test.local'),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'amigo@test.local'),
  ('33333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'otro@test.local');
insert into private.admins (user_id) values ('11111111-1111-4111-8111-111111111111');
insert into auth.sessions (id, user_id) values ('aaaaaaaa-0000-4000-8000-0000000000a1', '22222222-2222-4222-8222-222222222222');

set local role authenticated;

-- ── A normal user ────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select throws_ok($$ select * from public.admin_users() $$, '42501', null, 'a normal user cannot list accounts');
select throws_ok($$ select public.admin_overview() $$, '42501', null, 'a normal user cannot see the summary');
select throws_ok($$ select public.admin_set_admin('22222222-2222-4222-8222-222222222222', true) $$, '42501', null, 'a normal user cannot make themselves admin');
select throws_ok($$ select public.admin_set_suspended('33333333-3333-4333-8333-333333333333', true) $$, '42501', null, 'a normal user cannot suspend anyone');

-- ── The admin ────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select is((select count(*)::int from public.admin_users() where email like '%@test.local'), 3, 'the admin lists every account');
select is((select name from public.admin_users() where id = '22222222-2222-4222-8222-222222222222'), 'amigo', 'with a name from the email when there is no profile name');
select is((public.admin_overview() ->> 'users')::int, (select count(*)::int from public.admin_users()), 'the summary counts accounts');
select throws_ok($$ select public.admin_set_admin('11111111-1111-4111-8111-111111111111', false) $$, 'VD008', null, 'the admin cannot remove their own role');
select throws_ok($$ select public.admin_set_suspended('11111111-1111-4111-8111-111111111111', true) $$, 'VD008', null, 'the admin cannot suspend themselves');

select lives_ok($$ select public.admin_set_suspended('22222222-2222-4222-8222-222222222222', true) $$, 'the admin suspends an account');
select ok((select suspended from public.admin_users() where id = '22222222-2222-4222-8222-222222222222'), 'it shows as suspended');
reset role;
select is((select count(*)::int from auth.sessions where user_id = '22222222-2222-4222-8222-222222222222'), 0, 'its sessions are closed');
set local role authenticated;
select lives_ok($$ select public.admin_set_suspended('22222222-2222-4222-8222-222222222222', false) $$, 'and reactivates it');

select lives_ok($$ select public.admin_set_admin('33333333-3333-4333-8333-333333333333', true) $$, 'the admin makes someone else admin');

select * from finish();
rollback;
