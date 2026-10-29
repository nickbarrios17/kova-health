-- Releases bucket: public for reading, never writable by app users.
begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

select ok((select public from storage.buckets where id = 'releases'), 'the releases bucket is public (read without a session)');

insert into auth.users (id, instance_id, aud, role, email) values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('releases', 'android/latest.json') $$,
  '42501', null, 'signed-in users cannot upload releases');

set local role anon;
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('releases', 'android/vida.apk') $$,
  '42501', null, 'anonymous users cannot upload releases');

select * from finish();
rollback;
