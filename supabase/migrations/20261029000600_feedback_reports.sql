-- «Reportar un problema» (docs/reportes.md): anyone signed in reports an error or an idea about an
-- exercise, the 3D model, the interface… Each person sees their own reports; the app's admins see
-- all of them to decide what to work on. Admins are rows in private.admins (added by hand, never by
-- the app).

create type public.report_category as enum ('exercise', 'model3d', 'interface', 'bug', 'idea', 'other');
create type public.report_status as enum ('new', 'seen', 'done', 'dismissed');

create table public.feedback_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category public.report_category not null,
  message text not null check (char_length(btrim(message)) between 3 and 2000),
  -- Where it happened, filled by the app: { screen, exercise_id, exercise_name, platform, app_version }.
  context jsonb not null default '{}'::jsonb check (jsonb_typeof(context) = 'object' and pg_column_size(context) <= 4096),
  status public.report_status not null default 'new',
  admin_note text check (admin_note is null or char_length(admin_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index feedback_reports_status_idx on public.feedback_reports (status, created_at desc);
create index feedback_reports_user_idx on public.feedback_reports (user_id, created_at desc);
create trigger feedback_reports_updated_at before update on public.feedback_reports
  for each row execute function private.set_updated_at();

alter table public.feedback_reports enable row level security;
create policy feedback_reports_insert_own on public.feedback_reports for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'new' and admin_note is null);
create policy feedback_reports_select_own on public.feedback_reports for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.feedback_reports from anon, authenticated;
grant select, insert (id, category, message, context) on public.feedback_reports to authenticated;

create table private.admins (user_id uuid primary key references auth.users (id) on delete cascade);
revoke all on private.admins from public, anon, authenticated;

create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.admins where user_id = (select auth.uid()));
$$;

-- Admins: every report with who sent it, newest first; optionally only one status.
create function private.admin_reports(p_status public.report_status default null, p_limit integer default 200)
returns table (
  id uuid, category public.report_category, message text, context jsonb, status public.report_status,
  admin_note text, created_at timestamptz, reporter_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  return query
    select r.id, r.category, r.message, r.context, r.status, r.admin_note, r.created_at,
           coalesce(nullif(btrim(p.display_name), ''), split_part(u.email, '@', 1))
    from public.feedback_reports r
    join auth.users u on u.id = r.user_id
    left join public.profiles p on p.id = r.user_id
    where p_status is null or r.status = p_status
    order by r.created_at desc
    limit least(greatest(coalesce(p_limit, 200), 1), 500);
end $$;

create function private.admin_set_report(p_id uuid, p_status public.report_status, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  update public.feedback_reports set status = p_status, admin_note = nullif(btrim(coalesce(p_note, '')), '') where id = p_id;
  if not found then raise exception 'NOT_FOUND' using errcode = 'VD404'; end if;
end $$;

revoke all on function private.is_admin(), private.admin_reports(public.report_status, integer),
  private.admin_set_report(uuid, public.report_status, text) from public, anon;
grant execute on function private.is_admin(), private.admin_reports(public.report_status, integer),
  private.admin_set_report(uuid, public.report_status, text) to authenticated;

-- ── Public API: invoker wrappers ─────────────────────────────────────────────
create function public.am_i_admin() returns boolean
language sql stable security invoker set search_path = '' as $$ select private.is_admin() $$;
create function public.admin_reports(p_status public.report_status default null, p_limit integer default 200)
returns table (
  id uuid, category public.report_category, message text, context jsonb, status public.report_status,
  admin_note text, created_at timestamptz, reporter_name text)
language sql stable security invoker set search_path = '' as $$ select * from private.admin_reports(p_status, p_limit) $$;
create function public.admin_set_report(p_id uuid, p_status public.report_status, p_note text default null) returns void
language sql security invoker set search_path = '' as $$ select private.admin_set_report(p_id, p_status, p_note) $$;

revoke all on function public.am_i_admin(), public.admin_reports(public.report_status, integer),
  public.admin_set_report(uuid, public.report_status, text) from public, anon;
grant execute on function public.am_i_admin(), public.admin_reports(public.report_status, integer),
  public.admin_set_report(uuid, public.report_status, text) to authenticated;
