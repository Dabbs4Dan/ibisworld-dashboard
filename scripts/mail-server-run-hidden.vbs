' mail-server-run-hidden.vbs — launches the IBIS mail-server with no visible window.
' Registered as a logon scheduled task so the cockpit's zero-click transport is
' always up when Dan is logged in. See scripts/mail-server.js.
Set sh = CreateObject("WScript.Shell")
node = "C:\Users\Daniel.starr\AppData\Local\nodejs-portable\node-v24.16.0-win-x64\node.exe"
script = "C:\Users\Daniel.starr\OneDrive - IBISWORLD PTY LTD\Desktop\ibisworld-dashboard\scripts\mail-server.js"
sh.Run """" & node & """ """ & script & """", 0, False
