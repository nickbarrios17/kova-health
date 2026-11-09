"""Pick USDA SR Legacy foods for Kova's Spanish catalog. Values are copied, never invented.
Each entry: (spanish name, [required substrings, all lowercase], [forbidden substrings]).
The shortest matching description wins."""
import csv, json, sys, os

D = sys.argv[1]
OUT = sys.argv[2]

FOODS = [
    # ── Carnes vacunas ──
    ('Bife de chorizo (vacuno, crudo)', ['beef, short loin, top loin steak, separable lean only, trimmed to 1/8" fat, all grades, raw'], []),
    ('Lomo (vacuno, crudo)', ['beef, tenderloin, steak, separable lean only, trimmed to 1/8" fat, all grades, raw'], []),
    ('Cuadril (vacuno, cocido)', ['beef, top sirloin, steak', 'lean only', 'broiled'], ['select', 'prime', 'choice', '1/8']),
    ('Nalga (vacuno, cocida)', ['beef, round, top round, separable lean only, trimmed to 0" fat, choice, cooked, braised'], []),
    ('Vacío (vacuno, asado)', ['beef, flank, steak', 'lean only', 'broiled'], ['select', 'prime', 'choice']),
    ('Entraña (vacuno, asada)', ['beef, plate, inside skirt steak', 'lean only', 'broiled'], ['select', 'prime', 'choice']),
    ('Asado de tira (vacuno, crudo)', ['beef, chuck, short ribs, boneless, separable lean and fat, trimmed to 0" fat, all grades, raw'], []),
    ('Carne picada común (cocida)', ['beef, ground, 80% lean meat / 20% fat', 'pan-browned'], []),
    ('Carne picada especial (cocida)', ['beef, ground, 90% lean meat / 10% fat', 'pan-browned'], []),
    ('Carne picada común (cruda)', ['beef, ground, 80% lean meat / 20% fat, raw'], []),
    ('Hígado de vaca (cocido)', ['beef, variety meats and by-products, liver, cooked, pan-fried'], []),
    ('Mondongo (cocido)', ['beef, variety meats and by-products, tripe, cooked'], []),
    # ── Cerdo y embutidos ──
    ('Bondiola de cerdo (cocida)', ['pork, fresh, shoulder, blade', 'lean and fat', 'roasted'], []),
    ('Carré de cerdo (cocido)', ['pork, fresh, loin, center loin (chops)', 'lean only', 'broiled'], []),
    ('Matambre de cerdo (cocido)', ['pork, fresh, spareribs, separable lean and fat, cooked, braised'], []),
    ('Chorizo parrillero (cocido)', ['pork sausage, link/patty, cooked, pan-fried'], []),
    ('Morcilla', ['blood sausage'], []),
    ('Jamón cocido', ['ham, sliced, regular'], []),
    ('Salame', ['salami, dry or hard, pork'], []),
    ('Panceta (cocida)', ['pork, cured, bacon, pre-sliced, cooked, pan-fried'], []),
    ('Salchicha', ['frankfurter, beef, unheated'], []),
    # ── Pollo, pavo y huevos ──
    ('Pechuga de pollo (cocida, sin piel)', ['chicken, broilers or fryers, breast, meat only, cooked, roasted'], []),
    ('Pechuga de pollo (cruda, sin piel)', ['chicken, broiler', 'breast', 'meat only', 'raw'], ['skin', 'fat']),
    ('Muslo de pollo (cocido, sin piel)', ['chicken, broilers or fryers, thigh, meat only, cooked, roasted'], []),
    ('Pata muslo de pollo (cocida, con piel)', ['chicken, broilers or fryers, leg, meat and skin, cooked, roasted'], []),
    ('Alitas de pollo (cocidas)', ['chicken, broilers or fryers, wing, meat and skin, cooked, roasted'], []),
    ('Pavo, pechuga (cocida)', ['turkey, whole, breast, meat only, cooked, roasted'], []),
    ('Huevo entero (crudo)', ['egg, whole, raw, fresh'], []),
    ('Huevo duro', ['egg, whole, cooked, hard-boiled'], []),
    ('Huevo frito', ['egg, whole, cooked, fried'], []),
    ('Huevos revueltos', ['egg, whole, cooked, scrambled'], []),
    ('Clara de huevo', ['egg, white, raw, fresh'], []),
    # ── Pescados y mariscos ──
    ('Merluza / pescado blanco (cocido)', ['fish, whiting, mixed species, cooked, dry heat'], []),
    ('Salmón (cocido)', ['fish, salmon, atlantic, farmed, cooked, dry heat'], []),
    ('Atún en lata al natural', ['fish, tuna, light, canned in water, drained solids'], ['without salt']),
    ('Atún en lata en aceite', ['fish, tuna, light, canned in oil, drained solids'], ['without salt']),
    ('Caballa en lata', ['fish, mackerel, jack, canned, drained solids'], []),
    ('Sardinas en aceite', ['fish, sardine, atlantic, canned in oil, drained solids with bone'], []),
    ('Camarones (cocidos)', ['crustaceans, shrimp, cooked'], ['breaded']),
    ('Calamar (crudo)', ['mollusks, squid, mixed species, raw'], []),
    ('Pescado rebozado (cocido)', ['fish, pollock, alaska, cooked, dry heat'], []),
    # ── Lácteos ──
    ('Leche entera', ['milk, whole, 3.25% milkfat, with added vitamin d'], []),
    ('Leche descremada', ['milk, nonfat, fluid, with added vitamin a and vitamin d'], ['calcium']),
    ('Leche semidescremada', ['milk, reduced fat, fluid, 2% milkfat, with added vitamin a and vitamin d'], ['protein']),
    ('Yogur natural entero', ['yogurt, plain, whole milk'], []),
    ('Yogur natural descremado', ['yogurt, plain, skim milk'], []),
    ('Yogur griego natural', ['yogurt, greek, plain, nonfat'], []),
    ('Yogur bebible frutado', ['yogurt, fruit, low fat, 9 grams protein per 8 ounce'], []),
    ('Queso cremoso (tipo Port Salut)', ['cheese, muenster'], ['low fat']),
    ('Queso mozzarella', ['cheese, mozzarella, whole milk'], ['low moisture']),
    ('Queso rallado (tipo reggianito)', ['cheese, parmesan, grated'], ['low', 'reduced']),
    ('Queso tybo / de máquina', ['cheese, gouda'], []),
    ('Queso crema', ['cheese, cream'], ['low', 'fat free', 'whipped']),
    ('Ricota', ['cheese, ricotta, whole milk'], []),
    ('Queso cottage', ['cheese, cottage, lowfat, 2% milkfat'], ['lactose', 'sodium', 'calcium']),
    ('Manteca', ['butter, salted'], []),
    ('Crema de leche', ['cream, fluid, heavy whipping'], []),
    ('Dulce de leche', ['dulce de leche'], []),
    ('Leche en polvo entera', ['milk, dry, whole, without added vitamin d'], []),
    # ── Panes, cereales y harinas ──
    ('Pan francés', ['bread, french or vienna (includes sourdough)'], ['toasted']),
    ('Pan lactal blanco', ['bread, white, commercially prepared'], ['toasted', 'low sodium', 'calcium']),
    ('Pan integral', ['bread, whole-wheat, commercially prepared'], ['toasted']),
    ('Pan de centeno', ['bread, rye'], ['toasted']),
    ('Pan árabe', ['bread, pita, white, enriched'], []),
    ('Pan rallado', ['bread, crumbs, dry, grated, plain'], []),
    ('Galletitas de agua', ['crackers, saltines'], ['low', 'unsalted', 'whole', 'fat-free']),
    ('Galletitas dulces', ['cookies, vanilla sandwich with creme filling'], []),
    ('Galletitas de arroz', ['snacks, rice cakes, brown rice, plain'], []),
    ('Tostadas de pan', ['bread, white, commercially prepared, toasted'], ['low sodium']),
    ('Arroz blanco (cocido)', ['rice, white, long-grain, regular, enriched, cooked'], []),
    ('Arroz integral (cocido)', ['rice, brown, long-grain, cooked'], []),
    ('Arroz blanco (crudo)', ['rice, white, long-grain, regular, raw, enriched'], []),
    ('Fideos secos (cocidos)', ['pasta, cooked, enriched, without added salt'], ['whole', 'spinach', 'fresh']),
    ('Fideos secos (crudos)', ['pasta, dry, enriched'], ['whole', 'spinach', 'fresh']),
    ('Fideos integrales (cocidos)', ['pasta, whole-wheat, cooked'], []),
    ('Fideos frescos / ñoquis de papa', ['pasta, fresh-refrigerated, plain, cooked'], ['spinach']),
    ('Avena arrollada', ['cereals, oats, regular and quick, not fortified, dry'], []),
    ('Avena cocida (con agua)', ['cereals, oats, regular and quick, unenriched, cooked with water'], []),
    ('Copos de maíz', ['corn flakes'], []),
    ('Granola', ['cereals ready-to-eat, granola, homemade'], []),
    ('Harina de trigo 000', ['wheat flour, white, all-purpose, enriched, bleached'], ['calcium', 'self-rising']),
    ('Harina integral', ['wheat flour, whole-grain'], ['soft']),
    ('Polenta (cocida)', ['cornmeal, degermed, enriched, yellow'], []),
    ('Quinoa (cocida)', ['quinoa, cooked'], []),
    ('Tapas de empanada / masa de tarta', ['pie crust, standard-type, frozen, ready-to-bake, enriched'], ['baked']),
    ('Tortilla de trigo (wrap)', ['tortillas, ready-to-bake or -fry, flour'], ['shelf']),
    ('Pan de hamburguesa', ['rolls, hamburger or hotdog, plain'], ['reduced', 'mixed']),
    ('Medialuna / croissant', ['croissants, butter'], []),
    ('Bizcochuelo', ['cake, sponge, commercially prepared'], []),
    # ── Legumbres y frutos secos ──
    ('Lentejas (cocidas)', ['lentils, mature seeds, cooked, boiled, without salt'], []),
    ('Garbanzos (cocidos)', ['chickpeas (garbanzo beans, bengal gram), mature seeds, cooked, boiled, without salt'], []),
    ('Porotos negros (cocidos)', ['beans, black, mature seeds, cooked, boiled, without salt'], []),
    ('Porotos alubia (cocidos)', ['beans, navy, mature seeds, cooked, boiled, without salt'], []),
    ('Arvejas (cocidas)', ['peas, green, frozen, cooked, boiled, drained, without salt'], []),
    ('Soja (cocida)', ['soybeans, mature cooked, boiled, without salt'], []),
    ('Tofu', ['tofu, firm, prepared with calcium sulfate and magnesium chloride (nigari)'], []),
    ('Maní tostado', ['peanuts, all types, dry-roasted, without salt'], []),
    ('Mantequilla de maní', ['peanut butter, smooth style, without salt'], ['reduced', 'vitamin']),
    ('Almendras', ['nuts, almonds'], ['blanched', 'oil', 'roasted', 'honey', 'butter', 'paste']),
    ('Nueces', ['nuts, walnuts, english'], []),
    ('Castañas de cajú', ['nuts, cashew nuts, raw'], []),
    ('Semillas de chía', ['seeds, chia seeds, dried'], []),
    ('Semillas de girasol', ['seeds, sunflower seed kernels, dried'], []),
    ('Semillas de lino', ['seeds, flaxseed'], []),
    # ── Verduras ──
    ('Papa (hervida)', ['potatoes, boiled, cooked without skin, flesh, without salt'], []),
    ('Papa (cruda)', ['potatoes, flesh and skin, raw'], []),
    ('Puré de papas', ['potatoes, mashed, home-prepared, whole milk and butter added'], []),
    ('Papas fritas', ['fast foods, potato, french fried in vegetable oil'], []),
    ('Batata (horneada)', ['sweet potato, cooked, baked in skin, flesh, without salt'], []),
    ('Zapallo (hervido)', ['squash, winter, butternut, cooked, baked, without salt'], []),
    ('Zapallito / zucchini', ['squash, summer, zucchini, includes skin, raw'], []),
    ('Tomate', ['tomatoes, red, ripe, raw, year round average'], []),
    ('Lechuga', ['lettuce, cos or romaine, raw'], []),
    ('Rúcula', ['arugula, raw'], []),
    ('Espinaca (cruda)', ['spinach, raw'], []),
    ('Espinaca (cocida)', ['spinach, cooked, boiled, drained, without salt'], []),
    ('Acelga (cocida)', ['chard, swiss, cooked, boiled, drained, without salt'], []),
    ('Zanahoria', ['carrots, raw'], ['baby']),
    ('Cebolla', ['onions, raw'], ['spring', 'welsh', 'young', 'dehydrated']),
    ('Morrón rojo', ['peppers, sweet, red, raw'], []),
    ('Pepino', ['cucumber, with peel, raw'], []),
    ('Brócoli (cocido)', ['broccoli, cooked, boiled, drained, without salt'], []),
    ('Coliflor (cocida)', ['cauliflower, cooked, boiled, drained, without salt'], []),
    ('Choclo (cocido)', ['corn, sweet, yellow, cooked, boiled, drained, without salt'], []),
    ('Choclo en lata', ['corn, sweet, yellow, canned, whole kernel, drained solids'], []),
    ('Remolacha (cocida)', ['beets, cooked, boiled, drained'], []),
    ('Berenjena (cocida)', ['eggplant, cooked, boiled, drained, without salt'], []),
    ('Champiñones', ['mushrooms, white, raw'], []),
    ('Repollo', ['cabbage, raw'], []),
    ('Palta', ['avocados, raw, all commercial varieties'], []),
    ('Ajo', ['garlic, raw'], []),
    ('Chauchas (cocidas)', ['beans, snap, green, cooked, boiled, drained, without salt'], []),
    ('Tomate triturado / puré de tomate', ['tomato products, canned, puree, without salt added'], []),
    ('Aceitunas verdes', ['olives, pickled, canned or bottled, green'], []),
    # ── Frutas ──
    ('Banana', ['bananas, raw'], []),
    ('Manzana', ['apples, raw, with skin'], ['without']),
    ('Naranja', ['oranges, raw, all commercial varieties'], []),
    ('Mandarina', ['tangerines, (mandarin oranges), raw'], []),
    ('Pera', ['pears, raw'], ['asian']),
    ('Durazno', ['peaches, yellow, raw'], []),
    ('Frutillas', ['strawberries, raw'], []),
    ('Uvas', ['grapes, red or green (european type, such as thompson seedless), raw'], []),
    ('Kiwi', ['kiwifruit, green, raw'], []),
    ('Ananá', ['pineapple, raw, all varieties'], []),
    ('Sandía', ['watermelon, raw'], []),
    ('Melón', ['melons, cantaloupe, raw'], []),
    ('Limón (jugo)', ['lemon juice, raw'], []),
    ('Arándanos', ['blueberries, raw'], []),
    ('Ciruela', ['plums, raw'], []),
    ('Mango', ['mangos, raw'], []),
    ('Pasas de uva', ['raisins, dark, seedless'], []),
    ('Jugo de naranja exprimido', ['orange juice, raw'], []),
    ('Duraznos en almíbar', ['peaches, canned, heavy syrup pack, solids and liquids'], []),
    # ── Aceites, dulces y otros ──
    ('Aceite de girasol', ['oil, sunflower, linoleic, (approx. 65%)'], []),
    ('Aceite de oliva', ['oil, olive, salad or cooking'], []),
    ('Mayonesa', ['salad dressing, mayonnaise, regular'], []),
    ('Ketchup', ['catsup'], ['low sodium']),
    ('Mostaza', ['mustard, prepared, yellow'], []),
    ('Azúcar', ['sugars, granulated'], []),
    ('Miel', ['honey'], []),
    ('Mermelada', ['jams and preserves'], ['dietetic', 'apricot']),
    ('Dulce de batata / membrillo', ['candies, gumdrops, starch jelly pieces'], []),
    ('Chocolate con leche', ['candies, milk chocolate'], ['almonds', 'rice', 'coated']),
    ('Chocolate amargo 70%', ['chocolate, dark, 70-85% cacao solids'], []),
    ('Cacao en polvo', ['cocoa, dry powder, unsweetened'], ['dutch']),
    ('Helado de crema', ['ice creams, vanilla'], ['light', 'rich', 'fat free']),
    ('Alfajor / galletita bañada', ['cookies, chocolate sandwich, with creme filling, regular, chocolate-coated'], []),
    ('Papas fritas de paquete', ['snacks, potato chips, plain, salted'], []),
    ('Pochoclo', ['snacks, popcorn, air-popped'], []),
    # ── Bebidas ──
    ('Gaseosa cola', ['beverages, carbonated, cola, regular'], []),
    ('Cerveza', ['alcoholic beverage, beer, regular, all'], []),
    ('Vino tinto', ['alcoholic beverage, wine, table, red'], []),
    ('Café (preparado)', ['beverages, coffee, brewed, prepared with tap water'], ['decaf']),
    ('Bebida deportiva', ['powerade, lemon-lime flavored, ready-to-drink'], []),
    ('Leche chocolatada', ['milk, chocolate, fluid, commercial, whole'], []),
]

def norm(s):
    return s.lower()

foods = {}
with open(os.path.join(D, 'food.csv'), encoding='utf-8') as f:
    for r in csv.DictReader(f):
        foods[r['fdc_id']] = r['description']

want = {1003: 'protein_g', 1004: 'fat_g', 1005: 'carbs_g', 1008: 'kcal', 1079: 'fiber_g'}
nut = {}
with open(os.path.join(D, 'food_nutrient.csv'), encoding='utf-8') as f:
    for r in csv.DictReader(f):
        k = int(r['nutrient_id'])
        if k in want:
            nut.setdefault(r['fdc_id'], {})[want[k]] = float(r['amount'])

portions = {}
units = {}
with open(os.path.join(D, 'measure_unit.csv'), encoding='utf-8') as f:
    for r in csv.DictReader(f):
        units[r['id']] = r['name']
with open(os.path.join(D, 'food_portion.csv'), encoding='utf-8') as f:
    for r in csv.DictReader(f):
        portions.setdefault(r['fdc_id'], []).append(r)

out, miss = [], []
for es, req, bad in FOODS:
    cands = [(fid, d) for fid, d in foods.items()
             if all(x in norm(d) for x in req) and not any(b in norm(d) for b in bad) and fid in nut]
    if not cands:
        miss.append(es + ' :: ' + ' & '.join(req))
        continue
    fid, desc = min(cands, key=lambda c: len(c[1]))
    n = nut[fid]
    if 'kcal' not in n or 'protein_g' not in n or 'fat_g' not in n or 'carbs_g' not in n:
        miss.append(es + ' :: missing nutrients ' + desc)
        continue
    ps = []
    for p in portions.get(fid, [])[:4]:
        g = float(p['gram_weight'] or 0)
        if g <= 0:
            continue
        label = ' '.join(x for x in [p['amount'], units.get(p['measure_unit_id'], '') if p['measure_unit_id'] != '9999' else '', p['portion_description'], p['modifier']] if x).strip()
        ps.append({'label_en': label, 'grams': g})
    out.append({'name': es, 'fdc_id': int(fid), 'usda': desc, **{k: round(v, 2) for k, v in n.items()}, 'portions': ps})

json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(len(out), 'ok;', len(miss), 'missing')
for m in miss:
    print('MISS', m)
