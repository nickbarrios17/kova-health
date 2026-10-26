-- LOCAL DEVELOPMENT SEED ONLY. Runs on `supabase db reset`; never applied to production.
-- Fake demo account (not a real person, no real health data):
--   email:    demo@vida.test
--   password: demo-vida-2026
-- Routines mirror the prototype's "Fuerza A / Fuerza B" (design/prototypes/VIDA Health v2.dc.html).

do $$
declare
  demo uuid := '00000000-0000-4000-8000-00000000d001';
  ra uuid := '00000000-0000-4000-8000-0000000000a1';
  rb uuid := '00000000-0000-4000-8000-0000000000b1';
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change)
  values (
    '00000000-0000-0000-0000-000000000000', demo, 'authenticated', 'authenticated', 'demo@vida.test',
    extensions.crypt('demo-vida-2026', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), demo, demo::text,
          jsonb_build_object('sub', demo::text, 'email', 'demo@vida.test', 'email_verified', true),
          'email', now(), now(), now());

  update public.profiles set display_name = 'Demo', onboarding_state = 'done' where id = demo;
  update public.user_preferences set time_zone = 'Europe/Madrid' where user_id = demo;

  insert into public.routines (id, user_id, name, schedule_days) values
    (ra, demo, 'Fuerza A', '{1,4}'),
    (rb, demo, 'Fuerza B', '{2,5}');

  insert into public.routine_exercises (routine_id, user_id, exercise_id, position, target_sets, target_reps_min, target_reps_max, target_rest_s)
  select ra, demo, e.id, v.pos, v.sets, v.reps, v.reps, 90
  from (values ('sentadilla', 0, 4, 6), ('press-banca', 1, 4, 8), ('curl', 2, 3, 10)) as v(slug, pos, sets, reps)
  join public.exercises e on e.slug = v.slug and e.owner_id is null;

  insert into public.routine_exercises (routine_id, user_id, exercise_id, position, target_sets, target_reps_min, target_reps_max, target_rest_s)
  select rb, demo, e.id, v.pos, v.sets, v.reps, v.reps, 90
  from (values ('peso-muerto', 0, 3, 5), ('press-militar', 1, 4, 8), ('curl', 2, 3, 12)) as v(slug, pos, sets, reps)
  join public.exercises e on e.slug = v.slug and e.owner_id is null;
end $$;
