# IBISWorld Sales Dashboard

Personal sales intelligence dashboard for Dan Starr, BDM at IBISWorld (US Major Markets).

**Live:** https://dabbs4dan.github.io/ibisworld-dashboard

---

## What this is

A single-file browser dashboard built on top of Salesforce CSV exports. No backend, no build tools — everything runs client-side with data stored in browser localStorage.

**Five tabs:**
- ⚡ **Action** — live working list of accounts Dan is actively pursuing
- 📋 **Accounts** — full territory view (150 accounts) with scoring, filtering, enrichment
- 🔑 **Licenses** — churn/active license intelligence
- 📣 **Campaigns** — 10 campaign contact hubs (Workables, Old Samples, 6QA, Churn, Net New, Multithread, Winback, Powerback, Alumni)
- 💀 **Dead** — accounts/licenses/contacts that dropped from CSV uploads

**Chrome extension** (`outreach-extension/`) — DOM overlay for Outlook Web that shows staleness badges, step counts, reply indicators, and company bubbles on campaign email rows.

---

## Tech stack

- Vanilla JS + HTML + CSS — single file (`index.html`)
- No frameworks, no npm, no build step
- localStorage for persistence
- Google Fonts (DM Sans + DM Mono)
- Wikipedia + Wikidata APIs for company enrichment (free, no key needed)

---

## Setup

```bash
git clone https://github.com/Dabbs4Dan/ibisworld-dashboard
# Open index.html in Chrome, or use GitHub Pages URL above
```

For full setup including Chrome extension, data upload, and Claude Code integration — see [RECOVERY.md](RECOVERY.md).

---

## Claude Code integration

This project uses Claude Code for all development. Session management is built in:

| Command | Purpose |
|---|---|
| `/start-session` | Orient Claude, read CLAUDE.md, confirm state |
| `/check-session` | Mid-session health check |
| `/end-session` | Update docs, commit, push |
| `/design-pass` | UI audit against the design system |

[CLAUDE.md](CLAUDE.md) is the single source of truth — architecture, features, business logic, open items, and behavioral rules for Claude all live there.

---

## Emergency recovery

If you need to set this up on a new machine from scratch, see [RECOVERY.md](RECOVERY.md).
