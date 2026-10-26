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

Quick start: see [docs/setup.md](docs/setup.md) (requires Docker Desktop and the Supabase CLI).

## Status (Phases 1–3)

**Done**
- Audit and architecture.
- Migrations: profiles/preferences, devices, entitlements (subscription-ready), exercise catalog with VIDA's 5 exercises, routines with versioning, workout sessions/sets with idempotent RPCs, history, PR and summary views, account export and deletion.
- RLS on every table.
- Domain and api-client packages, and docs.

**Verified on 2026-10-26**
- `npm run typecheck` passes.
- `npm test` passes: 27 domain + 9 api-client unit tests. The 8 integration tests were **skipped**, since they need a running local stack.
- All migrations, the seed and the 3 pgTAP files (68 assertions) pass on an **embedded Postgres 16 (PGlite) with a stubbed Supabase auth/pgTAP**. That smoke check caught and fixed one privilege bug.

**Not yet verified**
- These need Docker: `supabase db reset`, `supabase test db` on the real stack, `supabase db lint`, the integration suite, and the Edge Function.
- CI has not run (the repository isn't on GitHub yet).

**Next (Phase 4+)**
- Nutrition (foods with provenance, meals with snapshotted nutrients), habits and logs, body measurements, health observations, goals, daily summaries.
- Then port the prototypes to Next.js / Expo / Kotlin Wear OS (Phase 5), and Health Connect / HealthKit with offline sync on the watch (Phase 6).

**Open decisions**
- Launch markets and health-data compliance.
- Billing provider.
- Social sign-in (Google/Apple).
- Licence of the third-party exercise GIF catalog the prototype hot-links (not imported).
