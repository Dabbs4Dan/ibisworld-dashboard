# LIVE-COCKPIT.md — turning the dashboard into a live, two-way SF + Gong cockpit
*Companion initiative, started 2026-07-23. NO `index.html` changes yet — this is architecture + a live test. Read this when working on live Salesforce/Gong integration. Sibling doc to `EMAIL-COCKPIT.md`.*

---

## MISSION
Dan is swamped; the dashboard has become a tool he *manages* instead of a helper *embedded in his workflow*. Goal: make it a **live two-way cockpit** — one reconciled table of **Accounts × Opportunities × Contacts** that **pulls from Salesforce automatically** (no CSV uploads) and lets him make **in-field marks that write back** to Salesforce (log Tasks/meetings, update Opportunity fields), **plus** surface **Gong call-brief synthesis + next steps** per account. Constraint: Dan is a **non-admin** SF/Gong user — no Apex/Flow/Visualforce/Connected-App creation, no Gong API key, Graph delegated blocked by Conditional Access. Everything here must be **self-serve**.

---

## THE RANKED OPTIONS (researched + partially tested live, 2026-07-23)

| # | Path | Live pull | Write-back | Needs IT? | Verdict |
|---|---|---|---|---|---|
| **①** | **Chrome extension → Salesforce REST API** using Dan's own session | ✅ real-time | ✅ Tasks/Events/Opp fields | ❌ no (only "API Enabled") | 🏆 **Winner if the org allows it** — pending the live test |
| **②** | **Power Automate → GitHub → dashboard** (+ GitHub-file relay for write-back) | ✅ ~hourly | ✅ but laggy (poll) | ❌ no | 🥈 **Guaranteed fallback** |
| **③** | **Gong** direct API | — | — | ✅ admin-only keys | ❌ dead end direct — **but Gong syncs briefs/deal-signals INTO Salesforce**, so ①/② get it free; also Gong web app is readable via the same session trick |
| **④** | **Copilot Studio** | awkward | awkward | ✅ license + DLP + SF OAuth | ❌ skip — heavier, gated, chat-shaped |

### Why ① is the target (the "holy grail")
- A **browser extension** with `cookies` + `host_permissions` on `*.salesforce.com` can read the **httpOnly `sid` cookie** on `ibisworld-inc.my.salesforce.com` (page JS can't; an extension can) and call `/services/data/vXX.0/...` with `Authorization: Bearer <sid>` **from the service worker** (which is **exempt from the CORS allowlist** a web page would need an admin for).
- It acts **entirely as Dan, within his own permissions** — it can never do more than he can by hand, so writes are safe. This is exactly how **Salesforce Inspector Reloaded** works.
- Dan's **Outreach extension is already an MV3 service worker** with a `FETCH_URL` proxy — it's ~30 lines from doing this. (For the test we use a SEPARATE throwaway extension to avoid touching the working Outreach one — CLAUDE.md rule.)
- **The one required permission: "API Enabled"** — on by default in Unlimited Edition; Dan has the "IBISWorld Internal API Integration" permission set, so almost certainly on.

### ⚠️ The open risk that the live test resolves
Naive same-tab REST calls I ran live returned **`INVALID_SESSION_ID`** twice (both on `lightning.force.com` and after landing on `my.salesforce.com`). That is EXPECTED for cookie-auth navigation (UI session ≠ API session) — but it *could* also mean the org has **"API client whitelisting" / API Access Control ON**, which would block session-based REST **even via the Bearer method** → the only thing that kills ①. **Page JS cannot get the API token (httpOnly), so the only way to distinguish "Bearer works" from "whitelisting blocks it" is an actual extension.** Hence the test below.

---

## 🧪 THE LIVE TEST — `sf-api-test/` (built 2026-07-23, in repo)
A **temporary, isolated, read-only** MV3 extension that proves whether ① works in Dan's org, with **zero side effects** (write-capability is checked via read-only `describe` calls — it creates nothing).

**Files:** `sf-api-test/manifest.json` (cookies + salesforce/force.com host perms + service worker + content script on `dabbs4dan.github.io`), `background.js` (reads `sid` via `chrome.cookies.getAll({name:'sid'})`, prefers the `my.salesforce.com` cookie, queries 5 accounts, describes Task/Event/Opportunity for createable/updateable), `content.js` (asks the SW to run, then paints the verdict into a fixed banner `#sf-api-test-banner` on the dashboard so **Claude can read it via Claude-in-Chrome** — Dan doesn't need to read or report anything).

**How it's meant to run (Dan's only step = 1 action):**
1. Dan: `chrome://extensions` → Developer mode ON → **Load unpacked** → pick `ibisworld-dashboard/sf-api-test`.
   - ⚠️ **This one step cannot be automated** — Claude-in-Chrome is hard-blocked from `chrome://` pages and native file dialogs (verified live this session: navigating to `chrome://extensions` errors). No browser-automation tool can load an unpacked extension.
2. Claude: open `dabbs4dan.github.io` in the Claude-in-Chrome MCP tab → the test extension's content script runs → reads the `#sf-api-test-banner` text → reports the verdict.

**Verdict → decision:**
- `SUCCESS | accounts=[…] | write_tasks=true write_meetings=true update_opps=true` → **build Option ①** (instant two-way cockpit).
- `BLOCKED_WHITELISTING` → org blocks session REST → **build Option ②**.
- `API_DISABLED` → "API Enabled" off on profile → Option ② now, one-checkbox IT ask to unlock ①.
- `NO_COOKIE` → not logged into SF in that browser.

**After testing:** remove the `sf-api-test` extension (it's throwaway). The real capability, if ① is green, gets folded into the Outreach extension (add `cookies` + SF host perm + a `sfQuery`/`sfWrite` helper in `background.js`, push results to the dashboard via the existing `bridge.js`).

---

## 🎙️ GONG — the call-notes synthesis goldmine (probed live 2026-07-23)
Dan is logged into **`us-32796.app.gong.io`**. Key findings:
- **Gong already does the synthesis.** The home feed shows a rich **AI call brief per call**, account-linked, with the next step baked in — e.g. Resideo/Blake (wants qualitative research + Snowflake/Copilot integration, budget decision **Aug–Sep**), GGFL/Kody (cost concerns, DFK partnership → send options email), Egis/Pooja (pilot dates, Canadian SHRED tax credit), Aquatrols, Allinial, Goodnow, SeekWell… all mapping to dashboard accounts.
- **Gong pages read CLEANLY** via Claude-in-Chrome (`get_page_text` returned all briefs) — **no** extension/CSP conflict like the dashboard/Outlook have. A content script could scrape these trivially.
- **Gong runs the same "use your own session" door** as Salesforce — internal `/ajax/...` JSON endpoints authenticated by Dan's logged-in session (confirmed `/ajax/management/feature-flags/report-usage`). An extension with `host_permissions` on `*.app.gong.io` could call those as Dan.
- **Direct Gong API = admin-only dead end** (keys + OAuth both need a Gong admin; Engage `/v2/flows` needs Tech/Business admin). So the rep-viable paths are: (a) read Gong's **SF-synced** call activities + deal-signal custom fields (free, via ①/②), and/or (b) read Gong's **web app** via session/content-script.
- **The rockstar workflow:** each cockpit account gets a live **"Last call" cell = Gong AI brief + next step**, next to the deal + contacts. **No Obsidian needed** — the dashboard is already the second brain; piping Gong in beats adding another app. (Obsidian is a fine *future* add-on for linked notes, not now.)

---

## RESEARCH FINDINGS (condensed — full detail in the 2026-07-23 session)

**SF browser-session REST (①):** works via extension reading `my.salesforce.com` `sid` + Bearer from the service worker (CORS-exempt). Needs "API Enabled". Writes never exceed the user's UI permissions. Gotchas: (1) grab the **my.salesforce.com** sid, not lightning.force.com; (2) **API client whitelisting** kills it (→ the test); (3) IP-locked sessions can reject if browser/fetch egress differ (VPN).

**Sept-2025 Salesforce change (big):** connected apps flipped to **deny-by-default** for *uninstalled* apps. This kills the `sf` CLI **device flow** entirely (dead Aug-28-2025) and can block a **fresh** `sf org login web` for a non-admin unless grandfathered or granted "Approve Uninstalled Connected Apps". **① dodges this whole mess** (no connected app at all). The `sf` CLI bridge (`sf data query/create/update` → JSON file → dashboard) is a viable #2-style path **only if `sf org login web` still authorizes in his org** (test with one command).

**Power Automate (②) — the real free shapes:**
- **Pull (free, standard connectors):** Recurrence → Salesforce "Get records" (already working) → GitHub **"Create a repository dispatch event"** (standard connector — the GitHub connector has **no file-write action**) → a committed **GitHub Action** writes the JSON → dashboard `fetch()`es from **raw.githubusercontent.com** (open CORS for public repos, ~5-min CDN lag). The dashboard already reads `backups/latest.json` this way.
- **The generic HTTP action AND the Request/HTTP trigger are PREMIUM.** So "PA PUTs to the GitHub Contents API" needs premium, and "browser POST → PA Request trigger → SF write" is **blocked 3 ways** (premium + browser-CORS + the SAS URL is a secret you can't publish on a public page). **Don't design around the Request trigger.**
- **Write-back (free): dashboard writes marks to a GitHub file** (browser → GitHub Contents API with a fine-grained PAT — exactly what the dashboard's existing `_ghPushBackup` already does) → a **scheduled** PA flow reads that file → pushes to SF via the **standard Salesforce "Update/Create record"** action. Works, but **polling latency (15–60 min)**, not instant. This is why ① (instant) beats ② for write-back.
- The **Salesforce connector is PREMIUM** in PA/Copilot Studio — but Dan's `accounts.json` flow already uses it, so his tenant licenses it.

**Copilot Studio (④):** skip. Needs a paid standalone license (self-signup often disabled in locked tenants), the Salesforce connector is premium + **DLP defaults it to "Non-business" which governed tenants auto-block** (Publish greys out), and it's a **conversational** builder that just calls a PA flow under the hood anyway. Adds cost + a chat layer, removes zero walls.

---

## 🤖 AGENTIC WORKFLOWS — the playbook (researched 2026-07-23)

**🔑 Biggest unlock: Dan already holds a Power Automate PREMIUM seat** (the Salesforce connector is premium, and his `accounts.json` flow uses it). Premium turns on: **HTTP action** (call any REST endpoint), the **"When an HTTP request is received" webhook trigger**, and **AI Builder** (~5,000 credits/user/mo through Nov-2026). So he is NOT confined to standard connectors. ⚠️ Confirm it's a **per-user** Premium plan (not a narrow per-flow add-on) before building on HTTP/AI Builder. Note the webhook trigger still returns no CORS headers, so a browser *page* can't call it — but the **extension service worker CAN** (host_permissions bypass CORS), so the extension is the caller for direct webhooks.

**🔑 The core trick: never call Gong's API directly.** Gong syncs **call activity + the AI Call Brief into Salesforce as Tasks/Events** → PA's Salesforce connector reads the call summaries with **no Gong API key**. For sequencing, let a rep click Gong's own **"Add to Flow"** button (Gong Anywhere for Outlook add-in, or the Gong-for-Salesforce package) — assign-to-flow via API is the admin wall; automate the *decision*, keep the human on the one *click*.

**Connector tiers (confirmed):** Office 365 Outlook = **Standard** (Create Draft / Send V2) · OneDrive/GitHub = Standard · Salesforce/HTTP/Request-trigger/AI-Builder = **Premium (he has it)** · Approvals = Standard.

**Ranked, buildable loops — ship in this order:**
1. **🥇 Loop A — "Draft my follow-up" (flagship).** Dashboard marks an account "send follow-up" → extension POSTs to a PA webhook (or writes a GitHub trigger file) → PA reads the account's **Gong Call Brief + open opps from Salesforce** → **AI Builder "Create text with GPT"** drafts a tailored email → **Outlook "Create Draft"** lands it in Drafts for one-click send. 100% non-admin, draft-not-send (respects the never-send-without-confirmation guardrail).
2. **🥈 Loop B — "Who to sequence" shortlist → Gong one-click.** PA nightly reads SF (recent Gong call + no open task + gone quiet) → ranked JSON to GitHub → the **Outreach extension badges "→ Add to Gong flow"** on those Outlook rows, right where the **Gong Anywhere "Add to Flow"** button already sits. Decision automated, execution = one click. (Prereq: install **Gong Anywhere for Outlook** — self-serve if Engage-licensed.)
3. **🥉 Loop C — Gong → dashboard reverse sync.** PA reads Gong Tasks/Call Briefs from SF → JSON to GitHub → account deep-dive shows "last Gong call summary + date." Makes the dashboard trustworthy without manual entry.

**LLM synthesis:** AI Builder "Create text with GPT" runs inside PA (his Premium credits cover it); fallback if credits lapse = call an external LLM API via the premium HTTP action with his own key.

**Snowflake — park it.** Non-admin can query + self-make a PAT, but PAT needs an admin-set auth/network policy, and **Cortex (LLM-in-Snowflake) needs an ACCOUNTADMIN grant** — admin wall. Snowflake is an *enrichment/scoring* source, not the automation fabric; don't build the first loop on it.

**Hard admin walls (don't chase):** Gong public Engage API assign-to-flow · Graph delegated mail · Snowflake Cortex/PAT policy · Zapier→Gong (needs Gong API creds).

---

## 🔴 NEXT SESSION — START HERE
1. **Run the `sf-api-test`** (Dan loads the unpacked folder once; Claude reads the banner off the dashboard). Green → build ①; blocked → build ②.
2. Fold the winning path into the **Outreach extension** (or a PA flow) and add the **combined Accounts×Opps×Contacts live table** + the **Gong "Last call / next step" cell**.
3. Wire **write-back marks** (log Task/Event, update Opp) — instant via ①, or GitHub-relay via ②.
4. Land the **agentic outreach loop** (dashboard mark → PA drafts email from Gong brief).
5. Remove the throwaway `sf-api-test` extension once decided.
