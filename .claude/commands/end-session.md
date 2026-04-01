Run the end-of-session checklist:

---

## STEP 1 — Update CLAUDE.md (PRIMARY — always required)

CLAUDE.md is the single source of truth. Update it before committing anything.

Check each of the following and update as needed:

**a) Version number** — if new features were built, bump the version in the CURRENT STATE section heading (e.g. v28 → v29).

**b) Current State section** — for any new feature built this session:
   - Add a new sub-section under the relevant tab (Accounts, Campaigns, Licenses, Dead, Account Page)
   - Document: what it does, how it works, key functions, state vars, localStorage keys used
   - Match the detail level of existing sections — future Claude needs to understand it cold

**c) Architecture section** — if any new localStorage keys were added, document them under the ARCHITECTURE — CRITICAL RULES section.

**d) Open Items table** — for each task worked on this session:
   - Mark completed items ✅ Done with a plain English description
   - Add any new 🔴 Next or 🗺️ Future items that came up
   - Remove items that are no longer relevant

**e) Seed table / domain overrides** — if any new revenue seeds or domain overrides were added to index.html, mirror them in CLAUDE.md.

---

## STEP 2 — Update memory files (if anything worth persisting happened)

Update `~/.claude/projects/C--Users-Daniel-starr-OneDrive---IBISWORLD-PTY-LTD-Desktop-ibisworld-dashboard/memory/` as follows:

**Always update `project_status.md`** — refresh the current version, the 🔴 Next open items, and any key decisions made this session (e.g. "Dan decided to shelve X", "we're building Y next session").

**Update other memory files** if:
- Dan gave feedback or a correction that should change future behavior → update or create a `feedback_*.md` file
- A new technical blocker was confirmed → create a `project_*.md` file (like the existing email block memory)
- Dan's working preferences changed in any way → update `user_dan.md`

Then update `MEMORY.md` index to reflect any new or changed files.

Do NOT save to memory: code patterns, file paths, architecture details, or anything already captured in CLAUDE.md. Memory is for behavioral guidance, decisions, and blockers — not docs.

---

## STEP 3 — Update DESIGN.md (SECONDARY — only if UI work happened)

Only do this if new UI components or visual patterns were introduced this session:
- Add a changelog entry (version, date, what changed and why)
- If a new reusable component was built, add it to the Component Reference section
- Verify new components follow the locked token set (colors, spacing, radius, shadows)

If no UI changes happened, skip this step entirely.

---

## STEP 4 — Commit and push

1. Check for uncommitted changes: `git status`
2. Commit with a clear plain-English message (short, no heredoc, no bullet points)
3. Push to main
4. Confirm GitHub Pages will auto-deploy

---

## STEP 4b — Worktree cleanup (ALWAYS run, takes 10 seconds)

Run: `git worktree list`

If any worktrees appear (paths containing `.claude/worktrees/`):

**Do these steps IN ORDER — the history delete must happen first:**

1. **Delete the project history entry immediately** (do this FIRST, before anything else — even if git worktree remove later fails, the entry is gone):
   ```
   rm -rf "/c/Users/Daniel.starr/.claude/projects/C--Users-Daniel-starr-OneDrive---IBISWORLD-PTY-LTD-Desktop-ibisworld-dashboard--claude-worktrees-[name]"
   ```
2. Merge any unmerged commits to main first: `git merge [branch] --no-ff -m "..."` then `git push origin main`
3. Remove the worktree folder: `git worktree remove .claude/worktrees/[name] --force`
4. Delete the branch: `git branch -d claude/[name]`
5. Confirm: `git worktree list` should now show only the main repo path

If the session is currently INSIDE the worktree (step 3 will fail with "cannot remove current worktree"), that's OK — the project history entry (step 1) is already deleted so it won't reappear. The worktree folder itself is harmless and will be cleaned up automatically next session when `/start-session` runs from the main folder.

If no worktrees exist, skip this step.

**Why this matters:** If a worktree project history entry is left behind, Claude Code will list it as a recent project and Dan may accidentally open it next session. Deleting the history entry first guarantees it's gone regardless of whether the folder cleanup succeeds. The main project entry (`...ibisworld-dashboard` without a suffix) must always be preserved.

---

## STEP 5 — Print summary

✅ Pushed: [commit hash] — live in ~30 seconds
✅ CLAUDE.md updated: [yes/no — what changed: version bump? new feature docs? open items?]
🧠 Memory updated: [yes/no — what changed]
🎨 DESIGN.md updated: [yes/no — what changed, or "no UI work this session"]
📋 Open items remaining: [list the 🔴 Next items]
👋 Safe to close this window
