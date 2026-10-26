# ADR 0002 — Client-generated UUIDs

**Status:** accepted

## Context
The watch must record sets offline, and every client must retry safely after timeouts.

## Decision
Synced entities (sessions, session exercises, sets, routines, routine items, devices) use a `uuid` primary key that **the client generates** (UUID v4 via `crypto.randomUUID()`, or `java.util.UUID` on Kotlin). The server keeps `default gen_random_uuid()` for callers that don't provide one.

The create RPCs are idempotent on that id:
- Replaying the same id returns the stored row.
- An id that belongs to another user is indistinguishable from a not-found error, so nothing leaks.

## Consequences
- No separate idempotency-key table is needed.
- Ids are stable across devices from the moment of creation, so offline references between rows (a set → its session) work before the first sync.
- A client must never reuse an id for a different payload. A replay with a different payload returns the original row unchanged.
