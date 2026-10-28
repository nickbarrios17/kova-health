/**
 * Live workout engine. Local state is persisted on every change (recoverable after a crash) and every
 * server write goes through the durable outbox with client UUIDs, so it works offline and retries are
 * safe (docs/sync.md). The server stays authoritative.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { localDate, newId, VidaError } from '@vida/domain';
import { outbox, vida } from './client';

export interface LiveSet {
  id: string;
  w: number | null; // kg
  reps: number | null;
  done: boolean;
  completedAt?: string;
}

export interface LiveExercise {
  id: string; // workout_session_exercises.id (client-generated)
  exercise_id: string;
  name: string;
  rest_s: number;
  prevKg: number | null;
  bestKg: number | null; // for PR detection
  sets: LiveSet[];
}

export interface LiveSession {
  id: string;
  name: string;
  startedAt: string;
  pausedAt: string | null;
  pausedS: number;
  cur: number;
  exercises: LiveExercise[];
  restEndsAt: string | null;
  restTotal: number;
}

const KEY = 'vida:live-session';

export async function loadLive(): Promise<LiveSession | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as LiveSession) : null;
  } catch {
    return null;
  }
}

export async function saveLive(s: LiveSession | null) {
  if (s) await AsyncStorage.setItem(KEY, JSON.stringify(s));
  else await AsyncStorage.removeItem(KEY);
}

const flush = () => outbox.flush().catch(() => undefined);

export interface RoutineForStart {
  id: string;
  name: string;
  routine_exercises: Array<{
    exercise_id: string; position: number; target_sets: number; target_reps_min: number | null;
    target_reps_max: number | null; target_rest_s: number | null; target_load_kg: number | null;
  }>;
}

/** Builds the snapshot client-side (offline-capable) and queues start_session. */
export async function startFromRoutine(
  routine: RoutineForStart,
  names: Map<string, string>,
  lastKg: Map<string, number>,
  bestKg: Map<string, number>,
  deviceId: string | null,
  timeZone: string,
): Promise<LiveSession> {
  const id = newId();
  const items = [...routine.routine_exercises].sort((a, b) => a.position - b.position);
  const exercises: LiveExercise[] = items.map((it) => {
    const w = lastKg.get(it.exercise_id) ?? (it.target_load_kg != null ? Number(it.target_load_kg) : null);
    return {
      id: newId(),
      exercise_id: it.exercise_id,
      name: names.get(it.exercise_id) ?? 'Ejercicio',
      rest_s: it.target_rest_s ?? 90,
      prevKg: lastKg.get(it.exercise_id) ?? null,
      bestKg: bestKg.get(it.exercise_id) ?? null,
      sets: Array.from({ length: it.target_sets }, () => ({ id: newId(), w, reps: it.target_reps_min, done: false })),
    };
  });
  const startedAt = new Date().toISOString();
  await outbox.enqueue({
    kind: 'start_session',
    input: {
      id,
      routine_id: routine.id,
      name: routine.name,
      started_at: startedAt,
      time_zone: timeZone,
      device_id: deviceId,
      exercises: exercises.map((e, position) => {
        const src = items[position]!;
        return {
          id: e.id, exercise_id: e.exercise_id, position, planned_sets: src.target_sets,
          planned_reps_min: src.target_reps_min, planned_reps_max: src.target_reps_max,
          planned_rest_s: src.target_rest_s, planned_load_kg: src.target_load_kg != null ? Number(src.target_load_kg) : null,
        };
      }),
    },
  });
  const s: LiveSession = { id, name: routine.name, startedAt, pausedAt: null, pausedS: 0, cur: 0, exercises, restEndsAt: null, restTotal: 0 };
  await saveLive(s);
  flush();
  return s;
}

/** Marks a set done (queues record_set) and starts the rest timer. Unmarking deletes it online. */
export async function toggleSet(s: LiveSession, exIdx: number, setIdx: number, deviceId: string | null): Promise<LiveSession> {
  const ex = s.exercises[exIdx]!;
  const set = ex.sets[setIdx]!;
  if (!set.done) {
    if (set.reps == null || set.reps < 0) throw new VidaError('INVALID_INPUT', 'Indica las repeticiones.');
    const completedAt = new Date().toISOString();
    await outbox.enqueue({
      kind: 'record_set',
      input: { id: set.id, session_exercise_id: ex.id, set_index: setIdx, weight_kg: set.w, reps: set.reps, completed_at: completedAt, device_id: deviceId },
    });
    const next = patchSet(s, exIdx, setIdx, { done: true, completedAt });
    next.restEndsAt = new Date(Date.now() + ex.rest_s * 1000).toISOString();
    next.restTotal = ex.rest_s;
    await saveLive(next);
    flush();
    return next;
  }
  // Undo: the set may still be queued; flush first, then soft-delete on the server.
  await outbox.flush().catch(() => undefined);
  await vida.workouts.deleteSet(set.id);
  // Re-recording needs a new id (the old one is now a tombstone).
  const next = patchSet(s, exIdx, setIdx, { done: false, completedAt: undefined, id: newId() });
  await saveLive(next);
  return next;
}

export function patchSet(s: LiveSession, exIdx: number, setIdx: number, patch: Partial<LiveSet>): LiveSession {
  return {
    ...s,
    exercises: s.exercises.map((e, i) => (i !== exIdx ? e : { ...e, sets: e.sets.map((x, j) => (j === setIdx ? { ...x, ...patch } : x)) })),
  };
}

/**
 * Sets one field and carries it forward to the later, not-yet-done sets of the same exercise that
 * were still empty or still held the previous value, so a load typed once applies to the rest.
 */
export function fillForward(s: LiveSession, exIdx: number, setIdx: number, field: 'w' | 'reps', value: number | null): LiveSession {
  const sets = s.exercises[exIdx]!.sets;
  const prev = sets[setIdx]![field];
  return {
    ...s,
    exercises: s.exercises.map((e, i) => (i !== exIdx ? e : {
      ...e,
      sets: e.sets.map((x, j) => (j === setIdx || (j > setIdx && !x.done && value != null && (x[field] == null || x[field] === prev)) ? { ...x, [field]: value } : x)),
    })),
  };
}

export function addSet(s: LiveSession, exIdx: number): LiveSession {
  const ex = s.exercises[exIdx]!;
  const last = ex.sets[ex.sets.length - 1];
  return { ...s, exercises: s.exercises.map((e, i) => (i !== exIdx ? e : { ...e, sets: [...e.sets, { id: newId(), w: last?.w ?? null, reps: last?.reps ?? null, done: false }] })) };
}

export async function transition(s: LiveSession, action: 'pause' | 'resume' | 'complete' | 'abandon'): Promise<LiveSession | null> {
  const at = new Date().toISOString();
  await outbox.enqueue({ kind: 'transition_session', input: { id: s.id, action, at } });
  flush();
  if (action === 'complete' || action === 'abandon') {
    await saveLive(null);
    return null;
  }
  const next =
    action === 'pause'
      ? { ...s, pausedAt: at, restEndsAt: null }
      : { ...s, pausedAt: null, pausedS: s.pausedS + (s.pausedAt ? Math.max(0, (Date.now() - Date.parse(s.pausedAt)) / 1000) : 0) };
  await saveLive(next);
  return next;
}

export function elapsedS(s: LiveSession, now = Date.now()) {
  const end = s.pausedAt ? Date.parse(s.pausedAt) : now;
  return Math.max(0, (end - Date.parse(s.startedAt)) / 1000 - s.pausedS);
}

export interface Summary {
  name: string;
  durationS: number;
  volumeKg: number;
  sets: number;
  rows: Array<{ name: string; topKg: number | null; reps: number | null; pr: boolean }>;
  date: string;
}

export function summarize(s: LiveSession, timeZone: string): Summary {
  let volume = 0, sets = 0;
  const rows = s.exercises.map((e) => {
    const done = e.sets.filter((x) => x.done);
    done.forEach((x) => { volume += (x.w ?? 0) * (x.reps ?? 0); sets++; });
    const top = done.reduce<LiveSet | null>((m, x) => (x.w != null && (!m || x.w > (m.w ?? -1)) ? x : m), null);
    return { name: e.name, topKg: top?.w ?? null, reps: top?.reps ?? null, pr: top?.w != null && e.bestKg != null && top.w > e.bestKg };
  });
  return { name: s.name, durationS: elapsedS(s), volumeKg: volume, sets, rows, date: localDate(new Date(), timeZone) };
}
