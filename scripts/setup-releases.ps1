# One-time setup for automatic app updates (docs/android.md → "Actualizaciones").
# Run it yourself in PowerShell from the repository root:  .\scripts\setup-releases.ps1
# It creates Kova Health's release signing key (if missing), keeps it in %USERPROFILE%\kova-release (outside
# the repo) and stores every secret GitHub Actions needs. Nothing secret is printed.
$ErrorActionPreference = 'Stop'
$repo = 'nickbarrios17/kova-health'
$projectRef = 'oxfucatgikqbwowtgkow'
$dir = Join-Path $env:USERPROFILE 'kova-release'
$jks = Join-Path $dir 'kova-release.jks'
$creds = Join-Path $dir 'credenciales.txt'
$keytool = 'C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe'

function Set-GhSecret($name, $value) { $value | gh secret set $name --repo $repo | Out-Null; Write-Host "  secreto $name listo" }

Write-Host '1/5 Comprobando GitHub CLI y Supabase CLI...'
gh auth status | Out-Null
supabase projects list | Out-Null

Write-Host '2/5 Clave de firma de Kova Health...'
# The key created when the app was still called VIDA is reused (moved, never regenerated): installed
# apps only accept updates signed with that same key. Its alias stays "vida".
$oldDir = Join-Path $env:USERPROFILE 'vida-release'
if (-not (Test-Path $jks) -and (Test-Path (Join-Path $oldDir 'vida-release.jks'))) {
  New-Item -ItemType Directory -Force $dir | Out-Null
  Copy-Item (Join-Path $oldDir 'vida-release.jks') $jks
  Copy-Item (Join-Path $oldDir 'credenciales.txt') $creds
  Write-Host "  clave existente copiada de $oldDir a $dir (la carpeta vieja queda como respaldo)"
}
New-Item -ItemType Directory -Force $dir | Out-Null
if (-not (Test-Path $jks)) {
  $bytes = New-Object byte[] 24; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $pw = [Convert]::ToBase64String($bytes) -replace '[+/=]', 'x'
  & $keytool -genkeypair -v -storetype PKCS12 -keystore $jks -alias vida -keyalg RSA -keysize 4096 -validity 36500 `
    -dname 'CN=Kova Health, O=Kova Health' -storepass $pw -keypass $pw | Out-Null
  "Clave de firma de Kova Health (guardala: sin ella no se pueden publicar actualizaciones)`nArchivo: $jks`nAlias: vida`nContraseña: $pw" |
    Out-File -Encoding utf8 $creds
  Write-Host "  creada en $dir. HACÉ UNA COPIA de esa carpeta (por ejemplo en un pendrive o tu nube)."
} else {
  Write-Host "  ya existe en $dir, se reutiliza."
}
$pw = ((Get-Content $creds | Where-Object { $_ -like 'Contraseña:*' }) -replace '^Contraseña:\s*', '').Trim()

Write-Host '3/5 Secretos de la firma en GitHub...'
Set-GhSecret KOVA_KEYSTORE_BASE64 ([Convert]::ToBase64String([IO.File]::ReadAllBytes($jks)))
Set-GhSecret KOVA_KEYSTORE_PASSWORD $pw
Set-GhSecret KOVA_KEY_PASSWORD $pw
Set-GhSecret KOVA_KEY_ALIAS 'vida'

Write-Host '4/5 Supabase (URL y clave pública para compilar, clave de servicio para subir el APK)...'
$envFile = Get-Content (Join-Path $PSScriptRoot '..\apps\mobile\.env')
foreach ($name in 'EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY') {
  $value = (($envFile | Where-Object { $_ -like "$name=*" }) -replace "^$name=", '').Trim()
  gh variable set $name --repo $repo --body $value | Out-Null
  Write-Host "  variable $name lista"
}
$keys = supabase projects api-keys --project-ref $projectRef -o json | ConvertFrom-Json
Set-GhSecret SUPABASE_SERVICE_ROLE_KEY (($keys | Where-Object { $_.name -eq 'service_role' }).api_key)

Write-Host '5/5 Token de Expo (para las actualizaciones por aire)...'
Write-Host '  Crealo en https://expo.dev/settings/access-tokens (botón "Create token") y pegalo acá.'
$secure = Read-Host '  Token de Expo' -AsSecureString
$token = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
if ($token) { Set-GhSecret EXPO_TOKEN $token } else { Write-Host '  (sin token: las actualizaciones por aire quedan pendientes)' }

Write-Host ''
Write-Host 'Listo. Avisale a Claude para que vincule el proyecto de Expo y lance la primera versión.'
