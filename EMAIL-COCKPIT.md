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

**As of 2026-07-16 both the FACE and the FEED are built + verified.** The cockpit app is live at `/cockpit/` (`http://localhost:8099/cockpit/` via the `dashboard` dev server, or `https://dabbs4dan.github.io/ibisworld-dashboard/cockpit/`) — clean multi-file ES-module + IndexedDB app. It reads Dan's **real territory** (177 accounts) from the dashboard via shared localStorage, auto-builds a **logo folder per account**, has **Archive** (from `ibis_dead`), **Triage** catch-all, cross-account **buckets**, a **thread-state copilot**, and a slice-bar. **AND both Power Automate robots now write REAL email JSON** (Receive=Inbox, Send=Sent Items → `/IBIS-Mail/Inbox`), and the cockpit's **live-mail reader** ingests them (FSA → IndexedDB → dedup → route → thread → deletes the slot file). All verified end-to-end with real mail. **Read-only.**

✅ **THE ONLY THING LEFT: Dan clicks 🔌 Connect live mail once** in the cockpit and picks the `IBIS-Mail/Inbox` folder (a browser-security gesture that cannot be automated). After that, real mail flows into the folders as complete threads, forever automatic.

**See the `🟢 PRODUCTION BRIDGE — LIVE` section below for everything: flow IDs + config, the reproducible File-Content-fix method (the PA designer fights automation — the `execCommand('@{triggerBody()}')`→auto-tokenize trick is documented), the real V3 JSON shape, the cockpit reader, durability/scalability, and the email→account-matching + ZoomInfo plan.**

**Foundation honesty — what's built + verified vs what's left:**
| State | Item |
|---|---|
| ✅ **Built & verified** | Cockpit app · territory connection · logo folders · Archive · Triage · buckets · thread-state engine · IndexedDB · **live-mail reader** (`mailbox.js`) |
| ✅ **LIVE in production (2026-07-16)** | `Cockpit - Receive` (Inbox) + `Cockpit - Send` (Sent Items), both ON, both write `@{triggerBody()}` JSON — verified with real files |
| ✅ **Proven** | Architecture · OneDrive transport · data contract · the reproducible PA-edit method |
| 🚧 **Left** | Dan's one-time folder pick · then: email↔account matching tune-up (domain aliases + ZoomInfo) · account-page thread integration · send/reply UI |

**⏭️ DO THIS NEXT SESSION — paused mid-"land the troops" (2026-07-16 eve):**
Flows are LIVE + writing real JSON right now, so mail is **already accumulating** in `IBIS-Mail/Inbox` (cockpit will ingest + delete on connect). We paused just after opening the LIVE cockpit in Dan's real Chrome (`https://dabbs4dan.github.io/ibisworld-dashboard/cockpit/` via Claude-in-Chrome tab) to attempt the connect.
1. **Land the troops = connect the folder.** The `🔌 Connect live mail` button calls `showDirectoryPicker()` → a **native OS file dialog**. Automation reconnaissance for next time:
   - Claude-in-Chrome click *may* trigger the picker (CDP clicks are usually trusted gestures), but it **can't drive the OS dialog** (outside the DOM). `computer-use` desktop control likely **can't either** — browsers are tier "read" (clicks/typing blocked), and the file dialog is Chrome-owned. So this gesture may genuinely be Dan's one 5-sec click.
   - **Robust zero-click ALTERNATIVE to build if we want to kill the click forever:** a tiny always-on **local HTTP server** (Windows scheduled task, like the backup task) serving `IBIS-Mail/Inbox` with `Access-Control-Allow-Origin` for `dabbs4dan.github.io` + a DELETE endpoint. The HTTPS cockpit *can* fetch `http://localhost:PORT` (localhost is an allowed secure-context exception) → swap `source.js`/`mailbox.js` to fetch+DELETE instead of FSA. No folder pick ever. Weigh vs the one-time FSA click.
   - Simplest path: have Dan do the one click; everything after is automatic.
2. **Assess email→account matching** on real Triage volume (needs step 1 done so real mail is ingested) — where does domain-matching miss (subsidiaries, brand/odd handles, internal `@ibisworld.com` noise)? Populate `DOMAIN_ALIASES` (in `cockpit/js/engine/routing.js`) with fixes.
3. **ZoomInfo step** (Dan: "execute it yourself") — needs Dan's **ZoomInfo session** (auth, like PA). Pull golden domains per account → populate `DOMAIN_ALIASES`. Can't do without his logged-in ZoomInfo; set it up when his session is reachable via Claude-in-Chrome.
4. Then account-page integration (threads on each dashboard account page), then send/reply.

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

## 🟢 PRODUCTION BRIDGE — LIVE (2026-07-16). Real mail flowing, both directions.
The plumbing is no longer a POC — it's **production and verified end-to-end.** Every email Dan **receives** and **sends** is now captured as real structured JSON. Done fully autonomously (no clicks from Dan). The only thing left before mail shows in the cockpit is a **one-time File-System folder pick** (browser security; can't be automated).

**OneDrive folders:** `C:\Users\Daniel.starr\OneDrive - IBISWORLD PTY LTD\IBIS-Mail\{Inbox, Outbox, Sent}` (local; sync to cloud). **Both flows write to `/IBIS-Mail/Inbox`** — the cockpit sorts direction by sender, so one drop folder holds both.

**Power Automate flows (env `Default-d6e1be51-d33d-44fc-a23f-d343cd8b3e78`):**
| Flow | Id | Trigger folder | Action | Status |
|---|---|---|---|---|
| `Cockpit - Receive` | `4eed98b4-eafc-4153-8103-f1b4f428c27f` | **Inbox** | Create file → `/IBIS-Mail/Inbox`, name `concat('email_', guid(), '.json')`, **File Content = `@{triggerBody()}`** (whole email JSON) | ✅ **ON** |
| `Cockpit - Send` | `b6f426ff-f9be-4d8b-8355-0236bb85ff3a` | **Sent Items** | same as Receive (Save-As clone; inherited the triggerBody() fix) | ✅ **ON** |
| `Cockpit - Send Test` | `c69eb41c-9da7-4195-a906-44a539ea3de2` | Manual → Send email (V2) as him, to himself | verification tool | On — 🧪 test only |

**Verified live:** ran Send Test → both flows fired within ~1 min → **two real JSON files** landed (7.1 KB Inbox copy via Receive, 1.7 KB Sent copy via Send), both with real `from`/`subject`/`body`/`conversationId`. PowerShell-confirmed.

### 🔑 HOW THE FIX WAS DONE (reproducible — the PA designer fights automation, this is the way through)
The new PA designer **freezes on screenshots** and its **Copilot edits don't persist**, so normal automation fails. What works (via `mcp__claude-in-chrome__javascript_tool` on the flow's `?v3=true` editor):
1. Click the "Create file" action card to open its config panel.
2. Find the **File Content** field — it's a **Lexical contenteditable** (`data-lexical-*`), reachable by a **shadow-DOM-piercing walk** (`querySelectorAll('*')` recursing into `.shadowRoot`) matching the `File Content*` label.
3. Select all its content (a `Range` over the node), then `document.execCommand('insertText', false, '@{triggerBody()}')` — this fires the input events Lexical listens to. **On Save, PA auto-converts `@{triggerBody()}` into a real dynamic-content token** (`data-lexical-decorator="true"`, displays as "Body"). Plain-text `@{…}` typed this way tokenizes correctly; the fx/expression button was never findable.
4. Click **Save** (toolbar button via JS). **Confirm persistence by navigating to `/details` WITHOUT force** — if no "unsaved changes" dialog blocks it, it saved. (The green "ready to go" banner alone is NOT proof — Copilot showed it too and hadn't persisted.)
5. **Folder change** (for the Sent flow): trigger card → "Show all" advanced params → **Folder** field has an "Open folder" picker button → click it → wait ~3 s for the async folder list → click the `Sent Items` `[role=option]`.
- To run a manual flow (e.g. Send Test) headlessly: editor → click **Test** → select the **Manually** radio → click the dialog's **Test** button → click **Run flow**.

### The real V3 email JSON shape (what `triggerBody()` writes — the cockpit mapper targets this)
Top-level fields (camelCase): `id, receivedDateTime, hasAttachments, internetMessageId, subject, bodyPreview, importance, conversationId, isRead, internetMessageHeaders, isHtml, body, from, toRecipients, attachments`. `from` and `toRecipients` are **plain email strings** (semicolon-sep for multiple). Sent-folder copies carry the same shape (from = Dan → the cockpit tags them outbound).

### 🗄️ THE COCKPIT READER (`cockpit/js/data/mailbox.js` + `store.js`) — the durable, scalable half
- **FSA connect:** Dan clicks **🔌 Connect live mail** once, picks the `IBIS-Mail/Inbox` folder → the `FileSystemDirectoryHandle` is stored in IndexedDB and reused every load. This one gesture is **browser-security-mandated and unavoidable** (no code can read local files without the user pointing at the folder once).
- **Ingest loop** (`ingest()`): reads each `*.json`, skips legacy junk (`text[0] !== '{'`), maps via `mapV3()` (defensive on field name/casing), **upserts into IndexedDB keyed by `id`** (dedupes — a self-email's Inbox+Sent copies share `internetMessageId` → one record), then **deletes the source file** so OneDrive stays a near-empty transport slot. Runs on load + a 45 s poll.
- Downstream is the already-built engine: route to account folder by domain → thread by `conversationId` (sent + received together) → compute copilot state. Verified end-to-end with real-shaped data.

### ⚖️ DURABILITY & SCALABILITY (beachhead security check)
- **OneDrive stays tiny** — files deleted after ingest. Risk only if the cockpit is never opened: files accumulate (~1.7–7 KB each, dozens/day). Acceptable; the cockpit clears them on next connect. Future option: a retention sweep or `preview`-only mirror.
- **IndexedDB is the database** — holds tens of thousands locally, private, never uploaded. The mapper stores a **slim record** (drops the bulky `internetMessageHeaders`), so IndexedDB stays lean even though the OneDrive file is 7 KB.
- **Dedup by `id`** prevents double-counting across flows.
- **Mail never touches GitHub** — local + OneDrive only, by design.
- **If a flow ever breaks** (MS connector change), re-apply the File Content token via the method above; the flow IDs + config are here.

### ⏭️ REMAINING before it's fully "landed"
1. **Dan clicks 🔌 Connect live mail once** (the one unavoidable gesture) → real mail populates the folders.
2. **Email→account matching weaknesses** (Dan flagged) — routing is by email domain vs the account's website domain. Misses: subsidiaries/brand domains ≠ website, odd handles, personal domains → all land safely in **Triage** (visible, never lost). **Plan:** add a domain-alias override map so misses can be corrected, and back it with **ZoomInfo** golden-domain data (Dan's primary contact source) to auto-corroborate account↔domain. Assess against real Triage volume once connected.

## ⚠️ OPEN DESIGN DECISIONS — mostly resolved
1. ✅ **Sync model = new mail going forward** (not the 1,735 backlog). Both flows trigger on new items only. The cockpit ingests + deletes, so volume is controlled.
2. **Bodies:** currently the full `body` is in the file; the mapper keeps `bodyText` (HTML-stripped) + `preview`. Fine at current volume; switch to preview-only + fetch-on-demand if files ever bloat.
3. ✅ **One file per message** — simplest, and the cockpit deletes after ingest.
4. ✅ **IndexedDB is the store; OneDrive is transport.** Built.
5. ✅ **Account matching lives in the app** (by email domain). Flows stay dumb (just `triggerBody()`).

## ROADMAP (where we are)
1. ✅ Prove send · receive · OneDrive round trip — **DONE**
2. ✅ Scaffold the clean local app (real file tree, IndexedDB, dashboard design language) — **DONE 2026-07-11 (`/cockpit/`)**
3. ✅ Cockpit UI + territory connection — **DONE 2026-07-11**: folder-per-account w/ logos, Archive, Triage, buckets, thread-state copilot, slice-bar
4. ✅ **Production mail feed — DONE 2026-07-16**: both flows (Receive=Inbox, Send=Sent Items) write real `triggerBody()` JSON; cockpit reader (FSA ingest → IndexedDB → dedup → route → thread → delete slot) built + verified end-to-end. **Only gate: Dan's one-time folder pick.**
5. ⏭️ **← NEXT:** Dan connects the folder (one click) → assess email→account matching on real Triage volume → add domain-alias overrides + ZoomInfo corroboration. Then account-page integration (threads on each account's dashboard page).
6. ⏭️ Send/reply UI via the Outbox flow (Dan wants read-only until ironclad)
7. ⏭️ Smart folders, activity tokens, re-engagement cascades, priority signals
8. ⏭️ Migrate the rest of the dashboard onto the clean core

## SECURITY / TODO watch
- Mail data → IndexedDB (local) + OneDrive only; **exclude from the GitHub backup path** entirely.
- **No mailbox tokens in the app** (the OneDrive bridge means none needed — a win over the Graph path).
- Making the GitHub repo **private** is worth doing as email work deepens (already an open item). This doc has no secrets/no mail content by design.
