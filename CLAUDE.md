# CLAUDE.md — IBISWorld Sales Dashboard
*For Claude Code sessions. Read this before touching any code.*

---

## PROJECT OVERVIEW
Single-file sales intelligence dashboard for Dan Starr, BDM at IBISWorld (US Major Markets).
Built as a personal productivity tool — NOT an official IBISWorld product.

**Live URL:** https://dabbs4dan.github.io/ibisworld-dashboard
**Repo:** github.com/Dabbs4Dan/ibisworld-dashboard (public, main branch)
**File:** `index.html` — single self-contained file, ~8,700+ lines

---

## DEPLOY WORKFLOW
Claude Code edits `index.html` locally, then **Claude Code commits and pushes automatically** — Dan does not need to run any git commands.

After every completed task, Claude Code runs:
```
git add index.html
git commit -m "plain English description"
git push
```
GitHub Pages auto-deploys in ~30 seconds. Claude confirms with the commit hash.

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
  - `ibis_samples` → Old Samples campaign contacts, keyed by email (same schema as ibis_opps)
  - `ibis_6qa` → 6QA campaign contacts, keyed by email (same schema as ibis_opps)
  - `ibis_churn` → Churn campaign contacts, keyed by email (same schema as ibis_opps)
  - `ibis_netnew` → Net New campaign contacts, keyed by email (same schema as ibis_opps)
  - `ibis_multithread` → Multithread campaign contacts, keyed by email (same schema as ibis_opps)
  - `ibis_winback` → Winback campaign contacts, keyed by email (same schema as ibis_opps)
  - `ibis_powerback` → Powerback campaign contacts, keyed by email (same schema as ibis_opps)
  - `ibis_dead` → dead accounts array + dead licenses array + dead contacts (`{ accounts: [...], licenses: [...], sampleContacts: [...], sixqaContacts: [...], workableContacts: [...], churnContacts: [...], netnewContacts: [...], multithreadContacts: [...], winbackContacts: [...], powerbackContacts: [...] }`). Accounts added when missing from re-upload CSV; their licenses are **auto-moved to dead at the same time** (no separate license re-upload needed). Licenses also move independently when missing from license CSV re-upload. Each dead account carries `_deadSince`, `_statusAtDeath`, `_unexpectedDrop`, `_localSnapshot`.
  - `checkStorageSize()` fires on `init()` and after both CSV uploads; logs a console warning if any key exceeds 2MB or total exceeds 4MB
- All CSV parsing happens client-side in the browser

---

## CURRENT STATE — v33 (stable)

### Five tabs live:
1. **⚡ Action tab** — accounts Dan is actively working (new in v29)
2. **📋 Accounts tab** — main territory view
3. **🔑 Licenses tab** — churn/active license data (renamed from "License Intelligence")
4. **📣 Campaigns tab** — multi-campaign contact hub (was Workables); campaign dropdown lives in stats bar
5. **💀 Dead tab** — accounts/licenses/contacts that have disappeared from CSV uploads

### CSV Upload Date Display + Last Import Stats (v31)
- **Upload menu dots** — each CSV row in the Upload menu now shows the last upload date (e.g. "Apr 2") in green monospace instead of a green/grey square dot. Grey dash when not yet loaded.
  - `updateUploadDots()` reads `csvStats[key].date` for each campaign key mapped to its storage key + dot element ID
  - `MAP` inside `updateUploadDots()`: `{ accounts, licenses, workables, samples, sixqa, churn }` → `{ storageKey, dotId }`
- **Last Import stats panel** — far-right `stat-item` on Accounts, Licenses, and Campaigns stats bars
  - Shows: date in large monospace (`csv-stat-date`), green "+N added" pill (`csv-chip csv-chip-added`), red "−N removed" pill (`csv-chip csv-chip-removed`)
  - Campaigns panel is **context-aware**: switches to show stats for the selected campaign when `setCampaign(name)` is called → `renderCsvStatPanel('campaigns', name)`
  - Hidden on Action and Dead tabs (no CSV context)
- **`ibis_csv_stats`** localStorage key — JSON object keyed by campaign name: `{ accounts:{date,added,removed}, licenses:{...}, workables:{...}, samples:{...}, sixqa:{...}, churn:{...} }`
- **Key functions:** `loadCsvStats()`, `saveCsvStat(key, added, removed)`, `updateUploadDots()`, `renderCsvStatPanel(suffix, csvKey)`
- **Backfill:** on load, if `ibis_csv_stats.accounts` is missing but `ibis_updated` exists, synthesizes a date entry for accounts (preserving legacy data)

### Accounts Tab Features
- SF CSV upload → instant dashboard population
- Change detection → 🆕 flags new accounts
- Cards + Table view toggle
- Custom colored vertical dropdown
- Revenue column with auto-enrichment + progress indicator (bottom-right spinner)
- Logo cascade: UpLead → DuckDuckGo → Google Favicon → Initials
- Accounts CSV button now shows last upload date in the dropdown instead of green dot
- 6sense buying stage badges
- 🗑️ clear buttons next to each CSV upload — accounts clears `ibis_accounts`+`ibis_updated` only (preserves `ibis_local`); licenses clears `ibis_licenses` only
- **Row click modal removed** — clicking a row no longer opens the flags/notes/revenue modal (removed `onclick="openModal(...)"` from `<tr>` and `.account-card`)

#### Accounts Table Columns (left → right)
Status | Priority | Company | Opp | Vertical | Tier | Revenue | Score | Campaigns | US Client | Active Client | Opps | Licenses | Stage | Intent | Days Inactive

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

#### Campaigns Column (unified in v33)
- **Replaced** the separate Workables / Samples / 6QA columns with a single **Campaigns** column using `renderCampCluster(name)`.
- Shows **compact colored oval pills** (`.camp-oval`) — one per campaign with contacts, side-by-side in a single row (`.camp-cluster { flex-wrap:nowrap }`)
- **8 campaigns:** Workables (purple `#7c3aed`) · Old Samples (green `#059669`) · 6QA (cyan `#0891b2`) · Churn (orange `#c2410c`) · Net New (blue `#2563eb`) · Multithread (amber `#92400e`) · Winback (rose `#be185d`) · Powerback (teal `#0f766e`)
- Only campaigns with ≥1 contact show an oval; grey dash if none
- **Clickable** — click any oval opens `#contact-preview-portal` via `openContactPreview(event, name, type)` for that specific campaign
- `renderCampCluster(name)` — shared function used in Accounts table, Action table, Account page header stat strip
- `getKeyWorkable(name)` still used by Action tab cards and Account page Key Contact field

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
Company | Territory Dot | Opp | Stage | Action Headline | Next Date | Tier | Vertical | Active Client | Days Inactive | Campaigns | Priority

#### Territory Dot in Action Table (v30)
- Tiny column to the right of Company showing a green or grey dot
- 🟢 Green: account is in the master CSV (not skeleton, not dropped from CSV)
- ⚪ Grey: skeleton account (workable-anchored, never in CSV) OR dropped from CSV
- Logic: `const inTerritory = !isSkeleton && !isDropped` where `isSkeleton = !!acc._isSkeletonAccount`
- Reuses `.sixqa-terr-dot` CSS class (same as Old Samples / 6QA territory dots)

#### Campaigns Column in Action Table (v30)
- Shows all three campaign count bubbles side-by-side: `.wkbl-dot` (purple) + `.smpl-dot` (green) + `.sixqa-dot` (cyan)
- Each bubble clickable → opens `#contact-preview-portal` showing that account's contacts for that campaign
- Grey dash if no campaign contacts at all

#### Action Stage System (updated v30)
- `ACTION_STAGES` constant (8 stages — Tabled added, Multi-threading recolored):
  - 🚀 New Sequence (#15803d green / #dcfce7)
  - 👥 Multi-threading (#4338ca indigo / #eef2ff) — **was teal, changed to indigo to distinguish from New Sequence**
  - 💼 Active Opp (#92400e amber / #fef3c7)
  - 📋 Active Proposal (#6d28d9 purple / #ede9fe)
  - ⏸ Stalled (#9a3412 orange-red / #fff7ed)
  - 🔮 Future Reconnect (#475569 slate / #f1f5f9)
  - 🛟 Internal Support (#0369a1 cyan / #e0f2fe)
  - 🗄 Tabled (#6b7280 grey / #f3f4f6) — **NEW: hidden from main list by default**
- Stage stored in `ibis_local[name].acctActionStage`
- In the table: `.action-stage-select` — styled native `<select>`, pill shape, background+color+border matches stage. Uses `data-acctname="${escHtml(name)}"` + `onchange="setActionStage(this.dataset.acctname,this.value)"` — **never embed account name in JS string directly** (apostrophe bug).
- In the account page action block: same `<select>` with id `ap-action-stage-select`, same data-acctname pattern.

#### Tabled Stage (v30)
- Accounts set to 🗄 Tabled are **hidden from the main Action list and kanban by default**
- Only shown when the **🗄 Tabled** filter chip is active
- `renderAction()` always filters out tabled unless `actionStageFilters.has('tabled')`
- Kanban column for Tabled only renders when that filter is active
- Kanban column appears to the right of Internal Support

#### Action Stage Filter (updated v30)
- **Filter chips** (8 stage chips + 2 separators): `toggleActionStageFilter(val)` adds/removes from `actionStageFilters` Set
- **Chip colors**: chips show a subtle tinted version of their stage color always (55% opacity when inactive, full color+weight when active). `_applyActionChipColor(val, active)` handles both states. `initActionChipColors()` called on page init to set initial tints.
- **Column header dropdown**: `▾` button on Stage `<th>` opens a `.lic-dropdown` with checkboxes for all 8 stages + Unset (`id="action-dropdown-stage"`). Chips and dropdown **stay in sync bidirectionally**.
- `clearActionStageFilters()` resets both chips AND clears inline styles
- State: `actionStageFilters` (Set, global)

#### Action Stats Bar (redesigned v30)
- **Total Accounts** — all accounts with `hasAction=true`
- **Active Accounts** — non-tabled action accounts (all except `acctActionStage === 'tabled'`)
- **Open Opps** — accounts with `hasActiveOpp(name)` returning true
- **No Stage Set** — active (non-tabled) accounts with no stage assigned
- **Tabled** — count of tabled accounts
- IDs: `action-stat-total`, `action-stat-active`, `action-stat-opps`, `action-stat-nostage`, `action-stat-tabled`
- Old stats removed: Active (0-30d), Cooling (31-90d), Overdue (90d+), Avg Days Inactive

#### Auto-sync Workables → Action (v30)
- `syncAllWorkablesToAction()` runs on every page load (called from `init()` after all data loads)
- Iterates all non-archived, non-DQ workable contacts and calls `autoAddToAction(o.accountName)` for each
- Ensures any existing workables already pull their accounts into the Action tab without needing a CSV re-upload
- Skeleton accounts created for workable contacts whose account is not in the CSV (shown with grey territory dot)

#### Active Client Column Filter
- Clicking the "Active Client" `<th>` toggles `actionActiveClientFilter` boolean
- When active: only shows accounts with `getActiveLicBadges(name)` returning non-empty
- Visual indicator: red dot `●` appears inline in the header. Header gets `.lic-filter-active` class.
- `toggleActionActiveLicFilter()` function

#### Territory Dot (v29 kanban, v30 table)
- Small dot shown in the top-left of each kanban card AND as a column in the Action table
- 🟢 **Green** (`.action-terr-dot.in-csv` / `.sixqa-terr-dot.in-csv`): account is in the master CSV (not skeleton, not dropped)
- ⚪ **Grey** (`.action-terr-dot.dropped` / `.sixqa-terr-dot.dropped`): skeleton account (`_isSkeletonAccount`) or dropped from CSV (`_droppedFromCSV`)
- Kanban uses `.action-terr-dot` class; table column reuses `.sixqa-terr-dot` class (8×8px dot)

#### Action Kanban Cards (redesigned v29)
- Width: 240px per column (was 200px)
- Card padding: 12px, `border-radius:10px`, `position:relative`
- **Layout (top to bottom):**
  1. Card top row: territory dot · logo · account name (bold, links to account page) · optional next date (monospace muted) · optional action headline
  2. Card meta row: days badge (color-coded) · tier badge
  3. Key workable section (if workable exists): purple dot · contact name + title, separated by a divider border-top
- **Opp badge**: `<span class="action-opp-badge">` — absolute positioned top-right, blue pill, shows "Opp" when `acctOpp || hasAnyContactOpp(name)` is true. Read-only indicator, no click functionality.
- Account name click: `event.stopPropagation()` added to prevent drag interference → opens account deep-dive page

#### Action Stage Sort (v31)
- Stage `<th>` has a clickable `<span>Stage</span>` that calls `setActionSortCol('stage')`
- Sort arrow `id="axsort-stage"` updates with ▲/▼
- Kanban sort order: Unset(0) → new_sequence(1) → multithreading(2) → active_opp(3) → active_proposal(4) → stalled(5) → future_reconnect(6) → internal_support(7) → tabled(8)
- `STAGE_ORDER` map defined inline in sort switch case `'stage'`
- Filter ▾ button still works independently (stopPropagation on the button)

#### Dead Action Stage (v31)
- Selecting `💀 Remove from Action` from the stage dropdown triggers a confirm modal showing all associated workable contacts
- On confirm: `killActionAccount(name)` — moves all workable contacts for account to `deadWorkableContacts` with `_campaign:'workables'`, `_campaignLabel:'🎯 Workable'`; clears `hasAction` and `acctActionStage`; if skeleton account, removes from `accounts[]` entirely
- Stage select is reset to prior value BEFORE showing modal (no stale value in dropdown)
- `dead_action` is NOT in `ACTION_STAGES` — added only in `renderActionStageSelect()` as a separate `<option>` with a `<hr>` separator
- **Re-upload protection**: `mergeOpps()` checks `deadWorkableEmails` Set — killed contacts stay dead even if they reappear in a future Workables CSV upload. Only revivable via ↩ Revive button.
- **Revive button** on dead contacts panel: `reviveDeadContact(email, campaign)` — restores to correct campaign store (opps/samples/sixqa/churn), removes from dead array, calls `autoAddToAction` for workables

#### Kanban Overdue + Next Date Sort (v31)
- Kanban cards sorted within each column by `actionNextDate` (soonest first, nulls last)
- Cards with `actionNextDate < today` get `.action-card-overdue` class: `border-color:#fed7aa; background:#fffbf5`
- Next Date column in Action table is sortable: `setActionSortCol('nextdate')`, `id="axsort-nextdate"`, nulls sort to bottom

#### Skeleton Account Filter (v31)
- Skeleton accounts (`_isSkeletonAccount: true`) are completely hidden from Accounts tab: filtered in `getFiltered()`, excluded from `updateStats()` counts
- Only visible in Action tab (where they serve as anchors for workable contacts not in CSV)

#### Action Tab State Variables
```javascript
let actionView = 'cards';           // 'cards' | 'table'
let actionStageFilters = new Set(); // stages to filter by (empty = show all except Tabled)
let actionActiveClientFilter = false; // when true, only show accounts with active license
let actionHasOppFilter = false;     // when true, only show accounts with an active opp
let actionSortCol, actionSortDir;   // current sort
const ACTION_STAGES = [...];        // 8 stage objects with val, label, emoji, color, bg
```

#### Has Opp Filter Chip (v33)
- **💼 Has Opp** chip in Action controls bar filters to accounts with `hasActiveOpp(name) || hasAnyContactOpp(name)` — shows both account-level and contact-level active opps
- `toggleActionHasOppFilter()` — toggles `actionHasOppFilter` bool + `.active` class on `#action-filter-hasopp` chip, calls `renderAction()`
- **Opp column sortable (v33):** Click Opp `<th>` → `setActionSortCol('opp')`. Sort logic: `av = hasActiveOpp||hasAnyContactOpp ? 1 : 0`. `ACTION_SORT_DEFAULT_DIR.opp = 'desc'`. Arrow tracked at `#axsort-opp`.

#### ibis_local fields used by Action tab
- `hasAction` (bool) — whether account is in the Action list
- `acctActionStage` (string) — one of the 8 stage vals or '' ('' = unset; 'tabled' = hidden by default)
- `actionHeadline` (string) — short action note shown in table + cards
- `actionNextDate` (string) — free-text date, shown in table + cards
- `actionNotes` (string) — longer notes in account page action block (stored as HTML from contenteditable)
- `actionKeyContact` (string) — write-in key contact, shown in account page action block (new v29)

### Account Deep-Dive Page (new in v27)
- Full-page view — clicking any account name or logo transitions the entire dashboard to the account page (not a modal or drawer)
- **Entry points:** account name text + logo in Accounts table, Accounts cards, Licenses tab, Workables cards, Workables table (active + cold rows). Click targets are constrained — name text and logo only, not whole row.
- **Click handler pattern:** `onclick="goToAccount(this.dataset.name)"` + `data-name="${escHtml(name)}"` — safe for all account names including special characters. `event.stopPropagation()` used in table contexts.
- **Navigation:** sticky nav bar at `top:90px` (below 52px site header + 38px tab nav), `z-index:98`. Left: ← Back button + breadcrumb (`origin tab · Account Name`). Right: `‹ N / total ›` prev/next arrows.
- **Prev/next logic:** `goToAccount(name)` snapshots `getFilteredOrderedNames()` at click time (respects frozen sort + active filters). `accountPageOrigin`, `accountPageList`, `accountPageIdx` are global state vars.
- **Back navigation:** `closeAccountPage()` calls `setMainView(accountPageOrigin)` — returns to whichever tab opened the page. `setMainView()` also hides the account page whenever any tab is clicked directly.
- **Header now shows company description** (v29) — `local.desc` (from Wikipedia/Claude enrichment) displayed below the account name in small muted text. Hidden if no description loaded yet.
- **Key Contact field** (v32) — in the action block, between Next Date and Notes:
  - Shows ALL contacts for each campaign as individual chips — not just the first one
  - Auto-populated chips: workable contacts (purple `.ap-key-contact-auto`) + churn contacts (amber override) — each contact gets its own chip with name + title
  - Write-in input: type a name + press Enter → creates a saved blue chip (`.ap-kc-write-chip`) with an × delete button. Multiple write-ins supported.
  - Write-in chips stored as JSON array in `ibis_local[name].actionKeyContact` — `parseKCArray()` / `saveKCArray()` / `renderWriteInChips()` handle read/write/render
  - Container: `.ap-kc-all` (flex-wrap) holds all auto chips + write-in chips + the input field inline
  - CSS: `.ap-kc-write-chip` (blue `#eff6ff`/`#bfdbfe` border), `.ap-kc-chip-x` (delete button)
- **Notes field** (v32) — contenteditable `<div>` with full rich text editor UI:
  - **Unified toolbar frame**: `.ap-notes-editor` wraps toolbar + content area. Border-radius 8px, cyan focus ring (`#22d3ee`). Toolbar: `.ap-notes-toolbar` (grey `#fafafa` bg, `border-bottom`).
  - **Toolbar buttons**: B (bold), I (italic), separator, 🔗 (link), separator, • (bullet), Tx (clear format) — all use `.ap-notes-tool`; active state = `.nt-active` (indigo tint)
  - **Keyboard shortcuts**: Ctrl+B = bold, Ctrl+I = italic, Ctrl+K = insert link, Enter = blur/save, Shift+Enter = manual bullet (`<br>• ` via Range API — NOT `insertUnorderedList`)
  - **Link insert** (`insertNoteLink()`): prompts for URL; if text selected → `createLink`; if no selection → inserts `<a>` as linked text. Blocks `javascript:`, `data:`, `vbscript:` schemes. Ctrl+click on a link opens it in new tab.
  - **Active state tracking**: `updateNoteToolbarState()` checks `queryCommandState('bold'/'italic')` on keyup/mouseup/focus
  - Saves `innerHTML` to `ibis_local[name].actionNotes` on blur (HTML preserved for rich text)
  - CSS: `.ap-notes-editor`, `.ap-notes-toolbar`, `.ap-notes-tool`, `.ap-notes-sep`, `.ap-action-notes`, `.nt-active`
- **Six panels in a CSS grid (3 cols, 2 rows):**
  - Row 1, full width: **Header** — logo, name, description (v29), meta strip (Tier · Revenue · Vertical · Sentiment · Stage · Days inactive), stat strip (Licenses · Active Opps · Contacts · Intent · **Campaigns** · **Priority**)
    - **Grey dot removed** (v31): opp widget only shown when `local.acctOpp || hasAnyContactOpp(name)` is true — no more mysterious grey dot
    - **Campaigns stat** (v32): shows colored count bubbles (purple `.wkbl-dot` / green `.smpl-dot` / cyan `.sixqa-dot` / orange `.churn-dot` / blue `.netnew-dot`) — each clickable to open contact preview via `openContactPreview()`
    - **Priority stat** (v31): shows colored pill badge matching `PRIO_COLORS` map (`legendary:#fef3c7/#92400e`, etc.) — not plain text
    - **Contacts count** (v32): sums across all 5 campaign stores (opps + samples + sixqa + churn + netnew) via `normName()` match — was previously Workables-only
  - Row 2 col 1: **🎯 Priority Outreach** — contacts sorted by urgency, action labels
  - Row 2 col 2: **👥 Campaigns** — one column per campaign (🎯 Workables / 🧪 Old Samples / 🔥 6QA / 🐣 Churn / 🌱 Net New). Only columns with contacts are rendered.
  - Row 2 col 3: **💰 License History** — sorted active→newchurn→churned, ⚠ US churn callout
  - Row 3 col 1: **📈 Opportunities** — contacts with `sfOpp=true`
  - Row 3 cols 2–3: **📝 Account Plan** — inline editable textarea
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

### Churn Campaign (v31)
- **🐣 Churn** — fourth campaign under Campaigns tab. Same CSV schema as Old Samples/6QA (Account Name, First/Last Name, Title, Mailing Country, Email, Last Activity).
- **Colors:** orange/amber — bg `#fff7ed`, text `#c2410c`, count badge bg `#fed7aa`
- **`ibis_churn`** localStorage key (same keyed-by-email pattern as `ibis_opps`, `ibis_samples`, `ibis_6qa`)
- **Key functions:** `loadChurn()`, `saveChurn()`, `handleChurnCSV()`, `mergeChurn()`, `renderChurn()`, `deleteChurn()`, `clearChurnData()`, `getChurnCount(name)`, `getKeyChurnContact(name)`
- **Dead contacts:** `deadChurnContacts[]` — contacts missing from re-upload move here. `ibis_dead.churnContacts` array. Revivable via ↩ Revive button. Badge color: `background:#fed7aa;color:#c2410c`.
- **Accounts table:** `.churn-dot` bubble (orange) shown in Campaigns column next to workables/samples/sixqa dots
- **Account page Campaigns panel:** Churn column added (amber header `#fff7ed`/`#c2410c`). `renderAPCampaigns()` includes churn contacts.
- **Account page Key Contact:** `getKeyChurnContact(name)` auto-populates amber chip to the right of workable chip. Uses same `.ap-key-contact-auto` class with `background:#fff7ed; border-color:#fed7aa` override.
- **`openContactPreview()`** handles `type === 'churn'` — reads from `churn` object, label `'🐣 Churn'`
- **CAMPAIGN_DEFS entry:** `{ emoji:'🐣', label:'Churn', getCount: () => Object.values(churn).length, onActivate: () => renderChurn() }`

### Net New Campaign (v32)
- **🌱 Net New** — fifth campaign under Campaigns tab. Same CSV schema as Old Samples/6QA/Churn (Account Name, First/Last Name, Title, Mailing Country, Email, Last Activity).
- **Colors:** blue — bg `#eff6ff`, text `#1e40af`, count badge bg `#bfdbfe`
- **`ibis_netnew`** localStorage key (same keyed-by-email pattern as all other campaigns)
- **Key functions:** `loadNetnew()`, `saveNetnew()`, `handleNetnewCSV()`, `mergeNetnew()`, `renderNetnew()`, `deleteNetnew()`, `clearNetnewData()`, `getNetnewCount(name)`
- **Dead contacts:** `deadNetnewContacts[]` — contacts missing from re-upload move here. `ibis_dead.netnewContacts` array. Revivable via ↩ Revive button. Badge color: `background:#dbeafe;color:#1e40af`.
- **Accounts table:** `.netnew-dot` bubble (blue `#2563eb`) shown in Campaigns column alongside workables/samples/sixqa/churn dots
- **Account page Campaigns panel:** Net New column added (blue header `#eff6ff`/`#1e40af`). `renderAPCampaigns()` includes netnew contacts.
- **`openContactPreview()`** handles `type === 'netnew'` — reads from `netnew` object, label `'🌱 Net New'`
- **Action tab campaigns column:** `.netnew-dot` bubble added alongside other four campaign bubbles
- **CAMPAIGN_DEFS entry:** `{ emoji:'🌱', label:'Net New', getCount: () => Object.values(netnew).length, onActivate: () => renderNetnew() }`
- **Upload menu:** 🌱 Net New CSV row + `udot-netnew` dot + `netnew-file-input` file input + clear button

### Multithread Campaign (v33)
- **😎 Multithread** — sixth campaign under Campaigns tab. Same CSV schema as Old Samples/6QA/Churn/Net New (Account Name, First/Last Name, Title, Mailing Country, Email, Last Activity).
- **Colors:** amber/brown — bg `#fef3c7`, text `#92400e`, count badge bg `#fde68a`
- **`ibis_multithread`** localStorage key (same keyed-by-email pattern as all other campaigns)
- **Key functions:** `loadMultithread()`, `saveMultithread()`, `handleMultithreadCSV()`, `mergeMultithread()`, `renderMultithread()`, `deleteMultithread()`, `clearMultithreadData()`, `getMultithreadCount(name)`
- **Dead contacts:** `deadMultithreadContacts[]` — contacts missing from re-upload move here. `ibis_dead.multithreadContacts` array. Revivable via ↩ Revive button.
- **Campaign cluster oval:** amber `#92400e` — shown in Accounts + Action tables + Account page header via `renderCampCluster()`
- **CAMPAIGN_DEFS entry:** `{ emoji:'😎', label:'Multithread', getCount: () => Object.values(multithread).length, onActivate: () => renderMultithread() }`
- **Upload menu:** 😎 Multithread CSV row + `udot-multithread` dot + `multithread-file-input` file input + clear button

### Winback Campaign (v33)
- **❄️ Winback** — seventh campaign under Campaigns tab. Same CSV schema.
- **Colors:** rose/pink — bg `#fce7f3`, text `#be185d`, count badge bg `#fbcfe8`
- **`ibis_winback`** localStorage key
- **Key functions:** `loadWinback()`, `saveWinback()`, `handleWinbackCSV()`, `mergeWinback()`, `renderWinback()`, `deleteWinback()`, `clearWinbackData()`, `getWinbackCount(name)`
- **Dead contacts:** `deadWinbackContacts[]` → `ibis_dead.winbackContacts`
- **Campaign cluster oval:** rose `#be185d`
- **CAMPAIGN_DEFS entry:** `{ emoji:'❄️', label:'Winback', getCount: () => Object.values(winback).length, onActivate: () => renderWinback() }`
- **Upload menu:** ❄️ Winback CSV row + `udot-winback` dot + `winback-file-input` file input + clear button

### Powerback Campaign (v33)
- **🥶 Powerback** — eighth campaign under Campaigns tab. Same CSV schema.
- **Colors:** teal — bg `#ccfbf1`, text `#0f766e`, count badge bg `#99f6e4`
- **`ibis_powerback`** localStorage key
- **Key functions:** `loadPowerback()`, `savePowerback()`, `handlePowerbackCSV()`, `mergePowerback()`, `renderPowerback()`, `deletePowerback()`, `clearPowerbackData()`, `getPowerbackCount(name)`
- **Dead contacts:** `deadPowerbackContacts[]` → `ibis_dead.powerbackContacts`
- **Campaign cluster oval:** teal `#0f766e`
- **CAMPAIGN_DEFS entry:** `{ emoji:'🥶', label:'Powerback', getCount: () => Object.values(powerback).length, onActivate: () => renderPowerback() }`
- **Upload menu:** 🥶 Powerback CSV row + `udot-powerback` dot + `powerback-file-input` file input + clear button

### Campaign Cluster Widget (v33)
- **`renderCampCluster(name)`** — universal function returning a row of compact colored oval pills for all 8 campaigns.
- **CSS:** `.camp-cluster { display:inline-flex; align-items:center; gap:3px; flex-wrap:nowrap; }` — stays on one row always. `.camp-oval { height:20px; min-width:24px; border-radius:999px; color:#fff; font-size:10px; font-weight:700; font-family:'DM Mono',monospace; padding:0 6px; cursor:pointer; }`
- Only campaigns with ≥1 contact render an oval. Grey dash if all zero.
- Each oval is clickable → `openContactPreview(event, name, type)` shows contact preview popover for that campaign.
- **Used in 3 places:** Accounts table Campaigns column · Action table Campaigns column · Account page header stat strip
- `openContactPreview()` handles all 8 campaign types via `type` string matching.

### Dead Tab Features (v25, updated v33)
- **Purpose:** Accounts/licenses/contacts that disappear from a re-upload CSV move here instead of silently vanishing
- **Pill view switcher** — `⚰️ Accounts` / `🗂 Licenses` / `☠️ Contacts` buttons (not a dropdown), with live count badges
- **Resurrection:** if an account/license reappears in a future CSV upload, it's removed from dead and returns to the live tab
- **Dead accounts detection:** fires in `handleCSV()` when accounts already loaded — compares incoming names against current `accounts[]`; anything absent → pushed to `deadAccounts[]`
- **Dead licenses detection:** fires in `handleLicenseCSV()` similarly — missing license rows (matched by account name + license name) → pushed to `deadLicenses[]`
- **⚠️ Unexpected drop warning:** accounts that died WITHOUT being marked as `drop` status get an orange ⚠️ flag and sort to top of the table — these are accounts that left your territory unexpectedly
- **Status key note:** `_unexpectedDrop` is re-derived live in render as `statusKey !== 'drop'` — fixing any historical records that stored the wrong value
- **Dead accounts columns:** ⚠️ | Status | Company | Vertical | Tier | Revenue | Score | Intent | Stage | Days Inactive | Dead Since (mirrors live Accounts table)
- **Dead contacts (v31, updated v33):** unified view showing all dead campaign contacts. Color-coded campaign badge per row. **↩ Revive** button restores contact to correct campaign store via `reviveDeadContact(email, campaign)`.
- **Storage:** `ibis_dead` localStorage key → `{ accounts: [...], licenses: [...], sampleContacts: [...], sixqaContacts: [...], workableContacts: [...], churnContacts: [...], netnewContacts: [...], multithreadContacts: [...], winbackContacts: [...], powerbackContacts: [...] }`. Each dead account carries: `_deadSince` (ISO date), `_statusAtDeath` (raw key string), `_unexpectedDrop` (bool), `_localSnapshot` (copy of ibis_local entry at time of death)
- **State vars:** `let deadAccounts = [], deadLicenses = [], deadSampleContacts = [], deadSixqaContacts = [], deadWorkableContacts = [], deadChurnContacts = [], deadNetnewContacts = [], deadMultithreadContacts = [], deadWinbackContacts = [], deadPowerbackContacts = [], deadView = 'accounts'`
- **Key functions:** `saveDead()`, `loadDead()`, `updateDeadTabBadge()`, `renderDead()`, `renderDeadAccounts()`, `renderDeadLicenses()`, `renderDeadContacts()`, `reviveDeadContact(email, campaign)`, `setDeadView(v)`
- **Section IDs:** `dead-accts-section`, `dead-lics-section`, `dead-contacts-section` — explicit IDs used for show/hide

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
**Version:** v3.30
**Purpose:** DOM overlay injected into Outlook Web — shows staleness dots, days-since badge, step count, and company bubble directly on each email row + folder badge counts on campaign folders.

### Files
| File | Purpose |
|---|---|
| `manifest.json` | MV3. Runs on all Outlook URL variants + dabbs4dan.github.io |
| `content.js` | DOM overlay v3.30. Injects row badges + folder badges into Outlook. No sidebar. |
| `overlay.css` | Minimal CSS for badge classes (most styles applied inline with `!important` to beat Outlook) |
| `background.js` | Service worker. Generates red "I" icon via OffscreenCanvas. Also proxies cross-origin fetches for content scripts (FETCH_URL message). |
| `bridge.js` | Content script on dashboard. Merges ALL 8 campaign stores → `chrome.storage.local.outreach_contacts_raw` |
| `popup.html` | Simple "IBISWorld Overlay Active ✓" popup — version shown dynamically |
| `popup.js` | Reads `chrome.runtime.getManifest().version` and writes to `#ver` span |
| `config.js` | `IBIS_CONFIG.OVERDUE_DAYS = 3` — staleness threshold |

### How data flows
1. User opens dashboard → `bridge.js` merges all 8 campaign stores and pushes to `chrome.storage.local.outreach_contacts_raw`
2. User opens Outlook campaign folder → `content.js` reads contact map + PA email cache, scans email rows, injects badges
3. `bridge.js` polls every 3s for same-window changes; also listens for cross-tab storage events
4. PA flow `IBISWorld Contact Activity Sync` writes `contact_activity.json` to OneDrive → extension fetches via background proxy → uses real sent dates + step counts

### Storage keys (chrome.storage.local)
- `outreach_contacts_raw` — merged JSON of ALL 8 campaign contacts, written by bridge.js v1.4
- `outreach_contacts_ts` — timestamp of last push
- `ibis_folder_counts` — persisted folder overdue counts (JSON string `{folderName: count}`) — survives folder switches + page reloads

### PA Flow: "IBISWorld Contact Activity Sync"
- **Trigger:** Recurrence (every 2h)
- **Actions:** 7× Get emails (V3) — one per campaign folder (Workables, 6QA, Churns, Multithread, Winback, Old Samples, Net New) + 1× Get emails for Sent Items (Top:250, no date filter)
- **Sent Items:** ⚠️ KQL Search Query (`sent:>=`) was silently returning 0 results — removed. Now uses Top:250 with no filter. Top:500 times out.
- **Compose:** `union()` expression merges ALL 8 arrays (7 folders + Sent Items). ⚠️ Critical: Sent Items was missing from this union for months — only discovered when cache had 10 contacts vs expected 100+. After fix: 270 emails → 107 unique contacts. The current Compose expression is a nested union of all 8 Get emails steps — if adding a new folder step, you MUST add it to the Compose union or it will be silently ignored.
- **Select:** maps each email to `{id, from, toRecipients, receivedDateTime}` — feeds the Update file step
- **Update file (OneDrive):** writes to `contact_activity.json` in OneDrive
- **SharePoint direct download URL:** stored in `CONTACT_ACTIVITY_URL` const in content.js — append `&download=1` to SharePoint share link
- **Raw email fields used:** `from` (plain string), `toRecipients` (plain string — NOT an array in V3 output), `receivedDateTime` (ISO string), `id` (for deduplication)
- ⚠️ **`toRecipients` can be semicolon-separated multi-recipient string** — `processEmailCache` splits on `;` before processing
- ⚠️ **`toRecipients` is a plain string** (not an array) in Get emails (V3) output — `typeof check` required before `Array.isArray()`

### DOM Overlay (content.js v3.30)

#### Name-based contact matching (v3.30 — CRITICAL REWRITE)
- **Problem solved:** Date-based matching (`findEmailByDate()`) was the PRIMARY row-to-contact matching strategy. With 107+ contacts, date collisions caused wrong company names on most rows (e.g., all Workables rows showing "Tufts University" because one Tufts contact was emailed on the same day as other contacts). Step counts were also wrong because the PA cache count was for the wrong contact.
- **New matching pipeline** in `findContactForRow(row, activeFolder, domDate)`:
  1. **DOM email scan** (existing) — highest confidence, scans DOM attributes for `@` addresses
  2. **Greeting name parse** (NEW) — `extractGreetingName(row)` parses "Hi/Hey/Hello [Name]" from preview text → `matchContactsByFirstName(name, folder)` matches against contacts. Tries folder-restricted first, then cross-folder fallback. Date tiebreaking for ambiguous first names.
  3. **From name parse** (NEW) — `getNonDanFromNames(row)` extracts non-Dan sender names from the From field (for inbound/mixed threads like "Élise Doucet; Daniel Starr"). Tries full name match via `matchContactsByFullName()`, then first name.
  4. **Date matching** (existing, DEMOTED to last resort) — only used when all name strategies fail
- **`OWN_NAMES` Set** — filters Dan's own name from greeting parse to avoid self-matching on inbound replies where greeting says "Hi Daniel"
- **`contactMapLoaded` flag** — on first contact map load, strips all badges and re-scans to ensure name matching runs (previously rows matched before map loaded kept wrong date-matched data)
- **`findFromElement` fix** — now skips elements inside `.ibis-row-badges` to prevent matching our own injected badge text

#### Recovery heartbeat (v3.30)
- **Problem solved:** Outlook re-renders rows (virtual scrolling, SPA navigation), destroying injected badges. The 2-second rate limit on `scanEmailRows()` prevented immediate re-injection, leaving rows bare for seconds.
- **Fix:** `setInterval` every 3.5s checks for `[role="option"]` rows missing `data-ibis-processed` → forces re-scan with `lastScanTime = 0` (bypasses rate limit). Staggered from 1.5s folder badge heartbeat.

#### Helper functions (v3.30)
- `extractGreetingName(row)` — parses `\b(?:Hi|Hey|Hello|Dear)\s+([A-Z][a-z]{2,20})\b` from `row.textContent`. Filters `GENERIC` set (There, All, Team, Everyone, Folks, Friend, Sir, Madam) + `OWN_NAMES` (daniel, dan, starr).
- `getNonDanFromNames(row)` — uses `findFromElement(row)` to get From text, splits on `;`, filters out "Daniel Starr"
- `matchContactsByFirstName(firstName, folder)` — iterates `contactMap`, optionally filtered to contacts whose `_folders` includes `folder`. `folder = null` for cross-folder fallback.
- `matchContactsByFullName(fullName, folder)` — exact full-name match first, then falls back to first-name-only
- `tiebreakByDate(candidates, rowDate)` — when multiple contacts share a first name, picks the one whose PA cache dates are closest to the row's DOM date (±1 day tolerance)

#### Folder count model (v3.26+ — scan-only + pre-load)
- **Source of truth:** `folderCounts[f]` is ONLY set when the extension physically scans that folder's DOM rows. Estimation from PA cache was removed in v3.26 because dashboard campaign membership ≠ Outlook folder location (a contact in ibis_samples may have their emails in the Workables Outlook folder).
- **Pre-load on startup (v3.28):** On first cache load, estimates overdue counts for non-visited folders using real PA email dates + `_folders[0]` (primary dashboard campaign). With 107+ contacts this gives a useful approximation. Pre-loaded counts are only written to folders where `folderCounts[f] === undefined` (never scanned). Real scan overwrites when folder is visited.
- **Empty folder reset (v3.25):** When `scanEmailRows()` finds 0 rows, resets `folderCounts[activeFolder] = 0`, persists, calls `updateFolderBadges()` immediately.
- **Persistence:** `ibis_folder_counts` in chrome.storage.local. `FC_VERSION` bump clears all persisted counts on reload.

#### Folder-strict date matching (v3.29 — CRITICAL)
- **Problem solved:** With 107+ contacts in the PA cache, date collisions are very common (many contacts emailed on the same day). The old "noFolderBest" fallback allowed untagged contacts (in Sent Items but not in any dashboard campaign) to match any folder row by date — producing completely wrong company bubbles (Gmail/Evergreen contacts in LG's 6QA row).
- **Rule:** `findEmailByDate()` ONLY returns contacts whose `_folders` includes the active folder. If no such contact matches the date, returns null — shows staleness/step-count only, no company bubble. Never returns contacts from other folders or untagged contacts.
- **Exception:** when `hasFolderData = false` (bridge hasn't pushed `_folders` data yet), falls back to `globalBest` for graceful degradation.
- **±1 calendar day tolerance:** kept for the edge case where Outlook shows a time-string for <24h emails (parsed as "today") but PA cache has yesterday's date.

#### bridge.js v1.4 — `_folder` → `_folders` array
- Each contact now carries `_folders: string[]` — ALL campaign folders it belongs to (a contact in both Workables and Old Samples gets `_folders: ['Workables', 'Old Samples']`).
- First-campaign-wins for `accountName`; all folders collected for matching.

#### Row badges
- **Staleness chip** — colored dot (green→amber→orange→red→crimson) + glow + "Nd" or "today". DOM date is primary (always accurate to Outlook thread state). PA cache `lastDate` used only as fallback when DOM can't parse a date.
- **Step count** — envelope icon + count. Prefers Outlook DOM thread count (most accurate); falls back to PA cache count.
- **Reply chip** — green `↩` shown when contact has replied (inbound email detected in PA data with `hasReplied: true`).
- **Company bubble** — favicon + company name. Only shown when `findEmailByDate()` returns a folder-matched contact with a known `accountName` or domain. `FAVICON_DOMAIN_OVERRIDES`: `lge.com → lg.com`, `parker.com → parkerhannifin.com`.

#### Key functions
`scanEmailRows()`, `updateFolderBadges()`, `getDateFromRow()`, `findContactForRow()`, `findEmailByDate()`, `injectRowBadges()`, `loadEmailCache()`, `processEmailCache()`, `normFolder()`, `getThreadCountFromDOM()`

#### Key implementation details
- **`normFolder(text)`** — ⚠️ MUST use `\p{Extended_Pictographic}` NOT `\p{Emoji}` — `\p{Emoji}` includes ASCII digits 0–9, which strips "6" from "6QA".
- **`processEmailCache()`** — builds `emailCache` map: `{ email → { lastDate, count, dates[], hasReplied } }`. Splits `toRecipients` on `;` for multi-recipient emails. Inbound replies stored with `hasReplied:true`, `lastDate:''` (empty string, NOT null).
- **`toRecipients` "Name \<email\>" parsing** — uses `/<([^>@\s]+@[^>@\s]+)>/` regex to extract address correctly.
- **`PERSONAL_DOMAINS` Set** — free email domains excluded from company name guessing.
- **ID deduplication:** `seenIds` Set prevents double-counting emails appearing in both campaign folder AND Sent Items.
- **Mutation feedback loop prevention:** never call DOM-mutating functions directly from MutationObserver. Both `updateFolderBadges()` and `scanEmailRows()` run inside debounce (300ms). Heartbeat uses `setInterval`.
- **Re-entry guard:** `scanning` boolean prevents double-scans during Outlook re-renders.
- **Cache reload re-scan:** on first cache load (`isFirstLoad`), strips `data-ibis-processed` from all rows and re-scans immediately (`lastScanTime = 0` bypasses 2s rate limit).

### Background service worker (background.js) — FETCH proxy
- Added `FETCH_URL` message listener: content scripts send `{type:'FETCH_URL', url}` → background fetches → returns `{ok, data}` or `{ok:false, error}`.
- Required because MV3 content scripts cannot make cross-origin `fetch()` calls even with `host_permissions`. Background service worker can.

### CAMPAIGN_FOLDERS constant
```js
['Workables', '6QA', 'Churns', 'Multithread', 'Winback', 'Old Samples', 'Net New']
```
Folder names must match Outlook folder names exactly (no emoji prefix — title detection uses `document.title` which strips emoji).

### bridge.js v1.4 — all 8 campaigns + `_folders` array
Merges `ibis_opps`, `ibis_samples`, `ibis_6qa`, `ibis_churn`, `ibis_netnew`, `ibis_multithread`, `ibis_winback`, `ibis_powerback` into one flat contact map keyed by email. Each contact now carries `_folders: string[]` — ALL campaign folders it belongs to (a contact in both Workables and Old Samples gets `_folders: ['Workables', 'Old Samples']`). Used by `findEmailByDate()` for folder-strict date matching. Previously v1.3 only pushed `ibis_opps`; v1.4 pushes all 8 campaigns with multi-folder support.

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
- **Claude Code handles all git** — `git add index.html` → commit → push after every completed task. Dan never needs to run git manually.
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
| ✅ Done | Workables column redesign v29 | Moved to right of Opp in Accounts table. Shows contact name + title instead of count bubble. `getKeyWorkable(name)` helper — prefers sfOpp contact, falls back to first non-archived. "+N" overflow if multiple. **Reverted next session — see below.** |
| ✅ Done | Workables column reverted to count bubble | Moved back between Score and Samples. Purple count bubble only (`.wkbl-dot`). `getKeyWorkable` still used by Action cards + Account page Key Contact. |
| ✅ Done | Clickable count bubbles — Workables + Samples | Both `.wkbl-dot` and `.smpl-dot` bubbles are now clickable. Opens `#contact-preview-portal` (z-index:9700) showing a popover list of contacts for that account — name, title, and stage pill (workables) or name+title (samples). `openContactPreview(event, accountName, type)` + `closeContactPreview()`. Closes on click-outside or scroll. Works in Accounts table and Action table. |
| ✅ Done | Action stage select — light color scheme | Redesigned from dark solid fills (white text) to light tinted fills matching dashboard badge system. 🚀 `#dcfce7`/`#15803d` · 👥 `#dbeafe`/`#1d4ed8` · 💼 `#fef3c7`/`#92400e` · 📋 `#ede9fe`/`#6d28d9` · 🔮 `#f1f5f9`/`#475569` · 🛟 `#e0f2fe`/`#0369a1`. Border: `1px solid #d1d5db`, chevron: `#374151`. |
| ✅ Done | Action table Active Client + column filters v29 | Active Client moved to right of Vertical. Stage column has ▾ dropdown filter (checkboxes, synced with chips). Active Client column header is a toggle filter. State: `actionStageFilters` Set + `actionActiveClientFilter` bool. |
| ✅ Done | Action cards design pass v29 | 240px width, 10px radius, align-items:flex-start. Blue Opp badge (absolute top-right). Territory dot (green/grey). Account name click stopPropagation → opens account page. Date + headline in card header. Key workable name+title in card footer with divider. |
| ✅ Done | Action stage dropdown color fix | `.action-stage-select option { background:#fff !important; color:#111827 !important; }` — prevents selected stage bg color bleeding into dropdown option list. |
| ✅ Done | Account page: description below name | `local.desc` shown below account name in AP header — soft grey, hidden if empty. |
| ✅ Done | Account page: Key Contact field | In action block between Next Date and Notes. Auto-populates workable chip (right) + write-in input (left) when workable exists. Write-in only when no workable. Stored in `ibis_local[name].actionKeyContact`. |
| ✅ Done | 6QA campaign | 🔥 6QA — third campaign under Campaigns tab. Same CSV schema as Old Samples. Territory dots (green=in territory, grey=not). Dead contacts wiring (`ibis_dead.sixqaContacts`). `getSixqaCount(name)`. `.sixqa-dot` bubble (cyan) in Accounts + Action tables. Active Accounts Only filter chip. `CAMPAIGN_DEFS` entry. |
| ✅ Done | Account page Campaigns panel redesign v30 | Mini-table grouped by campaign: one column per campaign with colour-coded header + contacts stacked list-style. CSS: `.ap-campaigns-table`, `.ap-camp-col`, `.ap-camp-header`, `.ap-camp-row` etc. Replaces old per-contact card grid. |
| ✅ Done | Old Samples + 6QA table design pass v30 | Both tables now use `.table-wrap` wrapper (white rounded-border, matches Workables). Row layout uses same flex company cell + logo + Workables-style typography. Territory dots added to Old Samples (reuses `.sixqa-terr-dot` class). |
| ✅ Done | Tabled stage v30 | 8th ACTION_STAGE (🗄 grey). Hidden from main Action list and kanban by default. Only revealed when 🗄 Tabled filter chip is active. Kanban column renders to the right of Internal Support when active. |
| ✅ Done | Action stage colors overhaul v30 | Multi-threading changed from teal → indigo (#4338ca/#eef2ff) to distinguish from New Sequence green. All 8 stages now visually distinct. |
| ✅ Done | Action filter chip tints v30 | `_applyActionChipColor()` — chips show subtle tinted bg/color always (55% opacity inactive, full color active). `initActionChipColors()` sets tints on page load. `clearActionStageFilters()` resets inline styles. |
| ✅ Done | Action stats bar redesign v30 | New stats: Total Accounts · Active Accounts (non-tabled) · Open Opps · No Stage Set · Tabled. Removed: Active (0-30d), Cooling, Overdue, Avg Days Inactive. IDs: `action-stat-total/active/opps/nostage/tabled`. |
| ✅ Done | Auto-sync workables → Action v30 | `syncAllWorkablesToAction()` runs on init. Backfills all existing non-DQ/non-archived workable accounts into Action. Skeleton accounts created for workables whose account is not in CSV. |
| ✅ Done | Territory dot in Action table v30 | New column after Company: green if in CSV, grey if skeleton or dropped. Reuses `.sixqa-terr-dot` CSS class. |
| ✅ Done | Action stage select apostrophe bug fix | `onchange` now uses `data-acctname="${escHtml(name)}"` + `this.dataset.acctname` instead of embedding name in JS string. Fixes accounts with apostrophes (e.g. Women's Business Development Center). Applied to both table select and account page select. |
| ✅ Done | Card footer opp overflow fix | `.card-footer` now has `flex-wrap:wrap; gap:6px`. Opp inputs slightly narrower in card context (50px/66px). Active opp widget wraps below stage badge cleanly. |
| ✅ Done | CSV upload date display + Last Import stats panel | Upload menu dots now show last upload date (e.g. "Apr 2") in green monospace. Stats bar far-right panel shows date + "+N added" / "−N removed" chips. Context-aware for Campaigns tab. `ibis_csv_stats` key. `loadCsvStats()`, `saveCsvStat()`, `updateUploadDots()`, `renderCsvStatPanel()`. |
| ✅ Done | Dead Action stage | Selecting `💀 Remove from Action` from action stage dropdown triggers confirm modal showing workable contacts. `killActionAccount(name)` moves workables to dead, clears hasAction/stage, removes skeleton accounts. Re-upload protection in `mergeOpps()`. |
| ✅ Done | Kanban overdue sort + Next Date sort | Kanban cards sorted by nextDate within each column (soonest first). Overdue cards (nextDate < today) get `.action-card-overdue` orange border. Next Date column sortable in Action table (`axsort-nextdate`). |
| ✅ Done | Skeleton account filter from Accounts tab | `_isSkeletonAccount:true` accounts hidden from `getFiltered()` and `updateStats()` — invisible in Accounts tab, still visible in Action tab. |
| ✅ Done | Dead contacts Revive button | ↩ Revive button on each dead contact row. `reviveDeadContact(email, campaign)` restores to correct store (opps/samples/sixqa/churn), calls `autoAddToAction` for workables. |
| ✅ Done | 🐣 Churn campaign | Fourth campaign — same CSV schema as Old Samples/6QA. Orange/amber colors. `ibis_churn` key. Full function stack. Dead contacts wiring (`deadChurnContacts`). Churn chip on account page Key Contact row. Churn column in AP Campaigns panel. `.churn-dot` bubble. |
| ✅ Done | Action Stage column sort | Stage `<th>` clickable (span only, not the filter button). Sorts in kanban order: Unset→New Sequence→…→Tabled. `axsort-stage`. |
| ✅ Done | Action notes rich text | Textarea replaced with `contenteditable` div. Enter=blur, Shift+Enter=bullet list, Ctrl+B=bold. Always-visible label+toolbar row (B / •). Min-height 140px, drag-to-resize. Saves HTML to `ibis_local[name].actionNotes`. |
| ✅ Done | Account page design polish v31 | Grey dot removed from header (opp widget only when active). Priority stat shows colored bubble. Workables stat renamed Campaigns with colored count bubbles (all 4 campaigns). Key contact chips uniform pill shape. Write-in input becomes light-blue chip when filled (CSS only). |
| ✅ Done | 🌱 Net New campaign (v32) | Fifth campaign — same CSV schema as Old Samples/6QA/Churn. Blue colors. `ibis_netnew` key. Full function stack. Dead contacts wiring (`deadNetnewContacts`). `.netnew-dot` bubble in accounts/action tables. Net New column in AP Campaigns panel. |
| ✅ Done | Key contact chips — all contacts shown (v32) | Key Contact row now shows ALL workable + churn contacts as individual chips, not just the first. Write-in input creates saved chip with × delete on Enter. Stored as JSON array in `ibis_local[name].actionKeyContact`. |
| ✅ Done | Notes editor upgrade (v32) | Unified toolbar frame (`.ap-notes-editor` wrapper). Bold/italic/link/bullet/clear-format buttons with active state. Ctrl+B/I/K shortcuts. Link insert blocks unsafe URL schemes. Ctrl+click to follow links. Shift+Enter = plain bullet (Range API, not insertUnorderedList). |
| ✅ Done | Contacts count fix (v32) | `renderAPHeader` Contacts stat now sums across all 5 campaign stores (opps + samples + sixqa + churn + netnew). Was previously Workables-only. |
| ✅ Done | Security hardening (v32) | `.gitignore` added (protects `Data/` from accidental commit). `ALL_STORAGE_KEYS` now includes all 13 keys. Notes link blocks `javascript:`/`data:`/`vbscript:` schemes. CSP meta tag added to `index.html`. Email removed from `outreach-extension/config.js`. |
| 🔴 Next | Make GitHub repo private | CLAUDE.md + SF User ID + internal architecture is public. 2-minute fix on GitHub settings. ⚠️ GitHub Pages requires GitHub Pro for private repos — confirm before switching. |
| 🔴 Next | Dead Contacts resurrection logic | If a dead sample/sixqa/churn contact reappears in a future CSV re-upload, restore them to live and remove from dead. Not yet implemented. |
| 🗺️ Future | Old Samples: stage tracking | No stage dropdown yet. Could add simplified stages (Contacted / Responded etc) in future. |
| 🗺️ Future | Old Samples: cards view | Table-only for now. Cards view deferred. |
| ✅ Done | Campaigns: Winbacks/Multithread/Powerback | Three new campaigns added in v33. See above. |
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
| 🔥 BLOCKED | Outreach Extension: direct email API | IBISWorld tenant blocks all mail API paths — confirmed. Graph token scp = `openid profile user.read` only. All 5 approaches (OWA cloud.microsoft, OWA office365, Graph me/messages, Graph search/query, OWA Bearer) return 403/HTML. Fix requires IT (Azure AD app reg with Mail.Read). Workaround: PA flow below. |
| ✅ Done | Outreach Extension v3.x DOM overlay | Full rewrite of content.js — no sidebar, pure DOM overlay. Folder badge (orange count / grey 0). Row badges: staleness dot+glow+days chip, company bubble (from greeting text match). Mutation feedback loop fix (scanning guard + debounce). Bridge v1.3 pushes all 8 campaign stores. |
| ✅ Done | Outreach Extension v3.5 — PA flow + date matching | PA flow `IBISWorld Contact Activity Sync` built (Recurrence → 7 campaign folders + Sent Items → Compose union → Update OneDrive file). Extension fetches via background FETCH_URL proxy (CORS fix). Email cache: `{email→{lastDate,count,dates[]}}`. Date-based row matching via `findEmailByDate()`. ID dedup via `seenIds` Set. First-name guessing removed. Neutral company bubbles. Folder counts persisted to `ibis_folder_counts`. Version shown dynamically in popup. |
| ✅ Done | Outreach Extension v3.9–v3.13 — bug fixes + reply indicator | **v3.9:** `normFolder` trailing-star fix for 6QA ☆, exact title matching to prevent Winback sub-folder bleed, manifest version bump + Google favicon host_permission. **v3.10–v3.11:** `FC_VERSION` system to auto-clear stale folder counts on version bump (fixed Winback showing poisoned count of 23). **v3.12:** `\p{Emoji}` → `\p{Extended_Pictographic}` in normFolder (critical: `\p{Emoji}` includes digits 0–9, was stripping "6" from "6QA" causing zero badges). `updateFolderBadges` fallback to `.includes()` textContent after aria-label-only matching broke all badges. **v3.13:** `↩` reply chip (green) when contact has replied. `FAVICON_DOMAIN_OVERRIDES` (`lge.com→lg.com` fixes LG grey placeholder). `hasReplied` null→'' fix (empty string so date comparisons work). "Name \<email\>" toRecipients parsing. `getThreadCountFromDOM` broadened. `PERSONAL_DOMAINS` Set. |
| ✅ Done | Outreach Extension v3.14–v3.29 — PA data scarcity fix + folder-strict matching | **PA Compose union fix:** Sent Items step was returning data but NOT included in Compose `union()` expression — had been silently omitted since the step was added. Fix: added Sent Items as innermost union. Result: 10 contacts → 107 contacts, 20 emails → 270 emails. **KQL date filter removed:** `sent:>=` KQL on Sent Items returned 0 results silently; switched to Top:250 no filter. **Multi-recipient semicolon split (v3.27):** `toRecipients` can be `"a@x.com;b@x.com;c@x.com"` — split on `;` before processing. **Bridge v1.4:** each contact now carries `_folders: string[]` — all campaign folders it belongs to. **Folder-strict matching (v3.29 CRITICAL):** `findEmailByDate()` completely rewritten — with 107+ contacts date collisions are common. Old `noFolderBest` fallback allowed untagged contacts (Sent Items, not in any campaign) to match any folder row, causing scrambled company logos (Novo Nordisk appearing in LG's 6QA row). Fix: only return contacts whose `_folders.includes(activeFolder)`. **Scan-only folder count model (v3.26):** `refreshFolderCountsFromCache()` deleted — it falsely assumed dashboard campaign = Outlook folder. **Pre-load folder counts on startup (v3.28):** estimates overdue counts from PA cache on first load for unvisited folders. **Empty folder reset (v3.25):** 0 rows → badge resets to 0. **`FAVICON_DOMAIN_OVERRIDES` extended:** `parker.com → parkerhannifin.com`. |
| ✅ Done | PA flow: Sent Items date filter (deprecated) | KQL `sent:>=` filter was silently returning 0 results — removed in this session. Sent Items now uses Top:250 with no filter. Top:500 times out. Note: the auto-rolling 90-day window approach is no longer active. |
| 🔴 Next | Verify v3.29 scrambled logo fix | Dan needs to reload extension (↺ on chrome://extensions) + hard refresh Outlook, then navigate to 6QA to confirm only real 6QA contacts appear in company bubbles (Novo Nordisk / Gmail / Evergreen should no longer show). |
| 🔴 Next | PA flow: tag emails with source folder | Currently `_folders[0]` (dashboard campaign primary) used as proxy for Outlook folder — imperfect (e.g. Elise in ibis_samples but emails in Workables Outlook folder). Real fix: PA flow should include a `sourceFolder` field on each email. Would also enable accurate pre-loaded folder counts for unvisited folders. |
| ⚠️ Monitor | Outreach Extension: company bubble accuracy | Company bubble now only shows for folder-matched contacts (v3.29 strict). May show blank for contacts whose `_folders` doesn't include the current Outlook folder — these will show staleness/step count but no bubble. |
| 🗺️ Future | Outreach Extension: DOM scraper fallback | If Azure AD app registration isn't possible, build `scraper.js` content script that reads email list from Outlook DOM when user opens thread view. No API needed — reads rendered rows. Triggered on-click only (not background scan). |
| 🗺️ Future | Outreach Extension: Winbacks campaign | Define filter logic (churned accounts, lost stage contacts) + populate from ibis_opps/ibis_licenses |
| 🗺️ Future | Outreach Extension: Samples campaign | Define filter logic + contact list |
| 🗺️ Future | Outreach Extension: Add Campaign modal | UI + storage for custom campaigns |
| 🗺️ Future | Outreach Extension: email compose integration | Pre-fill Outlook compose with contact name + template on click |
| 🗺️ Future | Outreach Extension: activity logging | Log sent emails back to dashboard (surface in Workables tab) |
| ✅ Done | Slash command worktree fix | `/end-session` Step 4b now deletes project history entry FIRST (before git worktree remove) so it's always gone even when session is inside the worktree. `/start-session` now auto-runs full cleanup (remove + branch delete + history delete) when stale worktrees are detected from the main folder. |
| ✅ Done | Action tab: Has Opp filter chip + opp sort (v33) | `💼 Has Opp` chip in Action controls bar. `actionHasOppFilter` bool + `toggleActionHasOppFilter()`. Filters to `hasActiveOpp(name) || hasAnyContactOpp(name)`. Opp column header now sortable (`setActionSortCol('opp')`), sort tracked at `#axsort-opp`. |
| ✅ Done | 3 new campaigns: Multithread / Winback / Powerback (v33) | 😎 Multithread (amber), ❄️ Winback (rose), 🥶 Powerback (teal). All have full function stacks, upload CSV rows, dead contact wiring, CAMPAIGN_DEFS entries. Same schema as all other campaigns. |
| ✅ Done | Universal campaign cluster widget (v33) | `renderCampCluster(name)` — compact oval pills for all 8 campaigns. `.camp-oval` CSS. Replaced 3 separate columns (Workables/Samples/6QA) in Accounts table with one unified Campaigns column. Used in Accounts table, Action table, Account page header. Each oval clickable for preview. |
| ✅ Done | Action tab design pass (v33) | Camp cluster `flex-wrap:nowrap` (ovals no longer stack vertically). Controls bar chips now wrap naturally (removed nowrap from `#controls-action`). Campaigns `<th>` min-width:110px. Opp badge padding 7→8px. Territory dot size 7→8px. |
| 🗺️ Future | Campaigns: Winbacks campaign | NOW DONE as ❄️ Winback (v33). |
| 🔴 Next | Dead Contacts resurrection logic | If a dead sample/sixqa/churn/multithread/winback/powerback contact reappears in a future CSV re-upload, restore them to live and remove from dead. Not yet implemented for any campaign except workables. |
