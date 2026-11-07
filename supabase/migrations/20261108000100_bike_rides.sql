-- Ciclismo, navigation mode (docs/ciclismo.md): a ride you navigated can be saved as a workout, so it
-- shows in your history like any other session: one completed session with the «Ciclismo» exercise
-- and one set with the distance and the time moving.

insert into public.exercises (owner_id, slug, name, short_name, category, measurement_type, level, instructions, media)
select null, 'ciclismo', 'Ciclismo', 'Bici', 'cardio', 'distance_duration', 'beginner',
  $j${"steps": ["Salida en bici registrada con el modo navegación de Kova.", "Distancia y tiempo en movimiento según el GPS del celular."]}$j$::jsonb,
  -- Same pictures and 3D animation as the stationary bike, like every catalog exercise has.
  coalesce((select media from public.exercises where owner_id is null and slug = 'bicicleta-fija'), '[]'::jsonb)
where not exists (select 1 from public.exercises where owner_id is null and slug = 'ciclismo');

insert into public.exercise_muscles (exercise_id, muscle_code, role)
select e.id, m.code, m.role::public.muscle_role
from public.exercises e
cross join (values ('quads', 'primary'), ('glutes', 'secondary'), ('hamstrings', 'secondary'), ('calves', 'secondary')) as m(code, role)
where e.owner_id is null and e.slug = 'ciclismo'
on conflict do nothing;

-- Idempotent on p_id: saving the same ride twice (a retry, a double tap) keeps one session.
create function public.log_bike_ride(
  p_id uuid,
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
  if p_started_at is null or p_ended_at is null or p_started_at > ended
     or p_moving_s is null or p_moving_s < 0 or p_moving_s > 86400
     or p_distance_m is null or p_distance_m < 0 or p_distance_m > 1000000
     or ended - p_started_at > interval '1 day' then
    raise exception 'INVALID_INPUT' using errcode = 'VD005', detail = 'ride times or distance out of range';
  end if;

  select id into ex from public.exercises where owner_id is null and slug = 'ciclismo';

  insert into public.workout_sessions (id, name, status, started_at, ended_at, total_paused_s, time_zone, tags, energy_is_estimated)
  values (
    p_id,
    coalesce(nullif(btrim(left(p_name, 120)), ''), 'Salida en bici'),
    'completed', p_started_at, ended,
    greatest(0, extract(epoch from ended - p_started_at)::integer - least(p_moving_s, extract(epoch from ended - p_started_at)::integer)),
    p_time_zone, array['ciclismo'], true)
  returning * into s;

  insert into public.workout_session_exercises (session_id, exercise_id, position)
  values (s.id, ex, 0)
  returning id into wse;

  insert into public.workout_sets (session_id, session_exercise_id, set_index, duration_s, distance_m, completed_at)
  values (s.id, wse, 0, p_moving_s, round(p_distance_m, 1), ended);

  return s;
end $$;

revoke execute on function public.log_bike_ride(uuid, text, timestamptz, timestamptz, integer, numeric, text) from public, anon;
grant execute on function public.log_bike_ride(uuid, text, timestamptz, timestamptz, integer, numeric, text) to authenticated;
