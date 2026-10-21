# Register HireGen for automatic launch at the current Windows user's sign-in.
$ErrorActionPreference = 'Stop'
$scriptPath = Join-Path $PSScriptRoot 'start-on-login.ps1'
if (-not (Test-Path -LiteralPath $scriptPath)) {
    throw "Missing startup script: $scriptPath"
}

$powerShell = Join-Path $PSHOME 'powershell.exe'
$arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`""
$action = New-ScheduledTaskAction -Execute $powerShell -Argument $arguments
$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Hours 1) `
    -MultipleInstances IgnoreNew `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries

Register-ScheduledTask `
    -TaskName 'HireGen Docker Stack' `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Settings $settings `
    -Description 'Starts the HireGen Docker stack after Windows sign-in.' `
    -Force | Out-Null

Write-Host 'HireGen will start after you sign in to Windows.' -ForegroundColor Green
Write-Host 'To remove the automatic start later: Unregister-ScheduledTask -TaskName "HireGen Docker Stack" -Confirm:$false'
