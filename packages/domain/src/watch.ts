import { nf } from './format.js';

/**
 * «Del reloj»: what Samsung Health and other apps measured (read from Health Connect), in plain words.
 * Values are shown as recorded; nothing is estimated here.
 */

/** Health Connect exercise types (ExerciseSessionRecord.exerciseType), in Spanish. */
const EXERCISE: Record<number, string> = {
  0: 'Entrenamiento', 2: 'Bádminton', 4: 'Béisbol', 5: 'Básquet', 8: 'Bici', 9: 'Bici fija', 10: 'Bootcamp', 11: 'Boxeo',
  13: 'Calistenia', 16: 'Baile', 25: 'Elíptico', 26: 'Clase', 32: 'Golf', 33: 'Respiración guiada', 34: 'Gimnasia',
  35: 'Handball', 36: 'HIIT', 37: 'Trekking', 41: 'Soga', 44: 'Artes marciales', 46: 'Remo', 48: 'Pilates',
  51: 'Escalada', 53: 'Remo', 54: 'Remo (máquina)', 55: 'Rugby', 56: 'Correr', 57: 'Cinta', 60: 'Patinaje',
  61: 'Esquí', 64: 'Fútbol', 66: 'Squash', 68: 'Escaleras', 69: 'Escaladora', 70: 'Fuerza', 71: 'Elongación',
  72: 'Surf', 73: 'Natación (aguas abiertas)', 74: 'Natación', 75: 'Ping pong', 76: 'Tenis', 78: 'Vóley',
  79: 'Caminata', 81: 'Pesas', 83: 'Yoga',
};

export const exerciseName = (type: number | null | undefined, title?: string | null) =>
  title?.trim() || EXERCISE[type ?? 0] || 'Entrenamiento';

export interface WatchValue { metric: string; value: number; extra: Record<string, unknown> | null; at: string }

/** Label, how it reads and whether it is the day's total (vs. the latest reading). In display order. */
const SHOW: Array<[string, string, (v: number, x: Record<string, unknown> | null) => string, boolean]> = [
  ['active_energy_kcal', 'Calorías activas', (v) => nf(v, 0) + ' kcal', true],
  ['total_energy_kcal', 'Calorías totales', (v) => nf(v, 0) + ' kcal', true],
  ['distance_m', 'Distancia', (v) => nf(v / 1000, 1) + ' km', true],
  ['floors', 'Pisos', (v) => nf(v, 0), true],
  ['heart_rate_bpm', 'Pulso', (v, x) => nf(v, 0) + ' ppm' + (x?.min != null && x?.max != null ? ' (' + nf(Number(x.min), 0) + '–' + nf(Number(x.max), 0) + ')' : ''), true],
  ['hydration_ml', 'Agua', (v) => nf(v / 1000, 2) + ' l', true],
  ['blood_pressure_mmhg', 'Presión', (v, x) => nf(v, 0) + '/' + nf(Number(x?.diastolic ?? 0), 0) + ' mmHg', false],
  ['spo2_pct', 'Oxígeno en sangre', (v) => nf(v, 0) + ' %', false],
  ['respiratory_rate', 'Respiración', (v) => nf(v, 0) + ' por min', false],
  ['blood_glucose_mgdl', 'Glucosa', (v) => nf(v, 0) + ' mg/dl', false],
  ['vo2max', 'VO2 máx', (v) => nf(v, 1), false],
  ['skin_temp_delta_c', 'Temperatura de la piel', (v) => (v > 0 ? '+' : '') + nf(v, 1) + ' °C vs. lo normal', false],
  ['body_temp_c', 'Temperatura', (v) => nf(v, 1) + ' °C', false],
  ['lean_mass_kg', 'Masa magra', (v) => nf(v, 1) + ' kg', false],
  ['muscle_mass_kg', 'Masa muscular', (v) => nf(v, 1) + ' kg', false],
  ['body_water_kg', 'Agua corporal', (v) => nf(v, 1) + ' kg', false],
  ['bone_mass_kg', 'Masa ósea', (v) => nf(v, 1) + ' kg', false],
  ['bmr_kcal', 'Metabolismo basal', (v) => nf(v, 0) + ' kcal/día', false],
  ['height_cm', 'Altura', (v) => nf(v, 0) + ' cm', false],
];

/** The rows of «Del reloj» for a day: today's totals first, then the latest readings with their date. */
export function watchRows(values: WatchValue[], today: string): Array<{ key: string; label: string; value: string; when: string | null }> {
  return SHOW.flatMap(([key, label, fmt, isTotal]) => {
    const v = values.find((x) => x.metric === key);
    if (!v || !Number.isFinite(Number(v.value))) return [];
    const day = v.at.slice(0, 10);
    return [{ key, label, value: fmt(Number(v.value), v.extra), when: isTotal || day === today ? null : day.slice(8, 10) + '/' + day.slice(5, 7) }];
  });
}

/**
 * What a workout from the watch's own app works, by its Health Connect type (it brings no exercises or
 * sets): enough to suggest stretches. Yoga, pilates and stretching need none.
 */
const LEGS = { quads: 2, hamstrings: 2, calves: 2, glutes: 1 };
const TYPE_MUSCLES: Array<[number[], Record<string, number>]> = [
  [[56, 57, 79, 37], LEGS], // correr, cinta, caminata, trekking
  [[8, 9], { quads: 2, glutes: 2, hamstrings: 1, calves: 1 }], // bici
  [[73, 74], { lats: 2, delts: 2, chest: 1, triceps: 1 }], // natación
  [[53, 54, 46], { upper_back: 2, lats: 2, biceps: 1, hamstrings: 1 }], // remo
  [[25, 68, 69], { quads: 2, glutes: 2, calves: 1 }], // elíptico, escaleras
  [[64, 5, 76, 66, 2, 35, 55, 78], { quads: 2, hamstrings: 2, calves: 1, adductors: 1 }], // deportes
  [[36, 10, 26, 41, 11, 44], { quads: 1, glutes: 1, chest: 1, delts: 1, calves: 1 }], // HIIT, clases, boxeo
  [[0, 13, 70, 81], { chest: 1, upper_back: 1, quads: 1, hamstrings: 1, delts: 1 }], // fuerza sin detalle
];
export function exerciseTypeMuscles(type: number | null | undefined): Record<string, number> {
  return TYPE_MUSCLES.find(([types]) => types.includes(type ?? 0))?.[1] ?? {};
}
