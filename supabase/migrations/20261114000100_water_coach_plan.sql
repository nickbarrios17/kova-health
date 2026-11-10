-- Comidas, etapa 5 (docs/comidas.md): water through the day, and a coach can see the student's meal plan.

-- ── Water ─────────────────────────────────────────────────────────────────────
create table public.water_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  local_date date not null,
  ml integer not null check (ml between 50 and 3000),
  created_at timestamptz not null default now()
);
create index water_logs_user_day_idx on public.water_logs (user_id, local_date);
alter table public.water_logs enable row level security;
create policy water_logs_select_own on public.water_logs for select to authenticated using (user_id = (select auth.uid()));
create policy water_logs_insert_own on public.water_logs for insert to authenticated with check (user_id = (select auth.uid()));
create policy water_logs_delete_own on public.water_logs for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.water_logs from anon, authenticated;
grant select, insert, delete on public.water_logs to authenticated;

-- ── The student's meal plan, for their coach ───────────────────────────────
-- Same rule as the rest of «Coach y amigos»: only through a definer function that checks the link, and
-- only when the student shares their nutrition (people_links.share_nutrition).
create function private.person_meal_plan(p_owner uuid, p_week_start date)
returns table (local_date date, slot public.meal_slot, title text, kcal numeric, protein_g numeric, logged_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select i.local_date, i.slot, i.title, i.kcal, i.protein_g, i.logged_at
  from public.meal_plans p join public.meal_plan_items i on i.plan_id = p.id
  where private.can_view(p_owner, 'nutrition')
    and p.user_id = p_owner and p.week_start = p_week_start and p.archived_at is null
  order by i.local_date, i.slot
$$;
revoke all on function private.person_meal_plan(uuid, date) from public, anon;
grant execute on function private.person_meal_plan(uuid, date) to authenticated;

create function public.person_meal_plan(p_owner uuid, p_week_start date)
returns table (local_date date, slot public.meal_slot, title text, kcal numeric, protein_g numeric, logged_at timestamptz)
language sql stable security invoker set search_path = '' as $$ select * from private.person_meal_plan(p_owner, p_week_start) $$;
revoke all on function public.person_meal_plan(uuid, date) from public, anon;
grant execute on function public.person_meal_plan(uuid, date) to authenticated;
