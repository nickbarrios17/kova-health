-- Nutrition: foods (with provenance), recipes, daily meals with snapshotted nutrients, goals.
-- Rules (master prompt §5.5): never invent nutritional values; distinguish verified from
-- user-entered/estimated data; logged items keep the values used at logging time.
-- No clinical prescriptions: goals are user-set numbers, nothing here calculates them.

create type public.nutrition_source as enum ('verified', 'label', 'user', 'estimated');
create type public.food_unit as enum ('g', 'ml', 'serving');
create type public.meal_slot as enum ('breakfast', 'lunch', 'afternoon_snack', 'dinner', 'snack');

-- ── foods ────────────────────────────────────────────────────────────────────
-- Nutrients are given for `ref_amount` of `ref_unit` (e.g. 100 g, 250 ml, 1 serving), exactly as
-- known — portions like "1 mediano" are not converted to invented grams.
create table public.foods (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid default auth.uid() references auth.users (id) on delete cascade, -- null = catalog
  name text not null check (char_length(btrim(name)) between 1 and 120),
  brand text check (brand is null or char_length(brand) <= 80),
  barcode text check (barcode is null or barcode ~ '^[0-9]{8,14}$'),
  ref_amount numeric(8, 2) not null check (ref_amount > 0 and ref_amount <= 10000),
  ref_unit public.food_unit not null,
  serving_label text check (serving_label is null or char_length(serving_label) <= 60),
  default_quantity numeric(8, 2) check (default_quantity > 0 and default_quantity <= 10000),
  kcal numeric(7, 1) not null check (kcal between 0 and 20000),
  protein_g numeric(7, 2) not null check (protein_g between 0 and 2000),
  carbs_g numeric(7, 2) not null check (carbs_g between 0 and 2000),
  fat_g numeric(7, 2) not null check (fat_g between 0 and 2000),
  fiber_g numeric(7, 2) check (fiber_g between 0 and 2000),
  data_source public.nutrition_source not null default 'user',
  source_ref text check (source_ref is null or char_length(source_ref) <= 200), -- e.g. 'USDA FDC 171477'
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Macros cannot exceed the mass they describe.
  check (ref_unit = 'serving' or protein_g + carbs_g + fat_g + coalesce(fiber_g, 0) <= ref_amount * 1.02),
  -- Only the trusted catalog can be "verified", and verified data must cite its source.
  check (data_source <> 'verified' or (owner_id is null and source_ref is not null))
);
create index foods_owner_idx on public.foods (owner_id, updated_at, id);
create index foods_name_trgm_idx on public.foods using gin (name extensions.gin_trgm_ops);
create unique index foods_owner_barcode_key on public.foods (coalesce(owner_id, '00000000-0000-0000-0000-000000000000'::uuid), barcode)
  where barcode is not null;

create trigger foods_updated_at before update on public.foods
  for each row execute function private.set_updated_at();
create trigger foods_owner_immutable before update on public.foods
  for each row execute function private.prevent_owner_change('owner_id');

-- ── recipes (also used as reusable meals) ───────────────────────────────────
create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  servings numeric(6, 2) not null default 1 check (servings > 0 and servings <= 100),
  notes text check (notes is null or char_length(notes) <= 2000),
  archived_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create index recipes_user_sync_idx on public.recipes (user_id, updated_at, id);
create trigger recipes_updated_at before update on public.recipes
  for each row execute function private.set_updated_at();
create trigger recipes_owner_immutable before update on public.recipes
  for each row execute function private.prevent_owner_change('user_id');

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null,
  user_id uuid not null default auth.uid(),
  food_id uuid not null references public.foods (id),
  quantity numeric(8, 2) not null check (quantity > 0 and quantity <= 10000), -- in the food's ref_unit
  position smallint not null check (position between 0 and 99),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (recipe_id, user_id) references public.recipes (id, user_id) on delete cascade
);
create index recipe_ingredients_recipe_idx on public.recipe_ingredients (recipe_id, position);
create index recipe_ingredients_food_idx on public.recipe_ingredients (food_id);
create trigger recipe_ingredients_updated_at before update on public.recipe_ingredients
  for each row execute function private.set_updated_at();
create trigger recipe_ingredients_owner_immutable before update on public.recipe_ingredients
  for each row execute function private.prevent_owner_change('user_id');

-- Runs as the caller: RLS limits the lookup to foods the user can see (catalog + own).
create function private.assert_food_visible() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.food_id is not null and not exists (select 1 from public.foods f where f.id = new.food_id) then
    raise exception 'NOT_FOUND' using errcode = 'VD404', detail = 'food not found';
  end if;
  return new;
end $$;

create trigger recipe_ingredients_food_visible before insert or update of food_id on public.recipe_ingredients
  for each row execute function private.assert_food_visible();

-- ── meals and logged items ───────────────────────────────────────────────────
-- A meal is the (day, slot) container shown in the UI ("Cena", today). The day is the user's
-- calendar day chosen by the client, so offline logging needs no server clock.
create table public.meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  local_date date not null check (local_date >= date '2000-01-01'),
  slot public.meal_slot not null,
  notes text check (notes is null or char_length(notes) <= 1000),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create unique index meals_day_slot_key on public.meals (user_id, local_date, slot) where deleted_at is null;
create index meals_user_sync_idx on public.meals (user_id, updated_at, id);
create trigger meals_updated_at before update on public.meals
  for each row execute function private.set_updated_at();
create trigger meals_owner_immutable before update on public.meals
  for each row execute function private.prevent_owner_change('user_id');

create table public.meal_items (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null,
  user_id uuid not null default auth.uid(),
  food_id uuid references public.foods (id) on delete set null,
  recipe_id uuid,
  name text not null check (char_length(btrim(name)) between 1 and 120), -- snapshot
  quantity numeric(8, 2) not null check (quantity > 0 and quantity <= 10000),
  unit public.food_unit not null,
  -- Absolute values for this quantity, frozen at logging time.
  kcal numeric(7, 1) not null check (kcal between 0 and 20000),
  protein_g numeric(7, 2) not null check (protein_g between 0 and 2000),
  carbs_g numeric(7, 2) not null check (carbs_g between 0 and 2000),
  fat_g numeric(7, 2) not null check (fat_g between 0 and 2000),
  fiber_g numeric(7, 2) check (fiber_g between 0 and 2000),
  data_source public.nutrition_source not null,
  logged_at timestamptz not null default now(),
  device_id uuid,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (meal_id, user_id) references public.meals (id, user_id) on delete cascade,
  foreign key (recipe_id, user_id) references public.recipes (id, user_id) on delete set null (recipe_id),
  foreign key (device_id, user_id) references public.devices (id, user_id) on delete set null (device_id)
);
create index meal_items_meal_idx on public.meal_items (meal_id);
create index meal_items_food_idx on public.meal_items (user_id, food_id, logged_at desc);
create index meal_items_user_sync_idx on public.meal_items (user_id, updated_at, id);
create trigger meal_items_updated_at before update on public.meal_items
  for each row execute function private.set_updated_at();
create trigger meal_items_owner_immutable before update on public.meal_items
  for each row execute function private.prevent_owner_change('user_id');
create trigger meal_items_food_visible before insert or update of food_id on public.meal_items
  for each row execute function private.assert_food_visible();

-- Provenance cannot be claimed by the client: a "verified" snapshot must come from a verified
-- catalog food; manual entries are always 'user'.
create function private.guard_meal_item_source() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.food_id is null and new.recipe_id is null then
    new.data_source := 'user';
  elsif new.data_source = 'verified' and not exists (
    select 1 from public.foods f where f.id = new.food_id and f.data_source = 'verified'
  ) then
    new.data_source := 'user';
  end if;
  return new;
end $$;

create trigger meal_items_guard_source before insert on public.meal_items
  for each row execute function private.guard_meal_item_source();

-- ── nutrition goals (history-preserving: a change adds a row) ───────────────
create table public.nutrition_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  effective_from date not null,
  kcal numeric(6, 0) check (kcal between 500 and 10000),
  protein_g numeric(5, 0) check (protein_g between 0 and 1000),
  carbs_g numeric(5, 0) check (carbs_g between 0 and 1500),
  fat_g numeric(5, 0) check (fat_g between 0 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, effective_from),
  check (kcal is not null or protein_g is not null or carbs_g is not null or fat_g is not null)
);
create trigger nutrition_goals_updated_at before update on public.nutrition_goals
  for each row execute function private.set_updated_at();
create trigger nutrition_goals_owner_immutable before update on public.nutrition_goals
  for each row execute function private.prevent_owner_change('user_id');

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.foods enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.meals enable row level security;
alter table public.meal_items enable row level security;
alter table public.nutrition_goals enable row level security;

create policy foods_select_visible on public.foods for select to authenticated
  using (owner_id is null or owner_id = (select auth.uid()));
create policy foods_insert_own on public.foods for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy foods_update_own on public.foods for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy foods_delete_own on public.foods for delete to authenticated
  using (owner_id = (select auth.uid()));

do $$
declare t text;
begin
  foreach t in array array['recipes', 'recipe_ingredients', 'meals', 'meal_items', 'nutrition_goals'] loop
    execute format('create policy %1$s_select_own on public.%1$I for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format('create policy %1$s_insert_own on public.%1$I for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format('create policy %1$s_update_own on public.%1$I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('create policy %1$s_delete_own on public.%1$I for delete to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
end $$;

revoke all on public.foods, public.recipes, public.recipe_ingredients, public.meals,
  public.meal_items, public.nutrition_goals from anon, authenticated;
grant select, insert, update, delete on public.foods, public.recipes, public.recipe_ingredients,
  public.meals, public.nutrition_goals to authenticated;
-- Logged nutrient values are frozen: to change a quantity, soft-delete and log again.
-- Direct edits of the snapshot columns are not granted.
grant select, insert, delete on public.meal_items to authenticated;
grant update (deleted_at, updated_at) on public.meal_items to authenticated;

-- ── RPC: log_food (idempotent on p_item_id) ──────────────────────────────────
-- Exactly one of: p_food_id (scaled from the food), p_recipe_id (scaled per serving), or a manual
-- entry (p_name + p_kcal/p_protein_g/p_carbs_g/p_fat_g, recorded as data_source 'user').
create function public.log_food(
  p_item_id uuid,
  p_local_date date,
  p_slot public.meal_slot,
  p_quantity numeric,
  p_food_id uuid default null,
  p_recipe_id uuid default null,
  p_name text default null,
  p_kcal numeric default null,
  p_protein_g numeric default null,
  p_carbs_g numeric default null,
  p_fat_g numeric default null,
  p_logged_at timestamptz default null,
  p_device_id uuid default null
) returns public.meal_items
language plpgsql security invoker set search_path = '' as $$
declare
  it public.meal_items;
  v_meal uuid;
  f public.foods;
  r public.recipes;
  factor numeric;
  v_name text; v_unit public.food_unit; v_src public.nutrition_source;
  v_kcal numeric; v_p numeric; v_c numeric; v_f numeric; v_fib numeric;
begin
  select * into it from public.meal_items where id = p_item_id;
  if found then
    return it;
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'INVALID_INPUT' using errcode = 'VD005', detail = 'quantity must be positive';
  end if;
  if (p_food_id is not null)::int + (p_recipe_id is not null)::int + (p_name is not null)::int <> 1 then
    raise exception 'INVALID_INPUT' using errcode = 'VD005', detail = 'give exactly one of food, recipe or manual entry';
  end if;

  if p_food_id is not null then
    select * into f from public.foods where id = p_food_id;
    if not found then
      raise exception 'NOT_FOUND' using errcode = 'VD404', detail = 'food';
    end if;
    factor := p_quantity / f.ref_amount;
    v_name := f.name; v_unit := f.ref_unit; v_src := f.data_source;
    v_kcal := f.kcal * factor; v_p := f.protein_g * factor; v_c := f.carbs_g * factor;
    v_f := f.fat_g * factor; v_fib := f.fiber_g * factor;
  elsif p_recipe_id is not null then
    select * into r from public.recipes where id = p_recipe_id and deleted_at is null;
    if not found then
      raise exception 'NOT_FOUND' using errcode = 'VD404', detail = 'recipe';
    end if;
    -- Per-serving totals of the recipe; the least reliable ingredient source wins.
    select sum(fd.kcal * ri.quantity / fd.ref_amount), sum(fd.protein_g * ri.quantity / fd.ref_amount),
           sum(fd.carbs_g * ri.quantity / fd.ref_amount), sum(fd.fat_g * ri.quantity / fd.ref_amount),
           case when bool_and(fd.fiber_g is not null) then sum(fd.fiber_g * ri.quantity / fd.ref_amount) end,
           case when bool_or(fd.data_source = 'estimated') then 'estimated'
                when bool_or(fd.data_source = 'user') then 'user'
                when bool_or(fd.data_source = 'label') then 'label'
                else 'verified' end::public.nutrition_source
      into v_kcal, v_p, v_c, v_f, v_fib, v_src
    from public.recipe_ingredients ri join public.foods fd on fd.id = ri.food_id
    where ri.recipe_id = r.id;
    if v_kcal is null then
      raise exception 'INVALID_INPUT' using errcode = 'VD005', detail = 'recipe has no ingredients';
    end if;
    factor := p_quantity / r.servings;
    v_name := r.name; v_unit := 'serving';
    v_kcal := v_kcal * factor; v_p := v_p * factor; v_c := v_c * factor; v_f := v_f * factor; v_fib := v_fib * factor;
  else
    if p_kcal is null or p_protein_g is null or p_carbs_g is null or p_fat_g is null then
      raise exception 'INVALID_INPUT' using errcode = 'VD005', detail = 'manual entries need kcal and macros';
    end if;
    v_name := btrim(p_name); v_unit := 'serving'; v_src := 'user';
    v_kcal := p_kcal; v_p := p_protein_g; v_c := p_carbs_g; v_f := p_fat_g; v_fib := null;
  end if;

  -- Get or create the (day, slot) meal; concurrent creators converge on one row.
  select id into v_meal from public.meals
  where user_id = (select auth.uid()) and local_date = p_local_date and slot = p_slot and deleted_at is null;
  if not found then
    begin
      insert into public.meals (local_date, slot) values (p_local_date, p_slot) returning id into v_meal;
    exception when unique_violation then
      select id into v_meal from public.meals
      where user_id = (select auth.uid()) and local_date = p_local_date and slot = p_slot and deleted_at is null;
    end;
  end if;

  insert into public.meal_items (
    id, meal_id, food_id, recipe_id, name, quantity, unit, kcal, protein_g, carbs_g, fat_g, fiber_g,
    data_source, logged_at, device_id)
  values (
    p_item_id, v_meal, p_food_id, p_recipe_id, v_name, p_quantity, v_unit,
    round(v_kcal, 1), round(v_p, 2), round(v_c, 2), round(v_f, 2), round(v_fib, 2),
    v_src, least(coalesce(p_logged_at, clock_timestamp()), clock_timestamp()), p_device_id)
  on conflict (id) do nothing
  returning * into it;

  if it.id is null then
    select * into it from public.meal_items where id = p_item_id;
    if not found then
      raise exception 'NOT_FOUND' using errcode = 'VD404';
    end if;
  end if;
  return it;
end $$;

-- Recipe items and their sources are visible through RLS; this only aggregates.
create view public.recipe_nutrition with (security_invoker = true) as
select
  r.id as recipe_id,
  r.user_id,
  r.servings,
  round(sum(f.kcal * ri.quantity / f.ref_amount) / r.servings, 1) as kcal_per_serving,
  round(sum(f.protein_g * ri.quantity / f.ref_amount) / r.servings, 2) as protein_g_per_serving,
  round(sum(f.carbs_g * ri.quantity / f.ref_amount) / r.servings, 2) as carbs_g_per_serving,
  round(sum(f.fat_g * ri.quantity / f.ref_amount) / r.servings, 2) as fat_g_per_serving,
  bool_or(f.data_source in ('user', 'estimated')) as has_unverified_values
from public.recipes r
join public.recipe_ingredients ri on ri.recipe_id = r.id
join public.foods f on f.id = ri.food_id
where r.deleted_at is null
group by r.id, r.user_id, r.servings;

create view public.nutrition_daily with (security_invoker = true) as
select
  m.user_id,
  m.local_date,
  round(sum(i.kcal), 1) as kcal,
  round(sum(i.protein_g), 2) as protein_g,
  round(sum(i.carbs_g), 2) as carbs_g,
  round(sum(i.fat_g), 2) as fat_g,
  count(*) as items,
  bool_or(i.data_source in ('user', 'estimated')) as has_unverified_values
from public.meals m
join public.meal_items i on i.meal_id = m.id and i.deleted_at is null
where m.deleted_at is null
group by m.user_id, m.local_date;

-- "Frecuentes": foods the user logged most in the last 90 days.
create view public.frequent_foods with (security_invoker = true) as
select i.user_id, i.food_id, count(*) as times_logged, max(i.logged_at) as last_logged_at
from public.meal_items i
where i.food_id is not null and i.deleted_at is null and i.logged_at > now() - interval '90 days'
group by i.user_id, i.food_id;

revoke all on function public.log_food(uuid, date, public.meal_slot, numeric, uuid, uuid, text, numeric, numeric, numeric, numeric, timestamptz, uuid) from public, anon;
grant execute on function public.log_food(uuid, date, public.meal_slot, numeric, uuid, uuid, text, numeric, numeric, numeric, numeric, timestamptz, uuid) to authenticated;
revoke all on public.recipe_nutrition, public.nutrition_daily, public.frequent_foods from anon, authenticated;
grant select on public.recipe_nutrition, public.nutrition_daily, public.frequent_foods to authenticated;
