-- Coach and friend links: invitations, one coach per owner, ending, sharing, and that nobody gets
-- another person's data through RLS (only through the checked functions).
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

insert into auth.users (id, instance_id, aud, role, email) values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'coach@test.local'),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'alumno@test.local'),
  ('33333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'otro@test.local');
update public.profiles set display_name = 'Coach Ana' where id = '11111111-1111-4111-8111-111111111111';

-- The student has a completed session.
insert into public.workout_sessions (id, user_id, name, status, started_at, ended_at, local_date, time_zone)
values ('aaaaaaaa-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'Pecho', 'completed', now() - interval '2 hours', now() - interval '1 hour', current_date, 'UTC');

create temp table t (k text primary key, v text);
grant all on t to authenticated;

-- ── Coach invites, student accepts ───────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
insert into t select 'code', code from public.create_invite('coach');
select ok((select v ~ '^[A-HJ-NP-Z2-9]{6}$' from t where k = 'code'), 'invite code: 6 easy-to-read characters');
select throws_ok($$ select public.accept_invite((select v from t where k = 'code')) $$, 'VD005', null, 'cannot accept your own invitation');

select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select is((select inviter_name from public.invite_info((select v from t where k = 'code'))), 'Coach Ana', 'the invitation shows who invites');
select is((select kind::text from public.accept_invite((select v from t where k = 'code'))), 'coach', 'student accepts the coach invitation');
select throws_ok($$ select public.accept_invite((select v from t where k = 'code')) $$, 'VD006', null, 'an invitation works once');
select throws_ok($$ select public.accept_invite('ZZZZZZ') $$, 'VD006', null, 'unknown code is rejected');
select is((select role || ':' || person_name from public.my_links()), 'owner:Coach Ana', 'student sees the link with the coach name');

-- ── RLS: the coach still sees only his own rows in the tables ────────────────
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select is((select count(*)::int from public.workout_sessions), 0, 'coach gets no student sessions through RLS');
select ok(private.can_view('22222222-2222-4222-8222-222222222222', 'training'), 'coach can view the student training');
select ok(private.can_view('22222222-2222-4222-8222-222222222222', 'routines'), 'coach can view the student routines');
select ok(not private.can_view('22222222-2222-4222-8222-222222222222', 'body'), 'body data not shared by default');
select is((select sessions_7d from public.my_links()), 1, 'coach sees the student trained once this week');
select throws_ok($$ select public.set_link_shares((select id from public.people_links limit 1), true, true, true) $$, 'VD404', null, 'only the owner changes what is shared');

-- ── The student shares body data ─────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select lives_ok($$ select public.set_link_shares((select id from public.people_links limit 1), true, false, false) $$, 'owner shares body data');
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select ok(private.can_view('22222222-2222-4222-8222-222222222222', 'body'), 'coach now sees body data');

-- ── Someone else ─────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
select ok(not private.can_view('22222222-2222-4222-8222-222222222222', 'training'), 'an unlinked account sees nothing');
select is((select count(*)::int from public.people_links), 0, 'an unlinked account sees no links');
insert into t select 'coach2', code from public.create_invite('coach');
insert into t select 'friend', code from public.create_invite('friend');

-- ── One coach per student; friends both ways ─────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select throws_ok($$ select public.accept_invite((select v from t where k = 'coach2')) $$, 'VD007', null, 'a student has at most one coach');
select lives_ok($$ select public.accept_invite((select v from t where k = 'friend')) $$, 'friend invitation accepted');
select is((select count(*)::int from public.my_links() where kind = 'friend'), 2, 'friends: one link in each direction');
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
select ok(not private.can_view('22222222-2222-4222-8222-222222222222', 'routines'), 'a friend does not see routines');
select ok(private.can_view('22222222-2222-4222-8222-222222222222', 'training'), 'a friend sees training');

-- ── Ending ───────────────────────────────────────────────────────────────────
select lives_ok($$ select public.end_link((select id from public.my_links() where role = 'viewer')) $$, 'a friend ends the link');
select is((select count(*)::int from public.my_links()), 0, 'ending a friendship ends both directions');

select * from finish();
rollback;
