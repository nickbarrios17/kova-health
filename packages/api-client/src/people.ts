/**
 * Coach and friends (docs/coach.md). Every read of another person's data goes through RPCs that check
 * the link in the database; nothing here widens what the normal queries return.
 */
import { SaveRoutineSchema, type LinkKind, type PersonLink, type SaveRoutineInput } from '@kova/domain';

interface PeopleDeps {
  rpc: <T = unknown>(fn: string, args: Record<string, unknown>) => Promise<T>;
}

const CODE = /^[A-HJ-NP-Z2-9]{6}$/;
/** Normalizes what someone types or pastes ("abc 123", a whole invite link) to the 6-character code. */
export function inviteCode(raw: string): string | null {
  const m = raw.toUpperCase().match(/[A-HJ-NP-Z2-9]{6}(?![A-Z0-9])/g);
  const c = m?.at(-1) ?? raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return CODE.test(c) ? c : null;
}

export interface CoachRoutine {
  id: string;
  name: string;
  schedule_days: number[];
  version: number;
  assigned_by: string | null;
  routine_exercises: Array<{
    id: string; exercise_id: string; exercise_name: string; position: number; target_sets: number;
    target_reps_min: number | null; target_reps_max: number | null; target_rest_s: number | null;
    target_load_kg: number | null; notes: string | null;
  }>;
}

export function createPeople({ rpc }: PeopleDeps) {
  return {
    /** A one-use code, valid 7 days. 'coach': whoever accepts becomes your student. 'friend': you see each other. */
    createInvite: (kind: LinkKind) => rpc<{ code: string; kind: LinkKind; expires_at: string }>('create_invite', { p_kind: kind }),
    /** Who invites and as what, before accepting; null when the code does not exist. */
    inviteInfo: async (code: string) => {
      const rows = await rpc<Array<{ kind: LinkKind; inviter_name: string; valid: boolean }>>('invite_info', { p_code: code });
      return rows[0] ?? null;
    },
    acceptInvite: (code: string) => rpc<{ id: string; kind: LinkKind }>('accept_invite', { p_code: code }),
    /** Your links both ways: people you coach or follow (role 'viewer') and people who see you ('owner'). */
    links: () => rpc<PersonLink[]>('my_links', {}),
    endLink: (linkId: string) => rpc<null>('end_link', { p_link_id: linkId }),
    /** What else a viewer of yours sees, besides your training. */
    setShares: (linkId: string, s: { body: boolean; nutrition: boolean; health: boolean }) =>
      rpc<unknown>('set_link_shares', { p_link_id: linkId, p_body: s.body, p_nutrition: s.nutrition, p_health: s.health }),

    // ── As a coach (phase 2): the student's routines. FORBIDDEN unless you are their coach. ──
    /** The student's routines, items in order, each with `exercise_name`. */
    routines: (ownerId: string) => rpc<CoachRoutine[]>('coach_routines', { p_owner: ownerId }),
    /** The student's own exercises (the catalog comes from exercises.catalog()). */
    exercises: (ownerId: string) => rpc<Array<{ id: string; name: string; short_name: string | null }>>('coach_exercises', { p_owner: ownerId }),
    /** A new exercise owned by the student. Idempotent on input.id. */
    createExercise: (ownerId: string, e: { id: string; name: string; slug: string }) =>
      rpc<string>('coach_create_exercise', { p_owner: ownerId, p_id: e.id, p_name: e.name, p_slug: e.slug }),
    /** Create (expected_version omitted) or replace a student routine; same rules as routines.save. */
    saveRoutine: (ownerId: string, input: SaveRoutineInput) => {
      const r = SaveRoutineSchema.parse(input);
      return rpc<{ id: string; version: number }>('coach_save_routine', {
        p_owner: ownerId, p_id: r.id, p_name: r.name, p_items: r.items, p_schedule_days: r.schedule_days,
        p_notes: r.notes ?? null, p_expected_version: r.expected_version ?? null,
      });
    },
    deleteRoutine: (ownerId: string, routineId: string) => rpc<null>('coach_delete_routine', { p_owner: ownerId, p_id: routineId }),
  };
}
