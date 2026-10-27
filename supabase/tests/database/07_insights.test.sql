-- VIDA Intelligence memory: owner-only access, one row per insight per day, frozen key/kind.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (id, instance_id, aud, role, email) values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local'),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

select lives_ok($$ insert into public.shown_insights (insight_key, kind, shown_on) values ('sleep-mood', 'pattern', '2025-10-25') $$, 'A records a shown insight');
select lives_ok($$ insert into public.shown_insights (insight_key, kind, shown_on) values ('sleep-mood', 'pattern', '2025-10-25') on conflict do nothing $$,
  'showing it again the same day is a no-op');
select is((select count(*)::int from public.shown_insights), 1, 'one row per insight per day');
select throws_ok($$ update public.shown_insights set kind = 'fact' $$, '42501', null, 'key and kind cannot be edited, only feedback/dismissal');
select lives_ok($$ update public.shown_insights set feedback = 'useful' $$, 'A can leave feedback');

select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select is((select count(*)::int from public.shown_insights), 0, 'B cannot see A''s insights');

select * from finish();
rollback;
