# IBISWorld Dashboard - One-time setup for the Auto-Backup-to-GitHub scheduled task
# ----------------------------------------------------------------------------------
# Uses PowerShell's ScheduledTasks cmdlets (not schtasks.exe) so paths containing
# spaces (like the OneDrive root) are handled correctly. User-scope task, no admin.
# ----------------------------------------------------------------------------------

$ErrorActionPreference = 'Continue'

$VbsPath  = "$PSScriptRoot\auto-backup-run-hidden.vbs"
$TaskName = 'IBIS Dashboard Auto-Backup'

if (-not (Test-Path $VbsPath)) {
    Write-Host "ERROR: auto-backup-run-hidden.vbs not found at $VbsPath" -ForegroundColor Red
    exit 1
}

Write-Host "Registering scheduled task '$TaskName' (user-scope, no admin needed)..."

# Remove any existing task first (silent if absent)
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

# Use wscript.exe + VBS launcher so no console window ever appears (SW_HIDE).
# The VBS in turn launches PowerShell hidden — the user sees nothing.
$action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "`"$VbsPath`""

# Trigger: every 60 minutes starting in 2 minutes from now, indefinitely
$startAt = (Get-Date).AddMinutes(2)
$trigger = New-ScheduledTaskTrigger -Once -At $startAt -RepetitionInterval (New-TimeSpan -Minutes 60)

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 5) `
    -MultipleInstances IgnoreNew

# Limited principal - no admin, runs only when user is logged on
$principal = New-ScheduledTaskPrincipal `
    -UserId "$env:USERDOMAIN\$env:USERNAME" `
    -LogonType Interactive `
    -RunLevel Limited

$task = New-ScheduledTask -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
    -Description 'Hourly auto-commit of the latest IBIS dashboard backup file to GitHub.'

try {
    Register-ScheduledTask -TaskName $TaskName -InputObject $task | Out-Null
    Write-Host ''
    Write-Host "Task '$TaskName' registered successfully." -ForegroundColor Green
    Write-Host ''
    Write-Host "  First run: $startAt"
    Write-Host "  Repeats every 60 minutes thereafter."
    Write-Host ''
    Write-Host 'Verify action path was set correctly:'
    (Get-ScheduledTask -TaskName $TaskName).Actions | Format-List Execute, Arguments
} catch {
    Write-Host "Registration failed: $_" -ForegroundColor Red
    exit 1
}
