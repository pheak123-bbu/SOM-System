$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot ".env"

if (-not (Test-Path $envPath)) {
  Copy-Item (Join-Path $projectRoot ".env.example") $envPath
}

$lines = [System.Collections.Generic.List[string]]::new()
Get-Content $envPath | ForEach-Object { $lines.Add($_) }
$values = @{}
foreach ($line in $lines) {
  if ($line -match '^\s*([^#=]+)=(.*)$') {
    $values[$matches[1].Trim()] = $matches[2].Trim()
  }
}

function New-LocalSecret {
  $bytes = New-Object byte[] 32
  $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $generator.GetBytes($bytes)
  } finally {
    $generator.Dispose()
  }
  return [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

function Set-EnvValue([string]$key, [string]$value) {
  $pattern = '^\s*' + [Regex]::Escape($key) + '='
  for ($index = 0; $index -lt $lines.Count; $index++) {
    if ($lines[$index] -match $pattern) {
      $lines[$index] = "$key=$value"
      $values[$key] = $value
      return
    }
  }
  $lines.Add("$key=$value")
  $values[$key] = $value
}

function Get-OrCreateSecret([string]$key) {
  $value = $values[$key]
  if ([string]::IsNullOrWhiteSpace($value) -or $value -match '^replace-with') {
    $value = New-LocalSecret
    Set-EnvValue $key $value
  }
  return $value
}

Push-Location $projectRoot
try {
  $ownerEmail = $values["SEED_OWNER_EMAIL"]
  $ownerPassword = $values["SEED_OWNER_PASSWORD"]
  $ownerEmailMissing = [string]::IsNullOrWhiteSpace($ownerEmail) -or $ownerEmail -eq "owner@example.com"
  $ownerPasswordMissing = [string]::IsNullOrWhiteSpace($ownerPassword) -or $ownerPassword.StartsWith("replace-with")
  if ($ownerEmailMissing -or $ownerPasswordMissing) {
    throw "Set SEED_OWNER_EMAIL and SEED_OWNER_PASSWORD in .env before running this setup."
  }
  if ([string]::IsNullOrWhiteSpace($values["POSTGRES_PASSWORD"]) -or $values["POSTGRES_PASSWORD"] -match '^replace-with') {
    throw "Set POSTGRES_PASSWORD in .env before running this setup."
  }

  $issuerBaseUrl = "http://localhost:8180"
  $internalUrl = "http://keycloak:8080"
  $realm = "social-seller"
  $clientId = "social-seller-order-manager"
  $ownerEmail = $ownerEmail.Trim().ToLowerInvariant()
  $ownerPassword = $ownerPassword
  $nextAuthSecret = Get-OrCreateSecret "NEXTAUTH_SECRET"
  $clientSecret = Get-OrCreateSecret "KEYCLOAK_CLIENT_SECRET"
  $adminPassword = Get-OrCreateSecret "KEYCLOAK_ADMIN_PASSWORD"
  Set-EnvValue "NEXTAUTH_URL" "http://localhost:3000"
  Set-EnvValue "KEYCLOAK_ISSUER_BASE_URL" $issuerBaseUrl
  Set-EnvValue "KEYCLOAK_ISSUER" "$issuerBaseUrl/realms/$realm"
  Set-EnvValue "KEYCLOAK_INTERNAL_URL" "$internalUrl/realms/$realm"
  Set-EnvValue "KEYCLOAK_CLIENT_ID" $clientId
  Set-EnvValue "KEYCLOAK_ADMIN_USERNAME" "local-admin"

  $utf8 = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllLines($envPath, [string[]]$lines, $utf8)

  $realmDirectory = Join-Path $projectRoot ".keycloak\import"
  New-Item -ItemType Directory -Force -Path $realmDirectory | Out-Null
  $realmConfig = [ordered]@{
    realm = $realm
    enabled = $true
    displayName = "SOM · ប្រព័ន្ធគ្រប់គ្រងការបញ្ជាទិញ"
    sslRequired = "none"
    registrationAllowed = $false
    resetPasswordAllowed = $false
    verifyEmail = $true
    loginWithEmailAllowed = $true
    duplicateEmailsAllowed = $false
    loginTheme = "som"
    internationalizationEnabled = $true
    defaultLocale = "km"
    supportedLocales = @("km", "en")
    clients = @(
      [ordered]@{
        clientId = $clientId
        name = "Social Seller Order Manager (local)"
        enabled = $true
        protocol = "openid-connect"
        publicClient = $false
        clientAuthenticatorType = "client-secret"
        secret = $clientSecret
        standardFlowEnabled = $true
        implicitFlowEnabled = $false
        directAccessGrantsEnabled = $false
        serviceAccountsEnabled = $false
        redirectUris = @("http://localhost:3000/api/auth/callback/keycloak")
        webOrigins = @("http://localhost:3000")
        attributes = [ordered]@{ "pkce.code.challenge.method" = "S256" }
      }
    )
    users = @(
      [ordered]@{
        username = $ownerEmail
        email = $ownerEmail
        emailVerified = $true
        enabled = $true
        firstName = "Demo"
        lastName = "Owner"
        credentials = @(
          [ordered]@{ type = "password"; value = $ownerPassword; temporary = $false }
        )
      }
    )
  }
  $realmJson = ConvertTo-Json -InputObject $realmConfig -Depth 20
  [System.IO.File]::WriteAllText((Join-Path $realmDirectory "$realm-realm.json"), $realmJson, $utf8)

  Write-Host "Starting local Keycloak and importing the development realm..."
  docker compose up -d keycloak
  if ($LASTEXITCODE -ne 0) { throw "Failed to start Keycloak." }

  $ready = $false
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    try {
      $null = Invoke-RestMethod -Uri "$issuerBaseUrl/realms/$realm/.well-known/openid-configuration" -TimeoutSec 3
      $ready = $true
      break
    } catch {
      Start-Sleep -Seconds 2
    }
  }
  if (-not $ready) {
    docker compose logs --tail 80 keycloak
    throw "Keycloak did not become ready. Check the logs above."
  }

  $adminToken = Invoke-RestMethod -Method Post -Uri "$issuerBaseUrl/realms/master/protocol/openid-connect/token" -ContentType "application/x-www-form-urlencoded" -Body @{
    client_id = "admin-cli"
    username = $values["KEYCLOAK_ADMIN_USERNAME"]
    password = $adminPassword
    grant_type = "password"
  }
  $adminHeaders = @{ Authorization = "Bearer $($adminToken.access_token)" }
  $currentRealm = Invoke-RestMethod -Method Get -Uri "$issuerBaseUrl/admin/realms/$realm" -Headers $adminHeaders
  $currentRealm | Add-Member -MemberType NoteProperty -Name "loginTheme" -Value "som" -Force
  $currentRealm | Add-Member -MemberType NoteProperty -Name "displayName" -Value "SOM · ប្រព័ន្ធគ្រប់គ្រងការបញ្ជាទិញ" -Force
  $currentRealm | Add-Member -MemberType NoteProperty -Name "internationalizationEnabled" -Value $true -Force
  $currentRealm | Add-Member -MemberType NoteProperty -Name "defaultLocale" -Value "km" -Force
  $currentRealm | Add-Member -MemberType NoteProperty -Name "supportedLocales" -Value @("km", "en") -Force
  $realmBody = ConvertTo-Json -InputObject $currentRealm -Depth 100 -Compress
  $realmBytes = [System.Text.Encoding]::UTF8.GetBytes($realmBody)
  $null = Invoke-RestMethod -Method Put -Uri "$issuerBaseUrl/admin/realms/$realm" -Headers $adminHeaders -ContentType "application/json; charset=utf-8" -Body $realmBytes

  Write-Host "Building and starting the app, applying the database migration, and seeding the local owner..."
  docker compose build app migrate worker
  if ($LASTEXITCODE -ne 0) { throw "Failed to build the application services." }
  docker compose up -d db redis keycloak migrate worker
  if ($LASTEXITCODE -ne 0) { throw "Failed to start the application dependencies and migration." }
  docker compose run --rm --no-deps app npm ci
  if ($LASTEXITCODE -ne 0) { throw "Failed to synchronize application dependencies." }
  docker compose run --rm --no-deps app npx prisma generate
  if ($LASTEXITCODE -ne 0) { throw "Failed to generate the Prisma client." }
  docker compose up -d app
  if ($LASTEXITCODE -ne 0) { throw "Failed to start the application after dependency setup." }

  $appReady = $false
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    try {
      $providers = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/providers" -TimeoutSec 3
      if ($providers.keycloak.id -ne "keycloak") { throw "The Keycloak provider is not available in the app." }
      $appReady = $true
      break
    } catch {
      Start-Sleep -Seconds 2
    }
  }
  if (-not $appReady) {
    docker compose logs --tail 80 app
    throw "The app did not become ready with Keycloak configured."
  }

  docker compose exec -T app npm run db:seed
  if ($LASTEXITCODE -ne 0) { throw "The local owner seed failed." }

  Write-Host "Local setup is ready."
  Write-Host "App: http://localhost:3000"
  Write-Host "Keycloak admin: http://localhost:8180/admin (see KEYCLOAK_ADMIN_USERNAME and KEYCLOAK_ADMIN_PASSWORD in .env)"
  Write-Host "Demo sign-in uses SEED_OWNER_EMAIL and SEED_OWNER_PASSWORD from .env."
} finally {
  Pop-Location
}
