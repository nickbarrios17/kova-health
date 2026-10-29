-- Exercise catalog with images: ~150 system exercises, each with how-to steps or coaching cues and
-- two images in the public exercise-media bucket, which app users cannot write to.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

select cmp_ok((select count(*)::int from public.exercises where owner_id is null), '>=', 150, 'the system catalog has at least 150 exercises');
select is((select count(*)::int from public.exercises where owner_id is null
           and not (instructions ? 'steps' or instructions ? 'cues')), 0, 'every system exercise has steps or coaching cues');
select is((select count(*)::int from public.exercises e where owner_id is null
           and (select count(*) from jsonb_array_elements(e.media) m where m->>'kind' = 'image') < 2), 0, 'every system exercise has two images');
select is((select count(*)::int from public.exercises e, jsonb_array_elements(e.media) m
           where e.owner_id is null and m->>'kind' = 'image' and m->>'ref' !~ '^exercise-media/[a-z0-9-]+/[01]\.jpg$'), 0,
          'images reference our own bucket only');
select is((select count(*)::int from public.exercises e where owner_id is null
           and (select count(*) from jsonb_array_elements(e.media) m where m->>'kind' = 'animation' and m->>'ref' = 'kova-mannequin' and m ? 'slug' and m ? 'muscle') <> 1), 0,
          'every system exercise has exactly one 3D mannequin animation');
select ok((select instructions ? 'cues' from public.exercises where owner_id is null and slug = 'press-banca'), 'the original 5 keep their coaching cues');
select ok((select public from storage.buckets where id = 'exercise-media'), 'the exercise-media bucket is public');

insert into auth.users (id, instance_id, aud, role, email) values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('exercise-media', 'x/0.jpg') $$,
  '42501', null, 'signed-in users cannot upload exercise images');
select is((select count(*)::int from public.exercises where owner_id is null and slug = 'jalon-al-pecho'), 1, 'users can read the catalog');

select * from finish();
rollback;
