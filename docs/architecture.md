# Kova Health — Backend architecture

## Shape

```
 apps/web (Next.js)   apps/mobile (Expo)        apps/watch (Kotlin, Wear OS)
        │                    │                          │
        └── @kova/api-client ┘   (supabase-js)          │ PostgREST/RPC over HTTPS
                 │  @kova/domain (Zod, types, math)     │ same contract (docs/api.md)
                 ▼                                      ▼
        Supabase: Auth ─ PostgREST ─ Postgres (RLS on every table) ─ Edge Functions
```

- **One authoritative database.** Devices never have their own databases. Offline clients keep only an outbox of pending operations (`docs/sync.md`).
- **The database is the trust boundary.** Clients talk to PostgREST with the user's JWT, and RLS plus constraints enforce ownership and validity. Business rules that must be atomic or idempotent live in SQL functions marked `security invoker`, so they still run under RLS.
- **Edge Functions** handle only what needs privileges or secrets. Today that is `delete-account`. Later: billing webhooks, AI calls.
- **No microservices.** Modules are separated by schema area and migration file, not by deployment.

## Clients

| Client | Stack | Data access | Offline |
| --- | --- | --- | --- |
| `apps/web` | Next.js 15 + React 19 (static pages, client-side data) | `@kova/api-client` | — (always online) |
| `apps/mobile` | Expo SDK 58 / React Native 0.88 | `@kova/api-client` with AsyncStorage session | Durable outbox (AsyncStorage) + recoverable live session |
| `apps/watch` | Kotlin + Compose for Wear OS (no RN/web) | Minimal HTTPS client (GoTrue + PostgREST), same RPC contract | Durable outbox (SharedPreferences) + recoverable live session |

All three use only the public anon key plus the user's JWT; authorization is RLS. Shared TypeScript logic (schemas, units, workout math, habits, nutrition, insights, formatting) lives in `@kova/domain`; the watch mirrors the few rules it needs in Kotlin.

## Kova Intelligence v1
Deterministic detectors in `packages/domain/src/insights.ts` (no AI, no network): training week (fact), protein vs goal (fact), sleep↔mood (pattern/hypothesis by evidence), weakest habit weekday (pattern), weight trend (least-squares projection), missing sleep data (honest fact). Each insight carries `kind`, `evidence`, `domains`, `support` numbers and a score `severity + evidence + actionable + novelty − fatigue`. `shown_insights` stores what was shown (novelty/fatigue) and feedback. Language rules: patterns never say "porque"; predictions state their assumption; hypotheses are conditional. The core app works without it.

## Modules (migrations)

| Migration | Module | Tables / functions |
| --- | --- | --- |
| `…_foundation.sql` | Accounts, devices, entitlements | `profiles`, `user_preferences`, `devices`, `entitlements`, `user_entitlements`, `has_entitlement()` |
| `…_exercises.sql` | Exercise library | `muscle_groups`, `equipment_types`, `exercises`, `exercise_muscles`, `exercise_equipment` |
| `…_routines.sql` | Routines | `routines`, `routine_exercises`, `save_routine()`, `duplicate_routine()` |
| `…_workouts.sql` | Sessions and sets | `workout_sessions`, `workout_session_exercises`, `workout_sets`, `start_session()`, `record_set()`, `transition_session()`, views `exercise_history`, `personal_records`, `session_summaries` |
| `…_account.sql` | Account | `export_my_data()` |
| `…_touch_parent_definer.sql` | Fix | Account-deletion cascade privileges |
| `…_nutrition.sql` | Nutrition | `foods` (with provenance), `recipes`, `recipe_ingredients`, `meals`, `meal_items` (snapshots), `nutrition_goals`, `log_food()`, views `nutrition_daily`, `recipe_nutrition`, `frequent_foods` |
| `…_habits.sql` | Habits | `habits`, `habit_schedules` (dated versions), `habit_logs`, `save_habit()`, `habit_days()` |
| `…_body_health_goals.sql` | Body and health | `body_measurements`, `health_observations`, `goals`, `record_body_measurements()`, `record_observations()` |
| `…_daily_summaries.sql` | Summaries | `daily_summaries()`, full `export_my_data()` |
| `…_insights.sql` | Intelligence | `shown_insights` (novelty/fatigue + feedback), export v3 |

## Cross-cutting conventions

- **IDs**: `uuid`. Synced rows take a client-generated id (ADR 0002).
- **Ownership**: every user-owned table has `user_id uuid not null references auth.users on delete cascade`. A trigger forbids changing it. Child tables use composite FKs `(parent_id, user_id)` so a row can never point at another user's parent.
- **Timestamps**: `created_at`/`updated_at timestamptz` (UTC), with `updated_at` set by trigger. Records that belong to a day also store `local_date` and `time_zone` (ADR 0004).
- **Soft delete**: synced user data has `deleted_at` (tombstone), so other devices learn about deletions. Catalog lookups hard-delete.
- **Units**: canonical SI-ish: kg, m, s (ADR 0003).
- **History is immutable by construction**: a session copies its planned targets (`workout_session_exercises`) at start, so editing or deleting a routine never rewrites past sessions.
- **Derived data is computed on read** (views with `security_invoker`) until a measured performance need justifies materialising it.
- **Privileges**: `anon` has no table grants beyond the public catalogs' `select`. The service-role key exists only in Edge Function secrets.

## ADRs

- [0001 Stack and monorepo](adr/0001-stack-and-monorepo.md)
- [0002 Client-generated UUIDs](adr/0002-client-generated-ids.md)
- [0003 Canonical units](adr/0003-canonical-units.md)
- [0004 Time and local dates](adr/0004-time-and-local-dates.md)
- [0005 Sync protocol](adr/0005-sync-protocol.md)
