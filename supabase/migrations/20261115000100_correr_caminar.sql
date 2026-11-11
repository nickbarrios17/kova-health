-- Correr y caminar (docs/correr.md): the same planner as Ciclismo, on foot. Routes say which sport they
-- were planned for, and a navigated run or walk is saved as a workout like a ride.

alter table public.bike_routes add column sport text not null default 'bike' check (sport in ('bike', 'run', 'walk'));
create index bike_routes_user_sport_idx on public.bike_routes (user_id, sport, created_at desc) where deleted_at is null;
grant insert (sport) on public.bike_routes to authenticated;

insert into public.exercises (owner_id, slug, name, short_name, category, measurement_type, level, instructions, media)
select null, x.slug, x.name, x.short, 'cardio', 'distance_duration', 'beginner', x.steps::jsonb,
  coalesce((select media from public.exercises where owner_id is null and slug = 'correr-cinta'), '[]'::jsonb)
from (values
  ('correr', 'Correr', 'Correr', $j${"steps": ["Salida a correr registrada con el modo navegación de Kova.", "Distancia y tiempo en movimiento según el GPS del celular."]}$j$),
  ('caminata', 'Caminata', 'Caminata', $j${"steps": ["Caminata registrada con el modo navegación de Kova.", "Distancia y tiempo en movimiento según el GPS del celular."]}$j$)
) as x(slug, name, short, steps)
where not exists (select 1 from public.exercises e where e.owner_id is null and e.slug = x.slug);

insert into public.exercise_muscles (exercise_id, muscle_code, role)
select e.id, m.code, m.role::public.muscle_role
from public.exercises e
cross join (values ('quads', 'primary'), ('calves', 'secondary'), ('glutes', 'secondary'), ('hamstrings', 'secondary')) as m(code, role)
where e.owner_id is null and e.slug in ('correr', 'caminata')
on conflict do nothing;

-- A run or a walk, like log_bike_ride. Idempotent on p_id.
create function public.log_foot_activity(
  p_id uuid,
  p_sport text,
  p_name text,
  p_started_at timestamptz,
  p_ended_at timestamptz,
  p_moving_s integer,
  p_distance_m numeric,
  p_time_zone text default null
) returns public.workout_sessions
language plpgsql security invoker set search_path = '' as $$
declare
  s public.workout_sessions;
  ex uuid;
  wse uuid;
  ended timestamptz := least(p_ended_at, clock_timestamp());
begin
  select * into s from public.workout_sessions where id = p_id;
  if found then
    return s;
  end if;
  if p_sport is null or p_sport not in ('run', 'walk')
     or p_started_at is null or p_ended_at is null or p_started_at > ended
     or p_moving_s is null or p_moving_s < 0 or p_moving_s > 86400
     or p_distance_m is null or p_distance_m < 0 or p_distance_m > 300000
     or ended - p_started_at > interval '1 day' then
    raise exception 'INVALID_INPUT' using errcode = 'VD005', detail = 'sport, times or distance out of range';
  end if;

  select id into ex from public.exercises where owner_id is null and slug = case p_sport when 'run' then 'correr' else 'caminata' end;

  insert into public.workout_sessions (id, name, status, started_at, ended_at, total_paused_s, time_zone, tags, energy_is_estimated)
  values (
    p_id,
    coalesce(nullif(btrim(left(p_name, 120)), ''), case p_sport when 'run' then 'Salida a correr' else 'Caminata' end),
    'completed', p_started_at, ended,
    greatest(0, extract(epoch from ended - p_started_at)::integer - least(p_moving_s, extract(epoch from ended - p_started_at)::integer)),
    p_time_zone, array[case p_sport when 'run' then 'correr' else 'caminar' end], true)
  returning * into s;

  insert into public.workout_session_exercises (session_id, exercise_id, position)
  values (s.id, ex, 0)
  returning id into wse;

  insert into public.workout_sets (session_id, session_exercise_id, set_index, duration_s, distance_m, completed_at)
  values (s.id, wse, 0, p_moving_s, round(p_distance_m, 1), ended);

  return s;
end $$;

revoke execute on function public.log_foot_activity(uuid, text, text, timestamptz, timestamptz, integer, numeric, text) from public, anon;
grant execute on function public.log_foot_activity(uuid, text, text, timestamptz, timestamptz, integer, numeric, text) to authenticated;
