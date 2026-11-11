"""Comidas, etapa 3: how each catalog food is bought (góndola, envase, crudo/seco equivalent).
Writes supabase/migrations/20261112000100_shopping.sql (the shop column + the shopping tables).
Envases are the usual Argentine sizes; a food sold by weight has no package (rounded to 100 g).
`factor` turns plan grams into bought grams (cooked rice → raw rice ≈ 0.36, from USDA kcal ratios)."""
import json, sys

OUT = sys.argv[1]

A_VERD, A_CARN, A_POLLO, A_PESC, A_LACT, A_FIAM, A_ALM, A_PAN, A_BEB, A_CONG = (
    'Verdulería', 'Carnicería', 'Pollería', 'Pescadería', 'Lácteos y huevos', 'Fiambrería', 'Almacén', 'Panadería', 'Bebidas', 'Congelados')

# name → (aisle, buy as, factor, package grams, package label)
S = {}
def r(names, aisle, buy=None, factor=1, pkg=None, label=None):
    for n in names.split('|'):
        S[n] = {'aisle': aisle, **({'name': buy} if buy else {}), **({'factor': factor} if factor != 1 else {}),
                **({'package_g': pkg, 'package_label': label} if pkg else {})}

r('Bife de chorizo (vacuno, crudo)|Lomo (vacuno, crudo)|Asado de tira (vacuno, crudo)|Carne picada común (cruda)', A_CARN)
# Cooked meat: ~1/0.7 raw (meat loses ~30 % of its weight cooking).
for n in ['Cuadril (vacuno, cocido)', 'Nalga (vacuno, cocida)', 'Vacío (vacuno, asado)', 'Entraña (vacuno, asada)', 'Hígado de vaca (cocido)',
          'Mondongo (cocido)', 'Bondiola de cerdo (cocida)', 'Carré de cerdo (cocido)', 'Matambre de cerdo (cocido)']:
    r(n, A_CARN, n.split(' (')[0], 1.4)
r('Carne picada común (cocida)', A_CARN, 'Carne picada común', 1.4)
r('Carne picada especial (cocida)', A_CARN, 'Carne picada especial', 1.4)
r('Chorizo parrillero (cocido)', A_CARN, 'Chorizo parrillero', 1.15)
r('Morcilla', A_CARN)
r('Pechuga de pollo (cocida, sin piel)', A_POLLO, 'Pechuga de pollo', 1.35)
r('Muslo de pollo (cocido, sin piel)', A_POLLO, 'Muslo de pollo', 1.35)
r('Pata muslo de pollo (cocida, con piel)', A_POLLO, 'Pata muslo de pollo', 1.6)
r('Alitas de pollo (cocidas)', A_POLLO, 'Alitas de pollo', 1.6)
r('Pavo, pechuga (cocida)', A_POLLO, 'Pechuga de pavo', 1.35)
r('Huevo entero (crudo)|Huevo duro|Huevo frito|Huevos revueltos|Clara de huevo', A_LACT, 'Huevos', 1, 300, 'media docena')
r('Merluza / pescado blanco (cocido)', A_PESC, 'Filet de merluza', 1.3)
r('Salmón (cocido)', A_PESC, 'Salmón', 1.3)
r('Camarones (cocidos)', A_CONG, 'Camarones', 1.2, 400, 'bolsa de 400 g')
r('Calamar (crudo)', A_PESC, 'Calamar')
r('Atún en lata al natural', A_ALM, None, 1, 120, 'lata (120 g escurrido)')
r('Atún en lata en aceite', A_ALM, None, 1, 120, 'lata (120 g escurrido)')
r('Caballa en lata', A_ALM, None, 1, 280, 'lata (280 g escurrido)')
r('Sardinas en aceite', A_ALM, None, 1, 85, 'lata (85 g escurrido)')
r('Leche entera', A_LACT, None, 1, 1000, 'sachet de 1 l')
r('Leche descremada', A_LACT, None, 1, 1000, 'sachet de 1 l')
r('Leche semidescremada', A_LACT, None, 1, 1000, 'sachet de 1 l')
r('Leche chocolatada', A_LACT, None, 1, 1000, 'caja de 1 l')
r('Yogur natural entero|Yogur natural descremado', A_LACT, None, 1, 1000, 'sachet de 1 kg')
r('Yogur griego natural', A_LACT, None, 1, 160, 'pote de 160 g')
r('Yogur bebible frutado', A_LACT, None, 1, 900, 'botella de 900 g')
r('Queso cremoso (tipo Port Salut)|Queso tybo / de máquina', A_FIAM)
r('Queso mozzarella', A_LACT, 'Muzzarella', 1, 500, 'horma de 500 g')
r('Queso rallado (tipo reggianito)', A_LACT, None, 1, 150, 'sobre de 150 g')
r('Queso crema', A_LACT, None, 1, 290, 'pote de 290 g')
r('Ricota', A_LACT, None, 1, 500, 'pote de 500 g')
r('Queso cottage', A_LACT, None, 1, 300, 'pote de 300 g')
r('Manteca', A_LACT, None, 1, 200, 'pan de 200 g')
r('Crema de leche', A_LACT, None, 1, 200, 'pote de 200 ml')
r('Dulce de leche', A_LACT, None, 1, 400, 'pote de 400 g')
r('Leche en polvo entera', A_ALM, None, 1, 800, 'bolsa de 800 g')
r('Jamón cocido|Salame', A_FIAM)
r('Panceta (cocida)', A_FIAM, 'Panceta', 1.6)
r('Salchicha', A_FIAM, 'Salchichas', 1, 225, 'paquete de 6')
r('Pan francés', A_PAN)
r('Pan lactal blanco', A_PAN, None, 1, 550, 'paquete de 550 g')
r('Pan integral', A_PAN, 'Pan lactal integral', 1, 550, 'paquete de 550 g')
r('Pan de centeno', A_PAN, None, 1, 400, 'paquete de 400 g')
r('Pan árabe', A_PAN, None, 1, 300, 'paquete de 5')
r('Pan rallado', A_ALM, None, 1, 500, 'paquete de 500 g')
r('Pan de hamburguesa', A_PAN, 'Pan de hamburguesa', 1, 260, 'paquete de 4')
r('Medialuna / croissant', A_PAN, 'Medialunas')
r('Bizcochuelo', A_PAN)
r('Galletitas de agua', A_ALM, None, 1, 200, 'paquete de 200 g')
r('Galletitas dulces', A_ALM, None, 1, 150, 'paquete de 150 g')
r('Galletitas de arroz', A_ALM, None, 1, 100, 'paquete de 100 g')
r('Tostadas de pan', A_ALM, 'Tostadas', 1, 200, 'paquete de 200 g')
r('Arroz blanco (cocido)', A_ALM, 'Arroz blanco', 0.36, 1000, 'paquete de 1 kg')
r('Arroz blanco (crudo)', A_ALM, 'Arroz blanco', 1, 1000, 'paquete de 1 kg')
r('Arroz integral (cocido)', A_ALM, 'Arroz integral', 0.34, 1000, 'paquete de 1 kg')
r('Fideos secos (cocidos)', A_ALM, 'Fideos secos', 0.43, 500, 'paquete de 500 g')
r('Fideos secos (crudos)', A_ALM, 'Fideos secos', 1, 500, 'paquete de 500 g')
r('Fideos integrales (cocidos)', A_ALM, 'Fideos integrales', 0.43, 500, 'paquete de 500 g')
r('Fideos frescos (cocidos)', A_LACT, 'Fideos frescos', 0.75, 500, 'paquete de 500 g')
r('Avena arrollada', A_ALM, None, 1, 400, 'paquete de 400 g')
r('Avena cocida (con agua)', A_ALM, 'Avena arrollada', 0.19, 400, 'paquete de 400 g')
r('Copos de maíz', A_ALM, None, 1, 300, 'caja de 300 g')
r('Granola', A_ALM, None, 1, 400, 'bolsa de 400 g')
r('Harina de trigo 000', A_ALM, 'Harina 000', 1, 1000, 'paquete de 1 kg')
r('Harina integral', A_ALM, None, 1, 1000, 'paquete de 1 kg')
r('Harina de maíz / polenta (seca)', A_ALM, 'Polenta', 1, 500, 'paquete de 500 g')
r('Quinoa (cocida)', A_ALM, 'Quinoa', 0.33, 500, 'paquete de 500 g')
r('Tapas de empanada / masa de tarta', A_LACT, 'Tapas de empanada', 1, 400, 'paquete de 12')
r('Tortilla de trigo (wrap)', A_ALM, 'Tortillas de trigo', 1, 320, 'paquete de 8')
for n, buy in [('Lentejas (cocidas)', 'Lentejas secas'), ('Garbanzos (cocidos)', 'Garbanzos secos'), ('Porotos negros (cocidos)', 'Porotos negros secos'),
               ('Porotos alubia (cocidos)', 'Porotos alubia secos'), ('Soja (cocida)', 'Porotos de soja secos')]:
    r(n, A_ALM, buy, 0.4, 400, 'paquete de 400 g')
r('Arvejas (cocidas)', A_CONG, 'Arvejas congeladas', 1, 300, 'bolsa de 300 g')
r('Tofu', A_VERD, None, 1, 300, 'paquete de 300 g')
r('Maní tostado', A_ALM, None, 1, 200, 'bolsa de 200 g')
r('Mantequilla de maní', A_ALM, None, 1, 350, 'frasco de 350 g')
r('Almendras|Nueces|Castañas de cajú', A_ALM, None, 1, 200, 'bolsa de 200 g')
r('Semillas de chía|Semillas de girasol|Semillas de lino', A_ALM, None, 1, 200, 'bolsa de 200 g')
for n, buy, f in [('Papa (hervida)', 'Papa', 1.05), ('Papa (cruda)', 'Papa', 1), ('Puré de papas', 'Papa', 0.9), ('Batata (horneada)', 'Batata', 1.2),
                  ('Zapallo (hervido)', 'Zapallo', 1.1), ('Espinaca (cocida)', 'Espinaca', 1.9), ('Acelga (cocida)', 'Acelga', 1.9),
                  ('Brócoli (cocido)', 'Brócoli', 1.1), ('Coliflor (cocida)', 'Coliflor', 1.1), ('Choclo (cocido)', 'Choclo', 1.6),
                  ('Remolacha (cocida)', 'Remolacha', 1.1), ('Berenjena (cocida)', 'Berenjena', 1.1), ('Chauchas (cocidas)', 'Chauchas', 1.05)]:
    r(n, A_VERD, buy, f)
r('Zapallito / zucchini|Tomate|Lechuga|Rúcula|Espinaca (cruda)|Zanahoria|Cebolla|Morrón rojo|Pepino|Champiñones|Repollo|Palta|Ajo', A_VERD)
r('Banana|Manzana|Naranja|Mandarina|Pera|Durazno|Frutillas|Uvas|Kiwi|Ananá|Sandía|Melón|Arándanos|Ciruela|Mango', A_VERD)
r('Limón (jugo)', A_VERD, 'Limones', 3)
r('Jugo de naranja exprimido', A_VERD, 'Naranjas para jugo', 2)
r('Papas fritas', A_CONG, 'Papas fritas congeladas', 1.2, 720, 'bolsa de 720 g')
r('Choclo en lata', A_ALM, None, 1, 300, 'lata de 300 g')
r('Tomate triturado / puré de tomate', A_ALM, 'Puré de tomate', 1, 520, 'caja de 520 g')
r('Aceitunas verdes', A_ALM, None, 1, 180, 'frasco de 180 g')
r('Pasas de uva', A_ALM, None, 1, 200, 'bolsa de 200 g')
r('Duraznos en almíbar', A_ALM, None, 1, 820, 'lata de 820 g')
r('Aceite de girasol', A_ALM, None, 1, 830, 'botella de 900 ml')
r('Aceite de oliva', A_ALM, None, 1, 460, 'botella de 500 ml')
r('Mayonesa', A_ALM, None, 1, 250, 'doypack de 250 g')
r('Ketchup|Mostaza', A_ALM, None, 1, 250, 'doypack de 250 g')
r('Azúcar', A_ALM, None, 1, 1000, 'paquete de 1 kg')
r('Miel', A_ALM, None, 1, 500, 'frasco de 500 g')
r('Mermelada', A_ALM, None, 1, 390, 'frasco de 390 g')
r('Chocolate con leche|Chocolate amargo 70%', A_ALM, None, 1, 100, 'tableta de 100 g')
r('Cacao en polvo', A_ALM, None, 1, 360, 'paquete de 360 g')
r('Helado de crema', A_CONG, 'Helado', 1, 500, 'pote de 1/2 kg')
r('Alfajor / galletita bañada', A_ALM, 'Alfajores', 1, 50, 'unidad')
r('Papas fritas de paquete', A_ALM, None, 1, 140, 'bolsa de 140 g')
r('Pochoclo', A_ALM, 'Maíz pisingallo', 1, 400, 'paquete de 400 g')
r('Gaseosa cola', A_BEB, None, 1, 2250, 'botella de 2,25 l')
r('Cerveza', A_BEB, None, 1, 1000, 'botella de 1 l')
r('Vino tinto', A_BEB, None, 1, 750, 'botella de 750 ml')
r('Café (preparado)', A_ALM, 'Café molido', 0.06, 250, 'paquete de 250 g')
r('Bebida deportiva', A_BEB, None, 1, 500, 'botella de 500 ml')

# Typical dishes: bought as their ingredients (grams per gram of dish, from build-catalog.py).
DISHES = {
    'Milanesa de carne (frita)': [('Nalga (vacuno, cocida)', 100), ('Pan rallado', 25), ('Huevo entero (crudo)', 15), ('Aceite de girasol', 10)],
    'Milanesa de pollo (al horno)': [('Pechuga de pollo (cocida, sin piel)', 110), ('Pan rallado', 25), ('Huevo entero (crudo)', 15), ('Aceite de girasol', 4)],
    'Empanada de carne (al horno)': [('Tapas de empanada / masa de tarta', 35), ('Carne picada común (cocida)', 30), ('Cebolla', 15), ('Huevo duro', 5)],
    'Empanada de jamón y queso (al horno)': [('Tapas de empanada / masa de tarta', 35), ('Jamón cocido', 20), ('Queso mozzarella', 25)],
    'Tarta de verdura (porción)': [('Tapas de empanada / masa de tarta', 50), ('Acelga (cocida)', 90), ('Huevo entero (crudo)', 25), ('Queso rallado (tipo reggianito)', 10)],
    'Pizza muzzarella (porción)': [('Harina de trigo 000', 45), ('Queso mozzarella', 40), ('Tomate triturado / puré de tomate', 20), ('Aceite de oliva', 4)],
    'Choripán': [('Chorizo parrillero (cocido)', 90), ('Pan francés', 80)],
    'Sándwich de milanesa': [('Nalga (vacuno, cocida)', 100), ('Pan rallado', 25), ('Huevo entero (crudo)', 15), ('Aceite de girasol', 10), ('Pan francés', 100), ('Lechuga', 15), ('Tomate', 30)],
    'Fideos con tuco': [('Fideos secos (cocidos)', 250), ('Tomate triturado / puré de tomate', 80), ('Aceite de oliva', 5), ('Queso rallado (tipo reggianito)', 8)],
    'Guiso de lentejas': [('Lentejas (cocidas)', 180), ('Papa (hervida)', 80), ('Chorizo parrillero (cocido)', 30), ('Zanahoria', 30), ('Cebolla', 30), ('Tomate triturado / puré de tomate', 40)],
    'Café con leche': [('Café (preparado)', 150), ('Leche entera', 100)],
    'Tostado de jamón y queso': [('Pan lactal blanco', 60), ('Jamón cocido', 30), ('Queso tybo / de máquina', 30), ('Manteca', 5)],
    'Ensalada mixta': [('Lechuga', 60), ('Tomate', 80), ('Cebolla', 20), ('Aceite de girasol', 8)],
}
for dish, parts in DISHES.items():
    tot = sum(g for _, g in parts)
    S[dish] = {'aisle': 'Plato', 'parts': [{'name': n, 'share': round(g / tot, 4)} for n, g in parts]}

def q(s):
    return "'" + s.replace("'", "''") + "'"

sql = ["""-- Comidas, etapa 3 (docs/comidas.md): the shopping list. Generated in part by scripts/foods/build-shopping.py.
-- foods.shop says how a catalog food is bought: góndola, the name on the list, a factor from plan grams
-- to bought grams (cooked rice → raw), the usual package, or the ingredients of a typical dish.

alter table public.foods add column shop jsonb;

update public.foods f set shop = v.shop::jsonb
from (values"""]
sql.append(',\n'.join(f"  ({q(n)}, {q(json.dumps(v, ensure_ascii=False))})" for n, v in S.items()))
sql.append(""") as v(name, shop)
where f.owner_id is null and f.name = v.name;

-- ── lists and their items ──────────────────────────────────────────────────
create table public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  plan_id uuid references public.meal_plans (id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
create index shopping_lists_user_idx on public.shopping_lists (user_id, created_at desc);
create trigger shopping_lists_owner_immutable before update on public.shopping_lists
  for each row execute function private.prevent_owner_change('user_id');

create table public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null,
  user_id uuid not null default auth.uid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  aisle text not null default 'Otros' check (char_length(aisle) <= 40),
  grams numeric(8, 1) check (grams is null or grams between 0 and 100000),
  packages smallint check (packages is null or packages between 1 and 500),
  package_label text check (package_label is null or char_length(package_label) <= 60),
  position smallint not null default 0,
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (list_id, user_id) references public.shopping_lists (id, user_id) on delete cascade
);
create index shopping_items_list_idx on public.shopping_items (list_id, aisle, position);
create trigger shopping_items_owner_immutable before update on public.shopping_items
  for each row execute function private.prevent_owner_change('user_id');

-- ── pantry: what is already at home ───────────────────────────────────────
create table public.pantry_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  grams numeric(8, 1) check (grams is null or grams between 0 and 100000),
  source text not null default 'manual' check (source in ('manual', 'ticket', 'foto', 'lista')),
  created_at timestamptz not null default now()
);
create index pantry_items_user_idx on public.pantry_items (user_id, created_at desc);
create trigger pantry_items_owner_immutable before update on public.pantry_items
  for each row execute function private.prevent_owner_change('user_id');

alter table public.shopping_lists enable row level security;
alter table public.shopping_items enable row level security;
alter table public.pantry_items enable row level security;
do $$
declare t text;
begin
  foreach t in array array['shopping_lists', 'shopping_items', 'pantry_items'] loop
    execute format('create policy %1$s_select_own on public.%1$I for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format('create policy %1$s_insert_own on public.%1$I for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format('create policy %1$s_update_own on public.%1$I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('create policy %1$s_delete_own on public.%1$I for delete to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
end $$;
revoke all on public.shopping_lists, public.shopping_items, public.pantry_items from anon, authenticated;
grant select, insert, update, delete on public.shopping_lists, public.shopping_items, public.pantry_items to authenticated;
""")
open(OUT, 'w', encoding='utf-8', newline='\n').write('\n'.join(sql))
print(len(S), 'foods with shopping info')
