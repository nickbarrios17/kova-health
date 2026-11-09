-- Like the rest of the schema: the SECURITY DEFINER part of safety_reports_in lives in `private`,
-- and `public` keeps a security-invoker wrapper with the same signature.
create function private.safety_reports_in(p_west numeric, p_south numeric, p_east numeric, p_north numeric)
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
revoke all on function private.safety_reports_in(numeric, numeric, numeric, numeric) from public, anon;
grant execute on function private.safety_reports_in(numeric, numeric, numeric, numeric) to authenticated;

create or replace function public.safety_reports_in(p_west numeric, p_south numeric, p_east numeric, p_north numeric)
returns table (id uuid, lat numeric, lng numeric, kind public.safety_report_kind, day date, mine boolean)
language sql stable security invoker set search_path = '' as $$
  select * from private.safety_reports_in(p_west, p_south, p_east, p_north)
$$;
revoke all on function public.safety_reports_in(numeric, numeric, numeric, numeric) from public, anon;
grant execute on function public.safety_reports_in(numeric, numeric, numeric, numeric) to authenticated;
