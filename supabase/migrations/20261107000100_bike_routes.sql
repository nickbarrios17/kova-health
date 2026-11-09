-- Ciclismo (docs/ciclismo.md): routes a person planned and saved. Only the owner sees them.
-- The route itself (coordinates and the engine's way/surface stretches) is stored as planned, so
-- the analysis can be redone later with better data (parks, safety) without asking the engine again.

create table public.bike_routes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  kind text not null check (kind in ('ab', 'loop')),
  -- RawRoute (packages/domain/src/cycling.ts): { coords, distance_m, ascent_m, descent_m, waytype, surface }.
  route jsonb not null check (jsonb_typeof(route) = 'object' and pg_column_size(route) <= 400000),
  distance_m integer not null check (distance_m between 0 and 1000000),
  ascent_m integer not null default 0 check (ascent_m between 0 and 20000),
  duration_s integer not null check (duration_s between 0 and 360000),
  -- { shares, park_share, parks, tags, warnings } at save time, for the list.
  summary jsonb not null default '{}'::jsonb check (jsonb_typeof(summary) = 'object' and pg_column_size(summary) <= 8192),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index bike_routes_user_idx on public.bike_routes (user_id, created_at desc) where deleted_at is null;
create trigger bike_routes_updated_at before update on public.bike_routes
  for each row execute function private.set_updated_at();
create trigger bike_routes_owner before update on public.bike_routes
  for each row execute function private.prevent_owner_change('user_id');

alter table public.bike_routes enable row level security;
create policy bike_routes_select_own on public.bike_routes for select to authenticated
  using (user_id = (select auth.uid()));
create policy bike_routes_insert_own on public.bike_routes for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy bike_routes_update_own on public.bike_routes for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.bike_routes from anon, authenticated;
grant select, insert (id, name, kind, route, distance_m, ascent_m, duration_s, summary), update (name, deleted_at) on public.bike_routes to authenticated;
