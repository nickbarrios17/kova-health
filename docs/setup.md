# Local setup, tests and deployment

## Prerequisites
- Node ≥ 20 (24 tested) and npm
- [Supabase CLI](https://supabase.com/docs/guides/cli) ≥ 2.111
- **Docker Desktop**, running. The local Supabase stack runs in containers.

## First run
```bash
npm install
supabase start          # Postgres, Auth, PostgREST, Edge runtime, Mailpit
supabase db reset       # applies supabase/migrations/* and supabase/seed.sql
```
`supabase status` prints the local URL and keys. The seed creates a fake demo account, `demo@vida.test` / `demo-vida-2026`, with the prototype's Fuerza A/B routines. It exists **locally only**.

Studio: http://127.0.0.1:54323 · Mailpit (auth emails): http://127.0.0.1:54324

## Tests
```bash
npm run typecheck                 # tsc for all packages
npm run test:unit                 # @vida/domain (no database needed)
supabase test db                  # pgTAP: schema, RLS, business rules (needs the local stack)
supabase db lint --level warning  # plpgsql/static checks
```
Integration tests (`@vida/api-client`) need the local stack and Edge Functions:
```bash
supabase functions serve          # in another terminal
```
```bash
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=<anon key from supabase status> npm run test:integration
```
Without these variables the integration suite is **skipped**. Vitest reports it as skipped, which is different from passing.

## Regenerating DB types (optional)
```bash
npm run db:types                  # writes packages/domain/src/db.types.ts from the local schema
```

## Migrations
- Add one with `supabase migration new <name>`. Never edit a migration that has been applied anywhere shared.
- `supabase db reset` replays everything locally. CI does the same from scratch on every push.

## Deploying to a hosted Supabase project
```bash
supabase link --project-ref <ref>
supabase db push                  # applies pending migrations (seed.sql is NOT applied)
supabase functions deploy delete-account
```
In the dashboard:
- Set Auth → URL configuration (site URL and redirect URLs for web and mobile deep links).
- Configure SMTP for real emails.
- Enable leaked-password protection.
- Review the Security Advisor.

## CI
`.github/workflows/ci.yml` starts Supabase, resets the DB, lints, runs pgTAP, unit and integration tests. It runs once the repository is pushed to GitHub.
