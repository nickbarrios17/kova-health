-- VIDA foundation: profiles, preferences, devices, entitlements, shared helpers.
-- Conventions: docs/architecture.md. Every table exposed to clients has RLS enabled
-- with explicit per-operation policies; `anon` gets no access to user data.

-- `private` holds trigger/helper functions. It is not in PostgREST's exposed schemas;
-- authenticated needs USAGE only so helpers called inside triggers resolve.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

-- ── Domain error codes (SQLSTATE) ────────────────────────────────────────────
-- VD001 ACTIVE_SESSION_EXISTS · VD002 VERSION_CONFLICT · VD003 SESSION_CLOSED
-- VD004 INVALID_TRANSITION · VD005 INVALID_INPUT · VD404 NOT_FOUND
-- The message text is the domain code; @vida/api-client maps both.

-- ── Shared trigger helpers ───────────────────────────────────────────────────
create function private.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Rejects changes to the ownership column named in TG_ARGV[0].
create function private.prevent_owner_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (to_jsonb(new) ->> tg_argv[0]) is distinct from (to_jsonb(old) ->> tg_argv[0]) then
    raise exception 'INVALID_INPUT' using errcode = 'VD005', detail = tg_argv[0] || ' is immutable';
  end if;
  return new;
end $$;

create function private.is_valid_time_zone(tz text) returns boolean
language sql stable set search_path = '' as $$
  select exists (select 1 from pg_catalog.pg_timezone_names where name = tz);
$$;

-- ── Enums ────────────────────────────────────────────────────────────────────
create type public.onboarding_state as enum ('new', 'profile', 'goals', 'done');
create type public.weight_unit as enum ('kg', 'lb');
create type public.device_kind as enum ('web', 'mobile', 'watch');

-- ── profiles ─────────────────────────────────────────────────────────────────
-- Only what the product needs today; no sex/medical fields are collected.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(btrim(display_name)) between 1 and 80),
  birth_year smallint check (birth_year is null or birth_year between 1900 and 2100),
  height_cm numeric(5, 1) check (height_cm is null or height_cm between 50 and 272),
  onboarding_state public.onboarding_state not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();
create trigger profiles_owner_immutable before update on public.profiles
  for each row execute function private.prevent_owner_change('id');

-- ── user_preferences ─────────────────────────────────────────────────────────
create table public.user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  weight_unit public.weight_unit not null default 'kg',
  locale text not null default 'es-ES' check (locale ~ '^[a-z]{2,3}(-[A-Z]{2})?$'),
  time_zone text not null default 'UTC',
  week_start smallint not null default 1 check (week_start in (1, 7)), -- ISO: 1 = Monday, 7 = Sunday
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create function private.validate_preferences() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not private.is_valid_time_zone(new.time_zone) then
    raise exception 'INVALID_INPUT' using errcode = 'VD005', detail = 'unknown time zone';
  end if;
  return new;
end $$;

create trigger user_preferences_validate before insert or update on public.user_preferences
  for each row execute function private.validate_preferences();
create trigger user_preferences_updated_at before update on public.user_preferences
  for each row execute function private.set_updated_at();
create trigger user_preferences_owner_immutable before update on public.user_preferences
  for each row execute function private.prevent_owner_change('user_id');

-- ── New-user bootstrap ───────────────────────────────────────────────────────
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id);
  insert into public.user_preferences (user_id) values (new.id);
  return new;
end $$;
revoke all on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- ── devices (source attribution for sync) ────────────────────────────────────
create table public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind public.device_kind not null,
  platform text check (platform is null or char_length(platform) <= 40),
  label text check (label is null or char_length(label) <= 80),
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create index devices_user_idx on public.devices (user_id);
create trigger devices_updated_at before update on public.devices
  for each row execute function private.set_updated_at();
create trigger devices_owner_immutable before update on public.devices
  for each row execute function private.prevent_owner_change('user_id');

-- ── Entitlements (subscription-ready; no billing provider yet) ───────────────
create table public.entitlements (
  code text primary key check (code ~ '^[a-z][a-z0-9_]{1,40}$'),
  description text not null,
  created_at timestamptz not null default now()
);

create table public.user_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  entitlement text not null references public.entitlements (code),
  source text not null check (source in ('manual', 'promo', 'app_store', 'play_store', 'stripe')),
  provider_ref text check (provider_ref is null or char_length(provider_ref) <= 200),
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_to is null or valid_to > valid_from)
);
create index user_entitlements_user_idx on public.user_entitlements (user_id, entitlement);
create trigger user_entitlements_updated_at before update on public.user_entitlements
  for each row execute function private.set_updated_at();

insert into public.entitlements (code, description) values
  ('premium', 'VIDA Premium (reserved; no features gated yet)');

-- Server-side entitlement check. Never trust a client-sent flag.
create function public.has_entitlement(p_code text) returns boolean
language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from public.user_entitlements ue
    where ue.user_id = (select auth.uid())
      and ue.entitlement = p_code
      and ue.valid_from <= now()
      and (ue.valid_to is null or ue.valid_to > now())
  );
$$;

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.user_preferences enable row level security;
alter table public.devices enable row level security;
alter table public.entitlements enable row level security;
alter table public.user_entitlements enable row level security;

-- profiles: created by trigger, removed by cascade → no insert/delete for clients.
create policy profiles_select_own on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy prefs_select_own on public.user_preferences for select to authenticated
  using (user_id = (select auth.uid()));
create policy prefs_update_own on public.user_preferences for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy devices_select_own on public.devices for select to authenticated
  using (user_id = (select auth.uid()));
create policy devices_insert_own on public.devices for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy devices_update_own on public.devices for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy devices_delete_own on public.devices for delete to authenticated
  using (user_id = (select auth.uid()));

create policy entitlements_read on public.entitlements for select to authenticated using (true);

-- Read-only for the owner; only the service role (trusted server) writes.
create policy user_entitlements_select_own on public.user_entitlements for select to authenticated
  using (user_id = (select auth.uid()));

-- ── Grants (least privilege, explicit) ───────────────────────────────────────
revoke all on public.profiles, public.user_preferences, public.devices,
  public.entitlements, public.user_entitlements from anon, authenticated;
grant select, update (display_name, birth_year, height_cm, onboarding_state) on public.profiles to authenticated;
grant select, update (weight_unit, locale, time_zone, week_start) on public.user_preferences to authenticated;
grant select, insert, update, delete on public.devices to authenticated;
grant select on public.entitlements to authenticated;
grant select on public.user_entitlements to authenticated;

revoke all on function public.has_entitlement(text) from public, anon;
grant execute on function public.has_entitlement(text) to authenticated;
