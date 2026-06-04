Run the start-of-session orientation:

0a. **PORTABILITY CHECK — run this before anything else**

    Run: `ls ~/.claude/projects/` (Mac) or check `C:\Users\[name]\.claude\projects\` (Windows)

    - If this appears to be a **new or different machine** (no memory files found for this project, or the project path hash looks unfamiliar) → note it to Dan:
      > "⚠️ Looks like a fresh machine or new Claude Code install — no local memory files found. That's fine: CLAUDE.md has everything needed, including all behavioral rules. I'll read it now and be fully oriented."
    - If memory files exist → ✅ normal session, continue below.
    - Either way: **CLAUDE.md is the source of truth. Memory files are a local optimisation, not a requirement.**

0b. **WORKTREE CHECK**

   Run: `git worktree list`

   - If the current session path contains `.claude/worktrees/` → 🚨 **STOP. Tell Dan immediately:**
     > "⚠️ This session opened inside a worktree (a side branch), not the main project folder. Changes won't go live until manually merged to main. For future sessions, please open Claude Code from: `Desktop\ibisworld-dashboard` (the top-level folder, not any subfolder inside it). I'll handle merging for you this session — just letting you know."
     Then continue, but ensure ALL git commits are followed by a merge+push to main before confirming anything is "live".
   - If path does NOT contain `.claude/worktrees/` → ✅ correct location, continue below.

   Also run: `git worktree list` — if any OTHER worktrees appear (paths containing `.claude/worktrees/`) AND the current session is on the main folder (not in a worktree itself), clean them up automatically now:
   ```
   git worktree remove .claude/worktrees/[name] --force
   git branch -d claude/[name]
   rm -rf "/c/Users/Daniel.starr/.claude/projects/C--Users-Daniel-starr-OneDrive---IBISWORLD-PTY-LTD-Desktop-ibisworld-dashboard--claude-worktrees-[name]"
   ```
   Run all three commands for every stale worktree found. Confirm with `git worktree list` — only the main path should remain.

   If the current session IS inside a worktree (path contains `.claude/worktrees/`): delete this worktree's project history entry immediately before doing anything else:
   ```
   rm -rf "/c/Users/Daniel.starr/.claude/projects/C--Users-Daniel-starr-OneDrive---IBISWORLD-PTY-LTD-Desktop-ibisworld-dashboard--claude-worktrees-[current-worktree-name]"
   ```
   This ensures it won't reappear in Claude Code's project list next time. Then tell Dan to open from `Desktop\ibisworld-dashboard` next session.

0c. **CLAUDE-IN-CHROME ENABLEMENT — multi-tab browser workflow**

   Claude in Chrome lets Claude Code remote into Dan's real browser to connect data across his 4 core pages. Run this whenever the session will touch the browser (Outreach Extension diagnosis, or any cross-page data work between Salesforce / dashboard / Power Automate / Outlook). Skip the live nav-probe for pure dashboard-code sessions, but still note availability.

   **The 4 always-accessible pages (the workspace):**
   | # | Page | URL |
   |---|---|---|
   | 1 | Dashboard | `https://dabbs4dan.github.io/ibisworld-dashboard/` |
   | 2 | Outlook (Outreach diagnosis → 6QA folder) | `https://outlook.office.com/mail/` |
   | 3 | Salesforce | `https://ibisworld-inc.lightning.force.com` |
   | 4 | Power Automate | `https://make.powerautomate.com` |

   **Steps:**
   1. `list_connected_browsers` → `select_browser` (the local one) → `tabs_context_mcp` with `createIfEmpty: true` to create the MCP tab group.
   2. **Probe access broadly:** create/navigate a tab to EACH of the 4 URLs and confirm read access (`read_page` works even when JS/screenshot don't). Do this up front, not lazily.
   3. **If ANY domain returns "Navigation to this domain is not allowed" → STOP and tell Dan immediately.** This is the known **session-binding** issue: the Chrome connection locks to whatever domains were reachable at connect time. The fix is NOT something Claude Code can do live — it requires Dan's setup below + a fresh session.

   **The broad-enable setup (Dan-side, one-time — confirm it's in place):**
   - **Claude in Chrome → Settings → Claude in Chrome → Site permissions → "Default for all sites" = `Allow extension`** (works everywhere except a blocklist). This is the master switch. Undocumented but essential — without it, every new domain is hard-denied with no approval prompt.
   - In Claude Code, **`/chrome` → "Enabled by default"** so Chrome control persists without `--chrome`.
   - **All 4 tabs must be open in Chrome BEFORE starting the session** — the connection binds to reachable domains at init. A fresh session with the tabs already open + "Allow extension" set attaches to all of them cleanly.
   - If domains are STILL denied after all the above, it can need setting "Allow extension" in BOTH claude.ai and Claude Desktop (covers multiple Chrome profiles).

   **Known collision — Outreach Extension vs Claude's debugger:** on pages where Dan's own Outreach Extension injects (dashboard `dabbs4dan.github.io` + Outlook), `javascript_tool` and `screenshot` fail with *"Cannot access a chrome-extension:// URL of different extension."* **`read_page` (accessibility tree) still works** — use it as the primary read path. If a JS/localStorage read is essential (e.g. pulling `ibis_6qa` directly), ask Dan to toggle the Outreach Extension OFF in `chrome://extensions` during diagnosis, then back ON to test its badges.

1. **Read CLAUDE.md explicitly using the Read tool** — do NOT rely on auto-injected context.
   CLAUDE.md is ~700 lines. Read it in three clean chunks:
   - `Read offset:0 limit:250` → Project Overview, Architecture, Current State, Accounts tab features
   - `Read offset:250 limit:250` → Dead tab, Licenses, Revenue Engine, Logo Cascade, Design, Business Logic, Sort/Filter, PA Pipeline
   - `Read offset:500 limit:200` → Outreach Extension, Email Data Layer, How to Work with Dan, Slash Commands, Session Management, Open Items
   This is non-negotiable — reading the file confirms what's actually on disk, not just what was injected into context.

2. **Read DESIGN.md using the Read tool** — covers the locked design token set, component reference, and anti-patterns.
   Always required because UI work can come up at any point.

3. Print a clean summary:
   📦 Version: [current version from CLAUDE.md CURRENT STATE section]
   🔨 Last built: [last git commit message — run git log -1 --oneline]
   📋 Open items: [from CLAUDE.md Open Items table — 🔴 Next items only]
   🎨 Design system: [confirm DESIGN.md loaded — locked token set active]
   🧠 Context: Fresh — ready to go

4. Ask: "What do you want to tackle first?"

---

IMPORTANT HIERARCHY:
- CLAUDE.md = source of truth for everything: project state, features, architecture, business logic, open items
- DESIGN.md = visual design reference only: tokens, components, anti-patterns
- If they ever conflict, CLAUDE.md wins

IMPORTANT for UI work: Before writing any CSS or HTML, check DESIGN.md for the component.
Before picking a color, check the token table. After completing UI work, flag if DESIGN.md needs a changelog entry.
