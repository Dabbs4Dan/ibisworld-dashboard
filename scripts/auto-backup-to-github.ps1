# IBISWorld Dashboard — Auto-backup-to-GitHub script
# ------------------------------------------------------------
# Watches the Downloads folder for `ibis-autobackup-*.json` files,
# copies the most recent one to backups/latest.json + a timestamped
# file in this repo, and pushes to GitHub.
#
# Designed to be run via Windows Task Scheduler every 1 hour, or
# triggered ad-hoc by Claude Code. No user interaction required
# once configured.
#
# SETUP (one time):
#   1. Open Task Scheduler
#   2. Create Basic Task → Name: "IBIS Dashboard Auto-Backup"
#   3. Trigger: Daily, recur every 1 hour
#   4. Action: Start a program
#      Program: powershell.exe
#      Arguments: -ExecutionPolicy Bypass -File "C:\Users\Daniel.starr\OneDrive - IBISWORLD PTY LTD\Desktop\ibisworld-dashboard\scripts\auto-backup-to-github.ps1"
#   5. Done — every hour it copies the latest backup into the repo and pushes.
# ------------------------------------------------------------

$ErrorActionPreference = 'Stop'

$RepoRoot   = "C:\Users\Daniel.starr\OneDrive - IBISWORLD PTY LTD\Desktop\ibisworld-dashboard"
$Downloads  = [Environment]::GetFolderPath('UserProfile') + '\Downloads'
$BackupDir  = Join-Path $RepoRoot 'backups'
$LatestPath = Join-Path $BackupDir 'latest.json'
$LogPath    = Join-Path $BackupDir 'sync.log'

function Log($msg) {
    $line = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
    Write-Output $line
    if (Test-Path $BackupDir) { Add-Content -Path $LogPath -Value $line -Encoding utf8 }
}

# Ensure backup folder exists
if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

Log "Auto-backup sync starting…"

# Find the newest autobackup file in Downloads
$latestDl = Get-ChildItem -Path $Downloads -Filter 'ibis-autobackup-*.json' -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if (-not $latestDl) {
    Log "No ibis-autobackup-*.json files found in $Downloads — nothing to do."
    exit 0
}

Log ("Latest download: {0} ({1:N0} bytes, modified {2})" -f $latestDl.Name, $latestDl.Length, $latestDl.LastWriteTime)

# Skip if the latest file is older than our latest commit (no real change)
if (Test-Path $LatestPath) {
    $existing = Get-Item $LatestPath
    if ($latestDl.LastWriteTime -le $existing.LastWriteTime) {
        Log "Latest download is older than our committed latest.json — nothing new to sync."
        exit 0
    }
    # Also skip if file contents match (hash compare)
    $newHash = (Get-FileHash $latestDl.FullName -Algorithm SHA1).Hash
    $oldHash = (Get-FileHash $LatestPath        -Algorithm SHA1).Hash
    if ($newHash -eq $oldHash) {
        Log "Hash matches existing latest.json — no change to commit."
        exit 0
    }
}

# Copy as latest.json (overwritten every run — single canonical "current state" file)
Copy-Item $latestDl.FullName -Destination $LatestPath -Force
Log "Copied to backups/latest.json"

# Also save a timestamped copy so we have history (cap at last 30 timestamped files)
$stamp = $latestDl.LastWriteTime.ToString('yyyy-MM-dd-HHmm')
$timestamped = Join-Path $BackupDir "snap-$stamp.json"
if (-not (Test-Path $timestamped)) {
    Copy-Item $latestDl.FullName -Destination $timestamped -Force
    Log "Saved timestamped snapshot: snap-$stamp.json"
}

# Prune old timestamped snapshots — keep only newest 30
$old = Get-ChildItem -Path $BackupDir -Filter 'snap-*.json' |
    Sort-Object LastWriteTime -Descending |
    Select-Object -Skip 30
foreach ($f in $old) { Remove-Item $f.FullName -Force; Log "Pruned old snapshot: $($f.Name)" }

# Git: add + commit + push (only if there are real changes)
Set-Location $RepoRoot

$status = & git status --porcelain backups/ 2>&1
if (-not $status) {
    Log "No git changes detected (working tree clean for backups/). Done."
    exit 0
}

Log "Committing and pushing to GitHub…"
& git add backups/
$commitMsg = "auto-backup: $stamp ({0:N0} bytes)" -f $latestDl.Length
& git commit -m $commitMsg 2>&1 | ForEach-Object { Log $_ }
& git push origin main 2>&1 | ForEach-Object { Log $_ }

Log "Auto-backup sync complete."
