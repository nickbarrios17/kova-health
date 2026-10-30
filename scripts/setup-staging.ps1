# One-time setup of the test environment (docs/entornos.md). Run it yourself in PowerShell from the
# repository root:  .\scripts\setup-staging.ps1
# It stores the test Supabase project's keys where GitHub Actions and Vercel need them, so the develop
# branch publishes «Kova Health Prueba» and a test web against the test database. Nothing secret is printed.
$ErrorActionPreference = 'Stop'
$repo = 'nickbarrios17/kova-health'
$stagingRef = 'nvegmmpovtytrmdhgvlh'
$stagingUrl = "https://$stagingRef.supabase.co"

Write-Host '1/3 Comprobando GitHub CLI y Supabase CLI...'
gh auth status | Out-Null
$keys = supabase projects api-keys --project-ref $stagingRef -o json | ConvertFrom-Json
$anon = ($keys | Where-Object { $_.name -eq 'anon' }).api_key
$service = ($keys | Where-Object { $_.name -eq 'service_role' }).api_key
if (-not $anon -or -not $service) { throw 'No pude leer las claves del proyecto de prueba (¿supabase login?).' }

Write-Host '2/3 GitHub: variables y secreto del entorno de prueba...'
gh variable set STAGING_SUPABASE_URL --repo $repo --body $stagingUrl | Out-Null
gh variable set STAGING_SUPABASE_ANON_KEY --repo $repo --body $anon | Out-Null
$service | gh secret set STAGING_SUPABASE_SERVICE_ROLE_KEY --repo $repo | Out-Null
Write-Host '  STAGING_SUPABASE_URL, STAGING_SUPABASE_ANON_KEY y STAGING_SUPABASE_SERVICE_ROLE_KEY listos'

Write-Host '3/3 Vercel: la web de prueba (rama develop) apunta a la base de prueba...'
Write-Host '  Si es la primera vez, el navegador te pide entrar a Vercel.'
# npm writes notices to stderr, which Windows PowerShell 5.1 turns into errors: let them through and
# check the exit code instead.
$ErrorActionPreference = 'Continue'
npx --yes vercel@latest link --yes --project kova-health --cwd apps/web 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'No pude vincular el proyecto de Vercel (¿entraste a Vercel en el navegador?).' }
foreach ($pair in @(@('NEXT_PUBLIC_SUPABASE_URL', $stagingUrl), @('NEXT_PUBLIC_SUPABASE_ANON_KEY', $anon))) {
  npx --yes vercel@latest env rm $pair[0] preview develop --yes --cwd apps/web 2>&1 | Out-Null
  $pair[1] | npx --yes vercel@latest env add $pair[0] --environment preview --git-branch develop --no-sensitive --force --yes --cwd apps/web 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "No pude guardar $($pair[0]) en Vercel." }
  Write-Host "  $($pair[0]) (Preview, rama develop) listo"
}

Write-Host ''
Write-Host 'Listo. El próximo cambio en develop publica «Kova Health Prueba» y la web de prueba.'
