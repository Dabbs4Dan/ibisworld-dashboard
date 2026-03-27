Run the end-of-session checklist:

1. Check for any uncommitted changes — commit and push if found
2. Verify CLAUDE.md Open Items section reflects any unfinished tasks from this session
3. Check if any new UI components or visual patterns were introduced this session:
   - If YES → update DESIGN.md changelog with what changed and why before committing
   - If YES → verify new components follow the locked token set (colors, spacing, radius, shadows)
   - If a new design pattern was established that isn't in DESIGN.md → add it to the Component Reference section
4. Confirm index.html on GitHub matches local
5. Print a clean summary:
   ✅ Pushed: [commit hash]
   ✅ CLAUDE.md updated: [yes / no — what changed]
   🎨 DESIGN.md updated: [yes / no — what changed]
   📋 Open items: [list them]
   👋 Safe to close this window
