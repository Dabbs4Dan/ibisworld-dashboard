# CLAUDE.md — IBISWorld Sales Dashboard
*For Claude Code sessions. Read this before touching any code.*

---

## PROJECT OVERVIEW
Single-file sales intelligence dashboard for Dan Starr, BDM at IBISWorld (US Major Markets).
Built as a personal productivity tool — NOT an official IBISWorld product.

**Live URL:** https://dabbs4dan.github.io/ibisworld-dashboard
**Repo:** github.com/Dabbs4Dan/ibisworld-dashboard (public, main branch)
**File:** `index.html` — single self-contained file, ~3,980+ lines

---

## DEPLOY WORKFLOW
Claude Code edits `index.html` locally → Dan runs:
```
git add index.html
git commit -m "description of change"
git push
```
GitHub Pages auto-deploys in ~30 seconds. That's it.

---

## ARCHITECTURE — CRITICAL RULES
- **Single file only** — everything lives in `index.html` (HTML + CSS + JS, no separate files)
- **No build tools, no npm, no frameworks** — vanilla JS only
- **No external dependencies** except Google Fonts + DuckDuckGo favicon API
- **localStorage** for persistence — four keys, all in one logical namespace:
  - `ibis_accounts` → raw account rows from the SF CSV
  - `ibis_local` → flags, notes, revenue cache, **and `_lastSeen` date** (per-account, keyed by Account Name)
  - `ibis_licenses` → slim decoded license rows
  - `ibis_updated` → date string of last accounts CSV upload
  - ⚠️ There is **no separate `ibis_revenue` key** — revenue lives inside `ibis_local`
  - `ibis_opps` → contact pipeline rows, keyed by email (lowercase trimmed)
  - `checkStorageSize()` fires on `init()` and after both CSV uploads; logs a console warning if any key exceeds 2MB or total exceeds 4MB
- All CSV parsing happens client-side in the browser

---

## CURRENT STATE — v24 (stable)

### Three tabs live:
1. **📋 Accounts tab** — main territory view
2. **🔑 Licenses tab** — churn/active license data (renamed from "License Intelligence")
3. **🎯 Workables tab** — contact pipeline with Cards + Table view

### Accounts Tab Features
- SF CSV upload → instant dashboard population
- Change detection → 🆕 flags new accounts
- Cards + Table view toggle
- Custom colored vertical dropdown
- Revenue column with auto-enrichment + progress indicator (bottom-right spinner)
- Logo cascade: UpLead → DuckDuckGo → Google Favicon → Initials
- Accounts CSV button turns ✅ green when freshly uploaded this session
- 6sense buying stage badges
- 🗑️ clear buttons next to each CSV upload — accounts clears `ibis_accounts`+`ibis_updated` only (preserves `ibis_local`); licenses clears `ibis_licenses` only
- **Row click modal removed** — clicking a row no longer opens the flags/notes/revenue modal (removed `onclick="openModal(...)"` from `<tr>` and `.account-card`)

#### Accounts Table Columns (left → right)
Status | Company | Vertical | Tier | Revenue | Score | Workables | US Client | Active Client | Opps | Licenses | Stage | Intent | Days Inactive

#### Status Column (new in v23)
- Per-account dropdown: **✓ Keep** (green), **👁 Monitor** (yellow), **✗ Drop** (red), **— ** (grey dash)
- Stored in `ibis_local[name].acctStatus` — persists across CSV uploads; `pruneStaleLocalData` treats `acctStatus` as user data (won't prune)
- **Portal dropdown** — menu rendered in `<div id="acct-status-portal">` at `<body>` level (NOT inside the table), `z-index:9500`. Avoids all table stacking context / click-through issues permanently. `openAcctStatusPortal(id, triggerBtn)` positions portal via `getBoundingClientRect()`. `applyPortalStatus(status)` recovers account name by reverse-matching the wrap ID against `accounts[]` — no JS string escaping needed
- In-place trigger update on selection (no `renderAll()` call) — selection is instant, row order never changes
- Closes on click-outside and on scroll

#### Workables Column (new in v23)
- Purple circle `<span class="wkbl-dot">` with count of non-archived entries in `ibis_opps` matching the account name
- `getWorkableCount(name)` uses `normName()` matching — grey dash if 0

#### US Client Column (new in v23)
- Green ✓ checkmark if account has ANY US Industry license in `ibis_licenses` (regardless of active/churn status)
- `hasUSLicense(name)` — grey dash if none

#### Active Client Column (new in v23)
- Shows **only active PIQ or INTL** license badges borrowed from Licenses tab
- `getActiveLicBadges(name)` — returns coloured badge spans or empty string
- Grey dash if no active license — renamed from "Licenses" to "Active Client"

#### Filter Chips (v23 — replaced old Hot/Opp/Winback/Watching set)
- ✓ Keep · 👁 Monitor · ✗ Drop · 🟢 Active License
- Chips filter by `localData[name].acctStatus` or `getActiveLicBadges(name)`
- All chips have matching emoji/color to their status

#### Tier Filter Dropdown (new in v23)
- Multi-select checkbox dropdown on the Tier column header (matches license tab filter pattern)
- Options: T1, T2, T3, T4, — (no tier). AND logic with other filters
- State: `acctTierFilters` (Set). `applyTierFilter()` / `clearTierFilter()`

#### Sentiment Score Column (new in v24)
- Weighted 1–10 composite score per account, displayed as clickable color-coded badge (green 8–10, amber 5–7, red 1–4, grey dash for null)
- Trend arrow (↑/→/↓) based on composite of 5 signal types: Wikidata revenue history, Wikipedia growth/distress keywords, engagement recency, license status
- **Battle card popover** — click score badge to see: large score ring, auto-generated headline, trend + confidence indicators, 6 weighted factor bars
- Portal pattern (`#sentiment-card`, z-index:9600) — same architecture as status dropdown. Closes on click-outside + scroll.
- **Data sources** — NO paid API needed. Uses same free Wikipedia + Wikidata APIs as descriptions:
  - Wikidata entity claims: revenue history (P2139), employees (P1128), stock exchange (P414), dissolved (P576), acquired (P1366)
  - Wikipedia extract: keyword-scanned for growth/distress/acquisition signals
  - Internal data: revenue size, 6sense intent + stage, days inactive, workables count, opps count, license status
- **6 scoring factors**: Scale (15%), Rev Trend (20%), Mkt Signals (20%), Engagement (20%), Pipeline (15%), Licenses (10%)
- Enrichment queue: `sentQueue[]` / `runSentQueue()` — runs alongside description queue, triggered on init + CSV upload. `SENT_VERSION` bump forces re-score.
- Stored in `ibis_local[name].sentiment` — `{score, headline, rationale, trend, confidence, factors:{...}, v}`
- Sortable column, nulls sort last (-1). Added to `ACCT_SORT_DEFAULT_DIR`, sort dropdown, sort arrows.
- Card view: Score stat-cell between Tier and Intent
- `cloudflare-worker.js` in repo — optional Cloudflare Worker proxy for future Claude API enrichment (not currently used for scoring)

#### Frozen Sort Order (new in v23)
- After any explicit sort (column header click), row order is locked into `frozenSortOrder[]`
- All subsequent `renderAll()` calls (background enrichment, status changes, filter changes) preserve the frozen order — rows never shuffle mid-session
- Lock clears ONLY when user clicks a column header again (`setSortCol` / `onAcctSortSelectChange` set `frozenSortOrder = null`)
- New accounts not in the frozen list appear at the bottom

### Splash Screen
- Fires on every page load/refresh (no sessionStorage gate — JS tab switching never reloads so no risk of retrigger)
- 200px logo, 3.2s display, 0.5s fade
- Radial gradient dark bg, red pulse glow on logo, sheen animation
- Title "Account Intelligence" + subtitle "IBISWorld · US Major Markets" + animated 3-dot loader

### Workables Tab Features (renamed from Opportunities in v23)
- Tab label: **🎯 Workables** everywhere (HTML, JS, CSS)
- Parses SF contact CSV: `First Name` + `Last Name` → `name`, `Title`, `Mailing Country` → `country`, `Email`, `Account Name`, `Last Activity` (not "Last Activity Date"). No Phone column.
- Unique key = email (lowercase trimmed); stored in `ibis_opps`
- **Merge logic**: additive only — new email → add as Introduction; existing → update SF fields, preserve stage/notes/nextAction/sfOpp/sfAmt/closeDate. No auto-archive on re-upload.
- **Manual delete**: 🗑 button on each card and table row (confirm prompt before delete)
- **Toast on upload**: "✅ N updated · N new"
- **Cards view** (default, renamed from Kanban): 5 columns matching new stages
- **Table view**: full column set (see below)
- **Cold Workables** collapsible section: contacts where `archived=true`
- **Stats bar**: Total in Pipeline, stage count chips, Avg Days Inactive
- `isInTerritory(opp)` — checks if `opp.accountName` matches any account in `accounts[]` via `normName()`. Green dot shown in first table column and top-right of cards for territory matches.

#### Workables Stages (v23)
`OPP_STAGES`: 🟡 Introduction · 🔵 Walkthrough · 🟢 Proposal · 🟠 Stalled · 🔴 Lost · 🔮 Future Revisit
- Custom colored bubble dropdown (`renderStageSelect` / `toggleStageMenu` / `selectStageOpt`) — same quality as license badges
- Stage migration: old stage values auto-migrated to Introduction on `renderOpps()`
- `STAGE_COLORS` map `{stage: {bg, color}}` for consistent coloring

#### Workables Next Actions (v23)
`OPP_NEXT_ACTIONS`: 🌐 Webinar · 📧 Email Reconnect · 📋 Send Information · 📅 Book Webinar · — (grey dash)
- Native `<select>` styled with `.opp-next-select` / `.opp-next-empty`

#### Workables Table Columns (left → right)
Territory dot | Company+Logo | Name | Title | Opp | Stage | Next Action | Next Date | Close Date | Last Activity | 🗑

#### Opp Widget (v23)
- **Off**: grey dot (`.opp-dot-btn` / `.opp-dot`)
- **On**: blue pill "Opp" + `$` amount input + Close Date input, grouped as `.opp-active-wrap` with `box-shadow` glow
- `sfOpp` boolean + `sfAmt` string + `closeDate` string stored per contact
- `saveOppAmt()` auto-formats with `$` prefix; Enter key blurs input

#### Logo system for Workables
- `oppLogoHTML(opp, size)` — checks `accounts[]` first, then `ibis_local` keys, then `LOGO_DOMAIN_OVERRIDES`, then `guessDomain()`
- `guessDomain()` improved: detects non-profit/gov keywords → uses `.org` TLD; strips more noise words
- `LOGO_DOMAIN_OVERRIDES` extended with `Women's Business Development Center of Aurora → wbdc.org`, `New York SBDC Network → nysbdc.org`

### License Intelligence Tab Features
- Parses SF "Account with Licenses & Products" CSV (~1,082 rows)
- Auto-decodes license type from License Name field:
  - 🟡 US Industry (`- US -`)
  - 🔵 PIQ / US Procurement (`- USP -` or PIQ)
  - 🟢 International (`- AU -`, `- UK -`, etc.)
  - 🟣 Trial (contains "Trial")
  - ⚫ Migration → **always hidden** ($0 junk rows)
- Status bucketing by License End Date vs today:
  - ✅ Active (end date in future)
  - 🔥 New Churn (churned 2024+) — amber badge
  - ❌ Churned (2020–2023) — red badge
  - · Dead (pre-2020) — greyed out
- Sortable columns (bidirectional toggle on all column headers)
- Checkbox filter dropdowns on Type and Status column headers (AND logic, active state highlights header)
- Stats bar recalculates live from filtered/visible rows
- Company logos: UpLead → DuckDuckGo → Google → Initials (same cascade as Accounts tab)

---

## REVENUE ENGINE
Priority order: Seed table (instant) → Claude AI enrichment queue (~0.9s/account) → SF CSV fallback

### Seed Table (must match CSV Account Name EXACTLY)
Lyft→$5.8B, Burger King→$2.3B, BJ's Wholesale Club→$20.2B, Lloyds Bank→$19.8B,
Rolls Royce→$23.7B, Booz Allen Hamilton→$11.3B, Embraer S.A.→$6.1B,
The Vanguard Group Inc.→$7.2B, Turner Construction Company→$16.0B,
Mediterranean Shipping Company→$91.0B, Labcorp→$13.0B,
MGM Resorts International→$17.2B, StoneX→$1.7B, Cleveland Clinic→$14.0B,
Authentic Brands Group→$750M, DRS Technologies Inc.→$3.2B,
Conocophillips→$54.7B, Danone→$17.7B, Blackrock→$20.4B,
Berkshire Hathaway→$364.5B, Panasonic→$65.0B, WPP→$19.0B, Aflac→$22.9B

### No-revenue verticals (show dash, never enrich):
Academic, Government

---

## LOGO CASCADE — DO NOT BREAK
Order: UpLead → DuckDuckGo Favicon API → Google Favicon → Initials fallback

### Manual domain overrides (exact CSV account name → domain):
Alibaba Group → alibabagroup.com
Berkshire Hathaway → berkshirehathaway.com
Conocophillips → conocophillips.com
Dow → dow.com
Steel Dynamics Inc. → steeldynamics.com
Enterprise Mobility → enterprisemobility.com
Novelis → novelis.com
Vitol Inc. → vitol.com
Glencore → glencore.com

---

## DESIGN — LOCKED, DO NOT CHANGE
- Background: `#f0f2f5`
- IBISWorld red: `#C8102E`
- Fonts: DM Sans + DM Mono (Google Fonts)
- Light theme only

### Tier diamonds:
- T1 = Navy/Steel
- T2 = Forest/Emerald
- T3 = Sienna/Orange
- T4 = Charcoal/Grey

### Vertical colors:
Academic=#dbeafe, Accounting=#e0e7ff, Advertising/Media/Entertainment=#fce7f3,
Business Support=#f3f4f6, Commercial Banking=#d1fae5, Construction/Eng/RE=#fef3c7,
Consulting=#ede9fe, Energy & Waste=#fef9c3, Finance=#dcfce7, Insurance=#ccfbf1,
Government=#dbeafe, Health & Community=#fee2e2, Legal=#f1f5f9, Manufacturing=#ffedd5,
Biomedical & Pharma=#fce7f3, Food & Beverage=#fef9c3, Retail=#ffe4e6,
Transportation/Logistics=#e0f2fe, Wholesale=#f0fdf4

### Vertical override rules:
- Finance vertical + Insurance sub-vertical → use Insurance color
- Manufacturing vertical + Healthcare sub-vertical → use Biomedical & Pharma color
- Manufacturing vertical + Food sub-vertical → use Food & Beverage color

---

## FRONTEND DESIGN PHILOSOPHY
*Applies to all UI work only — does not govern backend logic, CSV parsing, or data handling.*

- **This is a sales tool used in client-facing meetings** — it must impress, not just function. Every visual decision should hold up under a VP's gaze on a shared screen.
- **Avoid all generic AI UI patterns** — no default box shadows, no Bootstrap energy, no cookie-cutter card layouts. If it looks like it came from a template, it's wrong.
- **Animations must feel intentional and premium** — never decorative. Every transition should serve a purpose: confirming an action, guiding the eye, or communicating state. No animation for animation's sake.
- **Every component must match the existing design language exactly** — DM Sans + DM Mono, IBISWorld red `#C8102E`, light theme `#f0f2f5`, the tier diamond system, the vertical color palette. New components must feel like they were always there.
- **Think like a designer AND an engineer simultaneously** — visual quality and code quality are equally non-negotiable. A feature that works but looks wrong is not done.
- **Reference the frontend-design skill** at `/mnt/skills/public/frontend-design/SKILL.md` when building or modifying any UI component.
- **Information hierarchy first** — before writing a single line of CSS, ask: what does the user need to see first? Design the visual weight to match that answer.
- **Progressive disclosure over information overload** — show the most important data always; let the rest live one interaction away. Don't cram everything into a card.

---

## CSV SCHEMAS

### Accounts CSV (SF "DA$ Account Stalker" report)
IBISWorld Custom Report Title, # Core Clients, # Core Opportunities,
US Days Since Last Activity, Account Name, Website, Major Markets Tier,
Vertical, Sub-Vertical, Employees, Annual Revenue Currency, Annual Revenue,
6sense Account Intent Score NA, 6sense Account Buying Stage NA

### License CSV (SF "Account with Licenses & Products" report)
Account Name, License Name, Opportunity Name,
Annualized Amount Currency, Annualized Amount,
License Start Date, License End Date

---

## BUSINESS LOGIC — CRITICAL
- IBISWorld does **NOT** sell by seat count
- In Dan's territory, active licenses are always **PIQ or International** — never US Industry
- **US Industry = churn signal**, not active client
- The Salesforce "Active License" field is **unreliable** — always use License End Date comparison vs today
- Account name matching uses case-insensitive trim (`normName()`)

### Territory Rules — applied via `applyLicenseRules(lic)` at parse + restore time:

1. **Active US Industry → PIQ**: If `_type === 'US'` AND `_active === true`, reclassify to PIQ. No active US Industry clients exist in Dan's territory — these are actually US Procurement accounts.
2. **Churned US trial → TRIAL**: If `_type === 'US'` AND `_active === false` AND `_acv === 0` AND Opportunity Name contains "trial", reclassify to TRIAL. These are $0 churned US Industry rows that are actually expired trials.

---

## SORT / FILTER PATTERN — ESTABLISHED CONVENTION
Both tabs implement sort state independently. Follow this pattern for any future tab:

### State variables (declare near top of JS, near existing `licSortCol`)
```javascript
let fooSortCol = 'someDefault';
let fooSortDir = 'desc';
const FOO_SORT_DEFAULT_DIR = { col1:'asc', col2:'desc' }; // sensible default per column
```

### Toggle function (click on column header → toggles direction; new column → reset to default)
```javascript
function setFooSortCol(col) {
  if (fooSortCol === col) { fooSortDir = fooSortDir === 'asc' ? 'desc' : 'asc'; }
  else { fooSortCol = col; fooSortDir = FOO_SORT_DEFAULT_DIR[col] || 'desc'; }
  saveSortPref(); renderFoo();
}
```

### Persistence — `saveSortPref()` and `restoreSortPref()` write to `ibis_sort` (JSON, keyed by tab name)
- Add `prefs.foo = { col: fooSortCol, dir: fooSortDir }` in `saveSortPref`
- Restore in `restoreSortPref` similarly

### Sort arrows — `updateFooSortArrows()` sets `▲` / `▼` on active header; clears others
- Each `<th>` gets `<span class="acct-sort-arrow" id="fsort-colname"></span>`
- Function mirrors `updateAcctSortArrows()` / `updateLicSortArrows()` pattern

### Full `TableControls` refactor is deferred until a 3rd tab is built.

---

## OUTREACH EXTENSION — Chrome Extension

**Location:** `/outreach-extension/` subfolder inside this repo (saved to GitHub, not deployed)
**Version:** v2.0.0
**Purpose:** Priority-based contact engine + email history layer on top of Outlook Web — companion to the dashboard

### Files
| File | Purpose |
|---|---|
| `manifest.json` | MV3. Runs on all Outlook URL variants + dabbs4dan.github.io |
| `content.js` | Injects collapsible sidebar into Outlook. Reads contacts from `chrome.storage.local` |
| `sidebar.css` | All sidebar styles. DM Sans/Mono, #C8102E, #f0f2f5 — matches dashboard exactly |
| `background.js` | Service worker. Generates red "I" icon via OffscreenCanvas. Relays refresh messages to bridge.js |
| `bridge.js` | Content script injected into dashboard page. Reads `ibis_opps` from localStorage → writes to `chrome.storage.local` as `outreach_contacts_raw` |

### How data flows
1. User opens dashboard → `bridge.js` auto-pushes `ibis_opps` into `chrome.storage.local.outreach_contacts_raw`
2. User opens Outlook → `content.js` reads `outreach_contacts_raw` → parses + displays contacts
3. Refresh button → asks `background.js` → finds open dashboard tab → tells `bridge.js` to re-push
4. CSV upload in dashboard → `bridge.js` detects `storage` event → auto-pushes updated data

### Storage keys (chrome.storage.local)
- `outreach_contacts_raw` — raw `ibis_opps` JSON string, written by bridge.js
- `outreach_contacts_ts` — timestamp of last push
- `ibis_sidebar_collapsed` — sidebar open/closed state
- `ibis_badge_top` — vertical position of the collapse badge

### Sidebar UI
- 300px right-anchored sidebar, IBISWorld red header
- 3 campaign cards: 🎯 Workables · 🔄 Winbacks · 📋 Samples
- 🎯 Workables: populated from `ibis_opps` — filters out `archived=true` and `stage='Lost'`
- Contact rows: letter avatar (color by initial) · Name · Company · stage pill (dashboard colors)
- Click contact → navigates Outlook to `from:[email]` search
- Collapse badge: small red "I" square, pinned to right wall, drag up/down only
- 🔄 refresh button in header — re-syncs from dashboard tab if open

### Manifest URL patterns (all Outlook variants covered)
- `https://outlook.live.com/*`
- `https://outlook.office.com/*`
- `https://outlook.office365.com/*`
- `https://outlook.cloud.microsoft/*` ← Microsoft's new URL (important)
- `https://outlook.microsoft.com/*`

### How to reload after code changes
1. Edit files locally
2. `chrome://extensions` → IBISWorld Outreach → click ↺ reload
3. Hard refresh Outlook tab (Ctrl+Shift+R)
4. **Do NOT just reload the tab** — must reload the extension first

### How to install fresh
1. `chrome://extensions` → Enable Developer mode
2. Load unpacked → select `outreach-extension/` folder
3. Open dashboard once (so bridge.js pushes contact data)
4. Open Outlook — sidebar appears automatically

### Design rules (same as dashboard)
- Font: DM Sans + DM Mono (Google Fonts)
- Red: `#C8102E`
- Background: `#f0f2f5`
- Stage pill colors match dashboard `STAGE_COLORS` exactly
- No shadows on the collapse badge

---

## HOW TO WORK WITH DAN

### Who Dan is
- Non-technical vibe coder — explain everything in plain English, no jargon
- Visual thinker — use emojis, tables, short bullets, never walls of text
- Moves fast — values speed and iteration over perfection

### How to communicate
- Before ANY change: one sentence explaining what you're about to do and why
- After ANY change: bullet list of exactly what changed, confirmed push, and what's next
- If something is broken or risky: flag it immediately with 🚨 before touching anything
- Max one logical change group at a time — always pause and summarize before moving on

### How to handle bugs & polish
- Small bugs and style fixes: just fix them, explain after, then push
- Anything that touches core logic or adds a new feature: propose a plan first, wait for Dan to say "go"
- If you're unsure what Dan wants: ask ONE specific question before proceeding

### Git workflow
- Always commit and push after every completed task
- Commit messages should be short and plain English (not technical)
- Always confirm: commit hash + "live in ~30 seconds"

### Vibe check
- Dan should always feel like he knows what's happening
- If the dashboard looks worse after a change, that's a failure — visual quality always matters
- When in doubt: simpler, cleaner, faster

---

## SLASH COMMANDS
Three commands live in `.claude/commands/` — type them anytime in Claude Code:

| Command | What it does |
|---|---|
| `/start-session` | Reads CLAUDE.md, prints version + last build + open items, asks what to tackle |
| `/check-session` | Health check — exchange count, uncommitted changes, unfinished tasks, recommendation |
| `/end-session` | Commits anything loose, confirms CLAUDE.md is current, prints safe-to-close summary |

---

## SESSION & CONTEXT MANAGEMENT

### Starting fresh — do this first
When a new session begins, Claude Code should:
1. Read CLAUDE.md fully
2. Confirm in one line: current version, last thing built, next open item
3. Ask Dan: "What do you want to tackle?"
- Never assume Dan remembers where things left off — he shouldn't have to

### Context window health
- After ~15 back-and-forth exchanges, say proactively:
  > 🧠 "Heads up — this session is getting long. Type `/compact` to compress history, or start a fresh window. CLAUDE.md has everything needed to pick up instantly."
- If responses feel repetitive or confused, flag it immediately — don't silently degrade

### Before closing a window — always confirm
- ✅ All changes committed and pushed to main
- ✅ CLAUDE.md reflects current state of the codebase
- ✅ Any unfinished work is noted below under Open Items

---

## OPEN ITEMS

| Priority | Item | Notes |
|---|---|---|
| ✅ Done | Licenses count on Accounts | Shown in card stat (replaces Clients) + table column, sortable. Uses `getLicCount(name)` via `normName()` matching. |
| ✅ Done | License badges on Account rows | `.alb-piq`, `.alb-intl`, `.alb-churn`, `.alb-trial` on cards + table. `getLicBadgeSpans()` / `getLicBadgesForAccount()`. |
| ✅ Done | Stale `ibis_local` cleanup | `stampLastSeen()` + `pruneStaleLocalData()` on CSV upload. Prunes entries not seen in >180 days with no notes/flags. |
| ✅ Done | Sort state persistence | Saved to `ibis_sort` key; restored on init via `restoreSortPref()`. |
| ✅ Done | Storage warning banner | Shows amber banner when any key >2MB or total >4MB; Clear Cache button strips only rev data. |
| ✅ Done | Update Claude model ID | Updated to `claude-sonnet-4-6`. |
| ✅ Done | Shared sort/filter pattern | Documented above under SORT / FILTER PATTERN. Full `TableControls` refactor deferred to 3rd tab. |
| ✅ Done | Wikipedia company descriptions | 5-step cascade: direct → suffix-stripped → slash-parts → Wikidata entity search → Wikipedia Search API. DESC_VERSION=6. 4-layer quality gate: `NON_BUSINESS_TERMS` + `isJustCompanyName` + `isGenericIndustryLabel` + `hasBusinessSignal` (positive require). `clearStaleDescs()` wipes old-version cache on load before first render. Claude revenue call also returns `description` field — highest quality, overwrites Wikipedia/Wikidata. |
| ✅ Done | 📌 Latest US filter chip | Licenses tab — deduplicates to 1 US Industry row per account (latest end date). Clears type/status filters on activate; those filters deactivate it. |
| ✅ Done | Lost renewal rule (Rule 0) | `applyLicenseRules`: `$0 + US + "renewal" in opp` → forces `_active=false`, `_churnTier=newchurn`. Prevents false PIQ promotion. Shown as US Industry. |
| ✅ Done | Logo flicker fix v2 | `logoResolved{}` cache — once a domain's URL resolves, stored in memory. Re-renders use cached URL at opacity:1 instantly. All three logo render sites (cards, accounts table, licenses table) check cache first. |
| ✅ Done | Opportunities tab (v22) | Kanban + Table view, drag-and-drop, CSV merge (add/update/archive), Cold section, stats bar. `ibis_opps` key. `setMainView()` refactored to 3-tab loop. |
| ✅ Done | Workables tab v23 overhaul | Renamed from Opportunities. New SF CSV schema (First/Last Name, Mailing Country, Last Activity). Additive merge only. Territory dot. Close date field. 6 stages incl. Future Revisit. Next Action emoji dropdown. Opp widget (dot → pill+amt+closedate). |
| ✅ Done | Accounts table v23 overhaul | Status column (Keep/Monitor/Drop portal dropdown). Workables column. US Client column. Active Client column. Tier multi-select filter. New filter chips (Keep/Monitor/Drop/Active License). Row click modal removed. Frozen sort order. |
| ✅ Done | Status dropdown portal | `#acct-status-portal` at body level, z-index:9500. Fixes table stacking context click-through permanently. `applyPortalStatus()` reverse-maps safeId → account name. Closes on scroll + click-outside. |
| ✅ Done | Frozen sort order | `frozenSortOrder[]` locks row order after explicit sort. Background enrichment + status changes never reshuffle rows. Clears only on explicit header click. |
| ✅ Done | acctStatus prune protection | `pruneStaleLocalData` now treats `acctStatus` as user data — won't prune an entry that has a Keep/Monitor/Drop set. |
| ✅ Done | Sentiment Score v24 | Weighted 1–10 composite score per account. Wikipedia + Wikidata + internal data. Battle card popover with factor breakdown. No paid API needed. `SENT_VERSION=1`. |
| ⚠️ Monitor | Description quality | DESC_VERSION=6. ~85% high quality. A few accounts may show vertical-tag fallback until Claude revenue enrichment runs. |
| ⚠️ Monitor | Sentiment score tuning | Score weights and thresholds may need adjustment after real-world use. Headline auto-generation covers ~10 scenarios. |
| 🗺️ Future | Cloudflare Worker proxy | `cloudflare-worker.js` ready in repo. Would unlock Claude API enrichment for higher-quality revenue, descriptions, and AI-powered sentiment from live site. |
| 🗺️ Future | Workables filter chips | Active Workables, Active Opportunities, Lost, Stalled filter chips — spec agreed but not yet built. |
| 🗺️ Future | Workables controls bar | Search field positioning, filter chip styling to match Licenses tab controls bar. |
| 🗺️ Future | Workables sort persistence | Sort state for Workables table not yet saved to `ibis_sort`. |
| 🗺️ Future | Opp dollar auto-format | Format sfAmt as currency on blur ($ prefix, comma separation). |
| 🗺️ Future | Licenses dropdown overflow | Type/Status filter dropdowns get clipped when only 1–2 rows showing. Needs position:fixed dropdown. |
| 🗺️ Future | Mobile/responsive layout | No media queries exist. |
| 🗺️ Future | Meetings layer | SF "Activities with Accounts" report |
| 🗺️ Future | Tasks/Samples layer | SF "Tasks and Events" report |
| ✅ Done | Outreach Extension foundation | `/outreach-extension/` — MV3 Chrome extension. Sidebar on Outlook with 3 campaign cards. Collapse badge (red "I", right-wall pinned, vertical drag). SPA resilience + context invalidation guards. |
| ✅ Done | Outreach Extension: Workables sync | `bridge.js` on dashboard pushes `ibis_opps` → `chrome.storage.local`. 3s poll fixes same-window CSV upload detection (storage event only fires cross-tab). |
| ✅ Done | Outreach Extension: search fix | `navigateToContact` now uses `window.open(..., '_blank')` to open search in new tab — avoids breaking the cloud.microsoft SPA. |
| ✅ Done | Outreach Extension v2.0: Priority Engine | Full rewrite. `config.js` for all settings. 3-view sidebar: Home → Contact List → Thread View. CORS fix: all email fetches route through background service worker. `allWorkables` (non-archived incl. Lost) used for Workables campaign count; `allContacts` (non-Lost) for Priority Engine. Diagnostic panel with token scope display. |
| ✅ Done | Outreach Extension: Workables campaign fix | `allWorkables` array tracks all non-archived contacts (including Lost stage). Workables campaign card shows correct full count. Contact row clicks use correct pool (allWorkables vs allContacts). |
| 🔥 BLOCKED | Outreach Extension: email scanning | **IBISWorld corporate tenant blocks mail API access.** Full debug trace: (1) cloud.microsoft OWA path → HTML (endpoint doesn't exist). (2) office365.com OWA REST → HTML (no valid cookies for that domain). (3) Graph `me/messages` → **403 ErrorAccessDenied** — Graph token IS found in MSAL localStorage but IBISWorld tenant policy means it's scoped for User.Read only, not Mail.Read. (4) Graph `search/query` → same 403. (5) OWA Bearer → HTML (OWA REST v2 only accepts legacy cookie auth, not Bearer). **Current code state:** 3-tier fallback in background.js (Graph messages → Graph search → OWA Bearer → OWA cookies), `extractMSALTokens()` decodes JWT aud+scp and logs scope to F12 console. **Next step: Dan needs to check F12 console for `[IBISWorld] Token summary:` line** to confirm token scope. If `scp` contains only `openid profile user.read`, the two options are: (A) register an Azure AD app with Mail.Read consent (proper fix, needs IT), or (B) build a DOM scraper that reads email data from the rendered Outlook page without any API. |
| ⚠️ Monitor | Outreach Extension: contact count | Workables card shows 0 until dashboard opened once (bridge.js pushes ibis_opps on load). |
| 🗺️ Future | Outreach Extension: DOM scraper fallback | If Azure AD app registration isn't possible, build `scraper.js` content script that reads email list from Outlook DOM when user opens thread view. No API needed — reads rendered rows. Triggered on-click only (not background scan). |
| 🗺️ Future | Outreach Extension: Winbacks campaign | Define filter logic (churned accounts, lost stage contacts) + populate from ibis_opps/ibis_licenses |
| 🗺️ Future | Outreach Extension: Samples campaign | Define filter logic + contact list |
| 🗺️ Future | Outreach Extension: Add Campaign modal | UI + storage for custom campaigns |
| 🗺️ Future | Outreach Extension: email compose integration | Pre-fill Outlook compose with contact name + template on click |
| 🗺️ Future | Outreach Extension: activity logging | Log sent emails back to dashboard (surface in Workables tab) |
