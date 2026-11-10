-- Comidas: better ranking for search_foods. In Spanish the first word names the dish («medialuna de
-- manteca», «pechuga de pollo», «café con leche»): a food whose name has that word ranks above one that
-- only shares a later word («Manteca»). Little words (de, con, y…) do not count. Same signature.

create or replace function public.search_foods(p_q text, p_limit int default 30)
returns setof public.foods
language sql stable security invoker set search_path = '' as $$
  with q as (select private.fold(btrim(left(coalesce(p_q, ''), 80))) as t),
  w as (
    select array_agg(x order by o) filter (where x <> '' and x not in ('de', 'del', 'con', 'y', 'al', 'a', 'la', 'el', 'las', 'los', 'en', 'sin', 'un', 'una')) as words
    from q, unnest(string_to_array(q.t, ' ')) with ordinality as u(x, o)
  )
  select f.* from public.foods f, q, w
  where f.archived_at is null and q.t <> ''
    and (private.fold(f.name) like '%' || q.t || '%'
         or extensions.similarity(private.fold(f.name), q.t) > 0.25
         or not exists (
           select 1 from unnest(coalesce(w.words, '{}')) x
           where private.fold(f.name) not like '%' || x || '%'))
  order by (private.fold(f.name) like q.t || '%') desc,
           -- the first meaningful word, as a word start («medialuna» → «Medialuna / croissant»)
           (w.words[1] is not null and private.fold(f.name) ~ ('(^|[^a-z])' || w.words[1])) desc,
           -- how many of the meaningful words the name has
           (select count(*) from unnest(coalesce(w.words, '{}')) x where private.fold(f.name) like '%' || x || '%') desc,
           (f.owner_id is not null) desc,
           extensions.similarity(private.fold(f.name), q.t) desc,
           f.name
  limit least(greatest(coalesce(p_limit, 30), 1), 100)
$$;
