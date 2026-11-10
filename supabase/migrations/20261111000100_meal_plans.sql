-- Comidas, etapa 2 (docs/comidas.md): the adviser. What the person likes, a weekly plan built around
-- their training, and events («el sábado tengo asado») that move the week's calories around.
-- Plan meals are made of catalog foods with grams; their nutrients are computed on the server from the
-- catalog (never typed by the AI) and frozen in the row, like logged meals.

create type public.diet_style as enum ('omnivora', 'vegetariana', 'vegana', 'sin_tacc');
create type public.meal_event_kind as enum ('asado', 'salida', 'cumple', 'otro');

-- ── preferences (one row per person) ───────────────────────────────────────
create table public.food_preferences (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  diet public.diet_style not null default 'omnivora',
  dislikes text[] not null default '{}' check (cardinality(dislikes) <= 30),
  allergies text[] not null default '{}' check (cardinality(allergies) <= 20),
  meals_per_day smallint not null default 4 check (meals_per_day between 3 and 5),
  cook_minutes smallint not null default 30 check (cook_minutes between 5 and 180),
  people smallint not null default 1 check (people between 1 and 10),
  budget_week_ars integer check (budget_week_ars is null or budget_week_ars between 0 and 100000000),
  notes text check (notes is null or char_length(notes) <= 300),
  updated_at timestamptz not null default now()
);
create trigger food_preferences_updated_at before update on public.food_preferences
  for each row execute function private.set_updated_at();
create trigger food_preferences_owner_immutable before update on public.food_preferences
  for each row execute function private.prevent_owner_change('user_id');

-- ── weekly plans ─────────────────────────────────────────────────────────────
create table public.meal_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  week_start date not null,
  -- The day targets the plan was built for (kind, kcal, macros, note), as the person saw them.
  targets jsonb not null default '[]',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
create unique index meal_plans_active_week_key on public.meal_plans (user_id, week_start) where archived_at is null;
create trigger meal_plans_owner_immutable before update on public.meal_plans
  for each row execute function private.prevent_owner_change('user_id');

create table public.meal_plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null,
  user_id uuid not null default auth.uid(),
  local_date date not null,
  slot public.meal_slot not null,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  minutes smallint check (minutes is null or minutes between 0 and 600),
  steps text check (steps is null or char_length(steps) <= 1200),
  -- [{ food_id, grams }] from the catalog; nutrients below are computed from them on the server.
  ingredients jsonb not null check (jsonb_typeof(ingredients) = 'array' and jsonb_array_length(ingredients) between 1 and 15),
  kcal numeric(7, 1) not null check (kcal between 0 and 5000),
  protein_g numeric(6, 1) not null check (protein_g between 0 and 500),
  carbs_g numeric(6, 1) not null check (carbs_g between 0 and 800),
  fat_g numeric(6, 1) not null check (fat_g between 0 and 400),
  logged_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (plan_id, user_id) references public.meal_plans (id, user_id) on delete cascade,
  unique (plan_id, local_date, slot)
);
create index meal_plan_items_plan_idx on public.meal_plan_items (plan_id, local_date, slot);
create trigger meal_plan_items_owner_immutable before update on public.meal_plan_items
  for each row execute function private.prevent_owner_change('user_id');

-- ── events that change a day ───────────────────────────────────────────────
create table public.meal_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  local_date date not null,
  kind public.meal_event_kind not null,
  note text check (note is null or char_length(note) <= 120),
  created_at timestamptz not null default now(),
  unique (user_id, local_date, kind)
);
create trigger meal_events_owner_immutable before update on public.meal_events
  for each row execute function private.prevent_owner_change('user_id');

-- ── RLS: everything is the person's own ────────────────────────────────────
alter table public.food_preferences enable row level security;
alter table public.meal_plans enable row level security;
alter table public.meal_plan_items enable row level security;
alter table public.meal_events enable row level security;
do $$
declare t text;
begin
  foreach t in array array['food_preferences', 'meal_plans', 'meal_plan_items', 'meal_events'] loop
    execute format('create policy %1$s_select_own on public.%1$I for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format('create policy %1$s_insert_own on public.%1$I for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format('create policy %1$s_update_own on public.%1$I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('create policy %1$s_delete_own on public.%1$I for delete to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
end $$;
revoke all on public.food_preferences, public.meal_plans, public.meal_plan_items, public.meal_events from anon, authenticated;
grant select, insert, update, delete on public.food_preferences, public.meal_events to authenticated;
grant select, insert, delete on public.meal_plans, public.meal_plan_items to authenticated;
grant update (archived_at) on public.meal_plans to authenticated;
-- Plan meals keep their computed nutrients: only marking them eaten is an update.
grant update (logged_at) on public.meal_plan_items to authenticated;
