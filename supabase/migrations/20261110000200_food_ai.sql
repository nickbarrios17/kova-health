-- Comidas, etapa 1 (docs/comidas.md): what describing a meal, a plate photo and a barcode need.
-- 1. log_food can record a manual entry as 'estimated' (an AI estimate the user confirmed), never as
--    'verified' or 'label'. Estimates stay marked as such everywhere they are shown.
-- 2. search_foods: accent- and typo-tolerant search over the foods the caller can see.
-- 3. off_products: a cache of Open Food Facts products (ODbL), kept apart from `foods`. Written only
--    by the food-barcode function; readable by signed-in users.
-- 4. ai_requests: one row per AI call, so the functions can cap calls per person and per day.

create extension if not exists unaccent with schema extensions;

-- ── 1. estimated manual entries ─────────────────────────────────────────────
create or replace function private.guard_meal_item_source() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.food_id is null and new.recipe_id is null then
    -- Manual entries are the user's numbers, or an estimate they confirmed. Nothing else.
    if new.data_source is distinct from 'estimated' then
      new.data_source := 'user';
    end if;
  elsif new.data_source = 'verified' and not exists (
    select 1 from public.foods f where f.id = new.food_id and f.data_source = 'verified'
  ) then
    new.data_source := 'user';
  end if;
  return new;
end $$;

drop function public.log_food(uuid, date, public.meal_slot, numeric, uuid, uuid, text, numeric, numeric, numeric, numeric, timestamptz, uuid);

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
  p_device_id uuid default null,
  p_estimated boolean default false
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
    v_name := btrim(p_name); v_unit := 'serving';
    v_src := (case when p_estimated then 'estimated' else 'user' end)::public.nutrition_source;
    v_kcal := p_kcal; v_p := p_protein_g; v_c := p_carbs_g; v_f := p_fat_g; v_fib := null;
  end if;
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
revoke execute on function public.log_food(uuid, date, public.meal_slot, numeric, uuid, uuid, text, numeric, numeric, numeric, numeric, timestamptz, uuid, boolean) from public, anon;
grant execute on function public.log_food(uuid, date, public.meal_slot, numeric, uuid, uuid, text, numeric, numeric, numeric, numeric, timestamptz, uuid, boolean) to authenticated;

-- ── 2. search ───────────────────────────────────────────────────────────────
create function private.fold(t text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(t, '')))
$$;
create index foods_name_fold_trgm_idx on public.foods using gin (private.fold(name) extensions.gin_trgm_ops);

-- Foods the caller can see (RLS), best matches first: every word present, then similarity.
create function public.search_foods(p_q text, p_limit int default 30)
returns setof public.foods
language sql stable security invoker set search_path = '' as $$
  with q as (select private.fold(btrim(left(coalesce(p_q, ''), 80))) as t)
  select f.* from public.foods f, q
  where f.archived_at is null and q.t <> ''
    and (private.fold(f.name) like '%' || q.t || '%'
         or extensions.similarity(private.fold(f.name), q.t) > 0.25
         or not exists (
           select 1 from unnest(string_to_array(q.t, ' ')) w
           where w <> '' and private.fold(f.name) not like '%' || w || '%'))
  order by (private.fold(f.name) like q.t || '%') desc,
           (f.owner_id is not null) desc,
           extensions.similarity(private.fold(f.name), q.t) desc,
           f.name
  limit least(greatest(coalesce(p_limit, 30), 1), 100)
$$;
revoke execute on function public.search_foods(text, int) from public, anon;
grant execute on function public.search_foods(text, int) to authenticated;
grant execute on function private.fold(text) to authenticated;

-- ── 3. Open Food Facts cache ────────────────────────────────────────────────
create table public.off_products (
  barcode text primary key check (barcode ~ '^[0-9]{8,14}$'),
  found boolean not null,                 -- false: Open Food Facts does not have it (cached too)
  name text check (name is null or char_length(name) <= 200),
  brand text check (brand is null or char_length(brand) <= 120),
  quantity_label text check (quantity_label is null or char_length(quantity_label) <= 60),
  serving_g numeric(7, 2) check (serving_g is null or serving_g > 0),
  kcal_100 numeric(7, 1), protein_100 numeric(7, 2), carbs_100 numeric(7, 2), fat_100 numeric(7, 2),
  fiber_100 numeric(7, 2), sugars_100 numeric(7, 2), sat_fat_100 numeric(7, 2), sodium_mg_100 numeric(8, 1),
  liquid boolean not null default false,
  category text check (category is null or char_length(category) <= 120),
  labels text[] not null default '{}',    -- Open Food Facts label tags (e.g. Argentine warning seals)
  fetched_at timestamptz not null default now()
);
alter table public.off_products enable row level security;
create policy off_products_read on public.off_products for select to authenticated using (true);
revoke all on public.off_products from anon, authenticated;
grant select on public.off_products to authenticated;

-- ── 4. AI calls per person ─────────────────────────────────────────────────
create table public.ai_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('describe', 'photo', 'label', 'plan', 'menu', 'pantry')),
  ok boolean not null default true,
  created_at timestamptz not null default now()
);
create index ai_requests_user_day_idx on public.ai_requests (user_id, created_at desc);
alter table public.ai_requests enable row level security;
create policy ai_requests_read_own on public.ai_requests for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.ai_requests from anon, authenticated;
grant select on public.ai_requests to authenticated;
