import { describe, expect, it } from 'vitest';
import { buildShoppingList, lineAmount, type ShopFood } from '../src/shopping.js';

const foods: ShopFood[] = [
  { id: 'arroz', name: 'Arroz blanco (cocido)', shop: { aisle: 'Almacén', name: 'Arroz blanco', factor: 0.36, package_g: 1000, package_label: 'paquete de 1 kg' } },
  { id: 'pollo', name: 'Pechuga de pollo (cocida, sin piel)', shop: { aisle: 'Pollería', name: 'Pechuga de pollo', factor: 1.35 } },
  { id: 'nalga', name: 'Nalga (vacuno, cocida)', shop: { aisle: 'Carnicería', name: 'Nalga', factor: 1.4 } },
  { id: 'rallado', name: 'Pan rallado', shop: { aisle: 'Almacén', package_g: 500, package_label: 'paquete de 500 g' } },
  { id: 'huevo', name: 'Huevo entero (crudo)', shop: { aisle: 'Lácteos y huevos', name: 'Huevos', package_g: 300, package_label: 'media docena' } },
  { id: 'tomate', name: 'Tomate', shop: { aisle: 'Verdulería' } },
  { id: 'mila', name: 'Milanesa de carne (frita)', shop: { aisle: 'Plato', parts: [{ name: 'Nalga (vacuno, cocida)', share: 0.8 }, { name: 'Pan rallado', share: 0.2 }] } },
  { id: 'raro', name: 'Algo raro', shop: null },
];

describe('shopping list', () => {
  it('turns plan grams into bought grams and packages, by aisle', () => {
    const list = buildShoppingList([
      { food_id: 'arroz', grams: 1500 }, { food_id: 'arroz', grams: 1500 }, // 3 kg cooked → 1.08 kg raw: one 1 kg package (10 % slack)
      { food_id: 'pollo', grams: 300 },
      { food_id: 'tomate', grams: 230 },
      { food_id: 'huevo', grams: 400 },
    ], foods);
    expect(list.map((l) => l.aisle)).toEqual(['Verdulería', 'Pollería', 'Lácteos y huevos', 'Almacén']);
    expect(list.find((l) => l.name === 'Arroz blanco')).toMatchObject({ packages: 1, package_label: 'paquete de 1 kg' });
    expect(list.find((l) => l.name === 'Pechuga de pollo')).toMatchObject({ grams: 500, packages: null }); // 405 g → 500 g
    expect(list.find((l) => l.name === 'Tomate')!.grams).toBe(300);
    expect(list.find((l) => l.name === 'Huevos')!.packages).toBe(2);
  });

  it('buys a dish as its ingredients, merged with the rest', () => {
    const list = buildShoppingList([{ food_id: 'mila', grams: 300 }, { food_id: 'nalga', grams: 100 }], foods);
    // Nalga: 300 × 0.8 + 100 = 340 g cooked → × 1.4 = 476 g → 500 g.
    expect(list.find((l) => l.name === 'Nalga')!.grams).toBe(500);
    expect(list.find((l) => l.name === 'Pan rallado')!.packages).toBe(1);
  });

  it('takes off what is at home', () => {
    const plan = [{ food_id: 'pollo', grams: 600 }, { food_id: 'arroz', grams: 1000 }, { food_id: 'tomate', grams: 200 }];
    const list = buildShoppingList(plan, foods, [{ name: 'pechuga de pollo', grams: 500 }, { name: 'Arroz blanco', grams: null }]);
    expect(list.find((l) => l.name === 'Pechuga de pollo')!.grams).toBe(400); // 810 − 500 = 310 → 400 g
    expect(list.find((l) => l.name === 'Arroz blanco')).toBeUndefined();
  });

  it('keeps unknown foods under «Otros» and says amounts plainly', () => {
    expect(buildShoppingList([{ food_id: 'raro', grams: 50 }], foods)[0]).toMatchObject({ name: 'Algo raro', aisle: 'Otros', grams: 100 });
    expect(lineAmount({ grams: 1200, packages: null, package_label: null })).toBe('1,2 kg');
    expect(lineAmount({ grams: 300, packages: null, package_label: null })).toBe('300 g');
    expect(lineAmount({ grams: 900, packages: 2, package_label: 'paquete de 500 g' })).toBe('2 × paquete de 500 g');
  });
});
