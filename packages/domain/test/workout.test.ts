import { describe, expect, it } from 'vitest';
import {
  activeDurationSeconds,
  estimateOneRepMax,
  isPersonalRecord,
  nextStatus,
  topSet,
  volumeKg,
  type SetLike,
} from '../src/workout.js';

describe('session state machine', () => {
  it('allows the prototype flow: start → pause → resume → complete', () => {
    expect(nextStatus('in_progress', 'pause')).toBe('paused');
    expect(nextStatus('paused', 'resume')).toBe('in_progress');
    expect(nextStatus('in_progress', 'complete')).toBe('completed');
    expect(nextStatus('paused', 'abandon')).toBe('abandoned');
  });

  it('treats repeated actions as no-ops (safe retries)', () => {
    expect(nextStatus('paused', 'pause')).toBe('paused');
    expect(nextStatus('completed', 'complete')).toBe('completed');
  });

  it('never leaves a terminal state', () => {
    expect(nextStatus('completed', 'resume')).toBeNull();
    expect(nextStatus('completed', 'pause')).toBeNull();
    expect(nextStatus('abandoned', 'complete')).toBeNull();
    expect(nextStatus('completed', 'abandon')).toBeNull();
  });

  it('rejects resume when not paused', () => {
    expect(nextStatus('in_progress', 'resume')).toBe('in_progress'); // no-op
    expect(nextStatus('abandoned', 'resume')).toBeNull();
  });
});

describe('workout math', () => {
  const sets: SetLike[] = [
    { weight_kg: 60, reps: 10, set_type: 'warmup' },
    { weight_kg: 90, reps: 6 },
    { weight_kg: 92.5, reps: 5 },
    { weight_kg: 95, reps: 3, deleted_at: '2026-10-24T10:00:00Z' },
  ];

  it('sums working-set volume, excluding warm-ups and deleted sets', () => {
    expect(volumeKg(sets)).toBe(90 * 6 + 92.5 * 5);
  });

  it('finds the top working set', () => {
    expect(topSet(sets)?.weight_kg).toBe(92.5);
    expect(topSet([])).toBeNull();
  });

  it('estimates 1RM with Epley only for 1–12 reps', () => {
    expect(estimateOneRepMax(100, 1)).toBe(100);
    expect(estimateOneRepMax(100, 5)).toBe(116.67);
    expect(estimateOneRepMax(100, 13)).toBeNull();
    expect(estimateOneRepMax(null, 5)).toBeNull();
  });

  it('flags a PR only when there is history to beat', () => {
    expect(isPersonalRecord(sets, 90)).toBe(true);
    expect(isPersonalRecord(sets, 92.5)).toBe(false);
    expect(isPersonalRecord(sets, null)).toBe(false);
  });

  it('computes active duration net of pauses, including an ongoing pause', () => {
    const base = { started_at: '2026-10-24T10:00:00Z', total_paused_s: 120 };
    expect(activeDurationSeconds({ ...base, ended_at: '2026-10-24T11:00:00Z', paused_at: null })).toBe(3480);
    const now = new Date('2026-10-24T10:30:00Z');
    expect(activeDurationSeconds({ ...base, ended_at: null, paused_at: '2026-10-24T10:25:00Z' }, now)).toBe(1380);
  });
});
