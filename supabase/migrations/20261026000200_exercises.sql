-- Exercise library: global catalog (owner_id is null) + user-created exercises.
-- Kept separate from sessions; sessions reference exercises but never copy them.

create extension if not exists pg_trgm with schema extensions;

create type public.exercise_category as enum ('strength', 'cardio', 'stretching', 'plyometrics', 'mobility');
create type public.measurement_type as enum ('weight_reps', 'reps', 'duration', 'distance_duration');
create type public.exercise_level as enum ('beginner', 'intermediate', 'advanced');
create type public.muscle_role as enum ('primary', 'secondary');

-- ── Lookups (global, read-only to clients) ───────────────────────────────────
create table public.muscle_groups (
  code text primary key check (code ~ '^[a-z][a-z_]{1,40}$'),
  name_es text not null,
  body_part text not null check (body_part in ('legs', 'back', 'chest', 'shoulders', 'arms', 'core', 'full_body'))
);

create table public.equipment_types (
  code text primary key check (code ~ '^[a-z][a-z_]{1,40}$'),
  name_es text not null
);

insert into public.muscle_groups (code, name_es, body_part) values
  ('quads', 'Cuádriceps', 'legs'),
  ('hamstrings', 'Isquiotibiales', 'legs'),
  ('glutes', 'Glúteos', 'legs'),
  ('calves', 'Gemelos', 'legs'),
  ('adductors', 'Aductores', 'legs'),
  ('abductors', 'Abductores', 'legs'),
  ('abs', 'Abdomen', 'core'),
  ('lower_back', 'Espalda baja', 'back'),
  ('lats', 'Dorsales', 'back'),
  ('upper_back', 'Espalda alta', 'back'),
  ('traps', 'Trapecio', 'back'),
  ('chest', 'Pecho', 'chest'),
  ('delts', 'Hombros', 'shoulders'),
  ('front_delts', 'Hombro anterior', 'shoulders'),
  ('biceps', 'Bíceps', 'arms'),
  ('triceps', 'Tríceps', 'arms'),
  ('forearms', 'Antebrazo', 'arms'),
  ('cardio', 'Cardio', 'full_body');

insert into public.equipment_types (code, name_es) values
  ('barbell', 'Barra'), ('dumbbell', 'Mancuerna'), ('cable', 'Polea'), ('machine', 'Máquina'),
  ('bodyweight', 'Peso corporal'), ('kettlebell', 'Kettlebell'), ('band', 'Banda'),
  ('ez_bar', 'Barra EZ'), ('smith', 'Smith'), ('lever', 'Palanca'), ('bench', 'Banco'),
  ('rack', 'Rack'), ('plates', 'Discos'), ('other', 'Otro');

-- ── exercises ────────────────────────────────────────────────────────────────
create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid default auth.uid() references auth.users (id) on delete cascade, -- null = system catalog
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  short_name text check (short_name is null or char_length(short_name) <= 40),
  description text check (description is null or char_length(description) <= 2000),
  category public.exercise_category not null default 'strength',
  measurement_type public.measurement_type not null default 'weight_reps',
  level public.exercise_level,
  -- { tempo, cues: [{title, body}], errors: [{title, fix}], breath: [text] } — same shape as the prototype's EX.
  instructions jsonb not null default '{}'::jsonb check (jsonb_typeof(instructions) = 'object'),
  -- [{ kind: 'animation'|'image'|'video', ref, license? }] — references only, no hot-linked third-party media.
  media jsonb not null default '[]'::jsonb check (jsonb_typeof(media) = 'array'),
  variation_of uuid references public.exercises (id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (variation_of is distinct from id)
);
create unique index exercises_system_slug_key on public.exercises (slug) where owner_id is null;
create unique index exercises_owner_slug_key on public.exercises (owner_id, slug) where owner_id is not null;
create index exercises_owner_idx on public.exercises (owner_id, updated_at);
create index exercises_name_trgm_idx on public.exercises using gin (name extensions.gin_trgm_ops);

create trigger exercises_updated_at before update on public.exercises
  for each row execute function private.set_updated_at();
create trigger exercises_owner_immutable before update on public.exercises
  for each row execute function private.prevent_owner_change('owner_id');

-- Runs as the invoking user, so RLS limits the lookup to exercises the user can see.
create function private.assert_exercise_visible() returns trigger
language plpgsql set search_path = '' as $$
declare
  ref uuid := (to_jsonb(new) ->> tg_argv[0])::uuid;
begin
  if ref is not null and not exists (select 1 from public.exercises e where e.id = ref) then
    raise exception 'NOT_FOUND' using errcode = 'VD404', detail = 'exercise not found';
  end if;
  return new;
end $$;

create trigger exercises_variation_visible before insert or update of variation_of on public.exercises
  for each row execute function private.assert_exercise_visible('variation_of');

create table public.exercise_muscles (
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  muscle_code text not null references public.muscle_groups (code),
  role public.muscle_role not null default 'primary',
  primary key (exercise_id, muscle_code)
);
create index exercise_muscles_muscle_idx on public.exercise_muscles (muscle_code);

create table public.exercise_equipment (
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  equipment_code text not null references public.equipment_types (code),
  primary key (exercise_id, equipment_code)
);
create index exercise_equipment_code_idx on public.exercise_equipment (equipment_code);

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.muscle_groups enable row level security;
alter table public.equipment_types enable row level security;
alter table public.exercises enable row level security;
alter table public.exercise_muscles enable row level security;
alter table public.exercise_equipment enable row level security;

create policy muscle_groups_read on public.muscle_groups for select to authenticated using (true);
create policy equipment_types_read on public.equipment_types for select to authenticated using (true);

create policy exercises_select_visible on public.exercises for select to authenticated
  using (owner_id is null or owner_id = (select auth.uid()));
create policy exercises_insert_own on public.exercises for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy exercises_update_own on public.exercises for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy exercises_delete_own on public.exercises for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy exercise_muscles_select on public.exercise_muscles for select to authenticated
  using (exists (select 1 from public.exercises e where e.id = exercise_id));
create policy exercise_muscles_insert_own on public.exercise_muscles for insert to authenticated
  with check (exists (select 1 from public.exercises e where e.id = exercise_id and e.owner_id = (select auth.uid())));
create policy exercise_muscles_delete_own on public.exercise_muscles for delete to authenticated
  using (exists (select 1 from public.exercises e where e.id = exercise_id and e.owner_id = (select auth.uid())));

create policy exercise_equipment_select on public.exercise_equipment for select to authenticated
  using (exists (select 1 from public.exercises e where e.id = exercise_id));
create policy exercise_equipment_insert_own on public.exercise_equipment for insert to authenticated
  with check (exists (select 1 from public.exercises e where e.id = exercise_id and e.owner_id = (select auth.uid())));
create policy exercise_equipment_delete_own on public.exercise_equipment for delete to authenticated
  using (exists (select 1 from public.exercises e where e.id = exercise_id and e.owner_id = (select auth.uid())));

-- ── Grants ───────────────────────────────────────────────────────────────────
revoke all on public.muscle_groups, public.equipment_types, public.exercises,
  public.exercise_muscles, public.exercise_equipment from anon, authenticated;
grant select on public.muscle_groups, public.equipment_types to authenticated;
grant select, insert, update, delete on public.exercises to authenticated;
grant select, insert, delete on public.exercise_muscles, public.exercise_equipment to authenticated;
