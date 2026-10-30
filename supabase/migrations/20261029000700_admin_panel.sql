-- Admin panel (docs/admin.md): accounts, activity, admin role and suspension, plus a weekly summary.
-- Admins see who uses the app and how much, never the content of anyone's health data (meals,
-- weight, sleep…): only counts and dates. Same pattern as the reports: definer functions in private
-- that check private.is_admin(), invoker wrappers in public.

-- Accounts with activity, newest first. last_seen_at is the latest of: sign-in, token refresh,
-- device seen, workout started, meal logged.
create function private.admin_users()
returns table (
  id uuid, email text, name text, created_at timestamptz, last_seen_at timestamptz,
  workouts integer, workouts_7d integer, meals_7d integer, reports integer,
  is_admin boolean, suspended boolean, has_coach boolean, students integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  return query
    select u.id, u.email::text,
           coalesce(nullif(btrim(p.display_name), ''), split_part(u.email, '@', 1)),
           u.created_at,
           greatest(u.last_sign_in_at,
                    (select max(s.updated_at) from auth.sessions s where s.user_id = u.id),
                    (select max(d.last_seen_at) from public.devices d where d.user_id = u.id),
                    (select max(w.started_at) from public.workout_sessions w where w.user_id = u.id),
                    (select max(m.created_at) from public.meals m where m.user_id = u.id)),
           (select count(*)::int from public.workout_sessions w where w.user_id = u.id and w.status = 'completed' and w.deleted_at is null),
           (select count(*)::int from public.workout_sessions w where w.user_id = u.id and w.deleted_at is null and w.started_at > now() - interval '7 days'),
           (select count(*)::int from public.meals m where m.user_id = u.id and m.deleted_at is null and m.created_at > now() - interval '7 days'),
           (select count(*)::int from public.feedback_reports r where r.user_id = u.id),
           exists (select 1 from private.admins a where a.user_id = u.id),
           coalesce(u.banned_until > now(), false),
           exists (select 1 from public.people_links l where l.owner_id = u.id and l.kind = 'coach' and l.ended_at is null),
           (select count(*)::int from public.people_links l where l.viewer_id = u.id and l.kind = 'coach' and l.ended_at is null)
    from auth.users u
    left join public.profiles p on p.id = u.id
    order by u.created_at desc
    limit 1000;
end $$;

-- This week at a glance.
create function private.admin_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  return jsonb_build_object(
    'users', (select count(*) from auth.users),
    'new_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'active_7d', (select count(distinct x.user_id) from (
        select user_id from public.workout_sessions where started_at > now() - interval '7 days'
        union all select user_id from public.meals where created_at > now() - interval '7 days'
        union all select user_id from public.devices where last_seen_at > now() - interval '7 days'
        union all select user_id from auth.sessions where updated_at > now() - interval '7 days') x),
    'workouts_7d', (select count(*) from public.workout_sessions where status = 'completed' and deleted_at is null and started_at > now() - interval '7 days'),
    'meals_7d', (select count(*) from public.meals where deleted_at is null and created_at > now() - interval '7 days'),
    'reports_new', (select count(*) from public.feedback_reports where status = 'new'),
    'coach_links', (select count(*) from public.people_links where kind = 'coach' and ended_at is null));
end $$;

-- Give or take the admin role. Nobody can take it from themselves (so there is always an admin).
create function private.admin_set_admin(p_user uuid, p_admin boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_user = (select auth.uid()) then raise exception 'ADMIN_SELF' using errcode = 'VD008'; end if;
  if not exists (select 1 from auth.users where id = p_user) then raise exception 'NOT_FOUND' using errcode = 'VD404'; end if;
  if p_admin then
    insert into private.admins (user_id) values (p_user) on conflict do nothing;
  else
    delete from private.admins where user_id = p_user;
  end if;
end $$;

-- Suspend or reactivate an account. A suspended account cannot sign in, and its sessions are closed
-- (an access token already issued keeps working until it expires, at most an hour). Its data stays.
-- Admins cannot be suspended: take the role away first.
create function private.admin_set_suspended(p_user uuid, p_suspended boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_user = (select auth.uid()) or exists (select 1 from private.admins where user_id = p_user) then
    raise exception 'ADMIN_SELF' using errcode = 'VD008';
  end if;
  update auth.users set banned_until = case when p_suspended then 'infinity'::timestamptz end where id = p_user;
  if not found then raise exception 'NOT_FOUND' using errcode = 'VD404'; end if;
  if p_suspended then delete from auth.sessions where user_id = p_user; end if;
end $$;

revoke all on function private.admin_users(), private.admin_overview(), private.admin_set_admin(uuid, boolean),
  private.admin_set_suspended(uuid, boolean) from public, anon;
grant execute on function private.admin_users(), private.admin_overview(), private.admin_set_admin(uuid, boolean),
  private.admin_set_suspended(uuid, boolean) to authenticated;

-- ── Public API: invoker wrappers ─────────────────────────────────────────────
create function public.admin_users()
returns table (
  id uuid, email text, name text, created_at timestamptz, last_seen_at timestamptz,
  workouts integer, workouts_7d integer, meals_7d integer, reports integer,
  is_admin boolean, suspended boolean, has_coach boolean, students integer)
language sql stable security invoker set search_path = '' as $$ select * from private.admin_users() $$;
create function public.admin_overview() returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.admin_overview() $$;
create function public.admin_set_admin(p_user uuid, p_admin boolean) returns void
language sql security invoker set search_path = '' as $$ select private.admin_set_admin(p_user, p_admin) $$;
create function public.admin_set_suspended(p_user uuid, p_suspended boolean) returns void
language sql security invoker set search_path = '' as $$ select private.admin_set_suspended(p_user, p_suspended) $$;

revoke all on function public.admin_users(), public.admin_overview(), public.admin_set_admin(uuid, boolean),
  public.admin_set_suspended(uuid, boolean) from public, anon;
grant execute on function public.admin_users(), public.admin_overview(), public.admin_set_admin(uuid, boolean),
  public.admin_set_suspended(uuid, boolean) to authenticated;
