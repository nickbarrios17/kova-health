/** Workout math and the session state machine. Mirrors the SQL in migrations/…_workouts.sql. */

export type SessionStatus = 'in_progress' | 'paused' | 'completed' | 'abandoned';
export type SessionAction = 'pause' | 'resume' | 'complete' | 'abandon';
export type SetType = 'warmup' | 'working' | 'drop' | 'failure';

export interface SetLike {
  weight_kg: number | null;
  reps: number | null;
  set_type?: SetType;
  deleted_at?: string | null;
}

const TARGET: Record<SessionAction, SessionStatus> = {
  pause: 'paused',
  resume: 'in_progress',
  complete: 'completed',
  abandon: 'abandoned',
};

export const isTerminal = (s: SessionStatus) => s === 'completed' || s === 'abandoned';

/**
 * Next status, or `null` if the action is not allowed.
 * Repeating the current state is a no-op (returns the same status), as in `transition_session`.
 */
export function nextStatus(current: SessionStatus, action: SessionAction): SessionStatus | null {
  const target = TARGET[action];
  if (target === current) return current;
  if (isTerminal(current)) return null;
  if (action === 'resume' && current !== 'paused') return null;
  if (action === 'pause' && current !== 'in_progress') return null;
  return target;
}

const counts = (s: SetLike) => !s.deleted_at && s.set_type !== 'warmup';

/** Epley estimate, only for 1–12 reps; `null` otherwise. Same rule as the `exercise_history` view. */
export function estimateOneRepMax(weightKg: number | null, reps: number | null): number | null {
  if (weightKg == null || reps == null || reps < 1 || reps > 12) return null;
  if (reps === 1) return weightKg;
  return Math.round(weightKg * (1 + reps / 30) * 100) / 100;
}

/** Sum of weight × reps over working sets, in kg. */
export function volumeKg(sets: SetLike[]): number {
  return sets.filter(counts).reduce((acc, s) => acc + (s.weight_kg ?? 0) * (s.reps ?? 0), 0);
}

export function topSet(sets: SetLike[]): SetLike | null {
  return sets.filter(counts).reduce<SetLike | null>(
    (best, s) => (s.weight_kg != null && (best == null || s.weight_kg > (best.weight_kg ?? -1)) ? s : best),
    null,
  );
}

/**
 * A session's top weight is a PR when it beats the previous best.
 * With no previous history there is nothing to beat, so it is not a PR (prototype rule).
 */
export function isPersonalRecord(sessionSets: SetLike[], previousMaxKg: number | null | undefined): boolean {
  const top = topSet(sessionSets)?.weight_kg;
  return top != null && previousMaxKg != null && top > previousMaxKg;
}

/** Active seconds = wall time − paused time (including an ongoing pause). */
export function activeDurationSeconds(
  s: { started_at: string; ended_at: string | null; paused_at: string | null; total_paused_s: number },
  now: Date = new Date(),
): number {
  const end = s.ended_at ? Date.parse(s.ended_at) : now.getTime();
  const ongoingPause = s.paused_at ? Math.max(0, now.getTime() - Date.parse(s.paused_at)) : 0;
  return Math.max(0, Math.floor((end - Date.parse(s.started_at) - ongoingPause) / 1000) - s.total_paused_s);
}
