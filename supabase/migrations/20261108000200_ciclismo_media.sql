-- The Ciclismo exercise gets the stationary bike's pictures and 3D animation where it was created
-- without them (the test environment got the first version of 20261108000100).
update public.exercises c
set media = b.media
from public.exercises b
where c.owner_id is null and c.slug = 'ciclismo' and c.media = '[]'::jsonb
  and b.owner_id is null and b.slug = 'bicicleta-fija';
