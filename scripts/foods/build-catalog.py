"""Builds the catalog migration from picked.json (USDA SR Legacy values, per 100 g).
Direct equivalents are 'verified'; Argentine names mapped to a close USDA food are 'estimated'
and say which food they come from. Typical Argentine dishes are computed from USDA ingredients."""
import json, re, sys, uuid

src, out = sys.argv[1], sys.argv[2]
foods = json.load(open(src, encoding='utf-8'))

NS = uuid.UUID('6f1d1c2e-6a8b-4b1e-9d1a-4b6f0a6e1c01')
fid = lambda key: str(uuid.uuid5(NS, key))

# Foods whose USDA match is a close equivalent, not the same product.
PROXY = {
    'Queso cremoso (tipo Port Salut)': 'Muenster', 'Queso tybo / de máquina': 'Gouda', 'Queso rallado (tipo reggianito)': 'Parmesano',
    'Merluza / pescado blanco (cocido)': 'Whiting', 'Tapas de empanada / masa de tarta': 'masa de tarta congelada',
    'Yogur bebible frutado': 'yogur frutado descremado', 'Alfajor / galletita bañada': 'galletita bañada rellena',
    'Chorizo parrillero (cocido)': 'salchicha de cerdo', 'Asado de tira (vacuno, crudo)': 'short ribs de chuck',
    'Vacío (vacuno, asado)': 'flank steak', 'Copos de maíz': 'corn flakes RALSTON', 'Bebida deportiva': 'Powerade lima-limón',
    'Fideos frescos / ñoquis de papa': 'pasta fresca', 'Granola': 'granola casera', 'Galletitas dulces': 'galletita de vainilla rellena',
}
DROP = {'Dulce de batata / membrillo', 'Pescado rebozado (cocido)'}
RENAME = {'Polenta (cocida)': 'Harina de maíz / polenta (seca)', 'Fideos frescos / ñoquis de papa': 'Fideos frescos (cocidos)'}

UNIT = [
    (r'^1 cup\b', '1 taza'), (r'^1 tbsp\b', '1 cucharada'), (r'^1 tsp\b', '1 cucharadita'), (r'^1 slice\b', '1 rebanada'),
    (r'^1 large\b', '1 grande'), (r'^1 medium\b', '1 mediano'), (r'^1 small\b', '1 chico'), (r'^1 extra large\b', '1 extra grande'),
    (r'^1 fillet\b', '1 filete'), (r'^1 steak\b', '1 bife'), (r'^1 pita, large', '1 pan árabe grande'), (r'^1 pita, small', '1 pan árabe chico'),
    (r'^1 roll\b', '1 pan'), (r'^1 link\b', '1 unidad'), (r'^1 piece\b', '1 pieza'), (r'^1 fruit\b', '1 unidad'),
    (r'^1 container\b', '1 pote'), (r'^1 can\b', '1 lata'), (r'^1 egg\b', '1 huevo'), (r'^1 wing\b', '1 alita'),
    (r'^1 serving small', '1 porción chica'), (r'^1 serving medium', '1 porción mediana'), (r'^1 serving large', '1 porción grande'),
    (r'^8 fl oz\b', '1 vaso (240 ml)'), (r'^12 fl oz\b', '1 lata (355 ml)'), (r'^1 fl oz\b', None), (r'^1 oz\b', None), (r'^1 lb\b', None),
    (r'^3 oz\b', None), (r'^4 oz\b', None),
]

def es_label(en, name):
    for pat, rep in UNIT:
        if re.match(pat, en, re.I):
            if rep is None:
                return None
            extra = ''
            if 'chopped' in en or 'diced' in en:
                extra = ' picado'
            elif 'sliced' in en:
                extra = ' en rodajas'
            elif 'mashed' in en:
                extra = ' pisado'
            elif 'shredded' in en or 'grated' in en:
                extra = ' rallado'
            return rep + extra
    return None

def q(s):
    return "'" + s.replace("'", "''") + "'"

rows, portions = [], []
by_name = {}
for f in foods:
    if f['name'] in DROP:
        continue
    name = RENAME.get(f['name'], f['name'])
    key = 'usda:' + str(f['fdc_id'])
    proxy = PROXY.get(f['name'])
    source = 'estimated' if proxy else 'verified'
    ref = 'USDA FDC ' + str(f['fdc_id']) + (' (equivalente: ' + proxy + ')' if proxy else '')
    fib = f.get('fiber_g')
    # USDA carbohydrates (by difference) already include fiber; the foods table adds fiber on top in
    # its mass check, so fiber is left out when both together would exceed the reference mass.
    if fib is not None and f['protein_g'] + f['carbs_g'] + f['fat_g'] + fib > 101:
        fib = None
    rows.append((fid(key), name, f['kcal'], f['protein_g'], f['carbs_g'], f['fat_g'], fib, source, ref))
    by_name[name] = f
    seen = set()
    for p in f['portions']:
        lab = es_label(p['label_en'], name)
        if lab and lab not in seen and 0 < p['grams'] <= 2000:
            seen.add(lab)
            portions.append((fid(key + ':' + lab), fid(key), lab, p['grams'], 'USDA FDC ' + str(f['fdc_id'])))

# Typical Argentine dishes: grams of each catalog ingredient for one unit of the dish.
DISHES = [
    ('Milanesa de carne (frita)', '1 milanesa', [('Nalga (vacuno, cocida)', 100), ('Pan rallado', 25), ('Huevo entero (crudo)', 15), ('Aceite de girasol', 10)]),
    ('Milanesa de pollo (al horno)', '1 milanesa', [('Pechuga de pollo (cocida, sin piel)', 110), ('Pan rallado', 25), ('Huevo entero (crudo)', 15), ('Aceite de girasol', 4)]),
    ('Empanada de carne (al horno)', '1 empanada', [('Tapas de empanada / masa de tarta', 35), ('Carne picada común (cocida)', 30), ('Cebolla', 15), ('Huevo duro', 5)]),
    ('Empanada de jamón y queso (al horno)', '1 empanada', [('Tapas de empanada / masa de tarta', 35), ('Jamón cocido', 20), ('Queso mozzarella', 25)]),
    ('Tarta de verdura (porción)', '1 porción', [('Tapas de empanada / masa de tarta', 50), ('Acelga (cocida)', 90), ('Huevo entero (crudo)', 25), ('Queso rallado (tipo reggianito)', 10)]),
    ('Pizza muzzarella (porción)', '1 porción', [('Harina de trigo 000', 45), ('Queso mozzarella', 40), ('Tomate triturado / puré de tomate', 20), ('Aceite de oliva', 4)]),
    ('Choripán', '1 choripán', [('Chorizo parrillero (cocido)', 90), ('Pan francés', 80)]),
    ('Sándwich de milanesa', '1 sándwich', [('Nalga (vacuno, cocida)', 100), ('Pan rallado', 25), ('Huevo entero (crudo)', 15), ('Aceite de girasol', 10), ('Pan francés', 100), ('Lechuga', 15), ('Tomate', 30)]),
    ('Fideos con tuco', '1 plato', [('Fideos secos (cocidos)', 250), ('Tomate triturado / puré de tomate', 80), ('Aceite de oliva', 5), ('Queso rallado (tipo reggianito)', 8)]),
    ('Guiso de lentejas', '1 plato', [('Lentejas (cocidas)', 180), ('Papa (hervida)', 80), ('Chorizo parrillero (cocido)', 30), ('Zanahoria', 30), ('Cebolla', 30), ('Tomate triturado / puré de tomate', 40)]),
    ('Café con leche', '1 taza', [('Café (preparado)', 150), ('Leche entera', 100)]),
    ('Tostado de jamón y queso', '1 tostado', [('Pan lactal blanco', 60), ('Jamón cocido', 30), ('Queso tybo / de máquina', 30), ('Manteca', 5)]),
    ('Ensalada mixta', '1 plato', [('Lechuga', 60), ('Tomate', 80), ('Cebolla', 20), ('Aceite de girasol', 8)]),
]
for dname, unit, parts in DISHES:
    tot = {'kcal': 0, 'protein_g': 0, 'carbs_g': 0, 'fat_g': 0, 'fiber_g': 0}
    grams = 0
    for ing, g in parts:
        f = by_name[ing]
        grams += g
        for k in tot:
            tot[k] += (f.get(k) or 0) * g / 100
    per100 = {k: round(v * 100 / grams, 2) for k, v in tot.items()}
    key = 'dish:' + dname
    ref = 'Receta típica con ingredientes USDA: ' + ', '.join(f'{ing} {g} g' for ing, g in parts)
    rows.append((fid(key), dname, round(per100['kcal'], 1), per100['protein_g'], per100['carbs_g'], per100['fat_g'], per100['fiber_g'], 'estimated', ref[:200]))
    portions.append((fid(key + ':' + unit), fid(key), unit, grams, 'Receta típica'))

sql = ["""-- Comidas, etapa 1 (docs/comidas.md): the public food catalog and household portions.
-- Generated by scripts/foods/build-catalog.py from USDA FoodData Central SR Legacy (public domain).
-- Values are per 100 g and copied from USDA. A food is 'verified' when the USDA food is the same
-- thing; 'estimated' when it is a close equivalent (source_ref says which) or a typical dish
-- computed from USDA ingredients (source_ref lists them).

create table public.food_portions (
  id uuid primary key default gen_random_uuid(),
  food_id uuid not null references public.foods (id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 60), -- '1 taza', '1 empanada'
  grams numeric(7, 2) not null check (grams > 0 and grams <= 5000),
  source text check (source is null or char_length(source) <= 120),
  created_at timestamptz not null default now(),
  unique (food_id, label)
);
alter table public.food_portions enable row level security;
-- Visible with its food: catalog portions for everyone signed in, own portions for their owner.
create policy food_portions_select on public.food_portions for select to authenticated
  using (exists (select 1 from public.foods f where f.id = food_id));
create policy food_portions_insert_own on public.food_portions for insert to authenticated
  with check (exists (select 1 from public.foods f where f.id = food_id and f.owner_id = (select auth.uid())));
create policy food_portions_delete_own on public.food_portions for delete to authenticated
  using (exists (select 1 from public.foods f where f.id = food_id and f.owner_id = (select auth.uid())));
revoke all on public.food_portions from anon, authenticated;
grant select, insert, delete on public.food_portions to authenticated;
create index food_portions_food_idx on public.food_portions (food_id);
"""]
sql.append('insert into public.foods (id, owner_id, name, ref_amount, ref_unit, kcal, protein_g, carbs_g, fat_g, fiber_g, data_source, source_ref) values')
vals = []
for r in rows:
    i, n, k, p, c, fa, fi, s, ref = r
    vals.append(f"  ({q(i)}, null, {q(n)}, 100, 'g', {k}, {p}, {c}, {fa}, {'null' if fi is None else fi}, '{s}', {q(ref[:200])})")
sql.append(',\n'.join(vals) + '\non conflict (id) do nothing;\n')
sql.append('insert into public.food_portions (id, food_id, label, grams, source) values')
sql.append(',\n'.join(f"  ({q(a)}, {q(b)}, {q(c)}, {d}, {q(e)})" for a, b, c, d, e in portions) + '\non conflict (id) do nothing;\n')
open(out, 'w', encoding='utf-8', newline='\n').write('\n'.join(sql))
print(len(rows), 'foods,', len(portions), 'portions')
