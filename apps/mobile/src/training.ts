import { kova } from './client';
import type { RoutineForStart } from './workout';

export interface TrainingData {
  routines: Array<RoutineForStart & {
    schedule_days: number[];
    version: number;
    routine_exercises: Array<RoutineForStart['routine_exercises'][number] & { notes: string | null }>;
  }>;
  names: Map<string, string>;
  lastKg: Map<string, number>;
  bestKg: Map<string, number>;
}

/** Routines + exercise names + last/best weights (for prefilled sets and PR detection). */
export async function loadTraining(): Promise<TrainingData> {
  const [routines, exercises, history, records] = await Promise.all([
    kova.routines.list(),
    kova.exercises.search({ limit: 100 }),
    kova.workouts.recentHistory(500),
    kova.workouts.personalRecords(),
  ]);
  const names = new Map((exercises as Array<{ id: string; name: string; short_name: string | null }>).map((e) => [e.id, e.short_name ?? e.name]));
  const lastKg = new Map<string, number>();
  const lastSession = new Map<string, string>();
  for (const h of history as Array<{ exercise_id: string; session_id: string; weight_kg: number | string | null }>) {
    if (h.weight_kg == null) continue;
    const s = lastSession.get(h.exercise_id);
    if (s && s !== h.session_id) continue;
    lastSession.set(h.exercise_id, h.session_id);
    lastKg.set(h.exercise_id, Math.max(lastKg.get(h.exercise_id) ?? 0, Number(h.weight_kg)));
  }
  const bestKg = new Map(
    (records as Array<{ exercise_id: string; max_weight_kg: number | string | null }>)
      .filter((r) => r.max_weight_kg != null)
      .map((r) => [r.exercise_id, Number(r.max_weight_kg)]),
  );
  return { routines: routines as TrainingData['routines'], names, lastKg, bestKg };
}

export function scheme(it: { target_sets: number; target_reps_min: number | null; target_reps_max: number | null }) {
  const reps = it.target_reps_min == null ? null
    : it.target_reps_max == null || it.target_reps_max === it.target_reps_min ? String(it.target_reps_min)
    : it.target_reps_min + '–' + it.target_reps_max;
  return it.target_sets + (reps ? '×' + reps : ' series');
}
