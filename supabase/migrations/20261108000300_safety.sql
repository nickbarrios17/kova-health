-- Ciclismo, safety (docs/ciclismo.md, «Zonas inseguras»).
-- safety_cells / safety_partidos: public statistics, loaded by a generated migration; read-only for users.
-- safety_reports: places cyclists mark (a robbery, a dark or unsafe stretch). Others see only the point,
-- the kind and the day, never who marked it. Reports fade out after 180 days.

create table public.safety_cells (
  cell text primary key,          -- grid index, shared with the bike-route function
  lat numeric(8, 5) not null,     -- center of the ~275 m cell
  lng numeric(8, 5) not null,
  robos real not null default 0,        -- per year
  robos_noche real not null default 0,  -- per year, 20 h to 6 h
  choques real not null default 0,      -- people hurt or killed in traffic, per year
  robo_level smallint not null default 0 check (robo_level between 0 and 2),
  choque_level smallint not null default 0 check (choque_level between 0 and 2)
);
create index safety_cells_lat_lng_idx on public.safety_cells (lat, lng);

create table public.safety_partidos (
  id text primary key,            -- INDEC department code, as the georef API answers
  name text not null,
  robos_rate real not null,       -- robberies per 100,000 people
  level smallint not null check (level between 0 and 2), -- against the conurbano average
  year smallint not null,
  conurbano boolean not null default false
);

create table public.safety_meta (
  key text primary key,
  value jsonb not null
);

alter table public.safety_cells enable row level security;
alter table public.safety_partidos enable row level security;
alter table public.safety_meta enable row level security;
create policy safety_cells_read on public.safety_cells for select to authenticated using (true);
create policy safety_partidos_read on public.safety_partidos for select to authenticated using (true);
create policy safety_meta_read on public.safety_meta for select to authenticated using (true);
revoke all on public.safety_cells, public.safety_partidos, public.safety_meta from anon, authenticated;
grant select on public.safety_cells, public.safety_partidos, public.safety_meta to authenticated;

create type public.safety_report_kind as enum ('robo', 'intento', 'insegura', 'peligrosa');

create table public.safety_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  lat numeric(8, 5) not null check (lat between -90 and 90),
  lng numeric(8, 5) not null check (lng between -180 and 180),
  kind public.safety_report_kind not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index safety_reports_lat_lng_idx on public.safety_reports (lat, lng) where deleted_at is null;
create index safety_reports_user_idx on public.safety_reports (user_id, created_at desc);
create trigger safety_reports_owner_immutable before update on public.safety_reports
  for each row execute function private.prevent_owner_change('user_id');

alter table public.safety_reports enable row level security;
-- Your own reports only; everyone else's go through safety_reports_in, without who made them.
create policy safety_reports_select_own on public.safety_reports for select to authenticated
  using (user_id = (select auth.uid()));
create policy safety_reports_insert_own on public.safety_reports for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy safety_reports_update_own on public.safety_reports for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.safety_reports from anon, authenticated;
grant select on public.safety_reports to authenticated;
grant insert (id, lat, lng, kind) on public.safety_reports to authenticated;
grant update (deleted_at) on public.safety_reports to authenticated;

-- At most 20 reports a day per person, so one account cannot paint a whole neighbourhood.
create function private.safety_reports_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.safety_reports r
      where r.user_id = new.user_id and r.created_at > now() - interval '1 day') >= 20 then
    raise exception 'RATE_LIMITED' using errcode = 'VD429', detail = 'too many safety reports today';
  end if;
  return new;
end $$;
create trigger safety_reports_limit before insert on public.safety_reports
  for each row execute function private.safety_reports_limit();

-- Recent reports in a box: point, kind, day, and whether it is yours. Never who made it.
create function public.safety_reports_in(p_west numeric, p_south numeric, p_east numeric, p_north numeric)
returns table (id uuid, lat numeric, lng numeric, kind public.safety_report_kind, day date, mine boolean)
language sql stable security definer set search_path = '' as $$
  select r.id, r.lat, r.lng, r.kind, (r.created_at at time zone 'America/Argentina/Buenos_Aires')::date, r.user_id = auth.uid()
  from public.safety_reports r
  where auth.uid() is not null
    and r.deleted_at is null
    and r.created_at > now() - interval '180 days'
    and r.lat between p_south and p_north and r.lng between p_west and p_east
    and p_east - p_west <= 1 and p_north - p_south <= 1
  order by r.created_at desc
  limit 500
$$;
revoke execute on function public.safety_reports_in(numeric, numeric, numeric, numeric) from public, anon;
grant execute on function public.safety_reports_in(numeric, numeric, numeric, numeric) to authenticated;
