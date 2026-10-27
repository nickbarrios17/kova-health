-- VIDA Intelligence v1 memory (design/reference/VIDA Intelligence (Copy).md §09, §12): which insights
-- were shown, so the client can rank by novelty and avoid repeating itself (fatigue), plus optional
-- user feedback. Insights themselves are computed client-side by @vida/domain (deterministic rules);
-- no AI service is involved and the core app works without this table.

create table public.shown_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  insight_key text not null check (insight_key ~ '^[a-z0-9-]{1,80}$'),
  kind text not null check (kind in ('fact', 'pattern', 'prediction', 'hypothesis')),
  shown_on date not null,
  shown_at timestamptz not null default now(),
  dismissed_at timestamptz,
  feedback text check (feedback in ('useful', 'not_useful')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, insight_key, shown_on) -- at most one "shown" row per insight per day (idempotent upsert)
);
create index shown_insights_user_recent_idx on public.shown_insights (user_id, shown_on desc);
create trigger shown_insights_updated_at before update on public.shown_insights
  for each row execute function private.set_updated_at();
create trigger shown_insights_owner_immutable before update on public.shown_insights
  for each row execute function private.prevent_owner_change('user_id');

alter table public.shown_insights enable row level security;
create policy shown_insights_select_own on public.shown_insights for select to authenticated using (user_id = (select auth.uid()));
create policy shown_insights_insert_own on public.shown_insights for insert to authenticated with check (user_id = (select auth.uid()));
create policy shown_insights_update_own on public.shown_insights for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy shown_insights_delete_own on public.shown_insights for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.shown_insights from anon, authenticated;
grant select, insert, delete on public.shown_insights to authenticated;
grant update (dismissed_at, feedback, updated_at) on public.shown_insights to authenticated;

-- Export keeps covering every user-owned table.
create or replace function public.export_my_data() returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  base jsonb;
begin
  if uid is null then
    raise exception 'NOT_FOUND' using errcode = 'VD404';
  end if;
  base := jsonb_build_object(
    'format', 'vida-export/3',
    'exported_at', now(),
    'user_id', uid,
    'profile', (select to_jsonb(p) from public.profiles p where p.id = uid),
    'preferences', (select to_jsonb(p) from public.user_preferences p where p.user_id = uid),
    'exercises', (
      select coalesce(jsonb_agg(to_jsonb(x) || jsonb_build_object(
        'muscles', (select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) from public.exercise_muscles m where m.exercise_id = x.id),
        'equipment', (select coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb) from public.exercise_equipment q where q.exercise_id = x.id))), '[]'::jsonb)
      from public.exercises x where x.owner_id = uid),
    'foods', (select coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb) from public.foods f where f.owner_id = uid)
  );
  return base || jsonb_build_object(
    'devices', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.devices x where x.user_id = uid),
    'user_entitlements', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.user_entitlements x where x.user_id = uid),
    'routines', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.routines x where x.user_id = uid),
    'routine_exercises', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.routine_exercises x where x.user_id = uid),
    'workout_sessions', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.workout_sessions x where x.user_id = uid),
    'workout_session_exercises', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.workout_session_exercises x where x.user_id = uid),
    'workout_sets', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.workout_sets x where x.user_id = uid),
    'recipes', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.recipes x where x.user_id = uid),
    'recipe_ingredients', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.recipe_ingredients x where x.user_id = uid),
    'meals', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.meals x where x.user_id = uid),
    'meal_items', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.meal_items x where x.user_id = uid),
    'nutrition_goals', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.nutrition_goals x where x.user_id = uid),
    'habits', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.habits x where x.user_id = uid),
    'habit_schedules', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.habit_schedules x where x.user_id = uid),
    'habit_logs', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.habit_logs x where x.user_id = uid),
    'body_measurements', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.body_measurements x where x.user_id = uid),
    'health_observations', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.health_observations x where x.user_id = uid),
    'goals', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.goals x where x.user_id = uid),
    'shown_insights', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.shown_insights x where x.user_id = uid)
  );
end $$;
