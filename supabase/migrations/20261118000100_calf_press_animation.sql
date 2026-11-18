-- «Gemelos en prensa» showed the seated calf raise machine: its 3D mannequin now uses the leg press
-- (feet on the platform's lower edge, pushing with the toes), like its steps describe.
update public.exercises
set media = (select coalesce(jsonb_agg(m), '[]'::jsonb) from jsonb_array_elements(media) m where m->>'kind' <> 'animation')
  || $j$[{"kind": "animation", "ref": "kova-mannequin", "slug": "calf-press-on-leg-press", "muscle": "calves", "equipment": "lever", "category": ""}]$j$::jsonb
where owner_id is null and slug = 'gemelos-prensa';
