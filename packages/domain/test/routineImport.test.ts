import { describe, expect, it } from 'vitest';
import {
  detectColumns, headerField, jsonToRoutines, matchExercise, parseCsv, parseDays, parseReps, parseRest, parseSetsReps, parseWeight,
  sheetToRoutines, slugify, type Sheet,
} from '../src/routineImport.js';

const catalog = [
  { id: 'sq', name: 'Sentadilla con barra' },
  { id: 'dl', name: 'Peso muerto' },
  { id: 'bp', name: 'Press de banca' },
  { id: 'ohp', name: 'Press militar' },
  { id: 'cu', name: 'Curl con barra' },
];

describe('cells', () => {
  it('sets × reps in one cell', () => {
    expect(parseSetsReps('4x8')).toEqual({ sets: 4, repsMin: 8, repsMax: 8 });
    expect(parseSetsReps('4 × 8-10')).toEqual({ sets: 4, repsMin: 8, repsMax: 10 });
    expect(parseSetsReps('3x12/10/8')).toEqual({ sets: 3, repsMin: 8, repsMax: 12 });
    expect(parseSetsReps('3xAMRAP')).toEqual({ sets: 3, repsMin: null, repsMax: null });
    expect(parseSetsReps('4')).toBeNull();
  });
  it('reps', () => {
    expect(parseReps('8 a 10')).toEqual({ min: 8, max: 10 });
    expect(parseReps(12)).toEqual({ min: 12, max: 12 });
    expect(parseReps('AMRAP')).toBeNull();
  });
  it('rest in many spellings', () => {
    expect(parseRest('90')).toBe(90);
    expect(parseRest('90s')).toBe(90);
    expect(parseRest('1:30')).toBe(90);
    expect(parseRest('2 min')).toBe(120);
    expect(parseRest("2'")).toBe(120);
    expect(parseRest(3)).toBe(180);
    expect(parseRest('')).toBeNull();
  });
  it('weight in kg or lb', () => {
    expect(parseWeight('62,5')).toBe(62.5);
    expect(parseWeight('60 kg')).toBe(60);
    expect(parseWeight('135 lb')).toBe(61.23);
    expect(parseWeight(100, 'lb')).toBe(45.36);
    expect(parseWeight('corporal')).toBeNull();
  });
  it('days in Spanish, English and letters', () => {
    expect(parseDays('Lun, Jue')).toEqual([1, 4]);
    expect(parseDays('lunes y miércoles')).toEqual([1, 3]);
    expect(parseDays('Mon/Thu')).toEqual([1, 4]);
    expect(parseDays('L X V')).toEqual([1, 3, 5]);
    expect(parseDays('Día A')).toEqual([]);
  });
});

describe('headers', () => {
  it('recognises synonyms and ignores units in parentheses', () => {
    expect(headerField('Ejercicio')).toBe('exercise');
    expect(headerField('Exercise')).toBe('exercise');
    expect(headerField('Peso (kg)')).toBe('weight');
    expect(headerField('Series x Reps')).toBe('setsReps');
    expect(headerField('Descanso (seg)')).toBe('rest');
    expect(headerField('Color')).toBeNull();
  });
  it('finds the header row below a title and reads the weight unit', () => {
    const sheet: Sheet = { name: 'Hoja1', rows: [['Mi plan de fuerza'], [], ['Ejercicio', 'Sets', 'Reps', 'Peso (lb)']] };
    const plan = detectColumns(sheet);
    expect(plan.headerRow).toBe(2);
    expect(plan.mapping).toEqual({ exercise: 0, sets: 1, reps: 2, weight: 3 });
    expect(plan.weightUnit).toBe('lb');
  });
  it('leaves the mapping empty when nothing is recognised', () => {
    expect(detectColumns({ name: 'x', rows: [['a', 'b'], ['c', 'd']] }).mapping).toEqual({});
  });
});

describe('sheetToRoutines', () => {
  it('standard table with a routine and days column', () => {
    const sheet: Sheet = {
      name: 'Plan',
      rows: [
        ['Rutina', 'Días', 'Ejercicio', 'Series', 'Reps', 'Descanso', 'Peso'],
        ['Fuerza A', 'Lun, Jue', 'Sentadilla', 4, '6', 90, 80],
        ['', '', 'Press banca', 4, '8', '1:30', '60 kg'],
        ['Fuerza B', 'Mar, Vie', 'Peso muerto', 3, 5, '2 min', 100],
      ],
    };
    const r = sheetToRoutines(sheet, detectColumns(sheet), 'Rutina importada');
    expect(r.map((x) => [x.name, x.days, x.items.length])).toEqual([['Fuerza A', [1, 4], 2], ['Fuerza B', [2, 5], 1]]);
    expect(r[0]!.items[1]).toMatchObject({ row: 3, name: 'Press banca', sets: 4, repsMin: 8, repsMax: 8, restS: 90, loadKg: 60, issues: [] });
  });

  it('title rows split routines; sets × reps in one column; blank rows ignored', () => {
    const sheet: Sheet = {
      name: 'Semana',
      rows: [
        ['Exercise', 'Scheme', 'Rest'],
        ['Lunes – Pierna'],
        ['Back squat', '5x5', '3'],
        [],
        ['Día B'],
        ['Bench press', '4 x 8-10', '90s'],
        ['Pull ups', '3xAMRAP', ''],
      ],
    };
    const r = sheetToRoutines(sheet, detectColumns(sheet), 'x');
    expect(r.map((x) => [x.name, x.days])).toEqual([['Lunes – Pierna', [1]], ['Día B', []]]);
    expect(r[0]!.items[0]).toMatchObject({ sets: 5, repsMin: 5, restS: 180 });
    expect(r[1]!.items[0]).toMatchObject({ sets: 4, repsMin: 8, repsMax: 10, restS: 90 });
    // "3xAMRAP": 3 sets, no rep number; the preview explains it.
    expect(r[1]!.items[1]).toMatchObject({ sets: 3, repsMin: null, issues: ['Repeticiones «3xAMRAP» sin número: quedaron vacías.'] });
  });

  it('no routine column: uses the fallback name; flags missing sets', () => {
    const sheet: Sheet = { name: 'Hoja1', rows: [['Nombre', 'Repeticiones'], ['Remo', '12']] };
    const r = sheetToRoutines(sheet, detectColumns(sheet), 'Hoja1');
    expect(r[0]!.name).toBe('Hoja1');
    expect(r[0]!.items[0]).toMatchObject({ sets: 3, repsMin: 12, issues: ['Sin series: usamos 3.'] });
  });

  it('a user-edited mapping works on headers Kova Health did not recognise', () => {
    const sheet: Sheet = { name: 'raro', rows: [['Mov', 'Vueltas', 'Kilos'], ['Hip thrust', '4', '100']] };
    const plan = { ...detectColumns(sheet), headerRow: 0, mapping: { exercise: 0, sets: 1, weight: 2 } };
    expect(sheetToRoutines(sheet, plan, 'raro')[0]!.items[0]).toMatchObject({ name: 'Hip thrust', sets: 4, loadKg: 100 });
  });
});

describe('jsonToRoutines', () => {
  it('accepts English and Spanish keys', () => {
    const r = jsonToRoutines(JSON.stringify({
      routines: [
        { name: 'Torso', days: ['Lun', 'Jue'], exercises: [{ exercise: 'Press banca', sets: 4, reps: '8-10', rest_s: 90, weight_kg: 60 }] },
        { nombre: 'Pierna', dias: [2, 5], ejercicios: [{ ejercicio: 'Sentadilla', series: 5, repeticiones: 5, descanso: '2 min' }] },
      ],
    }));
    expect(r.map((x) => [x.name, x.days])).toEqual([['Torso', [1, 4]], ['Pierna', [2, 5]]]);
    expect(r[0]!.items[0]).toMatchObject({ sets: 4, repsMin: 8, repsMax: 10, restS: 90, loadKg: 60 });
    expect(r[1]!.items[0]).toMatchObject({ sets: 5, restS: 120 });
  });
  it('explains invalid input', () => {
    expect(() => jsonToRoutines('{nope')).toThrow('JSON válido');
    expect(() => jsonToRoutines('{"a":1}')).toThrow('routines');
  });
});

describe('parseCsv', () => {
  it('semicolons (Excel in Spanish), quotes and CRLF', () => {
    expect(parseCsv('﻿Ejercicio;Series\r\n"Press; inclinado";4\r\n')).toEqual([['Ejercicio', 'Series'], ['Press; inclinado', '4']]);
    expect(parseCsv('a,b\n"x ""y""",2')).toEqual([['a', 'b'], ['x "y"', '2']]);
  });
});

describe('matchExercise', () => {
  it('exact, alias and unique partial matches', () => {
    expect(matchExercise('peso muerto', catalog)?.id).toBe('dl');
    expect(matchExercise('Bench press', catalog)?.id).toBe('bp');
    expect(matchExercise('Back squat', catalog)?.id).toBe('sq');
    expect(matchExercise('Sentadilla', catalog)?.id).toBe('sq');
    expect(matchExercise('Press', catalog)).toBeNull(); // ambiguous
    expect(matchExercise('Hip thrust', catalog)).toBeNull();
  });
  it('slugify', () => {
    expect(slugify('Hip Thrust (barra)')).toBe('hip-thrust-barra');
  });
});
