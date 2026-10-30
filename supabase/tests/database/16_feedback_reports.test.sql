-- «Reportar un problema»: users send and see their own reports; only admins see and triage all.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, instance_id, aud, role, email) values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@test.local'),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'amigo@test.local');
insert into private.admins (user_id) values ('11111111-1111-4111-8111-111111111111');

set local role authenticated;

-- ── A friend reports ─────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select lives_ok($$ insert into public.feedback_reports (id, category, message, context)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'model3d', 'El modelo del hip thrust mira para el otro lado', '{"screen":"exercise"}') $$, 'a user sends a report');
select throws_ok($$ insert into public.feedback_reports (category, message) values ('bug', 'x') $$, '23514', null, 'a report needs a real message');
select throws_ok($$ insert into public.feedback_reports (category, message, status) values ('bug', 'ya lo arreglé', 'done') $$, '42501', null, 'a user cannot set the status');
select is((select count(*)::int from public.feedback_reports), 1, 'a user sees their own reports');
select ok(not public.am_i_admin(), 'a normal user is not an admin');
select throws_ok($$ select * from public.admin_reports() $$, '42501', null, 'a normal user cannot list everyone''s reports');
select throws_ok($$ update public.feedback_reports set status = 'done' $$, '42501', null, 'a user cannot change a report');

-- ── The admin ────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select is((select count(*)::int from public.feedback_reports), 0, 'through the table the admin still sees only own reports');
select is((select reporter_name from public.admin_reports()), 'amigo', 'the admin lists every report with who sent it');
select lives_ok($$ select public.admin_set_report('aaaaaaaa-0000-4000-8000-000000000001', 'done', 'Arreglado en develop') $$, 'the admin marks it done');
select is((select status::text from public.admin_reports('done')), 'done', 'filter by status');

select * from finish();
rollback;
