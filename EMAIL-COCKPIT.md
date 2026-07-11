# EMAIL-COCKPIT.md — Custom Email Cockpit over M365
*Companion project to the dashboard. Started 2026-07-10. Read this + CLAUDE.md at session start when working on the email cockpit.*

> **One-line:** turn Dan's email from a rigid, separate Outlook world into a **cockpit that lives inside/alongside the dashboard** — inbox organized around his book of business, read + triage + send with account context, minimal hopping. NOT moving the mailbox, NOT forwarding.

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
- **Autonomous build mode is ON** (self-only test emails pre-authorized). See CLAUDE.md behavioral rules.

---

## PHASE 1 — ACCESS FINDINGS (tested live 2026-07-10)
| Question | Result |
|---|---|
| Delegated Microsoft Graph, self-serve? | ❌ **BLOCKED at consent.** Device-code sign-in via Microsoft's own Graph CLI app (client `14d82eec-204b-4c2f-b7e8-296a70dab67e`, tenant `d6e1be51-d33d-44fc-a23f-d343cd8b3e78`) showed **"Approval required — admin's approval"** for Mail.Read/Send. Tenant disables user consent for mail scopes. (Different block than the extension's `AADSTS50158` CA wall — same conclusion.) Dan clicked "Request approval" 2026-07-10; outcome pending, but **we do NOT build on it.** |
| Office 365 Outlook connector as him? | ✅ **Works, already consented.** Sends from his mailbox AS him (not forwarding). |
| Power Automate tier | Standard is enough — the OneDrive-file bridge needs no premium. |
| Power Apps | Present but gated behind a country+terms "Get started" click (his to accept). |
| M365 Copilot | Full version present with agent-builder. Grounds on his mail inside its own chat only (not an API we can drive). |

**→ Chosen path: Power Automate + OneDrive bridge (self-serve, standard tier, proven).**

## ARCHITECTURE (the model)
Three separate layers — this resolves "local vs web":
- **Code (the bones):** GitHub, Dan's personal account (`Dabbs4Dan`). Portable forever; survives machine loss AND leaving IBISWorld.
- **Data (CRM + email):** local + his OneDrive. Private, never public.
- **Runs:** locally on his machine (app-level, secure, can touch OneDrive). Public GitHub-Pages URL can eventually retire (he only uses this one laptop).

**The mail bridge (all standard connectors):**
- **Inbound:** PA flow "When a new email arrives" → writes JSON to OneDrive `IBIS-Mail/Inbox` → local cockpit reads it (syncs to local disk).
- **Outbound:** cockpit writes a draft JSON to OneDrive `IBIS-Mail/Outbox` → PA flow → "Send an email (V2)" as him → move to `IBIS-Mail/Sent`.
- **Bridge is a swappable adapter** — if he ever changes employer/mail, swap the adapter, keep everything else.

**Build approach:** Level-1 "real app" = multiple files + real folder tree + native ES modules + IndexedDB data layer. **No build tools, no framework, no npm.** Build the NEW cockpit clean; migrate the existing dashboard onto it gradually ("clean core, migrate gradually").

**Latency truth:** send = instant/true-as-him; reading a thread = instant; new-mail *detection* is bounded by the ~1-min email poll on standard. So sub-minute end-to-end — fine for hand-written outreach. (Graph would only beat the ~1-min inbound poll.)

---

## POC PROGRESS — FOUNDATION PROVEN ✅ (2026-07-10)
The single biggest risk ("does the plumbing actually work, reliably, as him?") is **answered: yes.** All verified live.

**OneDrive folders:** `C:\Users\Daniel.starr\OneDrive - IBISWORLD PTY LTD\IBIS-Mail\{Inbox, Outbox, Sent}` (local; sync to cloud).

**Power Automate flows built (in his default env `Default-d6e1be51-...`):**
| Flow | Id | What | Status |
|---|---|---|---|
| `Cockpit - Send Test` | `c69eb41c-9da7-4195-a906-44a539ea3de2` | Manual trigger → Send an email (V2) as him, to himself | On (reusable test) |
| `Cockpit - Receive` | `4eed98b4-eafc-4153-8103-f1b4f428c27f` | When a new email arrives (V3) → Create file in `/IBIS-Mail/Inbox` (name `concat('email_', guid(), '.json')`) | **OFF** (turned off after test so it doesn't write a file per inbound email) |

**Verified round trip:** ran the send flow (self) → receive flow triggered & **Succeeded** → wrote `email_<guid>.json` to OneDrive → **synced to local disk** (confirmed via PowerShell). Full loop (send → new mail detected → file on laptop) completed **within ~1 minute**. So: a local app reading the OneDrive folder sees new mail on its own; and can send by dropping a file. **Send half + receive half + local-disk delivery all proven.**

## ROADMAP (where we are)
1. ✅ Prove send · ✅ Prove receive · ✅ Prove the OneDrive round trip — **DONE (foundation de-risked)**
2. ⏭️ Build the **production bridge flows**: real inbound content (From/Subject/ReceivedTime/Body/Id JSON, not static) + the **Outbox→send→Sent** flow. Consider a trigger condition so inbound only mirrors what we want.
3. ⏭️ **Scaffold the clean local app** (real file tree, IndexedDB data layer, dashboard design language).
4. ⏭️ Build the **mail cockpit UI + account-page integration** (threads on the account page + a mail view).
5. ⏭️ Wire **smart folders, activity tokens, re-engagement cascades, priority signals**.
6. ⏭️ Migrate the rest of the dashboard onto the clean core.

## SECURITY / TODO watch
- Mail data → IndexedDB (local) + OneDrive only; **exclude from the GitHub backup path** entirely.
- **No mailbox tokens in the app** (the OneDrive bridge means none needed — a win over the Graph path).
- Making the GitHub repo **private** is worth doing as email work deepens (already an open item). This doc has no secrets/no mail content by design.
