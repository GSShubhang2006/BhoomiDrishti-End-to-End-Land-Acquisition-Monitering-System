$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot\..

$env:NODE_ENV = 'development'
$env:LOCAL_DEMO_SEED_CONFIRM = 'APPLY-LOCAL-BHOOMIDRISHTI-DEMO'
$securePassword = $null

try {
  $securePassword = Read-Host 'Synthetic demo staff password (12 characters minimum)' -AsSecureString
  $env:DEMO_PASSWORD = [System.Net.NetworkCredential]::new('', $securePassword).Password
  npm run seed:local-demo -- --apply
  if ($LASTEXITCODE -ne 0) {
    throw "Local demo seed command failed with exit code $LASTEXITCODE."
  }
} finally {
  Remove-Item Env:LOCAL_DEMO_SEED_CONFIRM,Env:DEMO_PASSWORD -ErrorAction SilentlyContinue
  if ($null -ne $securePassword) {
    $securePassword.Dispose()
  }
  Remove-Variable securePassword -ErrorAction SilentlyContinue
}
