# ADR 0004 — Time and local dates

**Status:** accepted

## Decision
- All instants are `timestamptz` (stored UTC).
- Records that belong to a day (sessions now; meals, habit logs and measurements later) also store:
  - `time_zone`: the IANA zone at the time of the event, taken from the client or else the user's preference, and validated against `pg_timezone_names`.
  - `local_date`: `(started_at at time zone time_zone)::date`, computed **in the database** at write time.
- Daily reports group by `local_date`, so a 23:30 workout in Madrid stays on that Madrid day even if the user later moves to another time zone.
- `user_preferences.week_start` (1 = Monday, the default per the prototypes) drives weekly aggregations.

## Consequences
- Travel does not move past days.
- `localDate()` in `@vida/domain` mirrors the SQL computation for offline display and is tested across DST transitions.
