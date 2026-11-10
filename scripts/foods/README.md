# Catálogo de alimentos (Comidas, etapa 1)

Genera `supabase/migrations/20261110000100_food_catalog.sql` desde USDA FoodData Central
(SR Legacy, dominio público). Los valores se copian tal cual; nunca se inventan.

```bash
curl -L -o sr.zip https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip
unzip sr.zip
python -I scripts/foods/pick-usda.py FoodData_Central_sr_legacy_food_csv_2018-04 picked.json
python -I scripts/foods/build-catalog.py picked.json supabase/migrations/20261110000100_food_catalog.sql
```

- `pick-usda.py`: la lista en español y qué alimento de USDA corresponde a cada uno.
- `build-catalog.py`: marca como `estimated` los equivalentes cercanos (dice cuál en `source_ref`)
  y arma los platos típicos argentinos con ingredientes USDA.

Para agregar alimentos, sumalos a la lista y generá una migración **nueva** (no edites una aplicada).
