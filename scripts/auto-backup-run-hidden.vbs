' IBISWorld Dashboard - silent launcher for auto-backup-to-github.ps1
' ------------------------------------------------------------------
' Called by the Windows Scheduled Task. Launches PowerShell with
' window state 0 (SW_HIDE), so there's no cmd window flash even briefly.
' The original auto-backup-run.bat is kept as a manual-run option.
Option Explicit

Dim WshShell, strFolder, strCmd
Set WshShell = CreateObject("WScript.Shell")

strFolder = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
strCmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & strFolder & "auto-backup-to-github.ps1"""

' 0 = SW_HIDE (no window ever shown). False = don't wait for completion.
WshShell.Run strCmd, 0, False

Set WshShell = Nothing
