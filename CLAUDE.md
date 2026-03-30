# CLAUDE.md — IBISWorld Sales Dashboard
*For Claude Code sessions. Read this before touching any code.*

---

## PROJECT OVERVIEW
Single-file sales intelligence dashboard for Dan Starr, BDM at IBISWorld (US Major Markets).
Built as a personal productivity tool — NOT an official IBISWorld product.

**Live URL:** https://dabbs4dan.github.io/ibisworld-dashboard
**Repo:** github.com/Dabbs4Dan/ibisworld-dashboard (public, main branch)
**File:** `index.html` — single self-contained file, ~5,200+ lines

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
  - `ibis_dead` → dead accounts array + dead licenses array (`{ accounts: [...], licenses: [...] }`). Accounts added when missing from re-upload CSV; their licenses are **auto-moved to dead at the same time** (no separate license re-upload needed). Licenses also move independently when missing from license CSV re-upload. Each dead account carries `_deadSince`, `_statusAtDeath`, `_unexpectedDrop`, `_localSnapshot`.
  - `checkStorageSize()` fires on `init()` and after both CSV uploads; logs a console warning if any key exceeds 2MB or total exceeds 4MB
- All CSV parsing happens client-side in the browser

---

## CURRENT STATE — v29 (stable)

### Five tabs live:
1. **⚡ Action tab** — accounts Dan is actively working (new in v29)
2. **📋 Accounts tab** — main territory view
3. **🔑 Licenses tab** — churn/active license data (renamed from "License Intelligence")
4. **📣 Campaigns tab** — multi-campaign contact hub (was Workables); campaign dropdown lives in stats bar
5. **💀 Dead tab** — accounts/licenses/contacts that have disappeared from CSV uploads

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
Status | Priority | Company | Opp | Workables | Vertical | Tier | Revenue | Score | Samples | US Client | Active Client | Opps | Licenses | Stage | Intent | Days Inactive

#### Status Column (new in v23)
- Per-account dropdown: **✓ Keep** (green), **👁 Monitor** (yellow), **✗ Drop** (red), **— ** (grey dash)
- Stored in `ibis_local[name].acctStatus` — persists across CSV uploads; `pruneStaleLocalData` treats `acctStatus` as user data (won't prune)
- **Portal dropdown** — menu rendered in `<div id="acct-status-portal">` at `<body>` level (NOT inside the table), `z-index:9500`. Avoids all table stacking context / click-through issues permanently. `openAcctStatusPortal(id, triggerBtn)` positions portal via `getBoundingClientRect()`. `applyPortalStatus(status)` recovers account name by reverse-matching the wrap ID against `accounts[]` — no JS string escaping needed
- In-place trigger update on selection (no `renderAll()` call) — selection is instant, row order never changes
- Closes on click-outside and on scroll
- **Collapsible column** — toggle button (`‹`/`›`) is a visible grey pill in the `<th>`. Collapsed state shrinks to 28px strip (not zero) showing only the expand button; `td` cells get `background:#f9fafb` as visual cue. `<span class="status-col-label">` wraps text so it hides independently from the button. CSS class `table.status-col-collapsed` controls all collapsed states.

#### Priority Column (new in v26)
- Per-account dropdown with 5 rarity tiers (Minecraft-style item rarity):
  - 💎 **Legendary** (gold) · ⭐ **Very Rare** (purple) · 🔨 **Rare** (blue) · ⛏ **Uncommon** (green) · 🪵 **Common** (grey) · dash (unset)
- Stored in `ibis_local[name].acctPriority` — same prune protection as `acctStatus`
- **Portal dropdown** — `<div id="acct-priority-portal">` at `<body>` level, `z-index:9501`. Same architecture as status portal. `openAcctPriorityPortal(id, triggerBtn)` / `applyPortalPriority(prio)` mirror status pattern exactly.
- Filter chips: 💎 Legendary · ⭐ Very Rare · 🔨 Rare · ⛏ Uncommon in the top filter bar
- Sortable column; `acctPriority` added to `ACCT_SORT_DEFAULT_DIR`

#### Workables Column (redesigned in v29)
- Shows **contact name + title** of the primary workable (not a count bubble any more)
- `getKeyWorkable(name)` — returns the key workable contact: prefers `sfOpp=true` contact, falls back to first non-archived. Returns `null` if none.
- `getWorkableCount(name)` still used for sort and for the "+N" overflow indicator (e.g. "John Smith +2")
- Layout: small purple dot · Name (bold 12px, truncated) · Title below (muted 10px, truncated) · "+N" count if multiple
- Grey dash if no workables

#### US Client Column (new in v23)
- Green ✓ checkmark if account has ANY US Industry license in `ibis_licenses` (regardless of active/churn status)
- `hasUSLicense(name)` — grey dash if none

#### Active Client Column (new in v23)
- Shows **only active PIQ or INTL** license badges borrowed from Licenses tab
- `getActiveLicBadges(name)` — returns coloured badge spans or empty string
- Grey dash if no active license — renamed from "Licenses" to "Active Client"

#### Filter Chips (v23 — replaced old Hot/Opp/Winback/Watching set; updated v26)
- ✓ Keep · 👁 Monitor · ✗ Drop · 🟢 Active License · 💎 Legendary · ⭐ Very Rare · 🔨 Rare · ⛏ Uncommon
- **OR-within-group / AND-between-group logic** (v26): chips in the same category are OR; chips from different categories are AND
  - e.g. Legendary + Very Rare = shows **either** (previously showed nothing)
  - e.g. Keep + Legendary = shows Keep accounts that are **also** Legendary
- Groups: Status (KEEP/MONITOR/DROP), Priority (PRIO_*), Stage (STAGE_*), Standalone (ACTIVE_LIC)
- `toggleChip(el, flag)` toggles individual flags; `renderAll()` re-evaluates all group logic on each filter change

#### Stage Filter (new in v26)
- Every 6sense Buying Stage badge in the accounts table AND card view is now clickable
- Click a badge → adds `STAGE_[value]` to `activeFlags`, filters to only that stage; outline ring appears on active badge
- Click same badge again → clears that stage filter
- Multiple stage badges can be active simultaneously (OR logic — same group mechanism as priority chips)
- `toggleStageFilter(stageVal)` — adds/removes `'STAGE_'+stageVal` key from `activeFlags`
- CSS: `.stage-tag.stage-clickable` (cursor), `.stage-tag.stage-active` (outline ring + offset)

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

### Action Tab Features (new in v28/v29)
- **Purpose:** Dan's live working list — accounts he's actively pursuing. Separate from the full Accounts tab territory view.
- **Entry point:** ⚡ bolt button on any account row in the Accounts table. Toggling ⚡ sets `ibis_local[name].hasAction = true`. Toggle again to remove.
- **Tabs nav:** `⚡ Action` is the first tab in the nav bar.
- **Protection rule:** Accounts with `hasAction=true` are NEVER moved to the Dead tab on CSV re-upload. They re-enter `accounts[]` with `_droppedFromCSV:true` flag and show an orange "dropped from CSV" badge. They stay visible in Action forever unless Dan manually removes ⚡.

#### Action Table Columns (left → right)
Company | Opp | Stage | Action Headline | Next Date | Tier | Vertical | Active Client | Days Inactive | Workables | Priority

#### Action Stage System
- `ACTION_STAGES` constant (6 stages):
  - 🚀 New Sequence (#16a34a green)
  - 👥 Multi-threading (#2563eb blue)
  - 💼 Active Opp (#d97706 amber)
  - 📋 Active Proposal (#7c3aed purple)
  - 🔮 Future Reconnect (#64748b slate)
  - 🤝 Internal Support (#0891b2 cyan)
- Stage stored in `ibis_local[name].acctActionStage`
- In the table: `.action-stage-select` — styled native `<select>`, pill shape, background color matches the stage, white text. Uses chevron SVG background-image. **Option elements always white bg + dark text (CSS rule) to prevent color bleed into dropdown list.**
- In the account page action block: same `<select>` with id `ap-action-stage-select`, synced via `setActionStage()`

#### Action Stage Filter
- **Filter chips** in the controls bar (6 chips + separator): `toggleActionStageFilter(val)` adds/removes from `actionStageFilters` Set
- **Column header dropdown**: `▾` button on Stage `<th>` opens a `.lic-dropdown` with checkboxes for all 6 stages + Unset (`id="action-dropdown-stage"`). Chips and dropdown **stay in sync bidirectionally**:
  - Chip click → `toggleActionStageFilter()` syncs checkbox
  - Checkbox change → `applyActionStageFromDropdown()` syncs chips
  - `clearActionStageFilters()` resets both
- State: `actionStageFilters` (Set, global)

#### Active Client Column Filter
- Clicking the "Active Client" `<th>` toggles `actionActiveClientFilter` boolean
- When active: only shows accounts with `getActiveLicBadges(name)` returning non-empty
- Visual indicator: red dot `●` appears inline in the header. Header gets `.lic-filter-active` class.
- `toggleActionActiveLicFilter()` function

#### Territory Dot (new in v29)
- Small dot shown in the top-left of each kanban card (next to logo)
- 🟢 **Green** (`.action-terr-dot.in-csv`): `!acc._droppedFromCSV` — account is still in the accounts CSV
- ⚪ **Grey** (`.action-terr-dot.dropped`): `acc._droppedFromCSV === true` — account was dropped from the CSV but protected by Action rule

#### Action Kanban Cards (redesigned v29)
- Width: 240px per column (was 200px)
- Card padding: 12px, `border-radius:10px`, `position:relative`
- **Layout (top to bottom):**
  1. Card top row: territory dot · logo · account name (bold, links to account page) · optional next date (monospace muted) · optional action headline
  2. Card meta row: days badge (color-coded) · tier badge
  3. Key workable section (if workable exists): purple dot · contact name + title, separated by a divider border-top
- **Opp badge**: `<span class="action-opp-badge">` — absolute positioned top-right, blue pill, shows "Opp" when `acctOpp || hasAnyContactOpp(name)` is true. Read-only indicator, no click functionality.
- Account name click: `event.stopPropagation()` added to prevent drag interference → opens account deep-dive page

#### Action Tab State Variables
```javascript
let actionView = 'cards';           // 'cards' | 'table'
let actionStageFilters = new Set(); // stages to filter by (empty = show all)
let actionActiveClientFilter = false; // when true, only show accounts with active license
let actionSortCol, actionSortDir;   // current sort
const ACTION_STAGES = [...];        // 6 stage objects with val, label, emoji, color, bg
```

#### ibis_local fields used by Action tab
- `hasAction` (bool) — whether account is in the Action list
- `acctActionStage` (string) — one of the 6 stage vals or ''
- `actionHeadline` (string) — short action note shown in table + cards
- `actionNextDate` (string) — free-text date, shown in table + cards
- `actionNotes` (string) — longer notes in account page action block
- `actionKeyContact` (string) — write-in key contact, shown in account page action block (new v29)

### Account Deep-Dive Page (new in v27)
- Full-page view — clicking any account name or logo transitions the entire dashboard to the account page (not a modal or drawer)
- **Entry points:** account name text + logo in Accounts table, Accounts cards, Licenses tab, Workables cards, Workables table (active + cold rows). Click targets are constrained — name text and logo only, not whole row.
- **Click handler pattern:** `onclick="goToAccount(this.dataset.name)"` + `data-name="${escHtml(name)}"` — safe for all account names including special characters. `event.stopPropagation()` used in table contexts.
- **Navigation:** sticky nav bar at `top:90px` (below 52px site header + 38px tab nav), `z-index:98`. Left: ← Back button + breadcrumb (`origin tab · Account Name`). Right: `‹ N / total ›` prev/next arrows.
- **Prev/next logic:** `goToAccount(name)` snapshots `getFilteredOrderedNames()` at click time (respects frozen sort + active filters). `accountPageOrigin`, `accountPageList`, `accountPageIdx` are global state vars.
- **Back navigation:** `closeAccountPage()` calls `setMainView(accountPageOrigin)` — returns to whichever tab opened the page. `setMainView()` also hides the account page whenever any tab is clicked directly.
- **Header now shows company description** (v29) — `local.desc` (from Wikipedia/Claude enrichment) displayed below the account name in small muted text. Hidden if no description loaded yet.
- **Key Contact field** (v29) — in the action block, between Next Date and Notes:
  - If a workable exists: write-in input on the LEFT ("Add another contact…") + auto-populated workable chip on the RIGHT (purple pill with name+title from `getKeyWorkable()`)
  - If no workable: single write-in input ("Write in a key contact…")
  - Stored in `ibis_local[name].actionKeyContact`, saved via `saveActionField(name,'actionKeyContact',value)`
  - CSS: `.ap-key-contact-row`, `.ap-key-contact-label`, `.ap-key-contact-input`, `.ap-key-contact-auto`
- **Six panels in a CSS grid (3 cols, 2 rows):**
  - Row 1, full width: **Header** — logo (same cascade), name, description (new v29), meta strip (Tier · Revenue · Vertical · Sentiment badge · Stage · Days inactive), stat strip (Licenses · Active Opps · Contacts · Intent · Workables · Priority)
  - Row 2 col 1: **🎯 Priority Outreach** — contacts sorted by urgency, action labels (Email today / Follow up / Re-engage / On ice)
  - Row 2 col 2: **👥 Campaigns** — all non-archived contacts with avatar, stage pill, days chip; "+ Add contact" placeholder
  - Row 2 col 3: **💰 License History** — sorted active→newchurn→churned, ⚠ US churn callout, type badges use existing `.lic-type-badge` classes
  - Row 3 col 1: **📈 Opportunities** — contacts with `sfOpp=true`, stage pill, amount, close date; placeholder button
  - Row 3 cols 2–3: **📝 Account Plan** — inline editable textarea, auto-saves to `ibis_local[name].accountPlan` on every keystroke
- **Account plan persistence:** `accountPlan` stored in `ibis_local` — survives CSV re-uploads. `pruneStaleLocalData` treats it as user data (won't prune).
- **State vars:** `accountPageOrigin`, `accountPageList`, `accountPageIdx` declared at global scope near `frozenSortOrder`
- **Key functions:** `goToAccount(name)`, `openAccountPage(name, origin, list, idx)`, `closeAccountPage()`, `navAccountPage(dir)`, `renderAccountPage(name)`, `renderAPHeader`, `renderAPPriorityOutreach`, `renderAPCampaigns`, `renderAPLicenses`, `renderAPOpportunities`, `renderAPPlan`
- **Not yet built:** live PA data sync, AI briefing panel, campaign type segmentation (Workables/Winbacks/Samples), prev/next for Licenses+Workables origins (currently passes empty list — arrows disabled)

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

### Dead Tab Features (v25)
- **Purpose:** Accounts/licenses that disappear from a re-upload CSV move here instead of silently vanishing
- **Pill view switcher** — `⚰️ Accounts` / `🗂 Licenses` buttons (not a dropdown), with live count badges
- **Resurrection:** if an account/license reappears in a future CSV upload, it's removed from dead and returns to the live tab
- **Dead accounts detection:** fires in `handleCSV()` when accounts already loaded — compares incoming names against current `accounts[]`; anything absent → pushed to `deadAccounts[]`
- **Dead licenses detection:** fires in `handleLicenseCSV()` similarly — missing license rows (matched by account name + license name) → pushed to `deadLicenses[]`
- **⚠️ Unexpected drop warning:** accounts that died WITHOUT being marked as `drop` status get an orange ⚠️ flag and sort to top of the table — these are accounts that left your territory unexpectedly
- **Status key note:** `_unexpectedDrop` is re-derived live in render as `statusKey !== 'drop'` — fixing any historical records that stored the wrong value
- **Dead accounts columns:** ⚠️ | Status | Company | Vertical | Tier | Revenue | Score | Intent | Stage | Days Inactive | Dead Since (mirrors live Accounts table)
- **Storage:** `ibis_dead` localStorage key → `{ accounts: [...], licenses: [...] }`. Each dead account carries: `_deadSince` (ISO date), `_statusAtDeath` (raw key string), `_unexpectedDrop` (bool), `_localSnapshot` (copy of ibis_local entry at time of death)
- **State vars** (declared at global scope alongside other state, line ~1469): `let deadAccounts = [], deadLicenses = [], deadView = 'accounts'`
- **Key functions:** `saveDead()`, `loadDead()`, `updateDeadTabBadge()`, `renderDead()`, `renderDeadAccounts()`, `renderDeadLicenses()`, `setDeadView(v)`
- **Section IDs:** `dead-accts-section` and `dead-lics-section` — explicit IDs used for show/hide (NOT fragile querySelectorAll indexing)

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
> 📐 **Full design system lives in `DESIGN.md`** — read it at session start (`/start-session` loads it automatically).
> Before writing any CSS or HTML: check DESIGN.md for the component you're building.
> After UI work: update the DESIGN.md changelog in `/end-session`.

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
- **Reference `DESIGN.md`** (in this repo) when building or modifying any UI component — it contains the full locked token set, component reference, and anti-patterns list.
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

## POWER AUTOMATE PIPELINE — In Progress

### Goal
Replace manual CSV uploads with an automated PA flow that runs every 4 hours, writes JSON files to OneDrive, and the dashboard fetches on load.

### Flow: "Dashboard Sync" (created in make.powerautomate.com)
- **Trigger:** Recurrence every 4 hours
- **SF Connection:** "Unique Dashboard Connection" (Dan's personal IBISWorld SF credentials, Production)
- **Dan's SF User ID:** `005U100000534tpIAA`

### Step 1 ✅ DONE — Get Dan's Account IDs
- Action: **Get records** → Salesforce Object Type: **Account Teams**
- Filter: `UserId eq '005U100000534tpIAA'`
- Returns: 150 records, each with `AccountId` field — Dan's exact territory
- Confirmed working: status 200, correct TeamMemberRole: "BDM"

### Step 2 ✅ DONE — Get Full Account Data

**Flow fully working. Rebuilt using Apply to each loop instead of OR-chained filter (which timed out).**

Final flow structure (all saved in "Dashboard Sync"):
1. ✅ **Initialize variable** — Name: `AccountResults`, Type: Array, Value: empty
2. ✅ **Get records** (Salesforce) — Object Type: Account Teams, Filter: `UserId eq '005U100000534tpIAA'` — returns 150 account IDs
3. ✅ **Apply to each** (concurrency not yet set — runs sequentially, ~2 min) — loops over Account Teams `value` array
   - Inside: **Get records 1** (Salesforce) — Object Type: Accounts, Filter: `Id eq '[AccountId chip]'`, Select Query: `Name,Website,Major_Markets_Tier__c,Vertical__c,Sub_Vertical__c,NumberOfEmployees,AnnualRevenue,CurrencyIsoCode,Core_Clients__c,Core_Opportunities__c,US_Days_Since_Last_Activity__c,X6sense_Account_Intent_Score_IW__c,X6sense_Account_Buying_Stage_IW__c`, Connection: **Unique Dashboard Connection**
   - Inside: **Append to array variable** — Name: `AccountResults`, Value: body of Get records 1
4. ✅ **Create file** (OneDrive for Business) — Folder: `/Desktop/ibisworld-dashboard/Data`, File Name: `accounts.json`, File Content: `variables('AccountResults')`

**Confirmed working:** `accounts.json` written to OneDrive at `Desktop/ibisworld-dashboard/Data/accounts.json` — contains all 150 accounts with correct field data. Vertical__c comes as numbers (13, 44, 25 etc.) — needs lookup table in dashboard JS.

**Optional perf improvement:** Set Apply to each concurrency to 20 (currently sequential ~2 min — fine for 4hr sync).

**Next session action:** Wire dashboard to fetch `accounts.json` from OneDrive on load instead of requiring CSV upload. Need OneDrive share link + ~20 lines of fetch code in `index.html`.

### SF Field Mappings (confirmed from test run)
| Dashboard CSV column | SF API field name |
|---|---|
| Account Name | `Name` |
| Website | `Website` |
| Major Markets Tier | `Major_Markets_Tier__c` |
| Vertical | `Vertical__c` ⚠️ returns a number — needs lookup table |
| Sub-Vertical | `Sub_Vertical__c` |
| Employees | `NumberOfEmployees` |
| Annual Revenue | `AnnualRevenue` |
| Annual Revenue Currency | `CurrencyIsoCode` |
| # Core Clients | `Core_Clients__c` |
| # Core Opportunities | `Core_Opportunities__c` |
| US Days Since Last Activity | `US_Days_Since_Last_Activity__c` |
| 6sense Intent Score NA | `X6sense_Account_Intent_Score_IW__c` |
| 6sense Buying Stage NA | `X6sense_Account_Buying_Stage_IW__c` |

### ⚠️ Vertical Number Mapping Problem
`Vertical__c` stores numbers ("1", "13", "44" etc.) not text labels. The dashboard currently uses text labels ("Finance", "Manufacturing" etc.). Need to either:
- A) Add a lookup table in the dashboard JS that converts numbers to labels
- B) Find a text-label vertical field in SF (not confirmed to exist yet)

### Steps 3–5 (not started)
- Step 3: Repeat for Licenses (Account with Licenses & Products)
- Step 4: Repeat for Workables/Contacts
- Step 5: Dashboard code — fetch from OneDrive on load, fall back to localStorage CSV if fetch fails

### Security note
OneDrive share link is currently committed to GitHub (public repo). **However, it doesn't matter for now — SharePoint blocks cross-origin fetch() from GitHub Pages (CORS), so the dashboard can't use it anyway.** Fix is to switch PA to write to GitHub directly (see Open Items). Once fixed, the URL in `PA_CONFIG.accountsUrl` will point to `raw.githubusercontent.com` (public, no secrets needed).

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

## EMAIL DATA LAYER — ARCHITECTURE PRINCIPLES

The Priority Engine in the Outreach Extension needs email contact history (last sent, last received, thread status) per contact. This data could come from multiple sources depending on what's available.

### Design rule: swappable data source
**The extension must never be tightly coupled to any single data source.** Email history is written to a standardized JSON format in `chrome.storage.local` under `outreach_email_cache`. Any source can write to this key — the Priority Engine reads from it the same way regardless of origin.

### Standardized email cache format
```json
{
  "email@domain.com": {
    "lastSent":    "2026-03-20T14:00:00Z",
    "lastReceived": "2026-03-22T09:00:00Z",
    "lastSubject": "Re: IBISWorld demo",
    "source":      "powerautomate",
    "ts":          1742000000000
  }
}
```
The `source` field documents where the data came from. The Priority Engine only reads `lastSent`, `lastReceived`, `lastSubject`.

### Data source priority chain (fallback order)
1. **Power Automate sync** (`source: "powerautomate"`) — Flow reads Outlook sent+inbox, writes JSON to OneDrive, extension fetches it on load. Best coverage, fully passive. ⚠️ Tied to IBISWorld M365 account — if Dan leaves IBISWorld, this source disappears.
2. **MutationObserver cache** (`source: "dom_observer"`) — Passively captures emails as Dan browses Outlook naturally. Builds up over time. Works on any machine with the extension installed.
3. **Click-triggered DOM scrape** (`source: "dom_click"`) — On-demand capture when Dan opens a contact's thread from the sidebar. Zero setup, zero dependencies, works anywhere.
4. **No data** — Priority Engine degrades gracefully: all contacts default to `email_today` bucket until cache populates.

### ⚠️ Power Automate portability warning
Power Automate is available because Dan is employed at IBISWorld. **If Dan leaves IBISWorld:** source 1 disappears entirely. Sources 2 + 3 continue working on any new employer's Outlook setup with no changes needed. The extension is designed so sources 2+3 alone produce a usable (if slower-to-populate) Priority Engine.

### Future alternative sources (drop-in replacements for source 1)
- **IMAP bridge** — small local script (Python/Node) that reads via IMAP and writes the same JSON format to a shared file
- **Azure AD app** — if IT registers a custom app with Mail.Read, the extension can call Graph directly
- **Other automation tools** — Zapier, Make.com, n8n — any tool that can read Outlook and write a JSON file to a URL the extension can fetch

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
Four commands live in `.claude/commands/` — type them anytime in Claude Code:

| Command | What it does |
|---|---|
| `/start-session` | Reads CLAUDE.md + DESIGN.md via Read tool, prints version + last build + open items, asks what to tackle |
| `/check-session` | Health check — exchange count, uncommitted changes, unfinished tasks, recommendation |
| `/end-session` | Updates CLAUDE.md + memory files, commits, confirms DESIGN.md if UI work done, prints safe-to-close summary |
| `/design-pass [tab]` | Scoped visual/UX audit against DESIGN.md token set. Args: `campaigns` · `accounts` · `licenses` · `dead` · `account-page` · `all` |

---

## SESSION & CONTEXT MANAGEMENT

### Starting fresh — do this first
When a new session begins, Claude Code should:
1. **Use the Read tool** to read CLAUDE.md in 3 chunks (offset:0/250/500) — never rely on auto-injected context alone
2. **Use the Read tool** to read DESIGN.md fully
3. Confirm in one line: current version, last thing built, next open item
4. Ask Dan: "What do you want to tackle?"
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
| ✅ Done | Dead tab v25 | Accounts/licenses missing from re-upload CSV move here. Pill view switcher. ⚠️ unexpected drop flag (clickable to dismiss). Column parity with live accounts table. Resurrection on re-upload. `ibis_dead` key. Account death auto-moves its licenses to dead. |
| ✅ Done | Priority column v26 | Rarity-tier dropdown (💎 Legendary → 🪵 Common) via portal pattern. Stored in `ibis_local[name].acctPriority`. Filter chips in top bar. Sortable. Status column now collapsible to 28px strip with visible expand button. |
| ✅ Done | Stage filter + OR chip logic v26 | Stage badges in table + card are clickable to filter; active badge shows outline ring. Filter chips use OR-within-group / AND-between-group: Legendary+Very Rare shows either; Keep+Legendary shows intersection. `toggleStageFilter()` + group-aware filter logic in `renderAll()`. |
| ✅ Done | Account deep-dive page v27 (bones) | Full-page account view. Sticky nav + breadcrumb + prev/next. Six panels: header, priority outreach, campaigns, license history, opportunities, account plan. Click targets wired across Accounts (table + cards), Licenses tab, Workables (cards + table active + cold). `accountPlan` persists in `ibis_local`. |
| ✅ Done | DQ stage for Workables | Auto-tags contacts missing from re-upload CSV as DQ (grey stage). Hidden from main list by default. `⬜ DQ` filter chip shows them. Contacts that return in future upload → restored to Introduction. Toast shows DQ'd count. |
| ✅ Done | Campaigns tab v28 | Renamed from Workables. Campaign selector dropdown lives in the stats bar (large bold value, left side). Workables + Old Samples stats shown inline to the right. `📣 Campaigns` tab at top nav. Campaign dropdown is scalable to N campaigns. |
| ✅ Done | Old Samples campaign | `🧪 Old Samples` — second campaign under Campaigns tab. Same CSV schema as Workables (Account Name, First/Last Name, Title, Mailing Country, Email, Last Activity). Simple table view (no kanban). `ibis_samples` localStorage key. `parseSamplesCSV` reuses `parseOppsCSV`. Shows in Account deep-dive Campaigns panel with `🧪 Sample` badge. |
| ✅ Done | Dead Contacts tab section | `☠️ Contacts` pill added to Dead tab. When Old Samples CSV re-uploaded, missing contacts → moved to `deadSampleContacts[]` (stored in `ibis_dead.sampleContacts`). Badge shows `🧪 Old Sample`. Dead tab badge count includes unseen contacts. `renderDeadContacts()` function. |
| ✅ Done | Has Workables filter chip | Accounts tab filter bar — new `🎯 Has Workables` chip filters to accounts with ≥1 workable. Standalone filter, AND logic with other chips. `HAS_WORKABLES` flag in `knownFlags`. |
| ✅ Done | Samples column in Accounts table | Green count bubble (like Workables purple bubble) showing sample contact count per account. `getSampleCount(name)`. Sortable via `samples` sort key. |
| ✅ Done | Tier badge fix on Account page | Account deep-dive header showed `T2` — now shows `2` matching rest of dashboard. |
| ⚠️ Monitor | Description quality | DESC_VERSION=6. ~85% high quality. A few accounts may show vertical-tag fallback until Claude revenue enrichment runs. |
| ⚠️ Monitor | Sentiment score tuning | Score weights and thresholds may need adjustment after real-world use. Headline auto-generation covers ~10 scenarios. |
| 🗺️ Future | Cloudflare Worker proxy | `cloudflare-worker.js` ready in repo. Would unlock Claude API enrichment for higher-quality revenue, descriptions, and AI-powered sentiment from live site. |
| ✅ Done | PA Flow: Step 2 — Accounts sync | Flow rebuilt with Apply to each loop. Writes all 150 accounts to `accounts.json` in OneDrive. Vertical__c = numbers (needs lookup table). See PA PIPELINE section for full flow structure. |
| ✅ Done | Dead tab badge clears on first visit | `deadSeenKeys` Set (persisted to `ibis_dead_seen` localStorage). Badge shows only NEW unseen dead items. Clears when user opens Dead tab. `markDeadAsSeen()` called in `setMainView('dead')`. |
| 🗺️ Shelved | Wire accounts.json → dashboard via PowerShell | Dan decided to abandon PA/auto-sync approach and stick with CSV uploads. PA flow left intact in make.powerautomate.com if ever revisited. GitHub PAT stored in Dan's password manager. |
| ✅ Done | Shift+D debug panel | `openDebugPanel()` / `closeDebugPanel()` / `copyDebugReport()`. Shows PA sync status, Claude enrichment stats, localStorage sizes, data state, event log. `_dbg` global captures events. Press Shift+D anywhere to open; "Copy Report" button copies JSON to clipboard for Claude. |
| 🔴 Next | Account page: PA live data sync | Depends on PowerShell auto-push above. Once accounts.json lands in GitHub, dashboard auto-loads on every page open. |
| 🔴 Next | Account page: AI briefing panel | 7th panel powered by PA + AI Builder GPT prompt. Pre-call summary: relationship history, last email, sentiment, deal stage in 3 bullets. Drops into existing grid naturally. |
| 🗺️ Future | Account page: campaigns layer | Workables tab evolves into multi-campaign support (Workables / Winbacks / Samples). Account page campaigns panel shows segmented by campaign type. `opp.campaign` field added. |
| ✅ Done | Account page: prev/next for Licenses+Campaigns origins | `goToAccount()` builds context-appropriate list via `getFilteredLicenseAccountNames()` / `getFilteredCampaignAccountNames()`. Prev/Next arrows enabled from all tab origins. |
| 🗺️ Future | Account page: refresh on CSV re-upload | Account page is a snapshot at open time. If CSV uploads while page is open, data stays stale. Add re-render hook to `handleCSV` / `handleLicenseCSV`. |
| ✅ Done | Workables → Campaigns tab rename | `📣 Campaigns` tab. Campaign dropdown in stats bar (large bold value). Workables + Old Samples campaigns. Scalable to N campaigns via `CAMPAIGN_DEFS`. |
| ✅ Done | Campaigns tab UI/UX consistency pass | Spacing, padding, border-radius, shadow, typography violations fixed. opp-card 10px→12px padding, stage pills 9px→8px, kanban header 12px→11px font, controls bar 10px→12px, global td/th padding 10px→12px, td-logo radius 5px→6px. |
| ✅ Done | Design system foundation | `DESIGN.md` created with full locked token set. `/start-session` reads it. `/end-session` checks it. `/design-pass [tab]` command for scoped per-tab UI audits. |
| ✅ Done | :root CSS var alignment | `--text-primary`, `--text-secondary`, `--text-muted`, `--border`, `--border-hover` aligned to design system tokens. |
| ✅ Done | Global badge/pill radius | All badges, pills, chips across all tabs unified to `border-radius:999px`. License type/status badges, stage tags, sentiment badges, dvt-btn, filter chips, status/priority triggers — all standardized. |
| ✅ Done | PA pipeline removed | `PA_CONFIG`, `SF_VERTICAL_MAP`, `parseAccountsFromPA`, `fetchAccountsFromPA` removed (~55 lines). |
| ✅ Done | Account page prev/next from Licenses/Campaigns | `goToAccount()` now builds context-appropriate list: `getFilteredLicenseAccountNames()` / `getFilteredCampaignAccountNames()`. Prev/Next arrows work from all tab origins. |
| ✅ Done | CAMPAIGN_DEFS abstraction | `getCount` + `onActivate` on each def. `setCampaign()` and `updateCampaignPillCounts()` fully driven by `Object.keys(CAMPAIGN_DEFS)`. Adding a 3rd campaign = one entry in CAMPAIGN_DEFS. |
| ✅ Done | Account-level Opp system | `ibis_local[name].acctOpp/acctOppAmt/acctOppClose` — distinct from contact-level `ibis_opps`. Every account row always shows grey dot; active = blue pill. `renderAcctOppCell(name, local)` is shared helper used in Accounts table, Action tab, Account page header. `hasActiveOpp(name)` used for HAS_OPP filter chip. |
| ✅ Done | Opp column on Accounts table | New Opp column after Company column. Active opp rows get `.tr-opp-active` (light blue `#eff6ff` background). Cards get `.card-opp-active` neon blue glow border. `💼 Active Opp` filter chip (HAS_OPP). |
| ✅ Done | Account page Action block | Full-width `ap-action-block` card between header and 3-column panel grid on account deep-dive. Headline field + Next Date field + Notes textarea. Data stored in `ibis_local[name].actionHeadline/actionNextDate/actionNotes` — same keys as Action tab table inputs. |
| ✅ Done | Account page opp widget in header | `renderAcctOppCell()` shown inline next to account name in AP header. AP header gets `.ap-header-opp-active` class (neon blue glow border) when opp is active. |
| ✅ Done | Action tab: Action Headline + Next Date columns | Action table gets Action Headline input (`.action-headline-input` — underline style, clearly editable) and Next Date column. Saves to `ibis_local[name].actionHeadline/actionNextDate`. |
| ✅ Done | Action protection rule | Accounts with `hasAction=true` are skipped in dead detection during CSV re-upload. They re-enter the accounts array with `_droppedFromCSV:true` flag and show an orange "dropped from CSV" badge in the Action table. They never move to the Dead tab. |
| ✅ Done | Action tab: Opp column | Opp widget shown near Company column in Action table using `renderAcctOppCell()`. |
| ✅ Done | Campaign dropdown click-outside fix | Click-outside handler now checks both `wrap.contains(e.target)` AND `menu.contains(e.target)` before closing — prevents menu items being eaten before their onclick fires. Items get explicit `background:#fff`. Z-index raised to 9800. |
| ✅ Done | Unified Opp system 1:1 sync | `toggleSFOpp()` now syncs to `ibis_local` (account-level). `toggleAcctOpp()` now syncs primary contact's `sfOpp` in `ibis_opps`. Amounts + close dates shared. Opp active rows turn light blue in both Accounts + Action tables. |
| ✅ Done | Workables column redesign v29 | Moved to right of Opp in Accounts table. Shows contact name + title instead of count bubble. `getKeyWorkable(name)` helper — prefers sfOpp contact, falls back to first non-archived. "+N" overflow if multiple. |
| ✅ Done | Action table Active Client + column filters v29 | Active Client moved to right of Vertical. Stage column has ▾ dropdown filter (checkboxes, synced with chips). Active Client column header is a toggle filter. State: `actionStageFilters` Set + `actionActiveClientFilter` bool. |
| ✅ Done | Action cards design pass v29 | 240px width, 10px radius, align-items:flex-start. Blue Opp badge (absolute top-right). Territory dot (green/grey). Account name click stopPropagation → opens account page. Date + headline in card header. Key workable name+title in card footer with divider. |
| ✅ Done | Action stage dropdown color fix | `.action-stage-select option { background:#fff !important; color:#111827 !important; }` — prevents selected stage bg color bleeding into dropdown option list. |
| ✅ Done | Account page: description below name | `local.desc` shown below account name in AP header — soft grey, hidden if empty. |
| ✅ Done | Account page: Key Contact field | In action block between Next Date and Notes. Auto-populates workable chip (right) + write-in input (left) when workable exists. Write-in only when no workable. Stored in `ibis_local[name].actionKeyContact`. |
| 🔴 Next | Dead Contacts resurrection logic | If a dead sample contact reappears in a future Old Samples CSV re-upload, restore them to `samples` and remove from `deadSampleContacts`. Not yet implemented. |
| 🗺️ Future | Old Samples: stage tracking | No stage dropdown yet. Could add simplified stages (Contacted / Responded etc) in future. |
| 🗺️ Future | Old Samples: cards view | Table-only for now. Cards view deferred. |
| 🗺️ Future | Campaigns: Winbacks campaign | Third campaign type — churned license accounts + lost contacts. |
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
| 🔥 BLOCKED | Outreach Extension: direct email API | IBISWorld tenant blocks all mail API paths — confirmed. Graph token scp = `openid profile user.read` only. All 5 approaches (OWA cloud.microsoft, OWA office365, Graph me/messages, Graph search/query, OWA Bearer) return 403/HTML. **Workaround path chosen: Power Automate → SF Activities → OneDrive JSON** (see below). Direct API unblocking requires IT (Azure AD app reg with Mail.Read). |
| 🔴 Next | Outreach Extension: PA flow + extension wiring | Build `IBISWorld Contact Activity Sync` PA flow: recurrence trigger (every 2h) → Salesforce Get Records (Tasks, filter by WhoId populated) → compose `contact_activity.json` (one entry per contact email: lastSent, lastReceived, lastSubject, source:"powerautomate") → OneDrive Create/Update file in `IBISWorld Outreach/contact_activity.json`. Then update `config.js` with OneDrive share URL + update `content.js` to fetch + parse into `outreach_email_cache`. Export flow as zip → `/powerautomate-flows/contact-activity-sync.zip` in repo. |
| ⚠️ Monitor | Outreach Extension: contact count | Workables card shows 0 until dashboard opened once (bridge.js pushes ibis_opps on load). |
| 🗺️ Future | Outreach Extension: DOM scraper fallback | If Azure AD app registration isn't possible, build `scraper.js` content script that reads email list from Outlook DOM when user opens thread view. No API needed — reads rendered rows. Triggered on-click only (not background scan). |
| 🗺️ Future | Outreach Extension: Winbacks campaign | Define filter logic (churned accounts, lost stage contacts) + populate from ibis_opps/ibis_licenses |
| 🗺️ Future | Outreach Extension: Samples campaign | Define filter logic + contact list |
| 🗺️ Future | Outreach Extension: Add Campaign modal | UI + storage for custom campaigns |
| 🗺️ Future | Outreach Extension: email compose integration | Pre-fill Outlook compose with contact name + template on click |
| 🗺️ Future | Outreach Extension: activity logging | Log sent emails back to dashboard (surface in Workables tab) |
