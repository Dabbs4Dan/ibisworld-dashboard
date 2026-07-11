# IBIS Mail Cockpit — v1 (foundation)

A local-first email cockpit that sits *atop* Dan's mailbox — the way the dashboard
sits atop Salesforce. It auto-organizes email around his book of business, routes
each message to an account by domain, and labels every thread with where it stands
so he sees exactly where to focus.

**Companion doc:** `../EMAIL-COCKPIT.md` (mission, architecture, data contract, roadmap).

## Run it
It uses native ES modules + `fetch`, so it must be served over HTTP (not `file://`).
The repo already has a dev server config (`.claude/launch.json` → `dashboard`,
`http-server` on port 8099 from the repo root):

```
npx --yes http-server -p 8099 -c-1 .
```
Then open **http://localhost:8099/cockpit/**

## What v1 does (read-only · territory-scoped)
- **Auto account folders** — one per dashboard account, built from the account list. No dragging.
- **Domain routing** — each email → matched to an account by the sender/recipient email domain (`engine/routing.js`). Unmatched → 🟡 **Triage** (never hidden, never mis-filed).
- **Sub-buckets** — Inbound / Outreach / Churn / Active deal (`engine/buckets.js`).
- **Cross-account "by bucket" views** — the same emails sliced a second way.
- **Thread-state copilot** (`engine/threadState.js`) — every thread wears a badge:
  `they replied · your move` · `you owe a reply` · `waiting on them` · `chasing · N deep` · `cold · re-engage?`
- **Slice bar** — filter the whole view (all / inbound / owes my reply / chasing / cold).

## Architecture (Level-1 real app — no build tools, no framework, no npm)
```
cockpit/
  index.html            shell
  css/cockpit.css       dashboard design language (DM Sans/Mono, red #C8102E)
  js/
    main.js             boot + app state + event wiring
    data/
      source.js         WHERE data comes from  ← the swappable seam
      store.js          IndexedDB local layer (fail-safe fallback to memory)
    engine/
      routing.js        domain → account
      threadState.js    "where am I at" logic
      buckets.js        sub-folder classification
      model.js          messages → threads → the view model
    ui/
      render.js         view helpers (HTML from model + state)
  sample/
    accounts.json       stand-in for the dashboard account list
    messages.json       realistic sample emails (Message JSON + a `daysAgo` dev helper)
```

## Going from sample data → real mail (next)
The only thing that changes is `data/source.js`:
1. **Accounts** → read the dashboard's `ibis_accounts` (name + website/domain) instead of `sample/accounts.json`.
2. **Messages** → read Message JSON from the OneDrive `IBIS-Mail/Inbox` folder
   (Power Automate "Receive" flow writes them there) via the File System Access API —
   Dan picks the folder once, like the dashboard's backup folder.

Everything downstream (routing, thread state, buckets, UI) stays identical because
it all speaks the **Message JSON** shape from the data contract.

## Not in v1 (by design)
- Sending / replying (read-only first — earn trust, like the dashboard did).
- Churn / Active-deal auto-classification from dashboard campaign + opp signal
  (the `bucket` tag on a message is the seam where that plugs in).
- Saved custom folders (the "+ new folder" stub).
