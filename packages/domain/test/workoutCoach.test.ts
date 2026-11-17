import { describe, expect, it } from 'vitest';
import { exerciseStatus, setsPerMuscle, workoutCoach, type CoachExercise } from '../src/workoutCoach.js';

const ex = (name: string, primary: string[], sets: Array<[number, number]>, t: Partial<CoachExercise> = {}): CoachExercise => ({
  exerciseId: name, name, primary, secondary: [], sets: sets.map(([kg, reps]) => ({ kg, reps })), targetMin: 8, targetMax: 12, plannedSets: 3, ...t,
});
const catalog = [
  { id: 'remo', name: 'Remo con barra', primary: ['upper_back'] },
  { id: 'jalon', name: 'Jalón al pecho', primary: ['lats'] },
  { id: 'sentadilla', name: 'Sentadilla', primary: ['quads'] },
  { id: 'prensa', name: 'Prensa', primary: ['quads'] },
];

describe('workoutCoach', () => {
  it('sees a late exercise losing its reps and blames the early one that tired the same muscles', () => {
    const r = workoutCoach({
      exercises: [
        ex('Press banca', ['chest'], [[80, 10], [80, 9], [80, 8]], { secondary: ['triceps'] }),
        ex('Sentadilla', ['quads'], [[100, 8], [100, 8], [100, 8]]),
        ex('Press inclinado', ['chest'], [[60, 8], [60, 6], [60, 4]]),
        ex('Fondos', ['triceps'], [[0, 10], [0, 6]], { secondary: ['chest'] }),
      ],
      weekSets: {}, catalog,
    });
    const f = r.tips.find((t) => t.kind === 'fatigue')!;
    expect(f.title).toBe('Llegás cansado a Press inclinado y Fondos');
    expect(f.body).toContain('bajar un 10 % el peso de Press banca');
    expect(f.why).toContain('pasaste de 8 a 4 repeticiones');
  });

  it('with three exercises, the last two falling off is fatigue', () => {
    const r = workoutCoach({
      exercises: [
        ex('Peso muerto', ['hamstrings'], [[100, 5], [100, 5], [100, 5]], { targetMin: 5, targetMax: 5 }),
        ex('Press militar', ['delts'], [[40, 8], [40, 7], [40, 7], [40, 4]], { plannedSets: 4 }),
        ex('Curl', ['biceps'], [[25, 10], [25, 8], [25, 6]], { targetMin: 10 }),
      ],
      weekSets: {}, catalog,
    });
    expect(r.tips[0]).toMatchObject({ kind: 'fatigue', title: 'Llegás cansado a Press militar y Curl' });
  });

  it('a weight that is high from the start is not fatigue', () => {
    const r = workoutCoach({ exercises: [ex('Press banca', ['chest'], [[100, 5], [100, 4], [100, 4]])], weekSets: {}, catalog });
    expect(r.tips[0]).toMatchObject({ kind: 'fatigue', title: 'En Press banca el peso te quedó alto' });
    expect(r.tips[0]!.body).toContain('90 kg');
  });

  it('every set at the top of the range: add weight', () => {
    const r = workoutCoach({ exercises: [ex('Curl', ['biceps'], [[20, 12], [20, 12], [20, 13]])], weekSets: {}, catalog });
    expect(r.tips.find((t) => t.kind === 'progress')!.body).toBe('Curl: 22 kg.');
  });

  it('recommends exercises for a group not trained this week, the known ones first', () => {
    const r = workoutCoach({
      exercises: [ex('Press banca', ['chest'], [[80, 10], [80, 10], [80, 10]])],
      weekSets: { chest: 12, front_delts: 3, triceps: 6, biceps: 6, lats: 6, upper_back: 3, hamstrings: 4, glutes: 4, delts: 4, abs: 3, calves: 2 },
      catalog, usedBefore: new Set(['prensa']),
    });
    const m = r.tips.find((t) => t.kind === 'missing')!;
    expect(m.title).toBe('Esta semana no trabajaste cuádriceps');
    expect(m.suggest!.map((s) => s.id)).toEqual(['prensa', 'sentadilla']);
  });

  it('flags pushing much more than pulling', () => {
    const r = workoutCoach({
      exercises: [ex('Press banca', ['chest'], [[80, 10], [80, 10], [80, 10]])],
      weekSets: { chest: 15, front_delts: 3, lats: 3, upper_back: 2, quads: 6, hamstrings: 3, glutes: 3, delts: 3, triceps: 4, biceps: 3, abs: 2, calves: 2 },
      catalog,
    });
    const b = r.tips.find((t) => t.kind === 'balance')!;
    expect(b.why).toContain('18 series de pecho y hombro anterior contra 5 de espalda');
    expect(b.suggest!.map((s) => s.id)).toEqual(['remo', 'jalon']);
  });

  it('stretches what was trained and ramps up the warm-up from the working weight', () => {
    const r = workoutCoach({ exercises: [ex('Sentadilla', ['quads'], [[100, 8], [100, 8], [100, 8]], { secondary: ['glutes'] })], weekSets: {}, catalog });
    expect(r.stretches.map((s) => s.muscle)).toEqual(['quads', 'glutes']);
    expect(r.warmup[0]!.text).toBe('5 min de movilidad: sentadillas sin peso, zancadas caminando y puentes de glúteo.');
    expect(r.warmup[1]!.text).toBe('Sentadilla (trabajás con 100 kg): 50 kg × 8, 70 kg × 5, 85 kg × 2, con poco descanso.');
  });

  it('counts sets per muscle (secondary as half) and reads an exercise without targets', () => {
    expect(setsPerMuscle([{ primary: ['chest'], secondary: ['triceps'], sets: 4 }])).toEqual({ chest: 4, triceps: 2 });
    expect(exerciseStatus(ex('X', ['chest'], [[50, 10], [50, 10]], { targetMin: null, targetMax: null, plannedSets: null })).struggled).toBe(false);
  });
});
