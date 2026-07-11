# EMAIL-COCKPIT.md — Custom Email Cockpit over M365
*A **separate companion project** to the dashboard — its own architecture, local-first, its own build. Started 2026-07-10.*
*When working on the email cockpit: read this file top-to-bottom + CLAUDE.md. This doc is the source of truth (memory `project_email_cockpit.md` mirrors it).*

> **One-line:** turn Dan's email from a rigid, separate Outlook world into a **cockpit that lives inside/alongside the dashboard** — inbox organized around his book of business; read + triage + **send as him**; minimal hopping. NOT moving the mailbox. NOT forwarding.

---

## 🚀 NEXT SESSION — START HERE

**Plain-language recap (the "robots" model — keep using this with Dan, it landed well):**
Dan's email = a big busy **post office** 🏤 (Outlook). We're building **his own mail room** 🏠. Two **robot helpers** 🤖 in Power Automate move the mail; the **cockpit app** is the face he looks at.
- 📤 **Sender Robot** — hand it a note, it mails a real letter **as Dan** (proven).
- 📥 **Catcher Robot** — new letter arrives → drops a copy in a **shared cubby** 🗄️ (`OneDrive/IBIS-Mail/Inbox`) his computer can read (proven, but writes junk + is OFF).

**As of 2026-07-11 the FACE is built.** The cockpit app is live at `/cockpit/` (open `http://localhost:8099/cockpit/` via the `dashboard` dev server, or `https://dabbs4dan.github.io/ibisworld-dashboard/cockpit/`). It's a clean multi-file ES-module + IndexedDB app (no framework/build tools). It reads Dan's **real territory** from the dashboard (177 accounts) via shared same-origin localStorage, auto-builds a **folder per account** with the **company logo**, has an **Archive** section fed by `ibis_dead` (dropped accounts keep their folder + still catch mail), a **Triage** catch-all, cross-account **buckets** (Inbound/Outreach/Churn/Active-deal), and a **thread-state copilot** (they-replied·your-move / owe / waiting / chasing / cold) + a top slice-bar. **Read-only.** All verified live, committed + pushed.

⚠️ **The mail is still SAMPLE data** (~19 hand-written emails in `cockpit/sample/messages.json`). The folders are real; the emails inside are fake. **Feeding in real mail is the one remaining piece — and it's where we paused.**

**Foundation honesty — what's proven/built vs what's still to build:**
| State | Item |
|---|---|
| ✅ **Built & verified (2026-07-11)** | The whole cockpit app (`/cockpit/`) · territory connection · logo folders · Archive · Triage · buckets · thread-state engine · IndexedDB layer. Also fixed a `.gitignore` bug (`Data/` was hiding `cockpit/js/data/` on Windows → anchored to `/Data/`). |
| ✅ **Proven & keepable** | The architecture · OneDrive folder structure · the data contract (below) |
| 🧪 **Test-only (throwaway/upgrade)** | `Cockpit - Send Test` (fixed note) · `Cockpit - Receive` (junk content, OFF) — proved the pipe, NOT production |
| 🚧 **Not built yet** | **Real-mail feed** (production Receive flow + cockpit FSA reader) · Outbox sender · send/reply UI |

**⏸️ WHERE WE PAUSED / DO THIS NEXT — feed real mail into the cockpit (needs Dan's live browser for Power Automate):**
1. **Sync-model decision — RECOMMENDED (Dan leaned this way):** mirror **new mail going forward** (don't backfill the ~1,735 backlog). Keep the flow dumb — don't try to filter territory in Power Automate. The **cockpit already does territory routing by domain** and drops non-matches into **Triage** (Triage IS the "scan for weaknesses" surface Dan asked for). Optionally skip obvious internal `@ibisworld.com` senders in the trigger.
2. **Upgrade `Cockpit - Receive`** (id `4eed98b4-eafc-4153-8103-f1b4f428c27f`) — change its **Create file** content from the static junk string to the real email as **Message JSON** (schema below), using the "When a new email arrives (V3)" dynamic fields (From, To, Cc, Subject, BodyPreview, Body, receivedDateTime, internetMessageId, conversationId). Leave `account` blank (the app resolves it). Turn the flow **ON**.
3. **Build the cockpit's live-mail READER** — swap `cockpit/js/data/source.js` `loadRawMessages()` to read the individual Message JSON files from `OneDrive/IBIS-Mail/Inbox` via the **File System Access API** (Dan picks the folder once, store the handle in IndexedDB — same pattern as the dashboard's backup folder). Everything downstream is unchanged (same Message JSON shape).
4. Later: Outbox→send→Sent flow + send/reply UI (still read-only for now, by Dan's choice).

**How to drive step 2:** Power Automate needs Dan's authenticated session. Claude-in-Chrome CAN reach his real browser (`list_connected_browsers` → `select_browser` worked 2026-07-11), but Dan cancelled the `make.powerautomate.com` navigation to pause — pick it back up there. Alt: hand Dan a click-by-click recipe to edit the flow himself.

**Code map (the cockpit):** `cockpit/js/data/{source,store,dashboard}.js` (data + the swappable seam) · `engine/{routing,threadState,buckets,model}.js` (brain) · `ui/render.js` (view) · `main.js` (boot/wiring) · `sample/{accounts,messages}.json`. See `cockpit/README.md`.

---

## MISSION & DESTINATION
- **Dream:** a real send/receive email client that works like he's in outreach.
- **Floor:** a smart advisory layer over real mail data ("what to email and when").
- **Destination:** a **secure, local application** (the dashboard grown into a real multi-file app) where:
  - Email is **account-level** — threads on the account page + a full mail view
  - "Folders" = **smart views** (inbound leads, multi-threads, opportunities, cold → "re-email in ~6 months" cascades)
  - Every email is an **activity token** feeding the follow-up plan + prioritization signals
  - He **sends & replies as himself**, in seconds
  - **Local-first** — mail never touches the public web; code stays in his GitHub so it's his forever

## HARD CONSTRAINTS (Dan's rules)
- **No IT/RevOps permission asks** — work with what his own account has today. Probe hard/creatively.
- **Don't build on future approvals** — build for what works *now*.
- **Local-first / secure** — client email content lives ONLY in his OneDrive + his machine. Never in the public repo, never in a GitHub backup, never leaves the laptop.
- **Autonomous build mode is ON** (self-only test emails pre-authorized). See CLAUDE.md behavioral rules + memory `feedback_autonomous_loop_mode`.

## PHASE 1 — ACCESS FINDINGS (tested live 2026-07-10)
| Question | Result |
|---|---|
| Delegated Microsoft Graph, self-serve? | ❌ **BLOCKED at consent.** Device-code via Microsoft's own Graph CLI app (client `14d82eec-204b-4c2f-b7e8-296a70dab67e`, tenant `d6e1be51-d33d-44fc-a23f-d343cd8b3e78`) → **"Approval required — admin's approval"** for Mail.Read/Send. Tenant disables user consent for mail scopes. (Different block than the extension's `AADSTS50158` CA wall — same conclusion.) Dan clicked "Request approval" 2026-07-10; pending, but **we do NOT build on it.** |
| Office 365 Outlook connector as him? | ✅ **Works, already consented.** Sends from his mailbox AS him (not forwarding). |
| Power Automate tier | Standard is enough — the OneDrive-file bridge needs no premium. |
| Power Apps | Present but gated behind a country+terms "Get started" click (his to accept). |
| M365 Copilot | Full version with agent-builder. Grounds on his mail inside its own chat only (not an API we can drive). |

**→ Chosen path: Power Automate + OneDrive bridge (self-serve, standard tier, proven).**

## ARCHITECTURE
Three separate layers — this resolves "local vs web":
- **Code (the bones):** GitHub, Dan's personal account (`Dabbs4Dan`). Portable forever; survives machine loss AND leaving IBISWorld.
- **Data (CRM + email):** local + his OneDrive. Private, never public.
- **Runs:** locally on his machine. Public GitHub-Pages URL can eventually retire (he only uses this one laptop).

**The mail bridge (all standard connectors):**
- **Inbound:** PA "When a new email arrives" → writes **Message JSON** to `OneDrive/IBIS-Mail/Inbox` → local cockpit reads it (files sync to local disk).
- **Outbound:** cockpit writes **Draft JSON** to `OneDrive/IBIS-Mail/Outbox` → PA → Send email (V2) as him → move file to `OneDrive/IBIS-Mail/Sent`.
- **The bridge is a swappable adapter** — change employer/mail later, swap the adapter, keep everything else.
- **Build approach:** Level-1 "real app" = multiple files + real folder tree + native ES modules + IndexedDB data layer. **No build tools, no framework, no npm.** Build the NEW cockpit clean; migrate the existing dashboard onto it gradually ("clean core, migrate gradually").
- **Latency truth:** send = instant/true-as-him; reading a thread = instant; new-mail *detection* is bounded by the ~1-min email poll on standard. Sub-minute end-to-end — fine for hand-written outreach. (Graph would only beat the ~1-min inbound poll.)

## 📦 THE DATA CONTRACT (the keystone — get this right, everything snaps together)
The bridge and the app talk ONLY through these JSON shapes. Draft v1 — refine as we build, but keep it stable once the app reads it.

**Message JSON** — one per inbound (and later outbound) email, written by the Receive flow to `/IBIS-Mail/Inbox`:
```json
{
  "id": "<internetMessageId>",           // stable unique id (dedupe key)
  "conversationId": "<threadId>",         // groups a thread
  "direction": "inbound",                  // inbound | outbound
  "from": { "name": "", "email": "" },
  "to":   [ { "name": "", "email": "" } ],
  "cc":   [],
  "subject": "",
  "preview": "",                           // bodyPreview (short)
  "bodyHtml": "",                          // full body (optional in v1 if size is a concern)
  "receivedAt": "2026-07-10T20:06:00Z",    // ISO
  "hasAttachments": false,
  "importance": "normal",
  "folder": "Inbox",
  "account": "",                           // LEFT BLANK by the flow — the APP resolves account by matching from/to email → ibis_local. (This is the reliable match the extension never had.)
  "bridgeWrittenAt": "2026-07-10T20:06:02Z"
}
```
**Draft JSON** — one per outbound send, written by the cockpit to `/IBIS-Mail/Outbox`:
```json
{
  "draftId": "<guid>",                     // filename = <draftId>.json
  "to":   [ "name@company.com" ],
  "cc":   [],
  "subject": "",
  "bodyHtml": "",
  "inReplyTo": "<messageId or null>",      // for replies (keeps threading)
  "account": "",                           // for the cockpit's own logging
  "requestedAt": "2026-07-10T20:10:00Z"
}
```
**Rules:** app matches account by **email address** (not DOM/name guessing). File name = the id/guid (unique). Keep bodies out of the file if size becomes a problem — fetch on demand.

## POC PROGRESS — FOUNDATION PROVEN ✅ (2026-07-10)
The single biggest risk ("does the plumbing actually work, reliably, as him?") is **answered: yes.** All verified live.

**OneDrive folders:** `C:\Users\Daniel.starr\OneDrive - IBISWORLD PTY LTD\IBIS-Mail\{Inbox, Outbox, Sent}` (local; sync to cloud).

**Power Automate flows (env `Default-d6e1be51-...`):**
| Flow | Id | What | Status |
|---|---|---|---|
| `Cockpit - Send Test` | `c69eb41c-9da7-4195-a906-44a539ea3de2` | Manual → Send email (V2) as him, to himself | On — 🧪 test only |
| `Cockpit - Receive` | `4eed98b4-eafc-4153-8103-f1b4f428c27f` | New email (V3) → Create file `/IBIS-Mail/Inbox`, name `concat('email_', guid(), '.json')`, **static junk content** | **OFF** — 🧪 test only, upgrade to production |

**Verified round trip:** ran Send (self) → Receive triggered & **Succeeded** → wrote `email_<guid>.json` → **synced to local disk** (PowerShell-confirmed). Full loop **< 1 minute**. Send + receive + local-disk delivery all proven.

## ⚠️ OPEN DESIGN DECISIONS (decide deliberately next session — this is what makes it Fast/Scalable/Efficient)
1. **Don't mirror the whole mailbox.** His inbox is ~1,735+ unread / thousands total. One-file-per-email for ALL of it = thousands of tiny OneDrive files (bad sync/listing perf). **Decide:** mirror *new mail going forward only* + pull older threads on-demand. Likely add **trigger conditions** (e.g., only tracked-account senders, or specific folders) so we mirror what matters, not noise.
2. **Bodies in the file, or fetch on demand?** Full HTML bodies bloat files. Option: `preview` only in the mirror, fetch full body via a request/response flow when a thread is opened.
3. **One file per message vs a rolling batch.** Per-message is simplest + is what the app reads; fine if volume is controlled by (1). Revisit if it doesn't scale.
4. **App storage = IndexedDB** (planned) is the scalable local store; OneDrive files are just *transport*, not the database.
5. **Account matching lives in the APP** (match by email → `ibis_local`), NOT in the flow — keep flows dumb, keep intelligence in the cockpit.

## ROADMAP (where we are)
1. ✅ Prove send · ✅ Prove receive · ✅ Prove the OneDrive round trip — **DONE (foundation de-risked)**
2. ✅ Scaffold the clean local app (real file tree, IndexedDB, dashboard design language) — **DONE 2026-07-11 (`/cockpit/`)**
3. ✅ Cockpit UI + territory connection — **DONE 2026-07-11**: folder-per-account w/ logos, Archive, Triage, buckets, thread-state copilot, slice-bar (read-only, sample mail)
4. ⏭️ **← WE ARE HERE:** real-mail feed — production Receive flow (real Message JSON) + cockpit FSA reader of `OneDrive/IBIS-Mail/Inbox` (paused mid-step, needs Dan's PA session)
5. ⏭️ Outbox→send→Sent flow + send/reply UI (Dan wants read-only until it's ironclad)
6. ⏭️ Account-page integration (threads on each account's dashboard page), smart folders, activity tokens, re-engagement cascades, priority signals
7. ⏭️ Migrate the rest of the dashboard onto the clean core

## SECURITY / TODO watch
- Mail data → IndexedDB (local) + OneDrive only; **exclude from the GitHub backup path** entirely.
- **No mailbox tokens in the app** (the OneDrive bridge means none needed — a win over the Graph path).
- Making the GitHub repo **private** is worth doing as email work deepens (already an open item). This doc has no secrets/no mail content by design.
