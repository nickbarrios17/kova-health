# VIDA — Technical audit (Phase 1)

Date: 2026-10-26. Source: claude.ai/design project `971e744c-20eb-45e2-9a2e-439400222def`, imported verbatim into `design/`.

## 1. What exists

| File | Role | Notes |
| --- | --- | --- |
| `design/prototypes/VIDA Web v2.dc.html` | Web dashboard | Sidebar nav: Hoy, Tendencias, Comida, Entrenamiento, Coach. Grids, 7/14/28-day charts, insight cards with "kind" (fact/pattern/hypothesis), device list. |
| `design/prototypes/VIDA Health v2.dc.html` | Mobile app (412×892 phone frame) | Screens: home, coach, routines, library, exercise detail (3D mannequin, cues, errors, breathing), live session, summary, progress, food search/scan, area detail (sleep, steps, heart, body, mood, food). Props: `units kg|lb`, `loggingMode tabla|enfocado`, `hasWatch`. |
| `design/prototypes/VIDA Watch v2.dc.html` | Wear OS concept (round 280 px faces) | Face, today/readiness, live workout (set → rest → next), weight/reps edit, pause/finish, coach yes/no, mood, quick protein, offline and pending-sync states, sync log. |
| `design/prototypes/VIDA Sistema de diseño.dc.html` | Design system | Colour tokens with contrast checks, type scale per platform, spacing, components, do/don't, platform rules. |
| `nocturne.css` | Tokens + base component classes | Source of truth for colours, radii, shadows, `.btn`, `.input`, `.card`, `.table`, `.dialog`. |
| `support.js` | "dc" runtime | Parses `<x-dc>` templates + a `DCLogic` class; renders through a global React. Generated file — never edit. |
| `mannequin.js` | `<gym-mannequin>` web component | three.js@0.149 from unpkg; 5 animated exercises (squat, deadlift, bench, ohp, curl) with fault overlays. |
| `design/reference/*.md` | Design improvement plan; "VIDA Intelligence" concept | The Intelligence doc describes an **earlier codebase that is not available** (see §6). |

There is no application framework, package manifest, backend, database schema, test suite or git history. Not present: Next.js, React Native/Expo, Kotlin, Supabase.

## 2. What is simulated

- **All health data is hardcoded** (`HD` in Web; equivalent constants in Health): sleep minutes and stages, HRV + baseline, resting HR, steps, active kcal, weight series, mood, stress, kcal/protein history, macro goals. The device is hardcoded as "Galaxy Watch6".
- **Exercise data**: `EX` holds 5 exercises with Spanish cues, errors, breathing and tempo. `HIST`/`HREPS` hold 8 weeks of fake top-set weights. The library also fetches a third-party catalog from `cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@v1.1.0`.
- **Routines** "Fuerza A/B" live in component state. Edits are lost on reload.
- **Workout session** runs entirely in memory. A `tick()` loop synthesises heart rate (`98 + 42·e^(−t/45)` + noise) and estimates kcal from HR (Keytel formula) or MET. PRs are compared against `HIST`.
- **Nutrition**: `FOODS` is a 26-item table without provenance. "Scan" returns a fixed `SCAN` result with fake confidence values. Meals are in state.
- **"Sync"**: Web and Watch share one `localStorage['vida:sync']` JSON blob (`session`, `coach`, `mood`, `protAdd`, `log[]` with `src: web|reloj`), polled every 1–1.5 s and via the `storage` event. The Watch "offline" toggle only stops writing and keeps an in-memory queue. **This only works across tabs of one browser. It is not cross-device sync.**
- **Coach / insights**: fixed text with HRV-based "train at 90%" adjustments.

## 3. What requires backend integration

| Prototype feature | Backend need | Phase |
| --- | --- | --- |
| Units, locale, time zone | `user_preferences` | 2 |
| Sign-in, profile | Supabase Auth + `profiles` | 2 |
| Exercise library + detail | `exercises` catalog (system + user-owned), muscles, equipment, instructions | 3 |
| Routines (create/edit/duplicate, scheduled days) | `routines`, `routine_exercises`, versioning | 3 |
| Live session (sets, rest, pause, finish, notes, tags) | `workout_sessions`, `workout_session_exercises`, `workout_sets`, idempotent RPCs | 3 |
| Progress charts, PRs, summaries | history / PR / summary views | 3 |
| Watch ↔ web/phone session sharing, offline queue | Sync protocol (client UUIDs, outbox, idempotent writes) | 3 (contract), 6 (clients) |
| Food search, meals, macros, protein quick-add | foods (with provenance), meals, meal_items with snapshotted nutrients | 4 |
| Mood, habits | habits / habit_logs, mood observations | 4 |
| Weight, body | body_measurements | 4 |
| Sleep, HRV, RHR, steps, heart | `health_observations` fed from Health Connect / HealthKit | 4 (schema), 6 (integration) |
| Daily summaries, "Hoy" | daily summary query or materialisation | 4 |
| Coach / insights | VIDA Intelligence (rules first, no AI in core) | Later |
| Premium | entitlements (server-verified) | 2 (skeleton) |

## 4. What must be preserved

- The visual identity in `nocturne.css`: dark `#161826`/`#232532`, violet `#9184D9`, Inter, Phosphor icons, and the semantic ok/warn/crit tokens.
- The design-system rules: every number carries a unit and a period; state is never shown by colour alone; one primary action per section; **empty states never show sample numbers**. The backend supports the last rule by returning *no data* rather than defaults.
- The screen flows and Spanish copy of all three clients.
- Platform roles: web analyses, mobile acts, watch records with one tap.

## 5. Technical changes required

1. Add a real backend: Supabase (Postgres + Auth + RLS), schema as versioned migrations.
2. Add a shared TypeScript domain package (Zod contracts, unit conversion, workout math) and a typed data-access client for web and mobile.
3. Stop treating `localStorage` as sync. Clients use stable client-generated UUIDs plus an outbox, and the server is authoritative.
4. Phase 5: port the dc prototypes into Next.js (web) and Expo (mobile). The `.dc.html` runtime has no data layer, routing or build, and the master stack requires Next/Expo. The port keeps the markup and inline styles 1:1, and `renderVals()` logic becomes hooks that call `@vida/api-client`. The prototypes stay in `design/` as the visual reference.
5. Phase 5/6: build the Wear OS app natively (Kotlin, Compose for Wear OS, Health Services), using the same RPC contract over HTTPS. Do not embed web tech.

## 6. Conflicts, risks, missing requirements

- **Earlier codebase**: `VIDA Intelligence (Copy).md` references `PersonalPatterns.kt`, Room, 24 Supabase tables with tombstones, a Gemini `generate-insights` function and a Finance domain. The owner confirmed that code is unavailable. **Decision: start fresh.** Finance is out of scope.
- **Third-party exercise catalog**: the licence of `ExerciseGymGifsDB` and its GIFs is unverified, and runtime hot-linking to a GitHub CDN is a reliability and privacy leak. Recommendation: do not import it until the licence is confirmed. The system catalog is seeded from VIDA's own 5 exercises (`EX`), and media stays a reference field.
- **Estimated values**: HR-based kcal and "scan" nutrition are estimates. The schema carries `*_is_estimated` / provenance flags, and the UI must label them.
- **Health metrics** (HRV, sleep stages, steps) need Health Connect / HealthKit native layers. They are not implementable from the web. Phase 6+.
- **Medical claims**: Coach copy such as "HRV 18% bajo tu base → entrena al 90%" is a recommendation. Future insights must carry kind and confidence and must not diagnose (see the Intelligence doc §04/§08).
- **Week start / day boundaries**: the prototypes use Monday-first (`L M X J V S D`). Daily reporting needs the user's IANA time zone (ADR 0004).
- **Undecided** (needed before production): launch markets (GDPR / health-data rules), billing provider, auth methods beyond email/password (Google/Apple), and the hosting region.
- **Tooling**: Docker is required for local Supabase. It was not installed when this audit was written.
- **Not imported**: the design project's `_ds/` bundle is generated design-tool output and not needed by the app.

## 7. Prototype → target mapping

| Prototype | Target app | Location (Phase 5) |
| --- | --- | --- |
| VIDA Web v2 | Next.js + React + TS | `apps/web` |
| VIDA Health v2 | Expo + React Native + TS | `apps/mobile` |
| VIDA Watch v2 | Kotlin + Compose for Wear OS | `apps/watch` |
| Sistema de diseño / nocturne.css | Shared tokens | `packages/tokens` (CSS vars + TS + Compose theme generated from one JSON) |
