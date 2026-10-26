# ADR 0005 — Sync protocol

**Status:** accepted (v1, workout domain)

## Decision
The protocol has these parts:
1. **Server authoritative.** Postgres is the source of truth. Clients cache data for display.
2. **Push = outbox of idempotent RPC calls.** Each call is keyed by a client UUID (ADR 0002). An entry stays *pending* until the server acknowledges it, and is then *confirmed*.
3. **Pull = `updated_at` cursor.** Each table is read with `updated_at > cursor`, ordered by `(updated_at, id)`, with tombstones (`deleted_at`) included.
4. **Conflict rules per entity type:**
   - Sets: append-only by id. Two devices recording different sets both win.
   - Session status: a monotonic state machine. `completed` and `abandoned` are terminal, and a stale `pause` after `complete` is rejected.
   - Routines and profile: optimistic concurrency (`expected_version` or `updated_at`). A mismatch returns `VERSION_CONFLICT` and the client re-fetches.
   - Otherwise: last write wins on server time.
5. **One active session per user**, enforced by a partial unique index, so a phone and a watch cannot fork a workout.

Full details and the offline matrix are in [../sync.md](../sync.md).

## Not doing (yet)
CRDTs, vector clocks and realtime push. Supabase Realtime can be added later for "live on another screen" without changing this protocol.
