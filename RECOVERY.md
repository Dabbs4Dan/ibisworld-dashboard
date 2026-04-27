# RECOVERY.md — Emergency Machine Transfer Guide
*IBISWorld Sales Dashboard — Dan Starr*
*If you're reading this on a new machine, everything you need is right here.*

---

## The 30-second version

The code is 100% safe in GitHub. Your data (account notes, priorities, campaign contacts) lives in your browser and must be re-uploaded from Salesforce. Run through the steps below in order and you'll be back up in under 30 minutes.

---

## Step 1 — Clone the repo

```bash
git clone https://github.com/Dabbs4Dan/ibisworld-dashboard
```

Place it somewhere convenient — Desktop is fine.

**On Mac:** `~/Desktop/ibisworld-dashboard`
**On Windows:** `C:\Users\[yourname]\Desktop\ibisworld-dashboard`

---

## Step 2 — Set git identity

This must be done on every new machine or git push will fail / use the wrong name.

```bash
git config --global user.email "daniestarr67@gmail.com"
git config --global user.name "Dan Starr"
```

---

## Step 3 — Git auth (if push fails)

GitHub no longer accepts passwords. You need a Personal Access Token.

1. Go to: GitHub → Settings → Developer Settings → Personal access tokens → Tokens (classic)
2. Generate new token → scope: `repo` (full control)
3. Copy the token — you only see it once
4. When git push asks for a password, paste the token

On Mac, macOS Keychain will remember it after the first use.
On Windows, Windows Credential Manager will remember it.

---

## Step 4 — Install Claude Code

Download from: `claude.ai/download`

- Open Claude Code
- Open it from the `ibisworld-dashboard` folder (not a subfolder)
- Sign in with your Anthropic account
- Run `/start-session` — CLAUDE.md has everything it needs to orient instantly

**Note:** Claude Code session history does not transfer between machines. That's fine — CLAUDE.md + the `CLAUDE BEHAVIORAL RULES` section carry all the important context. Claude will be fully oriented after reading the file.

---

## Step 5 — Load the Chrome extension

The extension is in the repo at `outreach-extension/`.

1. Open Chrome
2. Go to `chrome://extensions`
3. Enable **Developer mode** (top right toggle)
4. Click **Load unpacked**
5. Select the `outreach-extension/` folder inside the cloned repo
6. Open the dashboard once in a browser tab (this lets `bridge.js` push contact data to the extension)
7. Open Outlook — badges should appear automatically

**If badges don't appear:** Hard refresh Outlook (Ctrl+Shift+R on Windows, Cmd+Shift+R on Mac), then reload the extension from `chrome://extensions`.

---

## Step 6 — Rebuild your dashboard data

This is the only step that takes real time. Your account data, notes, and campaign contacts live in your browser's localStorage — not in GitHub. You'll need to re-upload from Salesforce.

Upload order (use the Upload button in the dashboard):

| # | CSV | Salesforce Report Name |
|---|---|---|
| 1 | Accounts | DA$ Account Stalker |
| 2 | Licenses | Account with Licenses & Products |
| 3 | Workables | (SF contact export — your workable contacts) |
| 4 | Old Samples | (SF contact export — old samples contacts) |
| 5 | 6QA | (SF contact export — 6QA contacts) |
| 6 | Churn | (SF contact export — churn contacts) |
| 7 | Net New | (SF contact export — net new contacts) |
| 8 | Multithread | (SF contact export — multithread contacts) |
| 9 | Winback | (SF contact export — winback contacts) |
| 10 | Powerback | (SF contact export — powerback contacts) |

**Note:** Account notes, priorities, action stages, and revenue enrichment are stored in `ibis_local` in the browser. These cannot be exported — they will be blank after a fresh setup. They rebuild naturally as you use the dashboard. Priorities and statuses you had set will need to be re-entered.

---

## Mac vs Windows differences

| Thing | Mac | Windows |
|---|---|---|
| Shell | zsh | bash / PowerShell |
| Project path | `~/Desktop/ibisworld-dashboard` | `C:\Users\[name]\Desktop\ibisworld-dashboard` |
| Claude memory files | `~/.claude/projects/[hash]/memory/` | `C:\Users\[name]\.claude\projects\[hash]\memory\` |
| Claude Code install | `.dmg` download | `.exe` download |
| Chrome extension | Same steps | Same steps |
| Git | Install via `brew install git` or Xcode CLI tools | Git for Windows (`git-scm.com`) |
| Node (for extension validation) | Install via `brew install node` | Install from `nodejs.org` |

**Claude Code behavioral memory** lives at a hashed path based on the project's file path. On a new machine the hash will be different — that's fine. CLAUDE.md contains all the behavioral rules that used to live only in those memory files.

---

## What you can skip

- **Power Automate flow** — already set up in make.powerautomate.com under Dan's IBISWorld account. No action needed unless you switch employers.
- **Cloudflare Worker** — `cloudflare-worker.js` is in the repo but not currently deployed. Skip unless you want to enable Claude API enrichment.
- **`.claude/settings.local.json`** — will be recreated automatically when Claude Code asks permission to run node validation commands. Just approve when prompted.

---

## Verify everything is working

- [ ] Dashboard loads at `file:///[path]/index.html` or via GitHub Pages: `https://dabbs4dan.github.io/ibisworld-dashboard`
- [ ] `/start-session` prints version, last commit, open items
- [ ] `git push` works without errors
- [ ] Chrome extension shows badges on Outlook campaign folders
- [ ] Accounts CSV uploads and populates the dashboard

If any of these fail, check the relevant step above. CLAUDE.md has full architecture documentation — run `/start-session` and ask Claude for help.

---

*Last updated: see git log for this file*
