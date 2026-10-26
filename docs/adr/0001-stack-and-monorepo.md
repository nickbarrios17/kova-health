# ADR 0001 — Stack and monorepo

**Status:** accepted (2026-10-26)

## Context
The repository starts with HTML prototypes only. The target stack is Next.js (web), Expo (mobile), Kotlin/Compose for Wear OS, and Supabase (backend).

## Decision
- Use one git repository with **npm workspaces**. npm is already installed, so no extra package manager is added.
- `packages/domain`: Zod schemas, TS types and pure logic, shared by web, mobile and edge functions.
- `packages/api-client`: typed data access on `@supabase/supabase-js`.
- `supabase/`: migrations, seed, pgTAP tests, Edge Functions, managed by the Supabase CLI.
- `apps/*` are added in Phase 5. The Wear OS app is a Gradle project under `apps/watch` that does not join the npm workspace. It consumes the HTTP contract in `docs/api.md`.
- CI runs on GitHub Actions.

## Consequences
- TypeScript contracts are shared, but Kotlin must mirror them by hand (or later through OpenAPI or JSON Schema generated from Zod).
- Supabase is a single vendor dependency. Postgres, SQL migrations and RLS are portable, while Auth is the main lock-in.
