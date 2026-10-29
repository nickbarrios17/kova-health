# Environment variables

| Name | Where | Secret? | Purpose |
| --- | --- | --- | --- |
| `SUPABASE_URL` | web, mobile, watch, tests | no | Project API URL (`http://127.0.0.1:54321` locally) |
| `SUPABASE_ANON_KEY` | web, mobile, watch, tests | no (public; RLS protects data) | Client API key |
| `SUPABASE_SERVICE_ROLE_KEY` | **Edge Functions only** (injected automatically by Supabase) | **yes** | Privileged admin operations (`delete-account`). Never in a client bundle, never committed. |
| `MAILPIT_URL` | integration tests | no | Local email inbox (`http://127.0.0.1:54324`) for password-recovery tests |
| `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `apps/mobile/.env` (gitignored) | no | Embedded in the mobile app at build time |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | `apps/watch/secrets.properties` (gitignored) | no | Embedded in the watch app as BuildConfig fields |
| `SUPABASE_DB_PASSWORD` | `supabase/.env.remote` (gitignored) | **yes** | `supabase db push` to the cloud project; never in apps |
| `KOVA_CXX_DIR` | shell, at `expo prebuild` time | no | Short CMake staging dir on Windows (docs/android.md) |

Local values come from `supabase status`. Copy `.env.example` to `.env.local`, which is gitignored.

Framework prefixes for Phase 5: Next.js exposes `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and Expo exposes `EXPO_PUBLIC_…`. **Only the URL and anon key** may get those prefixes.
