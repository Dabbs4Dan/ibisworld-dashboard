# EMAIL-COCKPIT.md — Custom Email Cockpit over M365
*A **separate companion project** to the dashboard — its own architecture, local-first, its own build. Started 2026-07-10.*
*When working on the email cockpit: read this file top-to-bottom + CLAUDE.md. This doc is the source of truth (memory `project_email_cockpit.md` mirrors it).*

> **One-line:** turn Dan's email from a rigid, separate Outlook world into a **cockpit that lives inside/alongside the dashboard** — inbox organized around his book of business; read + triage + **send as him**; minimal hopping. NOT moving the mailbox. NOT forwarding.

---

## 🚀 NEXT SESSION — START HERE

**Plain-language recap (the "robots" model — keep using this with Dan, it landed well):**
Dan's email = a big busy **post office** 🏤 (Outlook). We're building **his own mail room** 🏠 that talks to it. We built two **robot helpers** 🤖 in Power Automate:
- 📤 **Sender Robot** — hand it a note, it mails a real letter **as Dan**.
- 📥 **Catcher Robot** — when a new letter arrives, it drops a copy in a **shared cubby** 🗄️ (`OneDrive/IBIS-Mail`) that Dan's computer can also reach.

We **proved both work** live: sent a letter → Catcher caught it → a copy appeared in the cubby *on Dan's disk*, all in **under a minute**. The robots are the **hands** 🤲; the dashboard cockpit will be the **face** 😊. Today = hands proven. Next = make hands production-grade, then build the face.

**Foundation honesty — what's proven vs what's still to build:**
| State | Item |
|---|---|
| ✅ **Proven & keepable** | The architecture/approach · OneDrive folder structure · the data contract (below) · this doc |
| 🧪 **Test-only (throwaway/upgrade)** | `Cockpit - Send Test` (mails a fixed note) · `Cockpit - Receive` (writes junk content, is OFF) — they proved the pipe, they are NOT production |
| 🚧 **Not built yet** | Production bridge flows (real content + Outbox sender) · the local app (clean ES-module + IndexedDB) · the cockpit UI |

**Do these next, in order:**
1. **Decide the receive sync model** (see ⚠️ Open Design Decisions) — do NOT blindly mirror all ~1,735+ inbox emails as one-file-each. Pick: *new-mail-going-forward only* + optional trigger conditions. This is a real decision, make it deliberately.
2. **Build the production Receive flow** — write the full **Message JSON** (schema below), not static text, into `/IBIS-Mail/Inbox`. Reuse/replace `Cockpit - Receive`.
3. **Build the Outbox Send flow** — trigger "when a file is created in `/IBIS-Mail/Outbox`" → parse **Draft JSON** (schema below) → Send email (V2) as Dan → move file to `/IBIS-Mail/Sent`. (The send *mechanism* is already proven via `Cockpit - Send Test`.)
4. **Then** scaffold the clean local app (Level-1: real file tree + native ES modules + IndexedDB, NO build tools/framework) and start the cockpit UI + account-page integration.

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
2. ⏭️ Production bridge flows (real Message JSON in + Outbox→send→Sent) — *after deciding the sync model above*
3. ⏭️ Scaffold the clean local app (real file tree, IndexedDB, dashboard design language)
4. ⏭️ Mail cockpit UI + account-page integration (threads on the account page + a mail view)
5. ⏭️ Smart folders, activity tokens, re-engagement cascades, priority signals
6. ⏭️ Migrate the rest of the dashboard onto the clean core

## SECURITY / TODO watch
- Mail data → IndexedDB (local) + OneDrive only; **exclude from the GitHub backup path** entirely.
- **No mailbox tokens in the app** (the OneDrive bridge means none needed — a win over the Graph path).
- Making the GitHub repo **private** is worth doing as email work deepens (already an open item). This doc has no secrets/no mail content by design.
