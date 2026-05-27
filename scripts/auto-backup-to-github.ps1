# IBISWorld Dashboard - Auto-backup-to-GitHub script
# ------------------------------------------------------------
# Watches the Downloads folder for ibis-autobackup-*.json files,
# copies the most recent one to backups/latest.json + a timestamped
# file in this repo, and pushes to GitHub.
#
# Designed to be run via Windows Task Scheduler every 1 hour, or
# triggered ad-hoc by Claude Code. No user interaction required
# once configured.
# ------------------------------------------------------------

$ErrorActionPreference = 'Continue'

$RepoRoot     = "C:\Users\Daniel.starr\OneDrive - IBISWORLD PTY LTD\Desktop\ibisworld-dashboard"
$Downloads    = [Environment]::GetFolderPath('UserProfile') + '\Downloads'
$BackupDir    = Join-Path $RepoRoot 'backups'
$LatestPath   = Join-Path $BackupDir 'latest.json'
$LogPath      = Join-Path $BackupDir 'sync.log'
# Independent local mirror — survives GitHub outages, repo corruption,
# OneDrive sync conflicts, and accidental Downloads cleanup.
$MirrorDir    = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'IBIS-Backups'
$MirrorLatest = Join-Path $MirrorDir 'latest.json'

function Log($msg) {
    $line = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
    Write-Output $line
    if (Test-Path $BackupDir) { Add-Content -Path $LogPath -Value $line -Encoding utf8 }
}

# Ensure backup folders exist
if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}
if (-not (Test-Path $MirrorDir)) {
    New-Item -ItemType Directory -Path $MirrorDir -Force | Out-Null
    # Leave a marker so future-Dan knows what this folder is
    $marker = Join-Path $MirrorDir 'WHAT-IS-THIS.txt'
    @"
IBIS Dashboard — independent local backup mirror

Populated automatically by the "IBIS Dashboard Auto-Backup" Windows Scheduled Task.
Runs hourly, copies the most recent dashboard backup here from Downloads.

Files:
  latest.json     — the most recent full snapshot
  snap-*.json     — last 30 hourly snapshots (oldest auto-pruned)

To restore: open the dashboard, click "Backups & Restore" (upload menu or
bottom-left pill), then "Restore from a file" and pick any snap-*.json
from this folder.

This is the LAST-RESORT recovery store. If GitHub is unreachable AND the
in-browser ring is empty AND Downloads has been cleaned, this folder is
what brings the dashboard back from zero.
"@ | Out-File -FilePath $marker -Encoding utf8
}

Log "Auto-backup sync starting"

# Find the newest autobackup file in Downloads
$latestDl = Get-ChildItem -Path $Downloads -Filter 'ibis-autobackup-*.json' -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if (-not $latestDl) {
    Log "No ibis-autobackup-*.json files found in $Downloads. Nothing to do."
    exit 0
}

$fmtBytes  = '{0:N0}' -f $latestDl.Length
$fmtTime   = $latestDl.LastWriteTime
Log "Latest download: $($latestDl.Name) ($fmtBytes bytes, modified $fmtTime)"

# Helper: tidy Downloads of any redundant ibis-autobackup files (used on
# every exit path so the folder never builds up regardless of whether we
# committed anything this run).
function Clean-Downloads {
    param([datetime]$Cutoff)
    try {
        $toClean = Get-ChildItem -Path $Downloads -Filter 'ibis-autobackup-*.json' -ErrorAction SilentlyContinue |
            Where-Object { $_.LastWriteTime -le $Cutoff }
        foreach ($f in $toClean) {
            Remove-Item $f.FullName -Force
            Log "Cleaned Downloads: $($f.Name)"
        }
    } catch {
        Log "Downloads cleanup skipped: $($_.Exception.Message)"
    }
}

# Skip if the latest file is older than our latest commit (no real change)
if (Test-Path $LatestPath) {
    $existing = Get-Item $LatestPath
    if ($latestDl.LastWriteTime -le $existing.LastWriteTime) {
        Log "Latest download is older than committed latest.json. Nothing new to sync."
        Clean-Downloads -Cutoff $existing.LastWriteTime
        exit 0
    }
    # Also skip if file contents match (hash compare)
    $newHash = (Get-FileHash $latestDl.FullName -Algorithm SHA1).Hash
    $oldHash = (Get-FileHash $LatestPath        -Algorithm SHA1).Hash
    if ($newHash -eq $oldHash) {
        Log "Hash matches existing latest.json. No change to commit."
        Clean-Downloads -Cutoff $existing.LastWriteTime
        exit 0
    }
}

# Copy as latest.json (overwritten every run - single canonical current state file)
Copy-Item $latestDl.FullName -Destination $LatestPath -Force
Log "Copied to backups/latest.json"

# Also save a timestamped copy so we have history (cap at last 30 timestamped files)
$stamp = $latestDl.LastWriteTime.ToString('yyyy-MM-dd-HHmm')
$timestamped = Join-Path $BackupDir "snap-$stamp.json"
if (-not (Test-Path $timestamped)) {
    Copy-Item $latestDl.FullName -Destination $timestamped -Force
    Log "Saved timestamped snapshot: snap-$stamp.json"
}

# ── Independent local mirror (Documents\IBIS-Backups) ───────────────────
# Same files, separate folder. Survives GitHub, OneDrive, or repo failure.
try {
    Copy-Item $latestDl.FullName -Destination $MirrorLatest -Force
    $mirrorTimestamped = Join-Path $MirrorDir "snap-$stamp.json"
    if (-not (Test-Path $mirrorTimestamped)) {
        Copy-Item $latestDl.FullName -Destination $mirrorTimestamped -Force
    }
    Log "Mirrored to $MirrorDir"
} catch {
    Log "Mirror copy failed (non-fatal): $($_.Exception.Message)"
}

# Prune old timestamped snapshots - keep only newest 30 (in BOTH locations)
$old = Get-ChildItem -Path $BackupDir -Filter 'snap-*.json' |
    Sort-Object LastWriteTime -Descending |
    Select-Object -Skip 30
foreach ($f in $old) { Remove-Item $f.FullName -Force; Log "Pruned old snapshot: $($f.Name)" }
$oldMirror = Get-ChildItem -Path $MirrorDir -Filter 'snap-*.json' -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -Skip 30
foreach ($f in $oldMirror) { Remove-Item $f.FullName -Force; Log "Pruned mirror snapshot: $($f.Name)" }

# Git: add + commit + push (only if there are real changes)
Set-Location $RepoRoot

$status = & git status --porcelain backups/ 2>&1
if (-not $status) {
    Log "No git changes detected (working tree clean for backups/). Done."
    exit 0
}

Log "Committing and pushing to GitHub"
& git add backups/
$commitMsg = "auto-backup: $stamp ($fmtBytes bytes)"
& git commit -m $commitMsg 2>&1 | ForEach-Object { Log $_ }
& git push origin main 2>&1 | ForEach-Object { Log $_ }

Log "Auto-backup sync complete."

# Tidy Downloads — remove autobackup files at or older than the committed
# latest. They're safely in $BackupDir + $MirrorDir + GitHub remote.
Clean-Downloads -Cutoff (Get-Item $LatestPath).LastWriteTime
