-- Safety data: public statistics are read-only; cyclists' reports are anonymous to others,
-- removable by their author, limited per day, and hidden from anonymous callers.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, instance_id, aud, role, email) values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ciclista@test.local'),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'otro@test.local');

select ok((select count(*) from public.safety_cells) > 1000, 'the CABA cells are loaded');
select ok((select count(*) from public.safety_partidos where conurbano) = 24, 'the 24 conurbano partidos are loaded');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select throws_ok($$ update public.safety_cells set robo_level = 0 $$, '42501', null, 'users cannot change the statistics');

select lives_ok($$ insert into public.safety_reports (id, lat, lng, kind)
  values ('cccccccc-0000-4000-8000-000000000001', -34.61, -58.44, 'robo') $$, 'a cyclist marks a robbery');
select throws_ok($$ insert into public.safety_reports (lat, lng, kind, user_id)
  values (-34.61, -58.44, 'robo', '22222222-2222-4222-8222-222222222222') $$, '42501', null, 'nobody reports as someone else');

select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select is((select count(*)::int from public.safety_reports), 0, 'another cyclist cannot read the reports table');
select is((select count(*)::int || ' ' || bool_or(mine)::text from public.safety_reports_in(-58.5, -34.7, -58.4, -34.5)), '1 false',
  'but sees the report, without who made it');
update public.safety_reports set deleted_at = now();

select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select is((select count(*)::int from public.safety_reports_in(-58.5, -34.7, -58.4, -34.5) where mine), 1, 'others cannot remove it; the author sees it as theirs');
update public.safety_reports set deleted_at = now() where id = 'cccccccc-0000-4000-8000-000000000001';
select is((select count(*)::int from public.safety_reports_in(-58.5, -34.7, -58.4, -34.5)), 0, 'the author removes it');

select throws_ok($$ insert into public.safety_reports (lat, lng, kind) select -34.6, -58.4, 'insegura' from generate_series(1, 21) $$,
  'VD429', null, 'at most 20 reports a day');

set local role anon;
select throws_ok($$ select * from public.safety_reports_in(-58.5, -34.7, -58.4, -34.5) $$, '42501', null, 'anonymous callers see nothing');

select * from finish();
rollback;
