# Kova Health

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
| `apps/web` | Next.js web app (sign-in, Hoy, Tendencias, Comida, Entrenamiento, Coach), markup ported from the Web v2 prototype |
| `apps/mobile` | Expo / React Native Android app (Hoy, Entrenar + live session, Comida, Progreso, Health Connect) |
| `apps/watch` | Native Wear OS app in Kotlin + Compose (live workout, rest timer, mood, Health Services heart rate) |
| `docs/android.md`, `docs/cloud.md` | Building/installing the APKs (phone + Wear OS); cloud backend and web deployment |
| `docs/guia-de-uso.md` | User guide (Spanish): install, accounts, daily use, what is left to do |

Quick start: see [docs/setup.md](docs/setup.md) (requires Docker Desktop and the Supabase CLI).

## Status (all phases, 2026-10-27)

| Phase | State |
| --- | --- |
| 1 Audit & architecture | Done (`docs/audit.md`, `docs/architecture.md`, ADRs) |
| 2 Backend foundation | Done: auth, profiles, preferences, devices, entitlements, RLS everywhere, export, account deletion |
| 3 Core fitness | Done: exercise catalog, versioned routines, idempotent sessions/sets, history/PR views |
| 4 Nutrition, habits, body | Done: foods with provenance, snapshotted meals, dated habit schedules, measurements, goals, daily summaries |
| 5 Clients | Web (Next.js): Hoy, Tendencias, Comida, Entrenamiento, Coach. Mobile (Expo): Hoy, Entrenar + live session, Comida, Progreso. Watch (Kotlin/Wear OS): live workout, rest timer, mood, offline queue. |
| 6 Health & sync | Health Connect import on mobile (steps, sleep, weight, resting HR, HRV); Health Services heart rate on the watch; offline outbox on mobile and watch |
| 7 Intelligence & ops | Kova Intelligence v1 (deterministic insights with kind/evidence, novelty/fatigue memory). Cloud Supabase deployed. Billing intentionally not implemented (no provider chosen). |

**Artifacts**
- `dist/Kova-Health-movil-0.1.0.apk` and `dist/Kova-Health-reloj-wearos-0.1.0.apk` (not in git; rebuild with `docs/android.md`).
- Cloud backend: Supabase project `oxfucatgikqbwowtgkow` (`docs/cloud.md`); web at https://kova-health.vercel.app.

**Verified**
- Local stack: 12 migrations, `supabase test db` (7 files, 121 assertions), `db lint`, typecheck of all workspaces, 48 domain + 23 api-client tests (incl. integration), web checked in the browser.
- Cloud: migrations pushed; `supabase test db --linked` 121/121.
- APKs: build successfully; metadata checked with `aapt2`.

**Not verified**
- APKs on a real phone or watch (no device connected).
- Health Connect and Health Services on hardware.
- Web on Vercel (waiting for the owner's Vercel login). CI on GitHub (not pushed).

**User guide:** [docs/guia-de-uso.md](docs/guia-de-uso.md) (in Spanish), including what is still up to the owner.

**Open decisions:** launch markets and health-data compliance, billing provider, social sign-in, verified food catalog source and licence, licence of the third-party exercise GIF catalog (not imported).
