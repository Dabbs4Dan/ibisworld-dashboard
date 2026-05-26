@echo off
REM Thin wrapper that the Windows Task Scheduler can call within the 261-char /TR limit.
REM Hands off to the real PowerShell script in this same folder.
powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0auto-backup-to-github.ps1"
