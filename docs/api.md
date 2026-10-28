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
| `log_food(p_item_id, p_local_date, p_slot, p_quantity, p_food_id \| p_recipe_id \| p_name+macros, p_logged_at, p_device_id)` | Log food into the (day, slot) meal and snapshot its nutrients | `p_item_id` |
| `save_habit(p_id, p_name, p_effective_from, p_kind, p_unit, p_icon, p_frequency, p_days, p_times_per_week, p_target_value)` | Create a habit, or set its schedule version from a date | `p_id` + `p_effective_from` |
| `habit_days(p_from, p_to)` | Per habit and day: scheduled, value, target, completed (≤ 366 days) | read-only |
| `record_body_measurements(p_rows)` | Batch of ≤ 500 measurements. Returns how many were new. | `id` and (`source`, `external_id`) |
| `record_observations(p_rows)` | Batch of ≤ 500 health observations. Returns how many were new. | `id` and (`source`, `external_id`) |
| `daily_summaries(p_from, p_to)` | One row per day (≤ 93 days), computed from source records | read-only |
| `complete_onboarding(p_display_name, p_birth_year, p_height_cm, p_sex, p_activity_level, p_weight_goal, p_goal_pace, p_weight_kg, p_measurement_id, p_kcal, p_protein_g, p_carbs_g, p_fat_g, p_is_estimated, p_time_zone)` | Mandatory first run: saves the profile, the starting weight and the nutrition target from the local today, and sets `onboarding_state = 'done'`. Calling it again recalculates. | `p_measurement_id`; same-day target is replaced |
| `export_my_data()` | Full JSON export of the caller's data (`vida-export/3`, every user table) | read-only |
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
| `foods` | read catalog + own. Write own only; `verified` is catalog-only and needs `source_ref`. |
| `recipes`, `recipe_ingredients`, `meals`, `nutrition_goals` | CRUD own |
| `meal_items` | read, insert, soft-delete own. Snapshot values cannot be updated: to change a quantity, remove the item and log it again. |
| `habits`, `habit_schedules`, `habit_logs` | CRUD own |
| `body_measurements`, `health_observations`, `goals` | CRUD own |
| `shown_insights` | read, insert (one row per insight per day), update `feedback`/`dismissed_at` only |
| Views `nutrition_daily`, `recipe_nutrition`, `frequent_foods` | read own (`security_invoker`) |
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

## Routine import (`packages/domain/src/routineImport.ts`, web page `/importar`)
- Files are read in the browser: `.xlsx` with `read-excel-file` (pinned 9.3.12), `.csv`/`.tsv` with `parseCsv` (detects `;` from Spanish Excel), `.json` with `jsonToRoutines` (Spanish or English keys). `.xls` is rejected with a message.
- `detectColumns` finds the header row (first 15 rows) by synonyms; the user can change the header row and every column in the UI. `planReady` needs an exercise column.
- `sheetToRoutines`: a routine per sheet, per value of a «Rutina» column, or per lone title row («Día A», «Lunes – Pierna»). Cells: «4x8», «8-10», «12/10/8», rest «90», «90s», «1:30», «2 min» (a bare number ≤ 10 means minutes), weight «60 kg», «135 lb» (stored in kg), days «Lun, Jue», «Mon/Thu», «L X V». Missing sets default to 3; out-of-range values are dropped. Each such case is listed as an issue in the preview.
- `matchExercise` links to the catalog by exact name, common aliases (bench press → press de banca…) or a unique partial match; otherwise the preview offers to create a user exercise. Saving creates the new exercises, then calls `save_routine` once per routine with new ids.

## Nutrition rules
- A food's nutrients are given for `ref_amount` of `ref_unit` (`g`, `ml` or `serving`). Portions without known grams ("1 mediano") stay as servings; grams are never invented.
- **Provenance** (`data_source`):

  | Value | Meaning |
  | --- | --- |
  | `verified` | From a trusted database. Catalog only, with `source_ref`. |
  | `label` | Copied from the product label |
  | `user` | Entered by the user |
  | `estimated` | E.g. a photo estimate |

  Show non-verified values with `nutritionSourceLabel()`. Recipes take their least reliable ingredient's source.
- **Snapshots.** `log_food` freezes kcal and macros for the logged quantity. Later edits to the food never change past days.
- **Goals** live in `nutrition_goals`. A change adds a row from a date, so past days keep their goal. `is_estimated = true` means VIDA calculated it during onboarding (shown as an estimate); `false` means the user typed it.
- **Energy** (`packages/domain/src/energy.ts`; the result is always shown as an estimate):
  - **Resting energy, best available method** (`bestRestingEnergy`):
    1. Body fat % known (watch bioimpedance via Health Connect ≤ 30 days, typed, or tape measurements ≤ 90 days) → **Cunningham (1980)**: `500 + 22 × lean mass kg`.
    2. Otherwise, activity level «muy activa» → **Ten-Haaf & Weijs (2014)**: `11.936 × kg + 587.728 × m − 8.129 × age + 191.027 (male) + 29.279`. Most precise equation in athletes (O'Neill 2023 meta-analysis).
    3. Otherwise → **Mifflin-St Jeor (1990)**: `10 × kg + 6.25 × cm − 5 × age + 5` (male) or `− 161` (female). Best general equation without body composition (Frankenfield 2005).
    Any of them can be off by about ±10% for one person; calibrating with the weight trend is future work.
  - **Tape measurements** (`navyBodyFat`, US Navy / Hodgdon & Beckett): neck and waist (at the navel), plus hip for women, in cm. Typical error vs DXA: a few percentage points, larger for very lean or very heavy people.
  - **Onboarding (typical day)** (`energyTarget`): resting × activity factor (sedentary 1.2, light 1.375, moderate 1.55, very active 1.725), then the goal adjustment.
  - **Daily target** (`dailyTarget`, loaded by `energy.today`): resting × 1.2 (sedentary day, includes ~3,000 steps) + that day's activity, of which only 70% is credited and at most +1,200 kcal:
    - steps above 3,000 × kg × 0.0004 kcal (net of resting);
    - workouts completed in VIDA: 3.5 METs above resting × kg × active hours (strength training ≈ 4.5 METs);
    - missing steps (no watch data) use the 7-day average, never zero, and the UI says so.
    It applies when the plan was calculated by VIDA (`nutrition_goals.is_estimated`); a plan typed by the user stays fixed. Protein and fat come from the plan; carbs absorb the day's difference.
  - Goal adjustment: lose −10 / −20 / −25 % (liviano / moderado / agresivo), maintain 0, gain +5 / +10 / +15 %. Rounded to 50 kcal and never below 1,200 kcal (female) or 1,500 kcal (male).
  - Macros: protein 2.0 g/kg when losing, 1.8 g/kg otherwise; fat the larger of 0.8 g/kg and 25 % of energy; carbs the rest.
  - Sex is required for the formulas and is not used for anything else. Age comes from the birth year only, so it can be one year high.
- The system food catalog is **empty** until a verified source is chosen (e.g. USDA FoodData Central or BEDCA), with its licence checked.

## Habit rules
- A habit's schedule and target are versioned by `effective_from`. `habit_days` judges each day with the version in force that day, so editing a habit never rewrites history.
- `daily` habits apply on the listed ISO weekdays (empty means every day). `weekly` habits need `times_per_week`.
- Several logs per day add up. A day is complete when the sum is at least the target (default 1).
- Streaks and rates are computed client-side with `dailyStreak` (optional `allowedMissesPerWeek` for flexible streaks), `weeklyStreak`, `weeklyProgress` and `completionRate`. An unfinished *today* never breaks a streak.

## Body and health data
- Every row has `source` (`manual`, `health_connect`, `healthkit`, `wear_os`, `import`), an optional `source_app`, an `external_id` for de-duplication, and `is_estimated`.
- Units are fixed per metric: weight in kg, circumferences in cm, sleep and active time in minutes, HRV in ms (RMSSD), heart rate in bpm, distance in m, energy in kcal, mood 1–5, stress 0–100.
- `local_date` comes from the event time in the user's time zone. Sleep is assigned to the **wake-up** day.
- Vendor sleep scores are stored only when the vendor provides them (`details.vendor_score`). They are never computed by VIDA.

## Daily summaries (`calc_version` 1)

| Field | Rule |
| --- | --- |
| workouts_* | Completed sessions of that `local_date` (count, active seconds, volume) |
| kcal, macros | Sum of non-deleted meal item snapshots. `nutrition_has_unverified` is true if any item is `user`/`estimated`. |
| *_goal | The `nutrition_goals` row with the latest `effective_from` on or before the day |
| habits_* | Daily habits scheduled that day, and how many were completed |
| weight_kg | Last weight measurement of the day |
| steps, sleep_min | Summed per source, then the **largest** source total, so the phone and the watch aren't double-counted |
| resting_hr_bpm, hrv_rmssd_ms | Average of that day's readings |
| mood | Latest check-in of the day |

Missing data is `null`, never `0` or a default (except counts of zero events). Change `calc_version` whenever a rule changes.

## VIDA Intelligence (client-side)
`vida.insights.today(localDate, limit)` loads 60 days of `daily_summaries` + `habit_days`, runs `generateInsights` from `@vida/domain`, ranks with novelty/fatigue from `shown_insights` (last 14 days) and records what was shown (idempotent per day). `vida.insights.feedback(key, localDate, 'useful'|'not_useful')` stores feedback. Insights are never computed by an LLM; see `docs/architecture.md`.
