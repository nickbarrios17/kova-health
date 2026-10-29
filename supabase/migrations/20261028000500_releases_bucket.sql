-- Public bucket for app releases: the Android APK and latest.json, read by the in-app updater
-- (apps/mobile/src/appUpdate.ts) without a session. Only the service role writes (GitHub Actions,
-- .github/workflows/mobile-release.yml): there are no insert/update/delete policies for users.
-- 50 MB per file is the Supabase free-plan upload limit.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('releases', 'releases', true, 52428800, array['application/vnd.android.package-archive', 'application/json'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
