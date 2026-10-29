-- is_valid_time_zone() scanned pg_timezone_names (~23 ms per call in the cloud). It runs in the
-- local_date trigger of every health_observations / body_measurements row, so a Health Connect batch
-- of 500 rows spent ~12 s just on this, past the phone's 20 s request timeout ("Sin conexión").
-- The names now live in an indexed table; only a name missing there (a newer tzdata after a Postgres
-- upgrade) falls back to the slow catalog view. Security definer: users (the triggers run as them)
-- cannot read the table directly.
create table private.time_zone_names (name text primary key);
insert into private.time_zone_names (name) select name from pg_catalog.pg_timezone_names on conflict do nothing;
revoke all on private.time_zone_names from public, anon, authenticated;

create or replace function private.is_valid_time_zone(tz text) returns boolean
language sql stable security definer set search_path = '' as $$
  -- OR evaluates left to right and stops at the first true: the slow view only runs for misses.
  select exists (select 1 from private.time_zone_names where name = tz)
      or exists (select 1 from pg_catalog.pg_timezone_names where name = tz);
$$;
