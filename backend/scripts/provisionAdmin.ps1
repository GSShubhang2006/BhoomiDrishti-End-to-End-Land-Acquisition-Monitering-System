$ErrorActionPreference = 'Stop'
$securePassword = $null
$securePasswordConfirmation = $null
$plainPassword = $null
$confirmationPassword = $null
$locationPushed = $false
$environmentNames = @(
  'BOOTSTRAP_ADMIN_CONFIRM',
  'BOOTSTRAP_ADMIN_EMAIL',
  'BOOTSTRAP_ADMIN_NAME',
  'BOOTSTRAP_ADMIN_PASSWORD',
  'RESET_ADMIN_CONFIRM',
  'RESET_ADMIN_EMAIL',
  'RESET_ADMIN_PASSWORD'
)
$previousEnvironment = @{}
foreach ($name in $environmentNames) {
  $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}

try {
  Push-Location (Join-Path $PSScriptRoot '..')
  $locationPushed = $true

  $operation = (Read-Host 'Choose administrator action: create or reset').Trim().ToLowerInvariant()
  if ($operation -notin @('create', 'reset')) {
    throw 'Choose either create or reset. No account was changed.'
  }

  $email = (Read-Host 'Administrator email address').Trim().ToLowerInvariant()
  if ($email -notmatch '^[^\s@]+@[^\s@]+\.[^\s@]+$') {
    throw 'Enter a valid administrator email address. No account was changed.'
  }

  if ($operation -eq 'reset') {
    $confirmation = Read-Host "Type '$email' to confirm resetting this administrator password"
    if ($confirmation.Trim().ToLowerInvariant() -cne $email) {
      throw 'Reset confirmation did not match. No account was changed.'
    }
  }

  $securePassword = Read-Host 'New password (12 characters minimum)' -AsSecureString
  $securePasswordConfirmation = Read-Host 'Confirm new password' -AsSecureString
  $plainPassword = [System.Net.NetworkCredential]::new('', $securePassword).Password
  $confirmationPassword = [System.Net.NetworkCredential]::new('', $securePasswordConfirmation).Password
  if ($plainPassword -cne $confirmationPassword) {
    throw 'Passwords did not match. No account was changed.'
  }
  if ($plainPassword.Length -lt 12 -or $plainPassword.Length -gt 1024) {
    throw 'Password must contain 12–1024 characters. No account was changed.'
  }

  if ($operation -eq 'create') {
    $env:BOOTSTRAP_ADMIN_CONFIRM = 'YES'
    $env:BOOTSTRAP_ADMIN_EMAIL = $email
    $env:BOOTSTRAP_ADMIN_NAME = (Read-Host 'Administrator display name (optional)').Trim()
    $env:BOOTSTRAP_ADMIN_PASSWORD = $plainPassword
    npm run bootstrap:admin
  } else {
    $env:RESET_ADMIN_CONFIRM = 'YES'
    $env:RESET_ADMIN_EMAIL = $email
    $env:RESET_ADMIN_PASSWORD = $plainPassword
    npm run reset:admin-password
  }

  if ($LASTEXITCODE -ne 0) {
    throw 'Administrator operation failed. Review the error above; no credentials were printed.'
  }
} finally {
  foreach ($name in $environmentNames) {
    [Environment]::SetEnvironmentVariable($name, $previousEnvironment[$name], 'Process')
  }
  if ($securePassword) { $securePassword.Dispose() }
  if ($securePasswordConfirmation) { $securePasswordConfirmation.Dispose() }
  Remove-Variable securePassword,securePasswordConfirmation,plainPassword,confirmationPassword -ErrorAction SilentlyContinue
  if ($locationPushed) { Pop-Location }
}
