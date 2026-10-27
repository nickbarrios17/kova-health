# VIDA

Health and fitness platform: web (analysis), mobile (daily actions and the gym), Wear OS (one-tap logging). This repository holds the backend foundation and shared TypeScript packages. The UI prototypes are kept verbatim in `design/`.

| Path | What |
| --- | --- |
| `design/prototypes/` | Original `.dc.html` prototypes and design system (visual source of truth, not edited) |
| `docs/audit.md` | Phase 1 technical audit |
| `docs/architecture.md`, `docs/adr/` | Architecture and decisions |
| `docs/api.md`, `docs/sync.md` | Data access contract and cross-device sync protocol |
| `docs/setup.md`, `docs/env.md` | Local setup, tests, deployment, environment variables |
| `supabase/` | Migrations, seed (local only), pgTAP tests, `delete-account` Edge Function |
| `packages/domain` | Zod contracts, units, time zones, workout math, session state machine |
| `packages/api-client` | Typed Supabase data access, retries, offline outbox |
| `apps/web` | Next.js web app (first cut: sign-in, Hoy, Entrenamiento), markup ported from the Web v2 prototype |

Quick start: see [docs/setup.md](docs/setup.md) (requires Docker Desktop and the Supabase CLI).

## Status (Phases 1–4)

**Done**
- Phases 1–3: audit and architecture; profiles/preferences, devices, entitlements (subscription-ready), exercise catalog with VIDA's 5 exercises, versioned routines, workout sessions/sets with idempotent RPCs, history/PR/summary views, account export and deletion.
- Phase 4:
  - Nutrition: foods with provenance, recipes, meals with frozen nutrient snapshots, dated goals.
  - Habits with dated schedule versions, plus streaks and completion in `@vida/domain`.
  - Body measurements, health observations (ready for Health Connect / HealthKit imports), goals.
  - Daily summaries computed on read; export of every user table.
- RLS on every table. Domain and api-client packages, offline outbox for all logging operations, docs.

**Verified on 2026-10-27 (local Supabase stack, Docker)**
- `supabase db reset` applies all 11 migrations and the seed cleanly.
- `supabase test db`: 6 files, 115 assertions, all pass.
- `supabase db lint --level warning`: no schema errors.
- `npm run typecheck` passes.
- `npm test` with the stack and `supabase functions serve` running: 40 domain + 10 api-client unit + 12 integration tests, all pass.
- Real-stack testing found and fixed two bugs: account deletion failed during GoTrue's cascade (`20261027000100_touch_parent_definer.sql`), and client validation errors were thrown synchronously instead of as rejected promises.

**Not yet verified**
- CI has not run (the repository isn't on GitHub yet).
- Nothing is deployed to a hosted Supabase project.
- No real Health Connect / HealthKit data has been imported yet. Only the import contract is tested.

**Phase 5, first web cut (2026-10-27)**
- `apps/web` (Next.js 15, React 19).
  - Sign-in, sign-up and password recovery.
  - Shell with real devices and a kg/lb toggle saved to preferences.
  - **Hoy**: daily summaries, today's routine, the week table.
  - **Entrenamiento**: routines, weekly e1RM chart, session history.
- Markup and styles are ported from `VIDA Web v2` with `nocturne.css` verbatim.
- Readiness and "VIDA ve hoy" need VIDA Intelligence, so they show facts or empty states instead of the prototype's sample numbers.
- Tendencias, Comida and Coach are "coming soon" empty states.
- Verified in the browser against the local stack: empty states, populated data and the unit switch, with no console errors. `npm run build:web` passes.
- Generated DB types are now in `packages/domain/src/db.types.ts`.

**Next**
- Web: Tendencias, Comida, Coach. Server-side sessions (`@supabase/ssr`) when SSR is needed.
- Expo mobile app (VIDA Health v2), including the live session.
- Kotlin Wear OS app on the same RPC contract, with Health Connect / HealthKit integration.

**Open decisions**
- Launch markets and health-data compliance.
- Billing provider.
- Social sign-in (Google/Apple).
- Source and licence for a verified food catalog (the system catalog is empty for now).
- Licence of the third-party exercise GIF catalog the prototype hot-links (not imported).
