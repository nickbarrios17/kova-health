# API and data access

All clients call Supabase (PostgREST + RPC) **with the signed-in user's JWT**. Authorization is RLS in Postgres. There is no "admin mode" in clients.
- TypeScript clients use `@vida/api-client`.
- The Wear OS app calls the same HTTP endpoints: `POST {SUPABASE_URL}/rest/v1/rpc/<fn>` with headers `apikey: <anon>` and `Authorization: Bearer <user JWT>`.

## Conventions
- **Validation.** Zod schemas in `@vida/domain/schemas.ts` validate input before any request. Postgres constraints, triggers and RPC checks re-validate at the trust boundary.
- **Errors.** Every failure becomes `VidaError { code, message, retryable }`. The message is a safe Spanish string, and SQL text is never shown. SQL raises domain errors with SQLSTATE `VDxxx`:

  | SQLSTATE | code | HTTP (PostgREST) | Retry? |
  | --- | --- | --- | --- |
  | VD001 | ACTIVE_SESSION_EXISTS | 400 | no: join the active session |
  | VD002 | VERSION_CONFLICT | 400 | no: reload |
  | VD003 | SESSION_CLOSED | 400 | no |
  | VD004 | INVALID_TRANSITION | 400 | no |
  | VD005 | INVALID_INPUT | 400 | no |
  | VD404 | NOT_FOUND | 400 | no (also covers "not yours") |
  | 23505 / 23503 / 23514 / 42501 | CONFLICT / NOT_FOUND / INVALID_INPUT / FORBIDDEN | 409 / 409 / 400 / 403 | no |
  | network, 5xx | NETWORK | — | yes, only for idempotent calls |
- **Idempotency.** Every write RPC is keyed by a client-generated UUID. `withRetry` (exponential backoff with jitter, 4 attempts) wraps only those calls.
- **Pagination.** Catalog search uses `limit`/`offset` (max 100). Sync and history use keyset pagination on `(updated_at, id)` or `completed_at`.
- **Filtering and sorting.** Exercises filter by `q` (name, case-insensitive, LIKE-escaped), `muscle` and `equipment`, sorted by name. Summaries sort by `local_date desc`.
- **Units.** Weights are always kg in and out; convert in the UI with `toDisplayWeight` and `fromDisplayWeight`.

## RPCs

| Function | Purpose | Idempotent on |
| --- | --- | --- |
| `save_routine(p_id, p_name, p_items, p_schedule_days, p_notes, p_expected_version)` | Create, or replace items atomically. `p_expected_version = null` means create. | `p_id` (create) |
| `duplicate_routine(p_source_id, p_new_id, p_name)` | Copy a routine | `p_new_id` |
| `start_session(p_id, p_routine_id, p_name, p_exercises, p_started_at, p_time_zone, p_device_id)` | Start a workout. Snapshots the routine, or uses the client's `p_exercises`. | `p_id` |
| `record_set(p_id, p_session_exercise_id, p_set_index, p_weight_kg, p_reps, p_duration_s, p_distance_m, p_rpe, p_rest_s, p_set_type, p_completed_at, p_device_id)` | Log a set | `p_id` |
| `transition_session(p_id, p_action, p_at)` | `pause\|resume\|complete\|abandon` | state (repeat = no-op) |
| `export_my_data()` | Full JSON export of the caller's data | read-only |
| `has_entitlement(p_code)` | Server-side premium check | read-only |

All RPCs are `security invoker`: they run as the caller, under RLS.

## Direct table access (RLS-protected, no RPC needed)

| Resource | Allowed |
| --- | --- |
| `profiles` | select/update own (selected columns only) |
| `user_preferences` | select/update own |
| `devices` | full CRUD own |
| `exercises` (+ `exercise_muscles`, `exercise_equipment`) | read system + own. Write own only. Archive rather than delete. |
| `routines`, `routine_exercises` | CRUD own. Soft delete via `deleted_at`. |
| `workout_sessions`, `workout_session_exercises`, `workout_sets` | CRUD own. Status changes are validated by trigger even on direct updates. |
| `muscle_groups`, `equipment_types`, `entitlements` | read |
| `user_entitlements` | read own (server writes only) |
| Views `exercise_history`, `personal_records`, `session_summaries` | read own (`security_invoker`) |

## Edge Functions

| Function | Auth | Body | Result |
| --- | --- | --- | --- |
| `delete-account` | user JWT | `{"confirm":"DELETE"}` | `200 {deleted:true}`. All data is removed by cascade. |

## Derived metrics (calculation rules)
- **Volume** = Σ weight_kg × reps over non-warm-up, non-deleted sets.
- **e1RM** uses Epley: `w × (1 + reps/30)` for 1 to 12 reps, with `reps = 1` giving `w`. Otherwise it is null.
- **PR** = a session's top weight is greater than the max of all *earlier* completed sessions. No earlier history means no PR.
- **Active duration** = (ended or now − started) − paused time.
- **Energy** (`energy_kcal`) is stored only when a client provides it. `energy_is_estimated` defaults to `true` and must be labelled "estimado" in the UI.
- All of these are computed on read (views) and never stored.
