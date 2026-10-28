-- Fix: account deletion failed for users who own an exercise that one of their routines or
-- workout sessions uses (e.g. any exercise created by the routine importer).
-- Deleting auth.users cascades to both public.exercises (owner_id) and public.routine_exercises /
-- public.workout_session_exercises (via routines / sessions). The NO ACTION check on exercise_id was
-- evaluated in the middle of that cascade, before the referencing rows were gone, so the whole delete
-- was rejected with 23503.
-- Making both foreign keys DEFERRABLE INITIALLY DEFERRED moves the check to commit time, when the
-- cascade has finished. Deleting an own exercise that is still in use keeps failing (at commit).

alter table public.routine_exercises
  alter constraint routine_exercises_exercise_id_fkey deferrable initially deferred;

alter table public.workout_session_exercises
  alter constraint workout_session_exercises_exercise_id_fkey deferrable initially deferred;
