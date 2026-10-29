-- Coach and friends (docs/coach.md): a link lets one account (the viewer) see another's (the owner)
-- training. A coach also plans the owner's routines; a friend only looks. Friends are two links, one
-- per direction, so each person controls what they share. Any account can coach, train, and have
-- friends; an owner has at most one active coach.
--
-- Viewers NEVER get extra RLS on the owner's tables: every read or write on someone else's data goes
-- through the security-definer functions below, which check the link. So nothing of a student or a
-- friend can leak into the viewer's own lists (which query those tables with RLS = own rows only).

create type public.link_kind as enum ('coach', 'friend');

create table public.people_links (
  id uuid primary key default gen_random_uuid(),
  viewer_id uuid not null references auth.users (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  kind public.link_kind not null,
  -- Training (sessions, sets, records) is always visible; routines only to a coach. The rest is opt-in
  -- by the owner.
  share_body boolean not null default false,
  share_nutrition boolean not null default false,
  share_health boolean not null default false,
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  check (viewer_id <> owner_id)
);
create unique index people_links_active_pair on public.people_links (viewer_id, owner_id) where ended_at is null;
create unique index people_links_one_coach on public.people_links (owner_id) where kind = 'coach' and ended_at is null;
create index people_links_owner_idx on public.people_links (owner_id) where ended_at is null;

-- One-use invitation codes, valid 7 days. Coach invite: whoever accepts becomes the inviter's student.
-- Friend invite: inviter and acceptor see each other.
create table public.people_invites (
  code text primary key check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  inviter_id uuid not null references auth.users (id) on delete cascade,
  kind public.link_kind not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_at timestamptz,
  used_by uuid references auth.users (id) on delete set null
);
create index people_invites_inviter_idx on public.people_invites (inviter_id);

alter table public.people_links enable row level security;
alter table public.people_invites enable row level security;
-- Both sides may read their links; changes only through the functions below.
create policy people_links_select_own on public.people_links for select to authenticated
  using (viewer_id = (select auth.uid()) or owner_id = (select auth.uid()));
create policy people_invites_select_own on public.people_invites for select to authenticated
  using (inviter_id = (select auth.uid()));
revoke all on public.people_links, public.people_invites from anon, authenticated;
grant select on public.people_links, public.people_invites to authenticated;

-- ── Helpers ──────────────────────────────────────────────────────────────────

-- Display name of a linked person: their profile name, else the part of the email before @.
create function private.person_name(p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(btrim(p.display_name), ''), split_part(u.email, '@', 1), 'Sin nombre')
  from auth.users u left join public.profiles p on p.id = u.id where u.id = p_user;
$$;

-- Whether the caller may see p_owner's data of one area: 'training' (any active link), 'routines'
-- (coach), 'body' | 'nutrition' | 'health' (only if the owner shares it).
create function private.can_view(p_owner uuid, p_area text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.people_links l
    where l.viewer_id = (select auth.uid()) and l.owner_id = p_owner and l.ended_at is null
      and case p_area
        when 'training' then true
        when 'routines' then l.kind = 'coach'
        when 'body' then l.share_body
        when 'nutrition' then l.share_nutrition
        when 'health' then l.share_health
        else false
      end);
$$;
revoke all on function private.person_name(uuid), private.can_view(uuid, text) from public, anon;
grant execute on function private.can_view(uuid, text) to authenticated;

-- ── Invitations ──────────────────────────────────────────────────────────────

create function private.create_invite(p_kind public.link_kind) returns public.people_invites
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no 0/O, 1/I: easy to dictate
  c text;
  r public.people_invites;
begin
  if uid is null then raise exception 'NOT_FOUND' using errcode = 'VD404'; end if;
  if (select count(*) from public.people_invites where inviter_id = uid and created_at > now() - interval '1 day') >= 20 then
    raise exception 'RATE_LIMITED' using errcode = 'VD429';
  end if;
  loop
    c := (select string_agg(substr(alphabet, 1 + floor(random() * 32)::int, 1), '') from generate_series(1, 6));
    begin
      insert into public.people_invites (code, inviter_id, kind) values (c, uid, p_kind) returning * into r;
      return r;
    exception when unique_violation then
      -- extremely rare: try another code
    end;
  end loop;
end $$;

-- What an invitation is, before accepting it (who invites and as what).
create function private.invite_info(p_code text)
returns table (kind public.link_kind, inviter_name text, valid boolean)
language sql stable security definer set search_path = '' as $$
  select i.kind, private.person_name(i.inviter_id),
         i.used_at is null and i.expires_at > now() and i.inviter_id <> (select auth.uid())
  from public.people_invites i where i.code = upper(btrim(p_code));
$$;

create function private.accept_invite(p_code text) returns public.people_links
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  inv public.people_invites;
  r public.people_links;
begin
  if uid is null then raise exception 'NOT_FOUND' using errcode = 'VD404'; end if;
  select * into inv from public.people_invites where code = upper(btrim(p_code)) for update;
  if not found or inv.used_at is not null or inv.expires_at <= now() then
    raise exception 'INVITE_INVALID' using errcode = 'VD006';
  end if;
  if inv.inviter_id = uid then
    raise exception 'INVALID_INPUT' using errcode = 'VD005', detail = 'own invitation';
  end if;

  if inv.kind = 'coach' then
    if exists (select 1 from public.people_links where owner_id = uid and kind = 'coach' and ended_at is null) then
      raise exception 'ALREADY_HAS_COACH' using errcode = 'VD007';
    end if;
    -- An existing friend link with the same person becomes the coach link.
    update public.people_links set ended_at = now()
    where viewer_id = inv.inviter_id and owner_id = uid and ended_at is null;
    insert into public.people_links (viewer_id, owner_id, kind) values (inv.inviter_id, uid, 'coach') returning * into r;
  else
    insert into public.people_links (viewer_id, owner_id, kind)
    select inv.inviter_id, uid, 'friend'
    where not exists (select 1 from public.people_links where viewer_id = inv.inviter_id and owner_id = uid and ended_at is null);
    insert into public.people_links (viewer_id, owner_id, kind)
    select uid, inv.inviter_id, 'friend'
    where not exists (select 1 from public.people_links where viewer_id = uid and owner_id = inv.inviter_id and ended_at is null);
    select * into r from public.people_links
    where viewer_id = inv.inviter_id and owner_id = uid and ended_at is null;
  end if;

  update public.people_invites set used_at = now(), used_by = uid where code = inv.code;
  return r;
end $$;

-- ── Links ────────────────────────────────────────────────────────────────────

-- The caller's links, both directions, with the other person's name and, where the caller is the
-- viewer, their last completed session and sessions in the last 7 days.
create function private.my_links()
returns table (
  id uuid, kind public.link_kind, role text, person_id uuid, person_name text,
  share_body boolean, share_nutrition boolean, share_health boolean, created_at timestamptz,
  last_session_at timestamptz, sessions_7d integer)
language sql stable security definer set search_path = '' as $$
  select l.id, l.kind,
         case when l.viewer_id = (select auth.uid()) then 'viewer' else 'owner' end,
         case when l.viewer_id = (select auth.uid()) then l.owner_id else l.viewer_id end,
         private.person_name(case when l.viewer_id = (select auth.uid()) then l.owner_id else l.viewer_id end),
         l.share_body, l.share_nutrition, l.share_health, l.created_at,
         case when l.viewer_id = (select auth.uid()) then
           (select max(s.ended_at) from public.workout_sessions s
            where s.user_id = l.owner_id and s.status = 'completed' and s.deleted_at is null) end,
         case when l.viewer_id = (select auth.uid()) then
           (select count(*)::int from public.workout_sessions s
            where s.user_id = l.owner_id and s.status = 'completed' and s.deleted_at is null
              and s.ended_at > now() - interval '7 days') end
  from public.people_links l
  where l.ended_at is null and (l.viewer_id = (select auth.uid()) or l.owner_id = (select auth.uid()))
  order by l.created_at;
$$;

-- Either side ends a link; for friends both directions end.
create function private.end_link(p_link_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  l public.people_links;
begin
  select * into l from public.people_links
  where id = p_link_id and ended_at is null and (viewer_id = uid or owner_id = uid);
  if not found then raise exception 'NOT_FOUND' using errcode = 'VD404'; end if;
  update public.people_links set ended_at = now()
  where ended_at is null and (id = l.id or (l.kind = 'friend' and kind = 'friend'
    and viewer_id = l.owner_id and owner_id = l.viewer_id));
end $$;

-- The owner chooses what else the viewer sees.
create function private.set_link_shares(p_link_id uuid, p_body boolean, p_nutrition boolean, p_health boolean)
returns public.people_links
language plpgsql security definer set search_path = '' as $$
declare r public.people_links;
begin
  update public.people_links
  set share_body = coalesce(p_body, false), share_nutrition = coalesce(p_nutrition, false), share_health = coalesce(p_health, false)
  where id = p_link_id and owner_id = (select auth.uid()) and ended_at is null
  returning * into r;
  if not found then raise exception 'NOT_FOUND' using errcode = 'VD404'; end if;
  return r;
end $$;

revoke all on function private.create_invite(public.link_kind), private.invite_info(text), private.accept_invite(text),
  private.my_links(), private.end_link(uuid), private.set_link_shares(uuid, boolean, boolean, boolean) from public, anon;
grant execute on function private.create_invite(public.link_kind), private.invite_info(text), private.accept_invite(text),
  private.my_links(), private.end_link(uuid), private.set_link_shares(uuid, boolean, boolean, boolean) to authenticated;

-- ── Public API: invoker wrappers (no SECURITY DEFINER in public, see 01_foundation) ──────────────
create function public.create_invite(p_kind public.link_kind) returns public.people_invites
language sql security invoker set search_path = '' as $$ select private.create_invite(p_kind) $$;
create function public.invite_info(p_code text) returns table (kind public.link_kind, inviter_name text, valid boolean)
language sql stable security invoker set search_path = '' as $$ select * from private.invite_info(p_code) $$;
create function public.accept_invite(p_code text) returns public.people_links
language sql security invoker set search_path = '' as $$ select private.accept_invite(p_code) $$;
create function public.my_links()
returns table (
  id uuid, kind public.link_kind, role text, person_id uuid, person_name text,
  share_body boolean, share_nutrition boolean, share_health boolean, created_at timestamptz,
  last_session_at timestamptz, sessions_7d integer)
language sql stable security invoker set search_path = '' as $$ select * from private.my_links() $$;
create function public.end_link(p_link_id uuid) returns void
language sql security invoker set search_path = '' as $$ select private.end_link(p_link_id) $$;
create function public.set_link_shares(p_link_id uuid, p_body boolean, p_nutrition boolean, p_health boolean)
returns public.people_links
language sql security invoker set search_path = '' as $$ select private.set_link_shares(p_link_id, p_body, p_nutrition, p_health) $$;

revoke all on function public.create_invite(public.link_kind), public.invite_info(text), public.accept_invite(text),
  public.my_links(), public.end_link(uuid), public.set_link_shares(uuid, boolean, boolean, boolean) from public, anon;
grant execute on function public.create_invite(public.link_kind), public.invite_info(text), public.accept_invite(text),
  public.my_links(), public.end_link(uuid), public.set_link_shares(uuid, boolean, boolean, boolean) to authenticated;
