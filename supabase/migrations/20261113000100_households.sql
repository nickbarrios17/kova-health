-- Comidas, etapa 4 (docs/comidas.md): «tu casa». People who live together share the shopping list:
-- anyone in the household sees it, ticks items and adds more. A person is in at most one household;
-- joining is by a one-use 6-character code. Only the shopping list is shared (plans, meals and the rest
-- stay private). Membership is checked by a security-definer helper so the policies do not recurse.

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  code text unique check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id),
  unique (user_id)
);

alter table public.households enable row level security;
alter table public.household_members enable row level security;
revoke all on public.households, public.household_members from anon, authenticated;

create function private.my_household() returns uuid
language sql stable security definer set search_path = '' as $$
  select household_id from public.household_members where user_id = (select auth.uid())
$$;
revoke all on function private.my_household() from public, anon;
grant execute on function private.my_household() to authenticated;

-- Members read their household (its code included, to invite someone else).
create policy households_member_read on public.households for select to authenticated using (id = (select private.my_household()));
create policy household_members_member_read on public.household_members for select to authenticated using (household_id = (select private.my_household()));
grant select on public.households, public.household_members to authenticated;

-- ── Shared shopping lists ───────────────────────────────────────────────────
alter table public.shopping_lists add column household_id uuid references public.households (id) on delete set null;
-- Items of a shared list are added by any member, so they no longer have to belong to the list's owner.
alter table public.shopping_items drop constraint shopping_items_list_id_user_id_fkey;
alter table public.shopping_items add constraint shopping_items_list_fkey foreign key (list_id) references public.shopping_lists (id) on delete cascade;

drop policy shopping_lists_select_own on public.shopping_lists;
drop policy shopping_lists_update_own on public.shopping_lists;
create policy shopping_lists_select_own_or_house on public.shopping_lists for select to authenticated
  using (user_id = (select auth.uid()) or (household_id is not null and household_id = (select private.my_household())));
create policy shopping_lists_update_own_or_house on public.shopping_lists for update to authenticated
  using (user_id = (select auth.uid()) or (household_id is not null and household_id = (select private.my_household())))
  with check (user_id = (select auth.uid()) or (household_id is not null and household_id = (select private.my_household())));
-- A list can only be shared with the person's own household.
create policy shopping_lists_house_check on public.shopping_lists as restrictive for insert to authenticated
  with check (household_id is null or household_id = (select private.my_household()));

create function private.can_use_list(p_list uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.shopping_lists l where l.id = p_list
    and (l.user_id = (select auth.uid()) or (l.household_id is not null and l.household_id = (select private.my_household()))))
$$;
revoke all on function private.can_use_list(uuid) from public, anon;
grant execute on function private.can_use_list(uuid) to authenticated;

drop policy shopping_items_select_own on public.shopping_items;
drop policy shopping_items_insert_own on public.shopping_items;
drop policy shopping_items_update_own on public.shopping_items;
drop policy shopping_items_delete_own on public.shopping_items;
create policy shopping_items_select_list on public.shopping_items for select to authenticated using ((select private.can_use_list(list_id)));
create policy shopping_items_insert_list on public.shopping_items for insert to authenticated
  with check (user_id = (select auth.uid()) and (select private.can_use_list(list_id)));
create policy shopping_items_update_list on public.shopping_items for update to authenticated
  using ((select private.can_use_list(list_id))) with check ((select private.can_use_list(list_id)));
create policy shopping_items_delete_list on public.shopping_items for delete to authenticated using ((select private.can_use_list(list_id)));
drop trigger shopping_items_owner_immutable on public.shopping_items;
create trigger shopping_items_owner_immutable before update on public.shopping_items
  for each row execute function private.prevent_owner_change('user_id');

-- ── Joining and leaving (definer, behind invoker wrappers) ────────────────────
create function private.new_household_code() returns text
language sql volatile set search_path = '' as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '') from generate_series(1, 6)
$$;

create function private.create_household(p_name text) returns public.households
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); h public.households;
begin
  if uid is null then raise exception 'NOT_FOUND' using errcode = 'VD404'; end if;
  if exists (select 1 from public.household_members where user_id = uid) then
    raise exception 'CONFLICT' using errcode = '23505', detail = 'already in a household';
  end if;
  loop
    begin
      insert into public.households (name, code, created_by) values (btrim(coalesce(nullif(p_name, ''), 'Mi casa')), private.new_household_code(), uid) returning * into h;
      exit;
    exception when unique_violation then
    end;
  end loop;
  insert into public.household_members (household_id, user_id) values (h.id, uid);
  return h;
end $$;

create function private.join_household(p_code text) returns public.households
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); h public.households;
begin
  if uid is null then raise exception 'NOT_FOUND' using errcode = 'VD404'; end if;
  select * into h from public.households where code = upper(btrim(p_code));
  if not found then raise exception 'INVITE_INVALID' using errcode = 'VD006'; end if;
  if exists (select 1 from public.household_members where user_id = uid) then
    raise exception 'CONFLICT' using errcode = '23505', detail = 'already in a household';
  end if;
  if (select count(*) from public.household_members where household_id = h.id) >= 8 then
    raise exception 'RATE_LIMITED' using errcode = 'VD429', detail = 'household full';
  end if;
  insert into public.household_members (household_id, user_id) values (h.id, uid);
  -- A fresh code, so the one that was shared cannot be reused.
  update public.households set code = private.new_household_code() where id = h.id returning * into h;
  return h;
end $$;

create function private.leave_household() returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); hid uuid;
begin
  delete from public.household_members where user_id = uid returning household_id into hid;
  if hid is null then return; end if;
  -- The person's own lists stop being shared; an empty household goes away.
  update public.shopping_lists set household_id = null where user_id = uid and household_id = hid;
  delete from public.households h where h.id = hid and not exists (select 1 from public.household_members m where m.household_id = hid);
end $$;

-- First names of the household, for «Compartida con Juli».
create function private.household_people() returns table (user_id uuid, name text, me boolean)
language sql stable security definer set search_path = '' as $$
  select m.user_id, coalesce(private.person_name(m.user_id), 'Alguien'), m.user_id = (select auth.uid())
  from public.household_members m where m.household_id = (select private.my_household()) order by m.joined_at
$$;

revoke all on function private.new_household_code(), private.create_household(text), private.join_household(text), private.leave_household(), private.household_people() from public, anon;
grant execute on function private.create_household(text), private.join_household(text), private.leave_household(), private.household_people() to authenticated;

create function public.create_household(p_name text) returns public.households
language sql security invoker set search_path = '' as $$ select * from private.create_household(p_name) $$;
create function public.join_household(p_code text) returns public.households
language sql security invoker set search_path = '' as $$ select * from private.join_household(p_code) $$;
create function public.leave_household() returns void
language sql security invoker set search_path = '' as $$ select private.leave_household() $$;
create function public.household_people() returns table (user_id uuid, name text, me boolean)
language sql stable security invoker set search_path = '' as $$ select * from private.household_people() $$;
revoke all on function public.create_household(text), public.join_household(text), public.leave_household(), public.household_people() from public, anon;
grant execute on function public.create_household(text), public.join_household(text), public.leave_household(), public.household_people() to authenticated;
