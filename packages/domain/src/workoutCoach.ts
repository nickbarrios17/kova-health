import { nf } from './format.js';

/**
 * Coach del entreno: after a session, plain advice from the numbers of that session and of the week.
 * Transparent rules, no AI (like the Coach in Hoy): every tip says why, with the person's own numbers.
 *
 * - Fatigue: late exercises that miss their reps (or lose ≥ 35 % of them set to set) while the early ones
 *   went fine → lighten the early ones, or move the late ones earlier.
 * - Progress: every set at or above the top of the range → add weight next time.
 * - Week balance: sets per muscle group in the last 7 days (primary = 1, secondary = ½); groups with
 *   nothing, or pushing much more than pulling, get catalog exercises that fill the gap.
 * - Stretches for what was trained, and a warm-up with ramp-up sets for next time.
 */

export interface CoachSet { kg: number | null; reps: number | null }
export interface CoachExercise {
  exerciseId: string;
  name: string;
  primary: string[];
  secondary: string[];
  sets: CoachSet[]; // done sets, in order
  targetMin?: number | null;
  targetMax?: number | null;
  plannedSets?: number | null;
}
export interface CoachCatalogExercise { id: string; name: string; primary: string[] }
export interface CoachInput {
  exercises: CoachExercise[];
  /** Sets per muscle code in the last 7 days, today included. */
  weekSets: Record<string, number>;
  catalog: CoachCatalogExercise[];
  /** Exercises the person has done before (suggested first). */
  usedBefore?: Set<string>;
}

export type TipKind = 'fatigue' | 'progress' | 'balance' | 'missing';
export interface CoachTip { kind: TipKind; title: string; body: string; why: string; suggest?: Array<{ id: string; name: string }> }
export interface CoachStretch { muscle: string; name: string; how: string }
export interface WarmupStep { text: string }
export interface CoachResult { tips: CoachTip[]; stretches: CoachStretch[]; warmup: WarmupStep[] }

/** The groups the week balance looks at, biggest first (they are suggested first). */
export const MUSCLE_GROUPS: Array<{ key: string; label: string; codes: string[] }> = [
  { key: 'back', label: 'espalda', codes: ['lats', 'upper_back'] },
  { key: 'quads', label: 'cuádriceps', codes: ['quads'] },
  { key: 'hamstrings', label: 'isquiotibiales', codes: ['hamstrings'] },
  { key: 'chest', label: 'pecho', codes: ['chest'] },
  { key: 'glutes', label: 'glúteos', codes: ['glutes'] },
  { key: 'delts', label: 'hombros', codes: ['delts', 'front_delts'] },
  { key: 'triceps', label: 'tríceps', codes: ['triceps'] },
  { key: 'biceps', label: 'bíceps', codes: ['biceps'] },
  { key: 'abs', label: 'abdomen', codes: ['abs'] },
  { key: 'calves', label: 'gemelos', codes: ['calves'] },
];

const STRETCH: Record<string, CoachStretch> = {
  chest: { muscle: 'chest', name: 'Pecho en el marco de la puerta', how: 'Antebrazo apoyado en el marco a la altura del hombro, das un paso adelante hasta sentir el pecho. 30 s por lado.' },
  front_delts: { muscle: 'front_delts', name: 'Hombro anterior con manos atrás', how: 'Entrelazá las manos detrás de la espalda y subilas despacio con el pecho abierto. 30 s.' },
  delts: { muscle: 'delts', name: 'Hombro cruzado', how: 'Llevá el brazo estirado cruzando el pecho y sostenelo con el otro. 30 s por lado.' },
  triceps: { muscle: 'triceps', name: 'Tríceps por detrás de la cabeza', how: 'Codo arriba, mano hacia la espalda, y con la otra mano empujá el codo suave. 30 s por lado.' },
  biceps: { muscle: 'biceps', name: 'Bíceps contra la pared', how: 'Palma apoyada en la pared con el brazo estirado atrás, girá el cuerpo hacia afuera. 30 s por lado.' },
  lats: { muscle: 'lats', name: 'Dorsal colgado o en el marco', how: 'Agarrate de un marco o una barra con un brazo y llevá la cadera hacia el otro lado. 30 s por lado.' },
  upper_back: { muscle: 'upper_back', name: 'Abrazo de espalda', how: 'Abrazate fuerte y redondeá la espalda alta, respirando hondo. 30 s.' },
  traps: { muscle: 'traps', name: 'Cuello lateral', how: 'Inclinás la cabeza hacia un hombro y con la mano la ayudás suave. 20 s por lado.' },
  lower_back: { muscle: 'lower_back', name: 'Rodillas al pecho', how: 'Boca arriba, abrazá las rodillas contra el pecho y balanceate suave. 30 s.' },
  quads: { muscle: 'quads', name: 'Cuádriceps de pie', how: 'Agarrá el empeine y llevá el talón a la cola, rodillas juntas. 30 s por pierna.' },
  hamstrings: { muscle: 'hamstrings', name: 'Isquios con pierna estirada', how: 'Talón apoyado en un banco, espalda recta, inclinate desde la cadera. 30 s por pierna.' },
  glutes: { muscle: 'glutes', name: 'Figura 4', how: 'Boca arriba, tobillo sobre la rodilla contraria y acercá las piernas al pecho. 30 s por lado.' },
  adductors: { muscle: 'adductors', name: 'Mariposa', how: 'Sentado, plantas juntas, dejá caer las rodillas hacia afuera. 30 s.' },
  abductors: { muscle: 'abductors', name: 'Cadera cruzada', how: 'Sentado, cruzá una pierna sobre la otra y girá el torso hacia ella. 30 s por lado.' },
  calves: { muscle: 'calves', name: 'Gemelos contra la pared', how: 'Pierna de atrás estirada y talón en el piso, empujá la pared. 30 s por pierna.' },
  abs: { muscle: 'abs', name: 'Cobra', how: 'Boca abajo, manos bajo los hombros, estirá los brazos y mirá al frente. 20 s.' },
  forearms: { muscle: 'forearms', name: 'Antebrazos', how: 'Brazo estirado, palma arriba y después abajo, tirando suave de los dedos. 20 s cada uno.' },
};

const MOBILITY: Record<string, string[]> = {
  chest: ['círculos de brazos', 'aperturas con banda'], front_delts: ['círculos de brazos'], delts: ['círculos de brazos', 'rotaciones con banda'],
  triceps: ['círculos de brazos'], biceps: ['círculos de brazos'], lats: ['rotaciones de tronco', 'colgarte 20 s de la barra'],
  upper_back: ['remo con banda', 'rotaciones de tronco'], traps: ['encogimientos suaves'], lower_back: ['gato-vaca'],
  quads: ['sentadillas sin peso', 'zancadas caminando'], hamstrings: ['balanceos de pierna adelante-atrás'], glutes: ['puentes de glúteo', 'zancadas caminando'],
  adductors: ['balanceos de pierna laterales'], abductors: ['balanceos de pierna laterales'], calves: ['elevaciones de talón'], abs: ['plancha 20 s'],
};

const round25 = (kg: number) => Math.max(0, Math.round(kg / 2.5) * 2.5);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const listEs = (xs: string[]) => (xs.length <= 1 ? xs.join('') : xs.slice(0, -1).join(', ') + ' y ' + xs[xs.length - 1]);

/** How an exercise went: did it hold its reps? */
export function exerciseStatus(e: CoachExercise): { struggled: boolean; topped: boolean; why: string | null } {
  const done = e.sets.filter((s) => s.reps != null && s.reps >= 0);
  if (!done.length) return { struggled: false, topped: false, why: null };
  const reps = done.map((s) => s.reps!);
  const first = reps[0]!, last = reps[reps.length - 1]!;
  const sameKg = done.every((s) => (s.kg ?? 0) >= (done[0]!.kg ?? 0) - 0.01);
  const drop = first > 0 && sameKg && reps.length >= 2 ? (first - last) / first : 0;
  const missed = e.targetMin != null ? reps.filter((r) => r < e.targetMin!).length : 0;
  const skipped = e.plannedSets != null ? Math.max(0, e.plannedSets - done.length) : 0;
  const reasons: string[] = [];
  if (drop >= 0.35) reasons.push('pasaste de ' + first + ' a ' + last + ' repeticiones');
  if (e.targetMin != null && missed * 2 >= reps.length && missed > 0) reasons.push(missed + ' de ' + reps.length + ' series por debajo de ' + e.targetMin);
  if (skipped > 0) reasons.push(skipped === 1 ? 'dejaste 1 serie sin hacer' : 'dejaste ' + skipped + ' series sin hacer');
  const top = e.targetMax ?? (e.targetMin != null ? e.targetMin + 3 : null);
  const topped = top != null && skipped === 0 && reps.length >= 2 && reps.every((r) => r >= top);
  return { struggled: reasons.length > 0, topped, why: reasons.length ? reasons.join(', ') : null };
}

export function workoutCoach(i: CoachInput): CoachResult {
  const ex = i.exercises.filter((e) => e.sets.some((s) => s.reps != null));
  const tips: CoachTip[] = [];
  const st = ex.map((e) => ({ e, s: exerciseStatus(e) }));

  // ── Fatigue ──
  // The first half (the first one of three) is the start; the rest is where fatigue shows.
  const half = Math.max(1, Math.floor(st.length / 2));
  const late = st.slice(half).filter((x) => x.s.struggled);
  const early = st.slice(0, half);
  if (st.length >= 3 && late.length && early.every((x) => !x.s.struggled)) {
    // The early exercise that most likely tired those muscles: shares muscles, else the one with most volume.
    const shares = (a: CoachExercise, b: CoachExercise) => [...a.primary, ...a.secondary].some((m) => b.primary.includes(m) || b.secondary.includes(m));
    const vol = (e: CoachExercise) => e.sets.reduce((a, s) => a + (s.kg ?? 0) * (s.reps ?? 0), 0);
    const culprit = early.map((x) => x.e).filter((e) => late.some((l) => shares(e, l.e))).sort((a, b) => vol(b) - vol(a))[0]
      ?? early.map((x) => x.e).sort((a, b) => vol(b) - vol(a))[0]!;
    const names = late.map((x) => x.e.name);
    tips.push({
      kind: 'fatigue',
      title: 'Llegás cansado a ' + listEs(names),
      body: 'Probá bajar un 10 % el peso de ' + culprit.name + ' para llegar bien a ' + (names.length > 1 ? 'esos' : 'ese') + ', o pasá ' + names[0] + ' más temprano en la rutina.',
      why: late.map((x) => x.e.name + ': ' + x.s.why).join('. ') + '. Los primeros ejercicios salieron completos.',
    });
  } else {
    // Missing from the start: the weight is simply high.
    for (const x of st.filter((y) => y.s.struggled).slice(0, 2)) {
      const kg = Math.max(...x.e.sets.map((s) => s.kg ?? 0));
      tips.push({
        kind: 'fatigue',
        title: 'En ' + x.e.name + ' el peso te quedó alto',
        body: kg > 0 ? 'La próxima probá con ' + nf(round25(kg * 0.9), 1) + ' kg y sumá peso cuando completes todas las repeticiones.' : 'La próxima hacé menos repeticiones por serie y sumá cuando las completes todas.',
        why: x.s.why ?? '',
      });
    }
  }

  // ── Progress ──
  const ready = st.filter((x) => x.s.topped && x.e.sets.some((s) => (s.kg ?? 0) > 0));
  if (ready.length) {
    tips.push({
      kind: 'progress',
      title: 'Listo para subir en ' + listEs(ready.map((x) => x.e.name)),
      body: ready.map((x) => {
        const kg = Math.max(...x.e.sets.map((s) => s.kg ?? 0));
        // Bars move in 2.5 kg steps; light dumbbells and machines in 1-2 kg.
        const next = kg >= 40 ? round25(kg + 2.5) : Math.round(kg + (kg >= 10 ? 2 : 1));
        return x.e.name + ': ' + nf(next, 1) + ' kg';
      }).join(' · ') + '.',
      why: 'Hiciste todas las series en el tope del rango' + (ready[0]!.e.targetMax != null ? ' (' + ready[0]!.e.targetMax + ' o más)' : '') + '.',
    });
  }

  // ── Week balance ──
  const groupSets = (codes: string[]) => codes.reduce((a, c) => a + (i.weekSets[c] ?? 0), 0);
  const pick = (codes: string[], n: number) => {
    const today = new Set(ex.map((e) => e.exerciseId));
    const cands = i.catalog.filter((c) => c.primary.some((m) => codes.includes(m)) && !today.has(c.id));
    const used = i.usedBefore ?? new Set<string>();
    return [...cands.filter((c) => used.has(c.id)), ...cands.filter((c) => !used.has(c.id))].slice(0, n).map((c) => ({ id: c.id, name: c.name }));
  };
  const trainedWeek = Object.values(i.weekSets).reduce((a, b) => a + b, 0);
  if (trainedWeek >= 6) {
    const missing = MUSCLE_GROUPS.filter((g) => groupSets(g.codes) < 1).slice(0, 2);
    for (const g of missing) {
      const suggest = pick(g.codes, 2);
      tips.push({
        kind: 'missing',
        title: 'Esta semana no trabajaste ' + g.label,
        body: suggest.length ? 'La rutina está bien, pero te faltaría ' + g.label + '. Te recomiendo sumar ' + listEs(suggest.map((s) => s.name)) + ', 3 series cada uno.' : 'La rutina está bien, pero te faltaría ' + g.label + '.',
        why: '0 series de ' + g.label + ' en los últimos 7 días. Para crecer y estar compensado conviene trabajar cada grupo al menos 1 o 2 veces por semana.',
        suggest,
      });
    }
    const push = groupSets(['chest', 'front_delts']);
    const pull = groupSets(['lats', 'upper_back']);
    if (push >= 6 && push > pull * 1.5) {
      const suggest = pick(['lats', 'upper_back'], 2);
      tips.push({
        kind: 'balance',
        title: 'Más empuje que tirón',
        body: 'Hiciste bastante más pecho que espalda. Para cuidar los hombros y la postura, sumá ' + (suggest.length ? listEs(suggest.map((s) => s.name)) : 'remos y dominadas') + '.',
        why: nf(push, 0) + ' series de pecho y hombro anterior contra ' + nf(pull, 0) + ' de espalda en 7 días. Lo ideal es parejo o más espalda.',
        suggest,
      });
    }
  }

  // ── Stretches: the muscles worked the most today ──
  const today: Record<string, number> = {};
  for (const e of ex) {
    const n = e.sets.length;
    for (const m of e.primary) today[m] = (today[m] ?? 0) + n;
    for (const m of e.secondary) today[m] = (today[m] ?? 0) + n / 2;
  }
  const worked = workedMuscles(today);
  const stretches = stretchesFor(today);

  // ── Warm-up for next time: mobility for those muscles, then ramp-up sets of the first loaded exercises ──
  const warmup: WarmupStep[] = [];
  const drills = [...new Set(worked.slice(0, 4).flatMap((m) => MOBILITY[m] ?? []))].slice(0, 4);
  if (drills.length) warmup.push({ text: '5 min de movilidad: ' + listEs(drills) + '.' });
  for (const e of ex.filter((x) => Math.max(...x.sets.map((s) => s.kg ?? 0)) >= 20).slice(0, 2)) {
    const kg = Math.max(...e.sets.map((s) => s.kg ?? 0));
    const steps = [[0.5, 8], [0.7, 5], [0.85, 2]].map(([p, r]) => nf(round25(kg * p!), 1) + ' kg × ' + r);
    warmup.push({ text: e.name + ' (trabajás con ' + nf(kg, 1) + ' kg): ' + steps.join(', ') + ', con poco descanso.' });
  }

  return { tips, stretches, warmup };
}

/** Sets per muscle code from a list of (exercise, sets) — primary counts 1 and secondary ½. */
export function setsPerMuscle(rows: Array<{ primary: string[]; secondary: string[]; sets: number }>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    for (const m of r.primary) out[m] = (out[m] ?? 0) + r.sets;
    for (const m of r.secondary) out[m] = (out[m] ?? 0) + r.sets / 2;
  }
  return out;
}

/** Muscles from most to least worked (only those with a stretch). */
const workedMuscles = (score: Record<string, number>) =>
  Object.entries(score).filter(([m, v]) => STRETCH[m] && v > 0).sort((a, b) => b[1] - a[1]).map(([m]) => m);

/** The stretches for the muscles worked the most (score: sets, or any weight per muscle code). */
export function stretchesFor(score: Record<string, number>, n = 5): CoachStretch[] {
  return workedMuscles(score).slice(0, n).map((m) => STRETCH[m]!);
}
