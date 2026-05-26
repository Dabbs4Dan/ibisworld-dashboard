# IBISWorld Dashboard - One-time setup for the Auto-Backup-to-GitHub scheduled task
# ----------------------------------------------------------------------------------
# Run this ONCE (right-click -> Run with PowerShell, OR Claude Code runs it for you).
# It registers a Windows scheduled task that runs auto-backup-to-github.ps1 every
# hour, silently, with no popups. NO ADMIN PRIVILEGES REQUIRED - uses schtasks.exe
# user-scope task scheduling.
#
# After this runs successfully you can:
#   * Forget about backups entirely
#   * The dashboard's in-browser auto-backup downloads the snapshot to Downloads
#   * This scheduled task picks up the latest one every hour and commits to GitHub
# ----------------------------------------------------------------------------------

$ErrorActionPreference = 'Continue'

$ScriptPath = "$PSScriptRoot\auto-backup-to-github.ps1"
$TaskName   = 'IBIS Dashboard Auto-Backup'

if (-not (Test-Path $ScriptPath)) {
    Write-Host "ERROR: auto-backup-to-github.ps1 not found at $ScriptPath" -ForegroundColor Red
    exit 1
}

Write-Host "Registering scheduled task '$TaskName' (user-scope, no admin needed)..."

# Delete existing task if present (silently ignore errors when not present)
try { & schtasks.exe /Delete /TN $TaskName /F *> $null } catch {}

# schtasks /TR has a 261-char limit. The path to our PS script is already long
# (OneDrive path), so we route through a tiny .bat wrapper in this same folder.
$tr = "$PSScriptRoot\auto-backup-run.bat"
if (-not (Test-Path $tr)) {
    Write-Host "ERROR: auto-backup-run.bat wrapper missing at $tr" -ForegroundColor Red
    exit 1
}

# Register: run every 60 minutes, user-scope, run only when logged on.
$schtasksArgs = @(
    '/Create',
    '/TN', $TaskName,
    '/TR', $tr,
    '/SC', 'HOURLY',
    '/MO', '1',
    '/ST', '01:00',
    '/RL', 'LIMITED',
    '/F'
)
& schtasks.exe @schtasksArgs | Out-Null

if ($LASTEXITCODE -eq 0) {
    Write-Host ''
    Write-Host "Task '$TaskName' registered." -ForegroundColor Green
    Write-Host ''
    Write-Host '  Runs hourly in the background, no popups.'
    Write-Host '  Picks up the newest ibis-autobackup file from Downloads each hour'
    Write-Host '  and commits it to backups/latest.json + a timestamped snapshot.'
    Write-Host ''
    Write-Host 'Check status:    schtasks /Query /TN "IBIS Dashboard Auto-Backup" /V /FO LIST'
    Write-Host 'Run on demand:   schtasks /Run /TN "IBIS Dashboard Auto-Backup"'
} else {
    Write-Host ''
    Write-Host "schtasks returned exit code $LASTEXITCODE. Registration may have failed." -ForegroundColor Yellow
    exit $LASTEXITCODE
}
