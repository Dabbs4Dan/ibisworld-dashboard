# /end-session
Run the end-of-session checklist:
1. Check for any uncommitted changes — commit and push if found
2. Verify CLAUDE.md Open Items section reflects any unfinished tasks from this session
3. Confirm index.html on GitHub matches local
4. Print a clean summary:
   ✅ Pushed: [commit hash]
   ✅ CLAUDE.md updated
   📋 Open items: [list them]
   👋 Safe to close this window

# /start-session
Run the start-of-session orientation:
1. Read CLAUDE.md fully
2. Print a clean summary:
   📦 Version: [current version]
   🔨 Last built: [last commit message]
   📋 Open items: [from CLAUDE.md]
   🧠 Context: Fresh — ready to go
3. Ask: "What do you want to tackle first?"

# /check-session
Assess the current session health and give Dan a plain English status:
1. Estimate conversation length (count roughly how many back-and-forth exchanges have happened)
2. Check if any responses have been repetitive or if the same bugs have come up twice
3. Check for any uncommitted local changes
4. Print a simple health report:
   🧠 Session Health Check
   ─────────────────────
   💬 Exchanges: [rough count]
   🟢 / 🟡 / 🔴 Context: [Fresh / Getting long / Start a new window]
   💾 Uncommitted changes: Yes / No
   📋 Unfinished tasks: [list or "none"]
   Recommendation:
   🟢 "You're good — keep going"
   🟡 "Type /compact to compress history and buy more runway"
   🔴 "Run /end-session then open a fresh window — CLAUDE.md has everything"
