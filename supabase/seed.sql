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

-- Demo foods: the prototype's FOODS table (design/prototypes/VIDA Health v2.dc.html). Their values have
-- no cited source, so they are stored as the demo user's own foods with data_source 'user' — never
-- as verified catalog data. Portions without grams ("1 mediano") stay as servings.
insert into public.foods (owner_id, name, ref_amount, ref_unit, serving_label, kcal, protein_g, carbs_g, fat_g, data_source)
select '00000000-0000-4000-8000-00000000d001', v.name, v.amt, v.unit::public.food_unit, v.label, v.kcal, v.p, v.c, v.g, 'user'
from (values
    ('Pechuga de pollo', 150, 'g', null, 248, 47, 0, 5),
    ('Salmón a la plancha', 150, 'g', null, 312, 34, 0, 19),
    ('Ternera magra', 150, 'g', null, 255, 39, 0, 10),
    ('Atún al natural', 1, 'serving', '1 lata (80 g)', 90, 20, 0, 1),
    ('Huevo cocido', 1, 'serving', '1 unidad', 78, 6, 1, 5),
    ('Tortilla francesa', 1, 'serving', '2 huevos', 180, 13, 1, 14),
    ('Proteína whey', 1, 'serving', '1 cacito (30 g)', 120, 24, 3, 1),
    ('Yogur griego natural', 170, 'g', null, 165, 15, 6, 9),
    ('Queso fresco', 100, 'g', null, 98, 12, 3, 4),
    ('Lentejas cocidas', 200, 'g', null, 232, 18, 40, 1),
    ('Garbanzos cocidos', 200, 'g', null, 328, 18, 54, 5),
    ('Arroz blanco cocido', 200, 'g', null, 260, 5, 57, 1),
    ('Arroz integral cocido', 200, 'g', null, 248, 5, 52, 2),
    ('Pasta cocida', 200, 'g', null, 314, 12, 62, 2),
    ('Patata asada', 200, 'g', null, 186, 5, 42, 0),
    ('Pan integral', 1, 'serving', '2 rebanadas', 160, 8, 28, 2),
    ('Avena', 60, 'g', null, 228, 8, 40, 4),
    ('Plátano', 1, 'serving', '1 mediano', 105, 1, 27, 0),
    ('Manzana', 1, 'serving', '1 mediana', 95, 0, 25, 0),
    ('Leche semidesnatada', 250, 'ml', null, 115, 8, 12, 4),
    ('Brócoli', 100, 'g', null, 34, 3, 7, 0),
    ('Ensalada mixta', 1, 'serving', '1 plato', 45, 2, 8, 1),
    ('Aguacate', 1, 'serving', '½ unidad', 120, 1, 6, 11),
    ('Aceite de oliva', 1, 'serving', '1 cda (10 ml)', 88, 0, 0, 10),
    ('Almendras', 30, 'g', null, 174, 6, 6, 15),
    ('Café con leche', 1, 'serving', '1 taza', 60, 3, 5, 3)
) as v(name, amt, unit, label, kcal, p, c, g);

-- Goals from the prototype (kcalGoal 2300, macroGoal 150/240/70) and one habit.
insert into public.nutrition_goals (user_id, effective_from, kcal, protein_g, carbs_g, fat_g)
values ('00000000-0000-4000-8000-00000000d001', current_date - 30, 2300, 150, 240, 70);
insert into public.habits (id, user_id, name, kind, unit, icon, start_date)
values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-00000000d001', 'Agua', 'count', 'vasos', 'drop', current_date - 30);
insert into public.habit_schedules (habit_id, user_id, effective_from, target_value)
values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-00000000d001', current_date - 30, 8);
