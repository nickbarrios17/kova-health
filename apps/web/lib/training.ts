/** Training view-model helpers shared by Hoy and Entrenamiento. */

export interface ExerciseRow {
  id: string;
  name: string;
  short_name: string | null;
}

export interface RoutineRow {
  id: string;
  name: string;
  schedule_days: number[];
  routine_exercises: Array<{
    id: string;
    exercise_id: string;
    position: number;
    target_sets: number;
    target_reps_min: number | null;
    target_reps_max: number | null;
    target_load_kg: number | null;
  }>;
}

export interface HistoryRow {
  exercise_id: string;
  session_id: string;
  local_date: string;
  completed_at: string;
  weight_kg: number | string | null;
  reps: number | null;
  e1rm_kg: number | string | null;
}

/** Top weight of the most recent session, per exercise (rows must be newest first). */
export function lastWeights(history: HistoryRow[]): Map<string, number> {
  const lastSession = new Map<string, string>();
  const top = new Map<string, number>();
  for (const h of history) {
    if (h.weight_kg == null) continue;
    const s = lastSession.get(h.exercise_id);
    if (s && s !== h.session_id) continue;
    lastSession.set(h.exercise_id, h.session_id);
    top.set(h.exercise_id, Math.max(top.get(h.exercise_id) ?? 0, Number(h.weight_kg)));
  }
  return top;
}

export const exerciseName = (exercises: ExerciseRow[], id: string) => {
  const e = exercises.find((x) => x.id === id);
  return e ? e.short_name ?? e.name : 'Ejercicio';
};

/** Rows like "Sentadilla · 4×6 · 92,5 kg". Weight: last used, else the routine target, else "—". */
export function routineItems(r: RoutineRow, exercises: ExerciseRow[], lastW: Map<string, number>, fw: (kg: number) => string) {
  return [...r.routine_exercises]
    .sort((a, b) => a.position - b.position)
    .map((it) => {
      const reps = it.target_reps_min == null ? null
        : it.target_reps_max == null || it.target_reps_max === it.target_reps_min ? String(it.target_reps_min)
        : it.target_reps_min + '–' + it.target_reps_max;
      const kg = lastW.get(it.exercise_id) ?? (it.target_load_kg != null ? Number(it.target_load_kg) : null);
      return {
        key: it.id,
        name: exerciseName(exercises, it.exercise_id),
        scheme: it.target_sets + (reps ? '×' + reps : ' series'),
        w: kg != null ? fw(kg) : '—',
      };
    });
}
