# CLAUDE.md — IBISWorld Sales Dashboard
*For Claude Code sessions. Read this before touching any code.*

---

## PROJECT OVERVIEW
Single-file sales intelligence dashboard for Dan Starr, BDM at IBISWorld (US Major Markets).
Built as a personal productivity tool — NOT an official IBISWorld product.

**Live URL:** https://dabbs4dan.github.io/ibisworld-dashboard
**Repo:** github.com/Dabbs4Dan/ibisworld-dashboard (public, main branch)
**File:** `index.html` — single self-contained file, ~11,450 lines

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

### 🛡 BACKUP-FIRST RULE (v37 — explicit Dan instruction, NON-NEGOTIABLE)
Every new system, field, tool, or data type built going forward MUST integrate with the 4-layer save-protection architecture. Dan's words: *"any new system or tool we build must also be optimized and fall under this save state."* Concretely:

1. **Any new localStorage key** must be added to the `ALL_STORAGE_KEYS` array (line ~6593) so it's captured by: in-browser ring, FSA/Downloads file, GitHub push, and the local mirror. A key NOT in this array is invisible to the backup system and **will be lost on cache wipe**.
2. **Any text input / textarea / contenteditable** must use the triple-protected save pattern: debounced auto-save on `input` (400ms via `saveActionFieldDebounced` or equivalent) + immediate save on `blur` + emergency save via the global `beforeunload` handler. **Blur-only saves are forbidden** — they're how Dan lost notes before v37.4.
3. **Any save function** must go through `localStorage.setItem` (wrapped by the write-health monitor). Never bypass via direct IndexedDB / cookies / sessionStorage for primary user data. Quota failures must surface so auto-recovery can run.
4. **Any new dropdown / toggle / immediate-save UI** should write to `ibis_local[name].<field>` and call `localStorage.setItem('ibis_local', ...)` directly (instant save, no debounce — pattern matches status, priority, action stage).
5. **Any new fetch destination** (API endpoint, restore URL, image source) MUST be whitelisted in the CSP meta tag at the top of `index.html`. The v37.5 incident proved an unwhitelisted destination silently breaks features and is only discovered during a real disaster.
6. **Any new editable UI surface** should show a visible save-state indicator (✓ Saved / ● Saving…) next to the field label so Dan can see his data is committed.

### Other critical rules
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
  - `ibis_alumni` → Alumni campaign contacts, keyed by email (same schema as ibis_opps)
  - `ibis_dead` → dead accounts array + dead licenses array + dead contacts (`{ accounts: [...], licenses: [...], sampleContacts: [...], sixqaContacts: [...], workableContacts: [...], churnContacts: [...], netnewContacts: [...], multithreadContacts: [...], winbackContacts: [...], alumniContacts: [...] }`). Accounts added when missing from re-upload CSV; their licenses are **auto-moved to dead at the same time** (no separate license re-upload needed). Licenses also move independently when missing from license CSV re-upload. Each dead account carries `_deadSince`, `_statusAtDeath`, `_unexpectedDrop`, `_localSnapshot`.
  - **GROUP TAB KEYS (v36)** — 8 keys, fully isolated from personal data:
    - `ibis_group_dan_accounts`, `ibis_group_christian_accounts`, `ibis_group_embry_accounts`, `ibis_group_anthony_accounts` — raw account rows per rep
    - `ibis_group_dan_licenses`, `ibis_group_christian_licenses`, `ibis_group_embry_licenses`, `ibis_group_anthony_licenses` — decoded license rows per rep
  - **CLIENT INSIGHTS KEYS (v36)**:
    - `ibis_client_licenses` — slim rows from SF Active Client Report (~2.6K rows). Schema: `{a:account, d:dept, v:vertical, $:annAmt, e:endDate, act:bool}`
    - `ibis_client_revenue` — **PROTECTED** Wikidata revenue cache, keyed by normName(company). Never touched by Clear Cache. Schema: `{normName: {raw, label, source, year, ts}}`
  - **OPPORTUNITY REPORT (v40)** — lives in **IndexedDB** (`ibis_opps_db` → store `opps`, key `'report'`), NOT localStorage (1,000+ rows overflow the ~5 MB quota). Feeds the Accounts My Opp / Other Opp / Key Lost / Other Lost / Key Trials columns + Opps count. Legacy `ibis_opps_report` localStorage copies auto-migrate to IDB on load. Deliberately NOT in `ALL_STORAGE_KEYS`. Re-uploadable from SF, so not part of the JSON backup.
  - **ROTATION TAB KEYS (v38)** — single departed-rep dataset (all in `ALL_STORAGE_KEYS`):
    - `ibis_rotation_accounts` — raw account rows (same shape as SF CSV)
    - `ibis_rotation_licenses` — decoded license rows (parseLicenseCSV shape, `applyLicenseRules` applied on load)
    - `ibis_rotation_opps` — raw opportunity rows from the SF opp report
    - `ibis_rotation_markup` — per-account UI state keyed by `normName`: `{assign, teamSell, star}` (instant-save, like status/priority)
  - **PRIORITY MIGRATION KEYS (v41)** — both in `ALL_STORAGE_KEYS`:
    - `ibis_priority_legacy` — backup of pre-v41 rarity-tier priority assignments `{account:{value,label,ts}}`, written once by `migrateLegacyPriority()` before clearing them. Recoverable if Dan wants the old data.
    - `ibis_prio_migrated_v41` — `'1'` flag so the migration runs once.
    - `ibis_prio_split_v42` (v42) — `'1'` flag; `migrateStageSplit()` moved `acctPriority==='tabled'` → the new `acctPrio` field.
    - `ibis_actflags_v43` (v43) — `'1'` flag; `migrateActFlags()` moved `headlineHot:true` → `actFlags:['fire']`.
  - Also in `ibis_local` (per-account): `customOpp` (manual My Opp free text). **v42 split:** `acctPriority` now holds **Stage** column values (action stages, minus tabled); the new **`acctPrio`** holds the **Priority** column (`immediate`/`urgent`/`prioritize`/`working`/`teamsell`/`tabled`/`''`). **v43:** `actFlags` = array of action-priority pillbox states (`fire`/`wait`/`internal`/`chill`/`won`) in the Action Headline cell (replaced the single `headlineHot` bool). `hasAction` still = the favorite star + ⚡ Action tab membership. `actionHeadline` shared with the Action tab.
  - **AUTO-BACKUP KEYS (v36)**:
    - Snapshot ring: last 5 v3 snapshots live in **IndexedDB** (`ibis_backup_ring` db) as of v39 — never competes with dashboard data for localStorage quota. The old `ibis_auto_backup_ring` localStorage key is legacy (auto-migrated + removed on boot).
    - `ibis_auto_backup_meta` — hashes + timestamps for change detection + file-download throttle
  - `checkStorageSize()` fires on `init()` and after both CSV uploads; logs a console warning if any key exceeds 2MB or total exceeds 4MB
- All CSV parsing happens client-side in the browser

---

## CURRENT STATE — v43 (stable)

### v42–v43 Summary — Accounts-tab overhaul: history columns, Priority/Stage split, favorite star, action-priority pillbox, typed filters, Excel export (entire multi-part session)
A very long single session reworking the **Accounts Table**. Every change verified against the live DOM in a local `http-server` preview (`.claude/launch.json` → `dashboard`) before push. Commits `dd3c3fc` → `dd6b3ca`. All migrations guarded + reversible; new fields live in `ibis_local` (backed up).

**📊 Full relationship-history columns (replaced the old US Client + Other Lost columns).** New column order from Score: `Active Client · Key Client · Key Churn · Key Opps · Key Trials`.
- **Key Client** (`getKeyClient` = Closed-Won opps, amount>1) — "times we won them". **Key Churn** (`computeKeyChurnsFromLics`) — every churned license (US/PIQ/**INTL**), **$20K floor removed**, active-PIQ suppression removed. **Key Opps** (`getKeyLostOpps`, was Key Lost + Other Lost merged) — all Closed-Lost opps US+Intl. **Key Trials** unchanged (≤$1 closed).
- **Unified colour system `histClass(type, year)`**: 🟡 gold = **≥2024** · ⚪ grey = **<2014** · else by type 🔴 IND / 🔵 PIQ / 🟢 INTL. `HIST_GOLD_YEAR=2024`, `HIST_GREY_YEAR=2014`. `UNIVERSAL_MIN_YEAR` lowered **2016→2010** (store-time floor; pre-2014 shows grey). Helpers: `oppGeoInfo(o)→{type,tag}`, `churnGeoType(l)`, `licCountry(l)` (extracts CA/AU/UK from license name). Pills: `keyChurnPill`/`keyClientPill`/`keyLostPill`/`keyTrialPill`, `renderKeyClientCell`. Rotation churns use the same engine (`rotChurnPillClass` gained INTL green).
- **🇨🇦 Canada rule (across all bubble/history columns + Rotation):** anything tagged **CA** counts as 🔴 Industry (red) but keeps the "CA" label. Applied in `histClass` via `churnGeoType`/`oppGeoInfo` (CA→IND). NOT applied to the Active-Client badge or Licenses tab (those keep CA as 🌍 INTL to match the badge).
- International churns now show the **country code** (UK/AU/CA…) instead of "Intl".

**🎯 Priority column split into two columns (v42, migration `ibis_prio_split_v42`).**
- **Stage** column (new, between Priority and Company) = the old Priority machinery: data key **`acctPriority`**, options = the 8 action stages + Unresponsive/Won/Nurture (Tabled removed), `renderAcctPrioritySelect`, `#acct-priority-portal`. Header filter id **`actstage`**.
- **Priority** column repurposed: NEW data key **`acctPrio`**, options **🆘 Immediate** (solid crimson, top) · 🚨 Urgent · 📌 Prioritize · 🛠 Working · 🤝 Team-Sell (teal) · 🗄 Tabled + `''`. Own funcs `renderAcctPrioSelect`/`openAcctPrioPortal`/`applyPortalPrio`, own portal **`#acct-prio-portal`**. `ACCT_PRIO_OPTS`/`ACCT_PRIO_FILTER_OPTS`. Sort order immediate→urgent→prioritize→working→teamsell→tabled. Migration moved existing `acctPriority==='tabled'` → `acctPrio='tabled'`.

**⭐ Favorite star (replaced the standalone Action column).** The old `hasAction` favorite is now a **Rotation-style star glyph** (`.fav-star`, ☆ grey outline off → ★ gold `#f4b829` on, 17px) sitting inside the Company cell next to the logo. Still writes `hasAction` (still feeds the ⚡ Action tab). New **`favorites`** header toggle filter above the Company column (`hfslot-favorites`, gold-star `.hf-fav` bubble). `toggleActionFav` swaps the glyph in place.

**🔥 Action-priority pillbox (merged into the Action Headline cell — NOT a separate column).** A segmented "pillbox" (`.act-pillbox`/`.act-seg`, 19px, 6px radius) left of the headline input with 5 independent toggles: **🔥 Fire · ⏳ Wait · 🌿 Internal · 🥶 Chill · 🎉 Won** (`ACT_FLAGS`). Stored as `ibis_local[name].actFlags` (array). Replaced the single 🔥 hot flag (`headlineHot` migrated → `actFlags:['fire']`, `ibis_actflags_v43`). `toggleActFlag(e,name,key)`. The **Action Headline filter** (`hasheadline`, multi) = the 5 states + Has Headline; **header sort** orders Fire→Wait→Internal→Chill→Won→has-headline→none.

**🔢 Sticky row-number sidebar.** A thin `#` column (`.row-num-cell`, 20px, sticky `left:0`) numbers every visible row 1→N (renumbers on filter). Frozen on horizontal scroll; header corner sticky both axes.

**🎛 Typed multi-select column filters (has-any / OR).** Multi-Owner, Active Client, Key Client/Churn/Opps/Trials converted from toggles to multi bubbles. Type options 🔴 Industry / 🔵 PIQ / 🟢 International (`ACCT_GEO_FILTER_OPTS`); Active Client = PIQ/Intl (`ACCT_ACTIVECLIENT_FILTER_OPTS`). **Multi-Owner is a dynamic, self-cleaning owner list** (`acctOwnerFilterOpts()` rebuilt every render from group-overlap + opp owners; departed reps auto-drop, stale selections pruned in `renderAcctHeaderBubbles`). Per-column type-set helpers: `keyClientTypes`/`keyLostTypes`/`keyTrialTypes`/`keyChurnTypes`/`activeClientTypes`/`acctOwnerKeys`.

**🎨 Filter-bubble redesign + result-count preview.** All header bubbles are now a **uniform grey capsule** (`.hf-bubble` bg `#f4f5f7`); the **text/emoji carry the option colour** via `optColor(opt)` (picks the darker of bg/text so solid options like Immediate stay readable); active = white fill + coloured border + bold. Each **dropdown option shows a faceted result-count** (`hfOptionCounts(id)` + `hfMatch(id,key,a,name)`, `.hf-opt-count`) — "rows you'd get if you pick this, given other filters".

**📤 Export Excel button** (`exportAccountsExcel`) — exports the accounts currently in view (respects all filters) as **Account + Status**, status labels spelled out for rev ops (`entdrop`→"Enterprise Drop", `market`→"Marketing") via `ACCT_STATUS_EXPORT`. `.xls` mso workbook + AutoFilter (mirrors `exportRotationExcel`).

**🛠 Misc:** dropdown portals (status/priority/stage) flip **upward** near the viewport bottom (`placePortal(portal,rect)` — shared helper, no more cut-off last rows). Status collapse toggle smoothed (button glyph updates sync, reflow deferred via `requestAnimationFrame`; grey border + `:active` press). Custom My Opp bubble matches regular pill height (21px), ✎/× auto-hide unless hovering/editing (flush-left when idle). Killed the old `action` filter, `.act-fav`, `.hl-hot`, `hfslot-action`.

**🏎 v43.1 post-session polish (after /end-session — same day).** (1) **⚡ Status-collapse lag = fixed + root-caused.** The collapse was fine but EXPAND "lagged the whole computer". Measured: forced layout ~100ms and SYMMETRIC — so it's not layout, it's PAINT: expand repaints all 176 status widgets at once. Fix = **`content-visibility: auto; contain-intrinsic-size: auto 46px`** on `.acct-main-table tbody tr` — off-screen rows now skip layout+paint entirely (only ~15 visible rows render), so expand paints a handful of widgets, not 176. Verified sticky header + sticky row-num column still work. **⚠️ Deeper root cause (KEY LEARNING):** the Accounts table uses **`table-layout: auto`**, so ANY column-width change re-measures every row → column resize is O(176 rows). content-visibility can't remove that (auto-layout forces all rows for width calc); the real fix if it ever hitches again is **`table-layout: fixed`** with explicit per-column widths — a bigger, careful change, deferred. (2) **1px red gap** between the two sticky header rows: the bubble strip renders **41px** but `.hf-labels` stuck at `top:42px` — body cells (red Immediate pills) peeked through the 1px sliver. Set `.hf-labels th` (+ its `.row-num-cell`) `top:40px` (slight overlap, robust vs zoom). (3) **Stats bar refreshed** — Total · ✓ Keep (keep+truekeep count) · **My Opps** (Σ`getMyOpps`) · **Other Opps** (Σ`getOtherOpps`) · Existing Clients · Last Import; removed Tier 1 + Avg Intent; tighter spacing (`.stat-item` 22px), Last Import no longer `margin-left:auto` (killed the big middle gap). `updateStats()` now also runs inside `renderAll()` (cheap) so My/Other Opps populate after the async opp-report load + stay fresh. (4) Collapsed Status column narrowed 28px→**20px**.

### v41 Summary — Accounts-tab column-header filter system + custom My Opp + priority→stages + deploy fix (entire session focus)
A long single-session build reworking how the **Accounts Table** filters, plus a critical GitHub Pages deploy fix. All verified against the live DOM in a local preview (screenshots were broken in-tool this session, so verification was DOM-measurement + interaction based). Commits `bd2929b` → `78fe611`.

**🎛 Column-header filter system (Table view only; Cards view keeps the old chip bar, gated by `updateAcctFilterUIVisibility()`)**
- Every filterable column has a **filter bubble** sitting in a two-row sticky header: a grey `#f0f2f5` strip (`tr.hf-row`, sticky `top:0`) holding the bubbles, above the sortable label row (`tr.hf-labels`, sticky `top:42px`). Bubbles are flush-left with the column label.
- Config-driven: `acctColFilters` (state — `Set` per multi filter, `bool` per toggle), `ACCT_HF` (descriptor: `kind:'multi'|'toggle'`, opts), option arrays `ACCT_STATUS_FILTER_OPTS` / `ACCT_PRIORITY_FILTER_OPTS` / `ACCT_TIER_FILTER_OPTS` / `ACCT_OTHEROPP_FILTER_OPTS` / `ACCT_REVENUE_FILTER_OPTS` / `ACCT_MYOPP_FILTER_OPTS` + dynamic `acctStageFilterOpts()` / `acctVerticalFilterOpts()`. Each option carries `{key,label,full?,css}` so it renders as its real data-encoded pill.
- **Multi bubbles** = the whole chip takes the option's colour theme (inline `css`), hard themed border (`border-color:currentColor`), themed divided caret; dimmed placeholder (first option) when nothing selected; `+N` when >1 selected. **Toggle bubbles** = neutral, red when on. Dropdown = `#hf-portal` with each option as a full-label coloured pill + checkbox. Helpers: `hfBubbleHtml`, `renderAcctHeaderBubbles`, `openHfMenu`, `hfSetMulti`, `toggleHf`, `hfClear`, `hfPill`, `hfOptsFor`. Predicate `passesColFilters(a,aName)` — OR within a filter, AND across (getFiltered branches to it when `currentView==='table'`).
- **New filters** added vs the old chips: **Vertical** (palette-coloured; toolbar "All Verticals" is hidden in Table view, kept for Cards), **Revenue bands** (`<$50M / $50M–$1B / $1B–$10B / $10B–$50B / $50B+ / No revenue` via `revBandKey(a)` on `getRevDisplay(a).raw`), **Stage** (6sense buying stages), **Has Headline** toggle. Overflow toggles with no natural column (Has Workables / In Action / Active Opp) live in `#acct-table-overflow` next to All Verticals. "N of M accounts" moved inline into the controls bar (`.acct-count-inline`) — no grey line above the table.
- Other Opp header click sorts by furthest close date (`setSortCol('otherOppClose')`), no longer auto-toggles a filter.

**📝 Custom My Opp (manual free-text opp)**
- Clicking the grey dot in the **My Opp** column creates an editable free-text bubble (`.ib-myopp-custom`, contenteditable, ✎ affordance, solid slate border + shadow + × remove). Stored in `ibis_local[name].customOpp`. Saves: debounced `saveCustomOppDebounced` (400ms) + `onCustomOppBlur` (empty → auto-remove) + it's in `ibis_local` so covered by `beforeunload`. `removeCustomOpp` clears the pending debounce timer (fixed a "shadow-save" where a removed opp re-appeared). Prune-protected in `pruneStaleLocalData`. Helpers: `hasCustomOpp`, `startCustomOpp`, `removeCustomOpp`, `onCustomOppBlur`. My Opp filter (`ACCT_MYOPP_FILTER_OPTS`) = Salesforce Opps / Custom Opps. `renderMyOppCell` shows SF opps (`getMyOpps`) + the custom bubble. My Opp **sort** = SF my-opp (2) → custom (1) → none (0); no longer counts account/contact-level opps (that was the "CarMax always top" bug).

**🎯 Priority column repurposed to Action-board stages**
- `ACCT_PRIORITY_OPTS` now mirrors the 8 `ACTION_STAGES` (same emoji + colours) + 🚫 Unresponsive / 🏆 Won / 🌱 Nurture + `—` unselected. Colours applied inline via `prioStyle()` (no per-option CSS class); `#acct-priority-portal` gained max-height + scroll. It does NOT yet write to the Action board — just the Priority column. Header filter (`ACCT_PRIORITY_FILTER_OPTS`), sort order map, `knownFlags`, and the account-page `PRIO_COLORS`/label all updated to the new keys.
- **One-time migration** `migrateLegacyPriority()` (runs in `init`, guarded by `ibis_prio_migrated_v41`): backs up old rarity-tier assignments (Legendary/Rare/…) to **`ibis_priority_legacy`** `{account:{value,label,ts}}` then clears them. `ibis_priority_legacy` + `ibis_prio_migrated_v41` added to `ALL_STORAGE_KEYS` (recoverable via backup).
- ⚠️ The **Cards-view** priority chips still use the old rarity flags (Quick Winner/Legendary/etc.) and no longer match data — left as-is since Dan works in Table. Cleanup deferred.

**🆕 Action Headline column** (right of Company): same `.action-headline-input` underline field as the Action tab, sharing `ibis_local.actionHeadline` (edit in either place, both reflect it). Triple-protected save (`saveActionFieldDebounced` + `saveActionField` on blur). Header filter = "Has Headline" toggle.

**🚨 GitHub Pages deploy fix (root-caused this session — pushes had silently stopped publishing)**
- Symptom: commits landed on `origin/main` but the live site kept serving the old build. Root cause: the hourly auto-backup task had grown committed `backups/` to **~90 MB (30 snapshot JSONs)**, and GitHub Pages rebuilds the whole repo per push — that bloat stalled/failed the build so new commits never published. NOT a code or push problem.
- Fixes: (1) added **`.nojekyll`** (static file deploy, no Jekyll pass, correct for this single-file site); (2) pruned the 30 historical `backups/snap-*.json` from the repo (kept `latest.json` — restore uses it via raw.githubusercontent; snaps still live in git history + local mirror + IDB ring) → repo 92 MB → **4.7 MB**; (3) `scripts/auto-backup-to-github.ps1` now keeps only **5** snapshots in the repo (local `Documents\IBIS-Backups` mirror still keeps 30) so it can't re-bloat. Deploys now publish in ~1 min. **Reliable live-check method:** `curl -sI -H 'Cache-Control: no-cache' <pages-url>` and watch `Content-Length` / grep the served HTML — GitHub's Fastly ignores `?query` cache-busting so query-string polling reads stale cache.

### v40 Summary — Opportunities layer + Accounts-tab UI/perf overhaul (entire session focus)
A long single-session build. New **Opportunities report CSV** feeds five new Accounts columns, plus a full rebuild of the Accounts table's layout, scroll, and bubble system. All verified in a local preview (identical code) before each push; Chrome-in-browser used to diagnose live layout bugs.

**📈 Opportunities report CSV (new upload, under Licenses CSV in the red menu)**
- SF "Opportunities" report. Columns: `Owner Role · Opportunity Owner · Account Name · Opportunity Name · Stage · Fiscal Period · Amount Currency · Amount · Age · Close Date · Created Date · Next Step · Lead Source · Type · Business`.
- **Stored in IndexedDB** (`ibis_opps_db` → store `opps`, key `'report'`), NOT localStorage — 1,000+ rows blew the ~5 MB localStorage quota and vanished on refresh. IDB is durable + removes the opp report from localStorage pressure. Auto-migrates any legacy `ibis_opps_report` localStorage copy → IDB on load. `idbSaveOpps/idbLoadOpps/idbClearOpps`, `loadOppReport` (async), `saveOppReport` (async), `handleOppReportCSV` (async), `clearOppReport`. `ibis_opps_report` is NOT in `ALL_STORAGE_KEYS` (it's in IDB).
- **Slim projection** `slimOppRow` (short keys: own/acct/nm/st/cur/amt/cd/crd/ns/biz/ty/orole; long text trimmed; pre-2016 rows dropped at store time). `decorateOppRow` reads slim → derived fields. **Index**: `_oppIndex` (Map normName→decorated rows), `getOppRowsFor(name)` O(1). `invalidateOppIndex()` on every data change.
- **`UNIVERSAL_MIN_YEAR = 2016`** — nothing older shown anywhere (opps AND churns). Dan's rule.

**Five new Accounts columns (all use `getOppRowsFor`)**
- **My Opp** (renamed from Opp): my active + won opps. `getMyOpps` = owner "Daniel Starr", not Closed Lost. Solid one-colour pill (blue active / green won), lead=stage bold. Falls back to the manual grey-dot (`renderAcctOppCell`) when no CSV opp. `MY_OPP_OWNER='daniel starr'`.
- **Other Opp** (new): other reps' LIVE open opps (`getOtherOpps`). **Categorised by OWNER ROLE, not the unreliable Business column** — a "ProQ CRM" owner selling Procurement IQ shows Business "US Industry". `oppRoleInfo(o)`: ProQ role → PIQ (BDM=New PIQ / else PIQ Renew); Ind role → country from role prefix confirmed by currency (`CUR_COUNTRY`), US → Ind Renew (rare off-case, kept), else International → "New <Country>" / "<Country> Renew". `otherOppCat` returns `{key,label}`; `OTHER_OPP_COLORS` maps key→{dark,light,text}. Split pill: dark segment = TYPE label, body = stage │ $amt │ close date │ owner (uniform, thin `│` separators). **Single-column stacking** (`ib-1col`) so 2 opps stack instead of widening. Header/chip click = `toggleOtherOppFilter()` → filters AND sorts by furthest-future close date (`otherOppMaxClose`, sort col `otherOppClose` desc).
- **Key Churn** (from Licenses CSV, not opps): significant re-winnable churned licenses. `computeKeyChurns`/`computeKeyChurnsFromLics` — churned US-Industry or PIQ, ACV > $20K, ≥2016, suppressed if account has an active PIQ. `getKeyChurnWeight` (recency-boosted ACV) drives the sortable header + `KEY_CHURN` filter chip.
- **Key Lost Opps**: Closed Lost · US Industry/Procurement · amount > $1 · 2016+. Type (Ind/PIQ) leads and is the only bold part; churn colours (`oppChurnClass`: gold 2024+/blue PIQ/red Ind/grey pre-2020). ★ = Dan owned it.
- **Other Lost** (renamed from "Key Other Opps"): Closed Lost · global (non-US) · > $1 · 2016+. `ib-global` indigo pill, lead=country.
- **Key Trials**: amount ≤ $1 · closed · all geographies · 2016+. **Rotation style** — one purple colour (`ib-trial`), `<lead PIQ/Ind> │ created → close` date range. (Earlier ✓/✗ won/lost removed — Dan found it confusing.)
- **Opps count** column now pulls from the opp report (`getOppRowsFor(name).length`) when loaded, else `# Core Opportunities`.
- Filters: `OTHER_OPP · KEY_LOST · KEY_OTHER · KEY_TRIALS` chips + `getFiltered` standalone logic + `knownFlags`. Non-sortable Key headers click = collapse expanded cells.

**Unified bubble system (`.ib-*`, mirrors the Rotation tab's clean look)**
- `.ib-cell` > `.ib-bubbles` (2-col `max-content` grid; `.ib-1col` = 1 col for Other Opp). `.ib-pill` (split: `.ib-stg` dark + `.ib-bdy` light) and `.ib-solid` (single colour) — DM **Sans**, 11px, only `.ib-lead` bold, `.ib-sep` thin separator lines, sized to content (never clipped). `.ib-more` = dark-grey "+N" expander.
- **In-cell expand** (not a popover): cells cap at 4 bubbles (2×2), then `+N` (with `· $total` for churn/lost). Click grows the cell in place; collapses on re-click (▲), a header sort, or a filter change. State `expandedCells` Set, `toggleCellExpand`, `collapseAllCells`, generic `renderBubbleCell(name,kind,items,pillFn,moreLabel,oneCol)`. `splitPill()` helper.

**Status column** — added 📣 **Market** (`market`, lime `#ecfccb`/`#4d7c0f`) and 🏢 **Ent Drop** (`entdrop`, reddish-brown `#eaddd6`/`#7c2d12`). Order: True Keep · Keep · Market · Monitor · Ent Drop · Drop · —. Filter chips `chip-market`/`chip-entdrop` + `MARKET`/`ENT_DROP` in `getFiltered` status group + `knownFlags` + Dead-tab `STATUS_DISPLAY`.

**Layout / scroll (UNIVERSAL — Accounts + Licenses + Group + Rotation + Dead)**
- `sizeActiveGrid()` sizes the visible table tab's `.table-wrap` to fill exactly from its top to the viewport bottom (`GRID_TABS`, `activeGridWrap()`), and locks `body.style.overflow='hidden'` while a table tab is showing → **page never scrolls, both scrollbars always reachable, chrome (stats/controls/filters) stays fixed**. `sizeAccountsGrid`/`updateBodyScrollLock` are now aliases. Runs on renderAll, setMainView, setView, resize, banner toggle, account-page open (unlocks). Fixed Rotation's "cut off, no horizontal slider".
- `.acct-main-table { width:auto; min-width:100% }` (grow-and-scroll, no squish). Sticky header `thead`/`thead th { position:sticky; z-index:30 }` — fixes the tier diamond painting over the header. `.acct-main-table .td-name` ellipsis-clamped. `#controls-accounts .filter-chips { flex:1 1 100% }` so filter chips **wrap within the viewport at any zoom** (was `flex-shrink:0` → overflowed). Hidden Campaigns + Days Inactive columns.

**Performance**
- Indexed licenses (`_licIndex`, `licsFor`) and opps (`_oppIndex`) by account → per-row lookups O(1) instead of scanning ~1–2K rows per account per render.
- **Per-row enrichment patching** (`patchEnrichedRow(name)`, `revCellHtml`): revenue/desc/sentiment queues now update just the changed row's cells in place (rows carry `data-acct`, cells `.js-rev`/`.js-score`) instead of full-table re-renders. `enrichRenderSoon()` throttle kept as a fallback.

### v39 Summary — Full code sweep: bugs, backup hardening, campaign engine (entire session focus)
A 5-agent code review + live browser inspection of the whole dashboard, followed by 6 fix batches (one commit each, revert point = git tag `v38-pre-sweep`). Commits: `b32c8c6` → `5dfe6ff`.

- **Batch 1 — data-safety bugs:** `ibis_local` now loads even when accounts data is absent (was a silent wipe-all-markup path if accounts were cleared). ~10 inline save handlers converted to the apostrophe-safe `data-acctname`/`data-email` pattern (opp widget, account-page + Action-table headline/date, kanban drag, workables fields, ↩ Revive button — which was 100% broken by a quoting bug, stage-filter badges). Action-table Headline/Next Date and Workables notes/next-action now have triple-protected saves (input debounce + blur + beforeunload flush). Dead-tab badge now clears for workable contacts. 🔒 True Keep sorts first. A license ending *today* counts active all day (`>=` midnight, all 5 sites). CSVs now read as UTF-8 with BOM handling via `readCsvViaReader()` (was latin1 — mojibaked accents, broke first-header matching on BOM). Removing ⚡ from an account now sticks (auto-sync only re-adds `undefined`, never `false`). Shift+D debug panel fixed; account page opened from Group/Rotation no longer stacks views.
- **Batch 2 — dead Claude enrichment layer removed:** the Cloudflare Worker was never deployed AND the CSP blocked it — it had never returned a byte, yet queued every account on every load (~2 min of failed fetches + a fake progress pill that counted negative). Revenue enrichment now routes through the already-working **Wikidata pipeline** (`queueClientInsightsRevenue`); Group/Rotation enrichment too. Revenue priority order is now: Seed table → Wikidata → SF CSV fallback.
- **Batch 3 — backup hardening:** the in-browser snapshot ring **moved from localStorage to IndexedDB** (`ibis_backup_ring` db). At ~3.5MB of data, one snapshot couldn't fit in the localStorage quota — ring saves silently failed, pre-upload rollback didn't exist, and the ring pushed storage over the 4.5MB auto-clean line causing a permanent enrichment wipe/refetch churn loop. Now the ring truly holds 5 snapshots, pre-upload rollback works, localStorage usage halved, churn gone. All 3 restore paths are **replace-not-merge** (keys absent from a backup are removed) and take a "Pre-restore safety" snapshot first. Backup toasts/panel only claim success when the ring write actually persisted. `auto-backup-to-github.ps1` gained `Push-IfBehind` — a failed GitHub push (observed live 2026-07-02) is now retried on every subsequent run and logged loudly.
- **Batch 4 — dead code removed (~220 lines):** the 📝 Account Plan panel (accidentally dropped from the account page in the v30 layout overhaul, commit `05bb6f1`; Dan confirmed removal — saved `accountPlan` data stays in `ibis_local`), `exportLocalBackup` (button was already gone; file **restore** still works via Backups panel), superseded helpers (`toggleActionOpp`, `getLicBadgesForAccount`, `getKeyChurnContact`, `applyStageColor`, `oppStageClass`, `promptOppNote`, `_calcLocalStorageKB`, legacy aliases), and orphaned CSS (old campaign count-dot family — replaced by `.camp-oval` in v33 — `.ap-contact-*`, `.ap-plan-*`, `.upload-btn-license`, `#autoback-indicator`, misc singles). `.btn-primary/.btn-secondary/.btn-ghost` kept (DESIGN.md canon).
- **Batch 5 — CAMPAIGN ENGINE:** the 7 copy-pasted campaign stacks (samples/sixqa/churn/netnew/multithread/winback/alumni, ~740 lines) are now ONE generic engine — `CAMPAIGN_ENGINE` config + `campLoad/campSave/campHandleCSV/campMerge/campRender/campDelete/campClear/campCount` (~180 lines). Every old function name (`loadSamples`, `handleChurnCSV`, `deleteWinback`, …) still exists as an auto-generated wrapper, so no HTML call site changed. Workables stays bespoke. **New feature: dead-contact resurrection** — a contact that reappears in a CSV re-upload is automatically revived from the Dead tab (notes preserved, toast shows "N revived from Dead"). `reviveDeadContact` also runs on the engine now. Verified end-to-end against synthetic data on a local server before push.
- **Batch 6 — usability:** all 12 search boxes debounced (`debouncedSearch`, 200ms); Churn campaign got its missing search box; the Action stage filter dropdown stays open across checkbox clicks; toast timer race fixed; **Escape closes any open portal/dropdown/menu/modal**; Insights → Group Accounts stats bar fixed (wrote to non-existent element IDs); enrichment queues re-render at most every 8 items and only while the Accounts view is visible; Wikidata progress chip moved up so it can't cover the toast.
- **Also:** Powerback is fully gone from the code (docs previously drifted); 🎓 **Alumni** (indigo `#4f46e5`, `ibis_alumni`, `deadAlumniContacts`, `al|` prefix) is the 8th campaign.
- **Frontend/usability catalog** from the review (design-token violations, contrast, focus states, tab inconsistencies) is parked for the upcoming redesign session.

## PREVIOUS STATE — v38

### Eight tabs live:
1. **⚡ Action tab** — accounts Dan is actively working (new in v29)
2. **📋 Accounts tab** — main territory view (gained Overlap column + Multi-Owner filter + Export button + 🤝 Team Sell priority tier in v36)
3. **🔑 Licenses tab** — churn/active license data
4. **📣 Campaigns tab** — multi-campaign contact hub; campaign dropdown lives in stats bar
5. **💀 Dead tab** — accounts/licenses/contacts that have disappeared from CSV uploads
6. **👥 Group tab** (new v36) — 4-rep enterprise overlap view; data lives in isolation from personal data
7. **📊 Insights tab** (new v36) — derived analytics; two subpages: Group Accounts + Client Insights
8. **🔄 Rotation tab** (new v38) — a departed rep's book, to decide which accounts to absorb into the team

### v38 Summary — 🔄 Rotation tab (entire session focus)
New standalone tab, right of Insights, for triaging a departed rep's book and deciding which accounts each teammate absorbs. Structured like Group/Insights (uploads its own data, shares the `ibis_local` enrichment cache).

- **Upload** — a new **Rotation** section inside the 👥 Group CSV menu: `Rotation · Accounts` (reuses `parseCSV`), `Rotation · Licenses` (reuses `parseLicenseCSV` + territory rules), `Rotation · Opportunities` (SF opp report). Each handler fires `snapshotBeforeAction('Pre-upload · Rotation …')`.
- **Lightweight accounts list** — 14 columns, all sortable on header click (sort/cluster, Dan's chosen behavior). Left→right: **Assign** ▾ (4-rep colored pill dropdown) · **Team Sell** ▾ (light-blue neon pill) · **PIQ Rep** (auto cross-ref) · **Active Opp** (golden stage · $ bubble) · **Active License** (🔵 PIQ / 🌍 INTL badges) · ⭐**Company** · **Vertical** · **Tier** · **Revenue** · **Key Churns** · **Key Trial** (purple) · **6sense** (Intent Score NA) · **Licenses** (count) · **Opps** (count).
- **Assign / Team Sell** — instant-save styled `<select>` pills (`rotationMarkup[norm].assign / .teamSell`), matches status/priority immediate-save pattern.
- **PIQ Rep** (auto) — `getRotationPIQReps(name)` flags Embry/Anthony as the sister-PIQ owner if the account appears in their **Group** account list. No manual entry.
- **Active Opp** — from opp CSV. Active = Stage not `Closed Won`/`Closed Lost`. Golden bubble `Stage · $Amount`.
- **Key Trial** — trial = Amount ≤ $1 **OR** `Closed Won`. Purple bubble showing Created Date → Close Date.
- **Key Churns** — churned (inactive) US-Industry or PIQ licenses with ACV > $20K, bubble ends with License End Date. **Special rule:** if the account still has an active PIQ, show nothing. Color by age/type: pre-2020 grey · 2024+ golden · else PIQ blue / Industry red.
- **⭐ Star / key accounts** — greyed star left of every company name; click → gold star + subtle gold row (`rot-row-key`, `#fffdf3`). Stored in `rotationMarkup[norm].star`.
- **6 quick filters** (controls row): 🎯 Assigned · 🤝 Team Sell · 🔵 PIQ Owned · 🟢 Active License · 🔴 Key Churns · ⭐ Favorites. Plus search + vertical filter + tier dropdown.
- **Export/PDF** (`exportRotationTab`) + **Export Excel** (`exportRotationExcel`) — the Excel path builds an mso HTML workbook (`.xls`, no libraries), preserves the on-screen colors as inline cell fills, respects current sort + filters, **excludes Assign & Team Sell**, ⭐ rows get gold fill + `★` prefix, and the header row has **Excel AutoFilter** enabled (`x:AutoFilter` R1C1 range). Multi-pill cells join with `|` and take the top item's color.
- **Key functions:** `loadRotationData`, `save*` (accounts/licenses/opps/markup), `handleRotation{Accounts,Licenses,Opps}CSV`, `clearRotationData`, `getRotation{ActiveLicBadges,LicCount,KeyChurns,PIQReps,OppRows,ActiveOpps,Trials,OppCount}`, `rotChurnPillClass`, `setRotation{Assign,TeamSell}`, `toggleRotationStar`, `getFilteredRotationRows`, `renderRotation`, `renderRotationRow`, `exportRotationExcel`, `bootRotation` IIFE. Helpers: `rotMoney`, `rotParseMoney`, `rotParseDate`, `rotShortDate`.
- **State vars:** `rotationAccounts/Licenses/Opps/Markup`, `rotTierFilters`, `rotActiveLicOn/AssignedOn/TeamSellOn/PiqOwnedOn/KeyChurnsOn/FavoritesOn`, `rotSortCol/Dir`, `ROT_SORT_DEFAULT_DIR`, `ROT_OWNER_ORDER`.
- **Open at session end:** International churns intentionally excluded from Key Churns (Dan may add later). Key Trial start/end = Created→Close (confirm if wrong).

### v37 Summary — Bulletproof save & recovery (entire session focus)
Major reliability + UX work. After v36 we had a 3-layer backup story but multiple gaps caused real data loss for Dan ("I lost notes once, they're too valuable to lose"). This session rebuilt the entire save/recovery story to be impossible to lose data:

- **🛡 4-layer backup system** (formalized, all working end-to-end):
  1. In-browser snapshot ring (`ibis_auto_backup_ring`, last 5 v3 snapshots)
  2. **Direct-write to user-chosen folder via File System Access API** → `Documents\IBIS-Backups\` (no Downloads folder, no Chrome download notifications). Falls back to legacy `<a download>` path if browser doesn't support FSA or permission is revoked.
  3. Hourly Windows scheduled task pushes to GitHub `backups/` remote
  4. **Independent local mirror** at `Documents\IBIS-Backups\` (also OneDrive-synced → 2nd cloud) — survives GitHub outages, repo corruption
- **Write-health monitor** — wraps every `localStorage.setItem` call. On quota failure: drops the backup ring, wipes enrichment (rev/desc/sentiment) from `ibis_local`, retries the write. If retry succeeds, user sees a single toast. If retry fails, a full-bleed red top banner appears with the failed key + time. Periodic 2-minute write probe pre-emptively catches degraded storage before user saves fail.
- **CRITICAL data-loss fixes (v37.4):**
  - **Account Plan textarea had ZERO save logic.** Anything typed there was lost on refresh. Confirmed by code audit — no oninput, no onblur, no save function existed. Fixed with `saveAccountPlanNow` + `saveAccountPlanDebounced`.
  - **Action Notes, Headline, Next Date all only saved on blur.** If user typed and closed the tab without clicking outside, the changes were lost. Fixed with triple-protected save: debounced auto-save on input (400ms) + immediate save on blur + emergency save via global `beforeunload` handler. Visible "✓ Saved / ● Saving…" indicator next to NOTES label.
- **CRITICAL CSP fix (v37.5):** The Content Security Policy meta tag only allowed connect-src to Wikipedia, Wikidata, and UpLead. GitHub fetches (status check + the actual cloud restore!) were silently blocked. So the most important feature in the backup system — one-click cloud restore — was non-functional and would have left Dan stranded during a real disaster. Added `api.github.com` + `raw.githubusercontent.com` to CSP connect-src.
- **Unified Backups panel** (replaces the bottom-left pill + recovery modal):
  - One big health status line at top: ✅/⚠️/🚨 + plain English summary
  - Storage usage bar (MB used of ~10 MB)
  - Single big "☁️ Restore Everything from Cloud" button — fetches `backups/latest.json` from GitHub, restores all keys, reloads
  - Collapsed-by-default details: 4-layer status (in-browser ring · file backup · GitHub · local mirror), in-browser snapshot list, advanced actions
  - FSA setup CTA with "Set it up" + "Skip — don't ask again" buttons
- **Discreet header indicator** — small 🛡 shield icon next to Group CSV / Upload CSV. Tiny 7px dot turns green / amber / red / pulsing-red based on health. Removed the bottom-left pill entirely.
- **Empty-state cloud restore** — when localStorage is wiped (fresh machine, Chrome cache cleared), the empty state shows a **dark "☁️ Restore Everything from Cloud" button** alongside the Upload CSV button. One-click recovery from zero data.
- **Auto-cleanup of Downloads folder** — scheduled task deletes `ibis-autobackup-*.json` files at or older than the committed latest. Folder never builds up regardless of whether the user has set up FSA. Once FSA is set up, files never land in Downloads at all.
- **Proactive auto-cleanup of enrichment** — when storage crosses 4.5 MB, silently wipes only re-fetchable enrichment (revenue / description / sentiment) from `ibis_local` after taking a fresh backup. User-typed data (status, priority, action stages, notes, CSVs, group data, dead, sort prefs) is NEVER touched. Wikipedia/Wikidata refetch automatically.
- **PowerShell script enhancements:**
  - Picks up backups from BOTH `Downloads\ibis-autobackup-*.json` AND `Documents\IBIS-Backups\latest.json` — works whether or not user has set up FSA
  - Auto-deletes processed Downloads files after sync
  - Skips redundant mirror copy when source IS the mirror (FSA path)
  - Replaced inline `if`-as-expression with explicit if/else for PowerShell 5.1 compatibility (avoid em-dashes in log strings — they break Windows-1252 default encoding)

### v36 Summary (previous session)
- **👥 Group tab** — 4-rep collective territory view (Dan / Christian / Embry / Anthony). 8 storage keys (per-rep accounts + licenses). One row per (account × owner). Overlap shown via colored owner pills in the Account Owner cell. Full filter set (owner multi-select, multi-owner toggle, active license, tier, vertical, search). Per-rep license attribution.
- **📊 Insights tab** — two subpages with pill switcher:
  - **Group Accounts** — Accounts-by-Vertical with per-rep breakdown bars
  - **Client Insights** — derived from the SF "Active Client Report" CSV (~2.6K active licenses across the whole IBIS book). 3 cards: Industry by vertical, Procurement by vertical, Top 25 cross-product clients. Each top-25 list (Industry-only, Procurement-only, Cross-Product) includes a **Company Revenue** column auto-fetched from Wikidata.
- **🤝 Team Sell** priority tier — teal palette, sits between Quick Winner and Legendary
- **Overlap column** on Accounts tab — surfaces other reps who also own each account; pairs with **🔁 Multi-Owner** filter chip
- **Auto-backup system** — 3 layers, fully automatic:
  1. In-memory ring (5 snapshots in `ibis_auto_backup_ring`)
  2. Auto-downloaded JSON files to `Downloads/ibis-autobackup-<ts>.json`
  3. Hourly Windows scheduled task pushes `Downloads/` files to GitHub `backups/`
- **Export/PDF** — Browser print-to-PDF on Accounts, Group, Insights → Group Accounts, Insights → Client Insights. Respects all active filters and shows them in the banner subtitle.
- **Wikidata revenue lookup** — direct browser fetch (no Cloudflare Worker dependency). Protected cache in `ibis_client_revenue` key (Clear Cache can never wipe it).
- **Safe storage cleanup** — banner button "💾 Backup & Free Space" auto-downloads full backup BEFORE confirming and wiping

### v37.8 additions (small follow-up session)
- **Pre-upload safety snapshots** — every one of the 13 CSV upload handlers now calls `snapshotBeforeAction('Pre-upload · <CSV name>')` as its first step. This captures the full pre-upload state into the in-browser ring synchronously AND fires an async file write to `Documents\IBIS-Backups\` so the user can roll back if they upload the wrong file. The ring entry stores a `reason` field which is displayed in the Backups panel (blue "🛡 Pre-upload · X" labels distinguish them from automatic background snapshots). Hooked: `handleCSV`, `handleLicenseCSV`, `handleOppsCSV`, `handleSamplesCSV`, `handleSixqaCSV`, `handleChurnCSV`, `handleNetnewCSV`, `handleMultithreadCSV`, `handleWinbackCSV`, `handleAlumniCSV`, `handleGroupAccountsCSV`, `handleGroupLicensesCSV`, `handleClientInsightsCSV`. Helper function lives just above the FSA module (around line 10610).
- **Silent scheduled task** — `scripts/auto-backup-run-hidden.vbs` introduced. Wraps the PowerShell launch with `WshShell.Run "...", 0, False` (window state 0 = SW_HIDE). The scheduled task action is now `wscript.exe <vbs path>` instead of `cmd.exe /c <bat path>`. No cmd window flashes when the hourly task runs. The old `auto-backup-run.bat` is kept as a manual-run option. `setup-auto-backup-task.ps1` updated to register the VBS-based action.
- **🔒 True Keep status (4th option, blue)** — new `truekeep` key added to `ACCT_STATUS_OPTS` at index 0 (sorts above ✓ Keep — strongest conviction first). CSS: `.ast-truekeep` portal option uses `#dbeafe`/`#1e40af`; `.chip-truekeep.active` filter chip uses `#dbeafe`/`#93c5fd`/`#1e40af`. Filter chip added in controls bar with `data-flag="TRUE_KEEP"`. Filter logic in `getFiltered()` recognizes `TRUE_KEEP` alongside `KEEP/MONITOR/DROP` in the status group, mapped to `'truekeep'`. `knownFlags` Set includes `TRUE_KEEP`. Dead tab `STATUS_DISPLAY` includes `truekeep`. Export PDF `statusLabels` map includes `TRUE_KEEP:'True Keep'`. Hardcoded `ACCT_STATUS_OPTS[3]` fallback replaced with `.find(o => o.key === '')` so future additions can't break the `—` reset option. Unexpected-drop warning still works correctly (any non-`drop` status including `truekeep` flags the death).
- **`TIER_OVERRIDES` system** — new constant near `REVENUE_SEEDS` for manually forcing an account's Major Markets Tier when SF data is wrong/missing. `applyTierOverridesToAccounts()` patches the in-memory `accounts` array — re-runs on init AND after every accounts CSV upload, so SF feed can never silently overwrite a manual override. Currently: `{ 'ExxonMobil': '1' }`.

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

#### Priority Column (new in v26, extended v35)
- Per-account dropdown with 6 tiers (5 rarity + Quick Winner top tier):
  - ⚡ **Quick Winner** (navy #1e3a8a / white — v35) · 💎 **Legendary** (gold) · ⭐ **Very Rare** (purple) · 🔨 **Rare** (blue) · ⛏ **Uncommon** (green) · 🪵 **Common** (grey) · dash (unset)
- Quick Winner sorts first (value 0), then legendary/veryrare/rare/uncommon/common (1–5)
- `ACCT_PRIORITY_OPTS[5]` hard-coded index fallback replaced with `.find(o => o.key === '')` — future tier additions can't break the `—` reset option
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

#### Filter Chips (v23 — replaced old Hot/Opp/Winback/Watching set; updated v26, v35)
- ✓ Keep · 👁 Monitor · ✗ Drop · 🟢 Active License · 💼 Active Opp · 🎯 Has Workables · ⚡ In Action · ⚡ Quick Winner · 💎 Legendary · ⭐ Very Rare · 🔨 Rare · ⛏ Uncommon
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
- **Accounts tab exclusion:** `_droppedFromCSV:true` accounts are hidden from the Accounts tab — `getFiltered()` returns false, `updateStats()` excludes them, and the "N of M" count label excludes them. The Accounts tab is a pure live-territory view. Dropped accounts remain in `accounts[]` solely so the Action tab can render them.

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
  - ~~Row 3 cols 2–3: 📝 Account Plan~~ — **removed in v39** (had been accidentally dropped from the render in the v30 layout overhaul; Dan confirmed he doesn't need it)
- **Account plan data:** any previously saved `accountPlan` text stays untouched in `ibis_local` — `pruneStaleLocalData` still treats it as user data (won't prune).
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

### Alumni Campaign (v34)
- **🎓 Alumni** — eighth campaign under Campaigns tab. Same CSV schema. For contacts who were IBISWorld users at a prior company and are now at an account in Dan's book.
- **Colors:** indigo — bg `#eef2ff`, text `#4f46e5`, count badge bg `#c7d2fe`
- **`ibis_alumni`** localStorage key · dead contacts: `deadAlumniContacts[]` → `ibis_dead.alumniContacts` · seen prefix `al|`
- **v39:** runs on the generic CAMPAIGN ENGINE like the other 6 simple campaigns (see below). All `loadAlumni`/`handleAlumniCSV`/etc. names still work as wrappers.
- ⚠️ **Powerback (🥶) was removed from the code before v39** — it no longer exists anywhere in `index.html`. Alumni holds the 8th campaign slot.

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
- **Storage:** `ibis_dead` localStorage key → `{ accounts: [...], licenses: [...], sampleContacts: [...], sixqaContacts: [...], workableContacts: [...], churnContacts: [...], netnewContacts: [...], multithreadContacts: [...], winbackContacts: [...], alumniContacts: [...] }`. Each dead account carries: `_deadSince` (ISO date), `_statusAtDeath` (raw key string), `_unexpectedDrop` (bool), `_localSnapshot` (copy of ibis_local entry at time of death)
- **State vars:** `let deadAccounts = [], deadLicenses = [], deadSampleContacts = [], deadSixqaContacts = [], deadWorkableContacts = [], deadChurnContacts = [], deadNetnewContacts = [], deadMultithreadContacts = [], deadWinbackContacts = [], deadAlumniContacts = [], deadView = 'accounts'`
- **Resurrection (v39):** a dead campaign contact that reappears in a CSV re-upload is auto-revived by the campaign engine (`campMerge`) — notes/history preserved, toast shows "N revived from Dead". Manual ↩ Revive still works for one-offs.
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

### Group Tab Features (v36)
- **Purpose**: 4-rep enterprise overlap view. Identifies accounts shared across reps (Dan / Christian / Embry / Anthony).
- **8 storage keys** (per rep × accounts/licenses), fully isolated from personal data
- **Upload menu**: "👥 Group CSV" button to the LEFT of Upload CSV. Dropdown has 8 rows (4 accounts + 4 licenses) + 1 row for Client Insights CSV. Each rep gets a colored owner dot (Dan=red `#C8102E` / Christian=blue `#2563eb` / Embry=green `#059669` / Anthony=purple `#7c3aed`).
- **Render model**: ONE row per `(account × owner)` pair. Overlap = same account appears multiple times, once per rep. Overlap **owner pills** (full coloured pills, not initials) shown in the Account Owner cell next to the row's owner pill — kept on one line via `white-space:nowrap` + `flex-wrap:nowrap`.
- **Default sort**: by owner (Dan → Christian → Embry → Anthony) so rows cluster by rep.
- **Columns**: Account Owner | Company | Vertical | Tier | Revenue | Score | US Client | Active Client | Licenses | Stage | Intent | Days Inactive (all sortable)
- **Filter set**:
  - Owner multi-select chips (colored to match each rep)
  - 🔁 Multi-Owner toggle (only accounts with overlap)
  - 🟢 Active License (uses per-owner license attribution via `getGroupActiveLicBadges(name, owner)`)
  - Tier dropdown · Vertical select · Search
- **Stats bar**: Total Rows · Unique Accounts · Overlap Accounts · per-rep counts
- **Shared enrichment cache**: logos, revenue, descriptions, sentiment all pull from `ibis_local` — anything enriched on the personal Accounts tab shows up instantly here. New group-only accounts auto-queue into the same enrichment pipelines via `autoQueueGroupEnrichment(owner)`.
- **Key functions**: `loadGroupData()`, `saveGroupAccounts(owner)`, `saveGroupLicenses(owner)`, `handleGroupAccountsCSV(owner, e)`, `handleGroupLicensesCSV(owner, e)`, `renderGroup()`, `renderGroupRow(r)`, `buildGroupRows()`, `getFilteredGroupRows()`, `getOtherRepOverlap(accountName)`, `renderOverlapBadges(accountName)`, `getGroupActiveLicBadges(name, owner)`, `hasGroupUSLicense(name, owner)`, `getGroupLicCount(name, owner)`
- **State vars**: `groupAccounts`, `groupLicenses`, `groupOwnerFilter`, `groupTierFilters`, `groupMultiOwnerOn`, `groupActiveLicOn`, `groupSortCol`, `groupSortDir`
- **Constants**: `GROUP_OWNERS = ['dan','christian','embry','anthony']`, `GROUP_OWNER_LABEL`, `GROUP_OWNER_INITIAL`, `GROUP_OWNER_COLOR`

### Insights Tab Features (v36)
- **Purpose**: derived analytics dashboard. Sub-tab switcher (pill style) inside the tab — currently 2 subpages but designed to scale.
- **Subpage 1: Group Accounts** — Accounts-by-Vertical breakdown with per-rep count pills + stacked bars showing rep distribution.
- **Subpage 2: Client Insights** — derived from SF "Active Client Report" CSV (~2.6K active licenses across the whole IBIS book).
  - **CSV schema** (key columns): `Account`, `Admin Client: Licensing Department`, `Admin Client: Vertical`, `Annualized Amount`, `License End Date`
  - **Industry vs Procurement rule**: `dept === 'Procurement'` → Procurement bucket. Everything else (blank, Library/Information Centre, Research, Marketing, etc.) → Industry bucket. Matches IBISWorld's two-product model.
  - **3 cards**: 🏛 Industry by Vertical (count + total $) · 🔷 Procurement by Vertical (same) · 💎 Top 25 Cross-Product Clients (accounts with BOTH active products, ranked by combined Annualized $)
  - Each of Industry + Procurement cards also includes a subsection: **Top 25 standalone clients** (accounts with that product but NOT the other), ranked by Annualized $.
  - All 3 top-25 lists have a **Company Revenue** column auto-fetched from Wikidata.
- **Key functions**: `renderInsights()` (group subpage), `renderClientInsights()`, `setInsightsSubtab(which)`, `renderVerticalBreakdown(containerId, rows, accentColor)`, `renderStandaloneTop25(containerId, active, kind, accentColor)`, `renderCrossProductTop25(active)`, `parseClientCSV(text)`, `handleClientInsightsCSV(e)`, `parseAnnAmount(str)`, `isProcurementDept(dept)`, `formatBigUSD(n)`
- **CSV parser caveat**: shared `parseCSV()` filters rows on `Account Name`/`AccountName` columns. The Active Client Report uses `Account` (no "Name") so we use dedicated `parseClientCSV()` which filters on `Account`. **Do not route the Client CSV through `parseCSV()` — it will silently return 0 rows.**
- **Loading overlay**: `showCsvLoadingOverlay(msg)` / `hideCsvLoadingOverlay()` — spinner + filename for large uploads. Parse runs via `requestAnimationFrame` so the overlay paints before the main thread blocks.

### Wikidata Company-Revenue Lookup (v36)
- **No backend dependency** — direct browser fetch from Wikipedia + Wikidata APIs (free, no auth, no Worker)
- **Storage**: `ibis_client_revenue` — its own protected localStorage key. Schema: `{ normName: {raw, label, source, year, ts} }`. **PROTECTED from Clear Cache** — `clearEnrichmentCache()` / `safeFreeStorage()` only modifies `ibis_local`, never touches this key.
- **Fetch pipeline** (`fetchRevenueFromWikidata(name)`):
  1. Strip company suffixes (`Inc.`, `Corp.`, `LLC`, `Ltd`, etc.) via `cleanCompanyName(name)`
  2. Wikipedia summary endpoint → extract `wikibase_item` ID (fallback: Wikipedia search API)
  3. Wikidata `wbgetclaims` → read `P2139` (revenue) with `P585` (year qualifier)
  4. Pick most recent year, convert to USD via `WD_CURRENCY_USD` table (12 majors: USD/EUR/GBP/JPY/CNY/CAD/AUD/CHF/INR/KRW/HKD/BRL)
  5. Cache result, log negative results to in-memory `wdTriedThisSession` Set (NOT persisted, so a fresh page load retries)
- **Queue runner**: `runWdRevQueue()` — 350ms throttle between requests. Cyan progress chip bottom-right shows "N left" countdown. Saves batched every 5 results for performance.
- **Read order on display** (`getClientCompanyRevenue(name)`): 
  1. Protected cache `clientRevCache[normName(name)]`
  2. Shared `localData[name].rev` (so accounts enriched elsewhere surface here too)
  3. Case-insensitive scan across `localData` keys (handles "KPMG" → "KPMG LLP" name variations)
- **Write strategy on successful fetch**: always writes to protected cache; opportunistically populates `localData[name].rev` ONLY if that entry has no existing revenue (so seed-table or future Claude values never get clobbered by Wikidata)

### Auto-Backup System (v36) — 3 layers, zero clicks required
**LAYER 1 — In-memory ring (browser):**
- Monkey-patches `Storage.prototype.setItem` to detect any write to an `ALL_STORAGE_KEYS` entry. Schedules `runAutoBackup()` with 30s debounce.
- Keeps last 5 v3 snapshots in `ibis_auto_backup_ring`. Evicts oldest if localStorage quota hit. Includes a `beforeunload` ring save as a safety net.
- Also fires unconditionally every 5 min via `setInterval(() => runAutoBackup(), 5 * 60 * 1000)` in case anything bypassed the hook.

**LAYER 2 — Auto-downloaded files (browser):**
- Silently triggers a `<a download>` of `ibis-autobackup-<ts>.json` to Downloads
- Throttled to **at most 1 file per hour** (`AUTO_BACKUP_FILE_MIN_MS = 3600000`)
- **Forced first backup**: 8 seconds after init, `bootAutoBackup()` fires `runAutoBackup({forceFile: true})` if any data is loaded — guarantees a file lands per session even if Dan just browses
- Status pill bottom-left: `🟢 Auto-backup 2m ago · file 30m ago` (click to open recovery modal)

**LAYER 3 — GitHub push (Windows Task Scheduler):**
- `scripts/auto-backup-to-github.ps1` — picks up newest `ibis-autobackup-*.json` from Downloads, copies to `backups/latest.json` + timestamped `backups/snap-<ts>.json`, commits and pushes to `main`. Keeps last 30 timestamped snapshots, prunes the rest.
- `scripts/auto-backup-run.bat` — thin wrapper (schtasks `/TR` has 261-char limit; the OneDrive path is too long for direct invocation, so we route through this `.bat`)
- `scripts/setup-auto-backup-task.ps1` — one-time registration via PowerShell `ScheduledTasks` cmdlets (NOT `schtasks.exe` — the latter doesn't quote paths with spaces properly, which silently broke the task with `ERROR_ACCESS_DENIED` until v36 fix)
- Task name: `IBIS Dashboard Auto-Backup`. User-scope, runs every hour. Logs to `backups/sync.log` (append-only).

**Recovery modal**: click the bottom-left green pill → lists the 5 in-memory snapshots. Click any to restore (full page reload after).

**Key functions / constants**: `runAutoBackup({forceFile})`, `scheduleAutoBackup()`, `_buildBackupSnapshot()`, `_autoBackupHash()`, `_autoBackupSaveToRing(snap)`, `_autoBackupDownloadFile(snap)`, `updateAutoBackupIndicator()`, `openAutoBackupPanel()`, `restoreAutoBackup(idx)`, `AUTO_BACKUP_RING_KEY`, `AUTO_BACKUP_META_KEY`, `AUTO_BACKUP_RING_SIZE=5`, `AUTO_BACKUP_DEBOUNCE_MS=30000`, `AUTO_BACKUP_FILE_MIN_MS=3600000`

### Safe Storage Cleanup (v36)
- Banner button now reads **"💾 Backup & Free Space"** (was "Clear Cache")
- New `safeFreeStorage()` function (alias: `clearEnrichmentCache()`) does:
  1. **Auto-downloads a full v3 backup FIRST** — happens before any destructive action
  2. **Shows itemized confirm dialog** listing exactly what's wiped (rev/desc/sentiment on `ibis_local`) vs preserved (action stages, status, priority, notes, CSVs, group data, `ibis_client_revenue`, dead, sort prefs, etc.)
  3. Wipes only re-fetchable fields (`rev`, `desc`+`descV`, `sentiment`) from `ibis_local`. **Never touches `ibis_dead`, `ibis_client_revenue`, or any CSV/group/contact stores.**
  4. Reports actual KB freed in the toast
- Cleanly composes with auto-backup (the wipe also triggers a fresh post-wipe backup via the storage write hook)

### Export / PDF (v36)
- **Buttons placed on**: Accounts controls bar · Group controls bar · Insights → Group Accounts subpage · Insights → Client Insights subpage
- **Engine**: `_printWithBanner(title, subtitle, sourceElement)` clones the target into `#print-stage`, prepends a banner, calls `window.print()`. Cleanup runs after the dialog closes.
- **Print stylesheet** (`@media print`): hides all chrome (header, tabs, controls, toasts, overlays, indicators, sub-tabs). Reveals only `#print-stage`. `print-color-adjust:exact` preserves all background colors (vertical pills, owner pills, badges). `page-break-inside:avoid` on `tr` and `ins-row` / `cli-cross-row` keeps rows whole.
- **Filter-aware subtitles**: `exportAccountsTab()` enumerates every active filter (Status, Priority, Stage, standalone flags, Tier, Vertical, search) + row count. `exportGroupTab()` similar for Group. `exportInsightsCurrentSubtab()` adapts to whichever subpage is active.
- **Manual backup button** in upload menu (💾 Backup Markup) still works as a manual fallback.

### Accounts Tab v36 additions
- **Overlap column** to the right of Revenue. `renderOverlapBadges(name)` returns owner pills for every OTHER rep (excludes 'dan') in the group lists who also has this account. Sortable by overlap count via `setSortCol('overlap')`. Live re-renders when any group CSV is uploaded (hook in `hookInsightsRefresh()`).
- **🔁 Multi-Owner filter chip** — added to Accounts filter chips. Sits next to ⚡ In Action. Uses standard `toggleChip(this,'MULTI_OWNER')` pattern. Filter logic in `getFiltered()`: `if (activeFlags.has('MULTI_OWNER') && getOtherRepOverlap(aName).length === 0) return false;`. AND-combines with all existing filters.
- **🤝 Team Sell priority** — new tier between Quick Winner and Legendary. Teal palette (bg `#ccfbf1` / text `#115e59`). CSS classes: `.apr-teamsell`, `.chip-teamsell.active`. Added to `ACCT_PRIORITY_OPTS`, `PRIO_COLORS`, sort maps in `getFiltered` + `renderAccountPage`, `prioFs` filter group, `knownFlags` Set.
- **🖨 Export / PDF button** — far right of controls bar. Calls `exportAccountsTab()`.

---

## REVENUE ENGINE
Priority order (v39): Seed table (instant) → Wikidata lookup queue (free, no auth — same pipeline as Client Insights) → SF CSV fallback
⚠️ The old Claude/Cloudflare-Worker enrichment queue was removed in v39 — the Worker was never deployed, so it had never returned data. `cloudflare-worker.js` remains in the repo but nothing calls it.

### Seed Table (must match CSV Account Name EXACTLY)
Lyft→$5.8B, Burger King→$2.3B, BJ's Wholesale Club→$20.2B, Lloyds Bank→$19.8B,
Rolls Royce→$23.7B, Booz Allen Hamilton→$11.3B, Embraer S.A.→$6.1B,
The Vanguard Group Inc.→$7.2B, Turner Construction Company→$16.0B,
Mediterranean Shipping Company→$91.0B, Labcorp→$13.0B,
MGM Resorts International→$17.2B, StoneX→$1.7B, Cleveland Clinic→$14.0B,
Authentic Brands Group→$750M, DRS Technologies Inc.→$3.2B,
Conocophillips→$54.7B, Danone→$17.7B, Blackrock→$20.4B,
Berkshire Hathaway→$364.5B, Panasonic→$65.0B, WPP→$19.0B, Aflac→$22.9B,
ExxonMobil→$339.25B

### No-revenue verticals (show dash, never enrich):
Academic, Government

### Manual tier overrides (v37.8)
Live in `TIER_OVERRIDES` constant near `REVENUE_SEEDS`. Applied by `applyTierOverridesToAccounts()` on init + after every accounts CSV upload — patches in-memory `accounts[]` so SF feed can never silently overwrite. Format: `'Exact Account Name': '<tier>'` where tier is `'1' | '2' | '3' | '4'`.

Current overrides:
- ExxonMobil → Tier 1

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

## ADDING A NEW CAMPAIGN — v39 ENGINE PROCESS

Since v39 the 7 simple campaigns run on one generic engine (`CAMPAIGN_ENGINE` + `campLoad/campSave/campHandleCSV/campMerge/campRender/campDelete/campClear/campCount`, search for `CAMPAIGN ENGINE` in index.html). The old 25-step checklist is obsolete. To add campaign `foo` (emoji 🆕, colors bg `#xxx` text `#yyy`):

1. **State**: add `foo = {}` to the campaign globals and `deadFooContacts = []` to the dead arrays; add `fooContacts: deadFooContacts` to `saveDead()` / `loadDead()` and a `fo|` seen-prefix line to `markDeadAsSeen()` + `updateDeadTabBadge()` + `renderDeadContacts` list/campColors.
2. **Engine entry**: one `CAMPAIGN_ENGINE.foo = { fn:'Foo', del:'Foo', count:'Foo', storageKey:'ibis_foo', idPrefix:'foo', csvKey:'foo', noun:'foo contacts', removeName:'Foo', deadLabel:'🆕 Foo', snapLabel:'Foo CSV', store: () => foo, setStore: v => { foo = v; }, dead: () => deadFooContacts }` — this auto-generates `loadFoo/saveFoo/handleFooCSV/mergeFoo/renderFoo/deleteFoo/clearFooData/getFooCount`, incl. pre-upload snapshot, dead detection, and dead-contact resurrection.
3. **Registry**: one `CAMPAIGN_DEFS.foo` entry (emoji/label/getCount/onActivate) + a `renderCampCluster` row + `updateUploadDots` MAP entry + `openContactPreview` type handler + `ibis_foo` in `ALL_STORAGE_KEYS` (🛡 BACKUP-FIRST RULE).
4. **HTML**: campaign view panel (`campaign-view-foo` with `foo-empty-state`/`foo-count-label`/`foo-table-wrap`/`foo-table-body`), controls inner (`controls-foo-inner` with `foo-search-input` using `debouncedSearch('renderFoo')`), dropdown menu item, stats div, upload-menu row + hidden file input.
5. **Extension**: add `ibis_foo` to the merged-contacts loop in `outreach-extension/bridge.js`.

Init (`loadFoo()` + empty-state toggle) is still called explicitly in `init()` — add one line there.

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

## SALESFORCE NATIVE COCKPIT — In Progress (June 2026)
*Goal: bring the dashboard's value INTO Salesforce so Dan's account workflow lives next to the live SF data instead of in a separate standalone page (he said the standalone dashboard "feels too apart from my day to day"). Explored live via Claude in Chrome.*

### 🚧 Hard constraint discovered — Dan CANNOT create Visualforce / Lightning / Apex
Verified live (his profile + all 12 permission sets + the functional "New" button test):
- **Profile:** "US Major Markets" (custom BDM *sales* profile). Role "US Ind MM BDM 1". SF User ID `005U100000534tpIAA`. Org `ibisworld-inc`, **Unlimited Edition**.
- **`Customize Application` = UNCHECKED** on his profile (also Debug Apex, Deploy Change Sets, package perms). This is the exact permission that gates creating Visualforce pages, Lightning App Builder pages, and Apex.
- His 12 permission sets are all feature/integration add-ons (Pipeline Inspection, Account Engagement/Pardot, 6sense, Gong, LinkedIn, Qualified, Files, IBISWorld Internal API Integration, IBISWorld Standard User) — **none** grants Customize Application.
- Functional confirmation: the **"New" button is absent** on Setup → Visualforce Pages (the button reflects profile + all perm sets combined).
- His broad Setup *tree visibility* (Object Manager, Custom Code, etc.) is a "view setup and configuration" permission — look, don't touch.
- **Implication:** a custom-branded Visualforce cockpit (his colors/graphics) is **BLOCKED** unless IT grants Customize Application — a visible, elevated-access ask, almost certainly not worth it. **Do NOT re-litigate the Visualforce route without an IT grant.**

### ✅ What Dan CAN self-serve (the chosen path: native + invisible)
His profile DOES have Create & Customize List Views / Reports / Dashboards (Edit My Reports, Edit My Dashboards, Export Reports checked). So the in-SF cockpit is built from **personal list views + private reports + a personal Lightning dashboard** — all scoped to "only me", invisible to other admins (NOT written to the Setup Audit Trail), zero system risk, no IT involvement.

### ⏸️ PROJECT STATUS — PAUSED (parked, not next session's priority — Dan's call, end of June-2026 session 2)
Dan deprioritized this. The work below is **saved server-side in Salesforce** (all private, reversible, zero org changes). Pick it up later — the one unfinished piece is getting the Active Clients pane onto the dashboard (blocked by a Lightning renderer glitch + an SSO session expiry at session end, NOT a logic problem).

### Artifacts built so far (all in `ibisworld-inc`, all PRIVATE / only-me / reversible)
**1. Account list view "DA$ Cockpit – My Territory"** — visibility "Only I can see", territory = **Filter by Owner → "My account teams"** (Account Team membership, more reliable than name-matching `Account_Owners__c`). Reverse: Accounts → view → gear → Delete.

**2. Personal Lightning dashboard "DA$ Cockpit"** (Private Dashboards, id `01ZU1000008Av6uMAC`). Current panes:
   - **MY COCKPIT** — Text widget routing hub with a hyperlink to the list view ("Open my Account Cockpit (editable list)").
   - **DA$ Cockpit - Open Opps by Owner** — live table (repointed this session off the old broken all-opps widget).
   - ✅ **Removed "Accounts by Vertical"** this session (Dan asked).
   - ❌ **Active Clients pane NOT yet attached** — see blocker below.
   - Dashboards are READ-ONLY (can't edit fields); the editable working-list lives in the list view, reached via the routing widget.

**3. Private reports** (all folder = Private Reports, owner Daniel Starr):
   | Report | Id | Type | Key config |
   |---|---|---|---|
   | **DA$ Cockpit - Active Clients (Licenses)** | `00OU1000005tuYAMAY` | Account with Licenses & Products | Show Me = My account team's accounts · Created Date = **All Time** · **License End Date ≥ TODAY** · **License Name does not contain "Migration"** · grouped by **License Type** · cols: Account, License Name, Annualized Amount, License End Date. **= 33 active licenses, $626,380.** |
   | **DA$ Cockpit - Open Opps by Owner** | `00OU1000005u0YjMAI` | Accounts with Opportunities | Show Me = My account team's accounts · Created Date = All Time · **Closed = False** · grouped by **Opportunity Owner: Full Name** · cols: Account, Opp Name, Stage, Amount, Close Date. One pane = mine-vs-colleagues (each owner is a group). Today: Daniel Starr $35K, no colleague opps yet. |
   | DA$ Cockpit - Tagged Contacts by Account | `00OU1000005toe1MAA` | Contacts | Department starts with "D" → 187 D+Account tagged contacts. |
   | DA$ Cockpit - Open Opportunities | `00OU1000005ts05MAA` | — | ⚠️ OLD/broken (all 1,824 opps, no open filter). Superseded by the by-owner report — **safe to delete**. |
   | DA$ Cockpit - Accounts by Vertical | `00OU1000005tqRJMAY` | — | Removed from dashboard; report still exists, can delete. |

### 🔑 LICENSE GEOGRAPHY DECODE (the big learning this session — how active/PIQ/intl is actually encoded)
- **"Active client" = compute it**: `License_End_Date__c >= TODAY`. There is **no "Active" field** (validates why the standalone dashboard recomputes from end-dates). Also no "active license" Account field (search "licen" on Account = 0 fields).
- **Geography/product lives ONLY in the License Name string**, as a middle token: **`- US -`** (US Industry) · **`- USP -`** (US Procurement = **Procurement IQ / PIQ**) · **`- CA -`** (Canada) · **`- AU -`** (Australia) · **`- UK -`** (United Kingdom).
- **NO clean groupable geography field exists.** Checked them all: `License_Type__c` AND `License_Type_Label__c` = **contract tier** (Direct / Enterprise / Departmental), NOT geography. `Module` and `Module_Country` (under the "Products" group of the report type) = **numeric internal IDs** (-1, 108, 1000…), useless for display — same class as `Vertical__c` being a number.
- **⚠️ "Direct" ≠ international.** Initially looked like Direct = the foreign book, but the full run showed **Toast and Staples are US-Direct**. So License-Type grouping does not isolate international. (Caught this by running the report for real instead of trusting the limited preview — worth remembering: SF report PREVIEW shows a truncated record set that can mislead.)
- **International clients bill in local currency** (AUD/GBP) — itself a reliable "this is foreign" flag. **Canada bills in USD**, so currency alone won't separate CA from US.
- **To isolate the international book cleanly**, the only reliable filter is **License Name contains `- CA -` / `- AU -` / `- UK -`** (3 filters, OR'd). Dan's current foreign book: 🇦🇺 Glencore (AUD 28.6K), Coca-Cola (AUD 25K), Newmont, Parker Hannifin · 🇨🇦 Schneider Electric ×3, ABB · 🇬🇧 Hiscox ×3.
- **Migration rows = $0 junk** (his documented rule). Filter `License Name does not contain "Migration"` — also removes duplicate $0 artifacts of real Departmental licenses.
- **🪤 The Created-Date trap:** every new SF report silently pins **Created Date = "Current FQ"**, which returns **0 rows** on older territory data. ALWAYS flip it to **All Time** first (the "No Results" hint has an "All Time" quick-link, but verify it applied — it sometimes doesn't on first click).

### 🚧 The blocker that stopped us (not logic — tooling)
Adding the **Active Clients report as a dashboard pane** failed repeatedly: the **Lightning dashboard editor's renderer froze** (CDP `Page.captureScreenshot` timed out "renderer may be frozen", and "+ Widget → Chart or Table → Add" silently no-op'd ~3×). On the retry-with-fresh-reload attempt, the **Salesforce session token expired → bounced to Microsoft SSO** (`login.microsoftonline.com`, tenant `d6e1be51-…`) on every Lightning navigation. Re-auth is Dan's to do (can't enter his credentials). **To finish (4 clicks, ~30s, once logged in):** open DA$ Cockpit → **Edit** → **+ Widget → Chart or Table** → pick **"DA$ Cockpit - Active Clients (Licenses)"** → (optionally tick "Use table settings from report" for the client list, or leave as the License-Type $ bar chart) → **Add** → **Save**.

### Cockpit column → real SF field mapping (pure existing Account fields — for the list view, no new fields needed)
| Column | Field | Notes |
|---|---|---|
| US Days Since Last Activity | `US_Days_Since_Last_Activity__c` | Formula(Number) |
| Paying client? | `Core_Clients__c` (# Core Clients) | Roll-Up COUNT of Admin Client = native paying-client proxy |
| Open opp? | `Core_Opportunities__c` (# Core Opportunities) | Roll-Up COUNT Opportunity |
| Other BDMs + names | `Account_Owners__c` (long text) + `Account_Owner_Roles__c` + `Account_Owners_number__c` | Semicolon name list e.g. "Daniel Starr; Zachary Ruthven; …" |
| Vertical | `Vertical__c` | Picklist — the API VALUE may be a number; render the label, not the raw value |
| Tier | `Major_Markets_Tier__c` | Formula(Text) |
| Revenue | `AnnualRevenue` | standard |
| 6sense intent / stage | `X6sense_Account_*` variants (GL/NA/IW/PIQ) | Novelis showed **GL** populated (Intent 57, Stage Consideration); Dan's CSV uses "NA" — verify which variant has data when wiring |

### Next steps when resumed
- **Finish the Active Clients pane** on the dashboard (4 clicks above) — the report is done.
- Optional: add a dedicated **🌍 International Clients pane** (clone Active Clients, swap the Migration filter approach for `License Name contains - CA -/- AU -/- UK -`).
- Finish the list view columns + sort (mid-build).
- Delete the two dead reports (old Open Opportunities, Accounts by Vertical) to keep Private Reports tidy.
- The standalone dashboard's tracking layer (Status / Priority / Action / Notes) would need org-wide custom fields — **deferred**; stays in the standalone tool.

---

## CLAUDE IN CHROME — REMOTE BROWSER WORKFLOW
*Claude Code remoting into Dan's real Chrome to connect data across his 4 core pages (dashboard, Outlook, Salesforce, Power Automate). Primary use today: live-diagnosing the Outreach Extension against ground-truth data. `/start-session` step 0c automates the enablement + access probe.*

### The 4 core pages (the workspace)
| # | Page | URL |
|---|---|---|
| 1 | Dashboard | `https://dabbs4dan.github.io/ibisworld-dashboard/` |
| 2 | Outlook (Outreach → 6QA) | `https://outlook.office.com/mail/` |
| 3 | Salesforce | `https://ibisworld-inc.lightning.force.com` |
| 4 | Power Automate | `https://make.powerautomate.com` |

### How the tooling works
- Claude does NOT read Dan's existing tabs directly. It owns a dedicated **MCP tab group** and acts on tabs inside it. Create it with `tabs_context_mcp({createIfEmpty:true})`, then `navigate`/`tabs_create_mcp` to populate it. Cookies/sessions are shared with Dan's logged-in profile, so the work pages load already authenticated.
- Read paths: **`read_page` (accessibility tree) is the reliable one.** `get_page_text` also works. `javascript_tool` + `screenshot` are higher-power but collide with injected extensions (see below).

### ⚠️ The two access blockers we hit (June 2026) — and the fixes
1. **Domain lockout / session binding (the big one).** Every domain except the dashboard returned *"Navigation to this domain is not allowed"* — even github.com — despite Claude Code's own permissions allowing the navigate tool fully. Root cause: the Chrome connection **binds to whatever domains are reachable at connect time**, and re-selecting the browser does NOT refresh it (`switch_browser` only works with a 2nd browser open). **Fix = Dan-side setup + a fresh session:**
   - **Claude in Chrome → Settings → Claude in Chrome → Site permissions → "Default for all sites" = `Allow extension`** ("works everywhere except sites you block"). This is the undocumented master switch the Reddit community found — without it, new domains are hard-denied with *no approval prompt ever appearing*. Confirmed: flipping it mid-session does NOT unblock the live connection; it must be set BEFORE the session starts.
   - In Claude Code: **`/chrome` → "Enabled by default"** (persists Chrome control without `--chrome`).
   - **All 4 tabs open in Chrome before launching the session.** A fresh session + "Allow extension" already set + tabs open = clean attach to all domains.
   - If still denied: set "Allow extension" in BOTH claude.ai and Claude Desktop (covers multiple Chrome profiles).
2. **Outreach Extension vs Claude's debugger.** On pages where Dan's own Outreach Extension injects content scripts (dashboard + Outlook), `javascript_tool` and `screenshot` fail with *"Cannot access a chrome-extension:// URL of different extension."* **`read_page` still works** — use it as the default. If a JS/localStorage read is essential (e.g. pulling `ibis_6qa` directly), toggle the Outreach Extension OFF in `chrome://extensions` during diagnosis, then back ON to test badges.

### Verified-working tool sequence
`list_connected_browsers` → `select_browser(deviceId)` → `tabs_context_mcp({createIfEmpty:true})` → `navigate(tab, url)` → `read_page(tab)`. Confirmed reading the dashboard's full Accounts table via `read_page` even while JS was blocked.

---

## OUTREACH EXTENSION — Chrome Extension

**Location:** `/outreach-extension/` subfolder inside this repo (saved to GitHub, not deployed)
**Version:** v3.80
**Purpose:** DOM overlay injected into Outlook Web — shows staleness dots, days-since badge, step count, and company bubble directly on each email row + folder badge counts on campaign folders.

### 🧩 Company-matching + metrics rework (v3.74–v3.80) — READ THIS BEFORE TOUCHING content.js MATCHING
A full June-2026 session rebuilt how rows map to a contact/company and how the three badges (staleness / step count / reply) are computed. The matching ENGINE was always accurate — every bug was in *which contact a row maps to* (a wrong match corrupts company + steps + replies together). All changes node-tested before push.

- **Two-token corroboration in `findAccountNameInText` (v3.76):** multi-word account names now require **≥2 of their significant tokens** present in the row text (single-token names need their 1 token). Replaces the old "longest single token" anchor that let a lone boilerplate word match. "World Bank Group" matches a row saying "World Bank" but NOT "World Trade Center" (signature) or "business" (signature). This structurally killed the CarMax/Farmers/"business"/"world" over-match class. `_ACCT_STOP_WORDS` is a secondary noise filter (generic words like business/insurance/research/industry/market — but NOT 'world', which the two-token rule needs as a corroborator).
- **`rowSearchText(row)` leaf-join (v3.77 — CRITICAL):** `row.textContent` concatenates sibling DOM cells with no space ("…World Bank" + "Hi Shiya" → "World BankHi Shiya"), which broke the `\bbank\b` boundary so two-token matching failed on real DOM. `rowSearchText` joins leaf-node text with spaces (same approach as `extractGreetingName`). ALL matching reads (`_textHint`, confirmation text, Strategy 4 scan, domain-fallback) go through it. If matching ever silently fails live but passes node tests, suspect textContent concatenation first.
- **Strict body-scan gate `_confirmTextScanMatch` (v3.76, Fix B):** Strategy 4's body-wide first-name scan now requires the company to actually appear in the row (no known-territory-domain auto-pass). Fixes a stray "Todd Kadry" in a Hubbell email wrongly labeling the row "FIS".
- **Confident greeting match (v3.76, Fix D):** Strategy 2b — a UNIQUE greeting first-name in the cache whose send date matches the row (`_dateCorroborates`) now surfaces the company even without it echoed in the body (Khaled→Air Canada, Roem→BNP Paribas). Confidence `cache_name_greeting`.
- **Strategy 3c initial+lastname bridge (v3.79):** for INBOUND rows, the full From name ("Jose Castro") is pattern-matched against cache local-parts (`matchCacheByNamePattern`: jcastro / jose.castro / castro …); on a hit the domain resolves the company. Gated by known-domain OR date match. Fixes Jose→Univision, Lara→Allinial.
- **Strategy 6 last-resort (v3.80):** runs ONLY after all else fails, so it never overrides a working match. For an outbound row addressed by first name ("Hi Dominica") whose email is initial+lastname (ddobbins@coca-cola.com), it matches only when: (a) Dan emailed the address on EXACTLY this row's day, (b) the address starts with the greeting's name/initial, (c) the domain is a KNOWN territory account, AND (d) exactly one account survives (any ambiguity → shows nothing). Dominica's own row stays blank because two "D" accounts collided on the same day — the safety rail correctly declining, not a bug. The clean fix for initial+lastname contacts is loading the campaign CSV (gives name↔email↔account directly). **Do NOT loosen S6's uniqueness gate — Dan explicitly chose safety over a wrong-logo guess.**
- **Company-name overrides (`COMPANY_NAME_OVERRIDES`, v3.76/79):** gowlingwlg.com→Gowling WLG, aircanada.ca→Air Canada, bnpparibas.com→BNP Paribas, televisaunivision.com/univision.com→Univision.

### 📏 Thread-scoped metrics (v3.78) — step count / staleness / reply
Dan's explicit decision: all three badges reflect THIS conversation, not the contact aggregated across all threads (a single 1:1 email to Josh was showing "3" because he was CC'd on two team blasts; the PA cache aggregates everything). Now read from the row's own DOM; the PA cache is used ONLY to resolve the company name.
- **Step count = `getThreadCountFromAria(row) || (contact replied ? 2 : 1)`** — messages in this conversation. A single email shows 1; a thread with a reply floors to 2. No longer the PA-cache unique-day total.
- **Staleness = the row's own date** (latest message in this conversation), future-clamped. No more pulling a fresher date from an unrelated thread.
- **Reply = `getNonDanFromNames(row).length > 0`** — the contact is a participant in THIS conversation's From field ("Christina; Daniel Starr"), not a reply in some other thread.
Every matched row's steps/days/replied was validated EXACT against the PA cache ground truth across 6QA/Workables/Churns.

### 🛠 Dev environment notes (this session)
- **Node.js is required to syntax-check the extension** (`node --check content.js`) but was NOT installed. Installed **portable Node v24.16.0** at `%LOCALAPPDATA%\nodejs-portable\` (no admin needed — winget MSI needs UAC) and added to user PATH. On a fresh machine, reinstall node (winget `OpenJS.NodeJS.LTS` with admin, or the portable zip route) before editing the extension.
- **Claude-in-Chrome debugger conflict:** clicks/JS/screenshots fail globally ("Cannot access a chrome-extension:// URL of different extension") when another debugger-using extension is active. Fix = disable other extensions (Loom / ZoomInfo / Outreach Everywhere / Tomba were the offenders) + use a FRESH tab; `read_page`/`navigate` always work. Outlook never exposes the contact email in collapsed-row DOM (`S1:no-dom-email` on every row) — that's why name/date matching is needed at all.

### Files
| File | Purpose |
|---|---|
| `manifest.json` | MV3. Runs on all Outlook URL variants + dabbs4dan.github.io |
| `content.js` | DOM overlay v3.80. Injects row badges + folder badges into Outlook. Also handles `\bcc` snippet expansion in compose bodies. Matching cascade S1–S6 + thread-scoped metrics — see the rework section above. |
| `overlay.css` | Minimal CSS for badge classes (most styles applied inline with `!important` to beat Outlook) |
| `background.js` | Service worker. Generates red "I" icon via OffscreenCanvas. Also proxies cross-origin fetches for content scripts (FETCH_URL message). |
| `bridge.js` | Content script on dashboard (v1.5). Merges ALL 8 campaign stores → `outreach_contacts_raw` + pushes account names → `outreach_account_names` |
| `popup.html` | Simple "IBISWorld Overlay Active ✓" popup — version shown dynamically |
| `popup.js` | Reads `chrome.runtime.getManifest().version` and writes to `#ver` span |
| `config.js` | `IBIS_CONFIG.OVERDUE_DAYS = 3` — reference config (content.js uses its own `OVERDUE_DAYS = 2`) |

### How data flows
1. User opens dashboard → `bridge.js` merges all 8 campaign stores and pushes to `chrome.storage.local.outreach_contacts_raw`
2. User opens Outlook campaign folder → `content.js` reads contact map + PA email cache, scans email rows, injects badges
3. `bridge.js` polls every 3s for same-window changes; also listens for cross-tab storage events
4. PA flow `IBISWorld Contact Activity Sync` writes `contact_activity.json` to OneDrive → extension fetches via background proxy → uses real sent dates + step counts

### Storage keys (chrome.storage.local)
- `outreach_contacts_raw` — merged JSON of ALL 8 campaign contacts, written by bridge.js v1.5
- `outreach_contacts_ts` — timestamp of last push
- `outreach_account_names` — JSON map of all account names from `ibis_accounts` (bridge.js v1.5). Keys = lowercase account name, values = `{name, domain}`. Used by `accountNameMap` for DOM text company matching.
- `ibis_folder_counts` — persisted folder overdue counts (JSON string `{folderName: count}`) — survives folder switches + page reloads
- `ibis_fc_version` — folder count version tag ('v2'). Bumped when counting methodology changes (v2 cleared stale preload estimates).
- `ibis_email_cache_map` — persisted processed email cache for instant load on next startup (avoids 5-10s SharePoint wait)

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

### DOM Overlay (content.js v3.43)

#### Name-based contact matching (v3.31 — CRITICAL REWRITE)
- **Problem solved:** Date-based matching (`findEmailByDate()`) was the PRIMARY row-to-contact matching strategy. With 107+ contacts, date collisions caused wrong company names on most rows. Date-fallback matching fully REMOVED in v3.31 — name-based matching is the only strategy.
- **Matching pipeline** in `findContactForRow(row, activeFolder, domDate)`:
  1. **DOM email scan** — highest confidence, scans DOM attributes for `@` addresses
  2. **Greeting name parse** — `extractGreetingName(row)` parses "Hi/Hey/Hello [Name]" from preview text → `matchContactsByFirstName(name, folder)` matches against contacts. Tries folder-restricted first, then cross-folder fallback. Date tiebreaking for ambiguous first names.
  2b. **Greeting name vs cache** — `cacheNameMap` indexes email addresses by first name for contacts NOT in dashboard campaign stores (e.g. "ren.thomas@evergreen.edu" → firstName "ren"). Built by `buildCacheNameMap()`.
  3. **From name parse** — `getNonDanFromNames(row)` extracts non-Dan sender names from the From field (for inbound/mixed threads like "Élise Doucet; Daniel Starr"). Tries full name match via `matchContactsByFullName()`, then first name.
  3b. **From name vs cache** — same cacheNameMap fallback as 2b.
  4. **Broad text scan** (v3.42) — scans entire row text for any known contact first name (from `contactMap` or `cacheNameMap`). Folder-restricted first, then cross-folder. Handles inbound reply rows where the preview shows the contact's reply text (not Dan's "Hi [Name]" greeting) and the From field shows Dan (not the contact).
  5. **Returns null** — row gets staleness-only badge (no company/step/reply). Date-fallback completely removed.
- **`OWN_NAMES` Set** — filters Dan's own name from greeting parse
- **`contactMapLoaded` flag** — on first contact map load, strips all badges and re-scans
- **`stripAccents(s)`** (v3.31) — NFD normalization for matching accented names (Élise → Elise). Applied in all name matching functions.

#### Greeting name parse fix (v3.31 — CRITICAL)
- **Problem:** `row.textContent` concatenates sibling DOM elements WITHOUT spaces. "IBISWorld Sample for ToastHi Pierre" has no word boundary before "Hi" → regex fails.
- **Fix:** `extractGreetingName(row)` now searches individual leaf DOM nodes via `row.querySelectorAll('*')` filtered by `childElementCount === 0`. Each leaf's textContent has proper boundaries.

#### Instant cache loading (v3.31)
- **Problem:** PA cache fetch from SharePoint takes 5-10s.
- **Fix:** `processEmailCache()` persists processed `emailCache` map to `chrome.storage.local.ibis_email_cache_map`. Init loads it synchronously on startup for instant badges. Fresh data loads in background.

#### Scan fast-path (v3.31)
- When all rows already have `data-ibis-processed`, `scanEmailRows()` exits immediately — avoids redundant work logged as repeated "6 rows, 5 overdue".

#### Recovery heartbeat (v3.30)
- `setInterval` every 3.5s checks for rows missing `data-ibis-processed` → forces re-scan. Staggered from 1.5s folder badge heartbeat.

#### Staleness date resolution (v3.41)
- Uses the MORE RECENT of DOM date and PA cache date.
- DOM date = when email was filed in the campaign folder (could be weeks old for the original outbound).
- PA cache date = most recent email to/from this contact across all contexts (v3.41: inbound replies now update lastDate too).
- "When did I last contact this person?" → the more recent date is always correct.
- **Staleness colors (v3.40):** 3 tiers only — green (0-2d), yellow/amber (3-5d), red (6d+).

#### Step count (v3.43)
- Unique calendar DAYS Dan emailed this contact (deduped from PA cache `dates[]` array).
- Always black text on grey background — no color coding.
- Hour-level dedup in `processEmailCache()` prevents same email in multiple PA arrays from inflating count.
- Tooltip: "N emails sent to this contact (across all threads)" — per-contact aggregate, not per-thread.

#### Reply detection (v3.43)
- **Two sources:** PA cache `hasReplied` (inbound email filed in campaign folder) OR DOM From field (row's From shows a non-Dan name).
- DOM-based detection is critical because PA flow only monitors 7 campaign folders + Sent Items — inbound replies that stay in Inbox are invisible to PA.
- `getNonDanFromNames(row).length > 0` → `hasReplied = true` → ↩ reply chip shown.

#### Folder count model (v3.43)
- **Source of truth:** `folderCounts[f]` set when extension physically scans that folder's DOM rows.
- **Pre-load on PA cache load** (v3.43): `preloadFolderCounts()` estimates overdue counts for unvisited folders using PA email dates + `_folders[0]`. Only fills folders NOT in `scannedFolders` Set — DOM-scanned folders are never overwritten.
- **`scannedFolders` Set (v3.39):** Tracks folders visited this session. Added to ALL early return paths in `scanEmailRows()` (empty folder, fast-path, normal scan). Prevents preload from reverting correct counts.
- **Empty folder reset:** When `scanEmailRows()` finds 0 rows, resets `folderCounts[activeFolder] = 0`.
- **Persistence:** `ibis_folder_counts` in chrome.storage.local. `FC_VERSION = 'v2'` — bumped in v3.41 to clear stale preload estimates.
- **Folder badge matching** (v3.34): Primary: aria-label exact match. Fallback: `textContent.includes(f)` with letter-suffix guard.
- **OVERDUE_DAYS = 2** (v3.35). Day 1 = amber, Day 2+ = overdue and counted in folder badge.

#### Folder-strict date matching (v3.29 — CRITICAL)
- `findEmailByDate()` ONLY returns contacts whose `_folders` includes the active folder. Never returns untagged or cross-folder contacts.
- ±1 calendar day tolerance for time-zone edge cases.

#### bridge.js v1.4 — `_folder` → `_folders` array
- Each contact now carries `_folders: string[]` — ALL campaign folders it belongs to (a contact in both Workables and Old Samples gets `_folders: ['Workables', 'Old Samples']`).
- First-campaign-wins for `accountName`; all folders collected for matching.

#### Row badges
- **Staleness chip** — colored dot (green→amber→orange→red→crimson) + glow + "Nd" or "today". Uses more recent of DOM date and PA cache date.
- **Step count** — envelope icon + unique calendar days emailed. Always black/white (no color coding).
- **Reply chip** — green `↩` shown when contact has replied (PA cache `hasReplied` OR DOM From field shows non-Dan name).
- **Company bubble** — favicon + company name. Only shown for name-matched contacts with a known `accountName` or domain. `FAVICON_DOMAIN_OVERRIDES`: `lge.com → lg.com`. `FAVICON_URL_OVERRIDES`: `parker.com → Google Favicon API`.

#### Helper functions
- `extractGreetingName(row)` — searches leaf DOM nodes for "Hi/Hey/Hello [Name]". Filters `GREETING_GENERIC` + `OWN_NAMES`. Uses `stripAccents()`.
- `buildCacheNameMap()` — indexes email addresses by first name from PA cache for contacts not in dashboard campaigns.
- `matchContactsByFirstName(firstName, folder)` / `matchContactsByFullName(fullName, folder)` — both use `stripAccents()`.
- `tiebreakByDate(candidates, rowDate)` — picks candidate with PA cache dates closest to DOM date (±1 day).
- `preloadFolderCounts()` — estimates overdue counts for non-active folders from PA cache.
- `findAccountNameInText(text)` (v3.52) — scans row text (subject/preview) for known account names from `accountNameMap`. Sorted longest-first to avoid partial matches. Returns `{name, domain}` or null.
- `accountNameMap` (v3.53) — reverse lookup from lowercase account name → `{name, domain}`. Built from bridge's `outreach_account_names` (all 159 accounts from `ibis_accounts`) + supplemented by campaign contacts' `accountName` fields. Used by `findAccountNameInText()` for DOM text company matching.

#### Domain-based cache fallback (v3.60)
- When no email match exists (greeting name doesn't match email prefix), but `findAccountNameInText` finds a company name with a known domain, searches the PA email cache for any `@domain` email. Picks the most recently active email at that domain.
- Provides step count + reply status + staleness date for contacts whose email can't be matched by name.
- Example: greeting "Hey Lara" can't match `ljoseph@allinialglobal.com`, but subject contains "Allinial Global" (domain: `allinialglobal.com`) → finds the PA cache entry → shows step count = 1.

#### Folder-restricted matching only (v3.61 — CRITICAL)
- Cross-folder fallback in Strategies 2 (greeting), 3 (sender), and 4 (text scan) fully REMOVED.
- **Rationale:** each contact's `_folders: string[]` already lists every campaign they belong to. If `_folders.includes(activeFolder)` is false, the contact genuinely isn't in this folder's campaign. Cross-folder "fallback" was just guessing — and the guess often picked the wrong company (e.g. Todd-at-FIS row wrongly matched Todd-at-Michaels from a different folder).
- Unmatched rows now fall through to Strategy 5 (date+domain correlation in `scanEmailRows`) or show staleness-only badge. No more wrong company bubbles from cross-folder collisions.

#### First-email step count (v3.61)
- PA cache runs every 2h, so new contacts emailed *today* have 0 entries in the PA cache `dates[]` array. Step count was stuck at 0 until next PA sync.
- Fix: `if (stepCount === 0 && resolvedEmail && domDate) stepCount = 1;` — the DOM row's existence in the folder proves at least one email was sent. Backfills to true count on next PA sync.

#### Campaign-folder scoping (v3.62 — CRITICAL)
- Old `getActiveCampaignFolder()` Step 4 scanned ALL `[aria-label]` / `[title]` elements in the document. Sidebar treeitems (e.g. `aria-label="❄️ Winback, 3 unread"`) kept matching even when the user was on Inbox → badges appeared on every email in every folder.
- **Fix:** Step 4 removed. Step 1 (document title) now authoritative: if the title names a specific non-campaign view (Inbox, Sent Items, Drafts, Archive, etc.), return null immediately instead of falling through to stale tree-state detection (Outlook leaves `aria-selected`/`tabindex=0` on sidebar treeitems after the user navigates away).
- Steps 1-3 cover all real cases. Extension now ONLY decorates rows inside the 7 campaign folders.

#### Snippet expander (v3.63)
- TextBlaze-style inline text expansion inside Outlook compose bodies (new mail, reply, reply all, forward).
- **`SNIPPETS` array** — list of `{ trigger, action, value, toast }` objects. Extensible — add more triggers without changing matching logic.
- **Current triggers:**
  - `\bcc` → strips the trigger text, clicks the Bcc button if hidden, pastes the Salesforce email-to-case tracking address into the Bcc field, shows a toast confirmation.
- **Flow:** `input` event listener (capture phase) on document → `isComposeBody(el)` check (walks up DOM looking for `aria-label="Message body"`) → match text-before-cursor against any snippet trigger → strip trigger + fire action.
- **Key functions:** `setupSnippetExpander()`, `onSnippetInput()`, `isComposeBody()`, `fillBccField()`, `findBccInput()`, `findBccButton()`, `typeIntoBcc()`, `showSnippetToast()`.
- **Selectors used** (may need adjustment if Outlook DOM changes): Bcc input = `[aria-label^="Bcc" i][role="combobox"]` / `[contenteditable="true"]` / `input`. Bcc button = any button/role=button with text or aria-label matching `/^bcc$/i` or `/show bcc/i`.

#### Key functions
`scanEmailRows()`, `updateFolderBadges()`, `getDateFromRow()`, `findContactForRow()`, `findEmailByDate()`, `injectRowBadges()`, `loadEmailCache()`, `processEmailCache()`, `normFolder()`, `buildCacheNameMap()`, `preloadFolderCounts()`, `findAccountNameInText()`, `loadContactMap()`

#### Key implementation details
- **`normFolder(text)`** — ⚠️ MUST use `\p{Extended_Pictographic}` NOT `\p{Emoji}` — `\p{Emoji}` includes ASCII digits 0–9, which strips "6" from "6QA". Also strips `\p{Mn}` (nonspacing marks) + `\p{Cf}` (format chars) + explicit `\uFE0E\uFE0F` variation selectors. CRITICAL: ❄️ = U+2744 + U+FE0F — without stripping U+FE0F, the invisible char breaks exact matching (the Winback bug, fixed v3.59).
- **`processEmailCache()`** — builds `emailCache` map: `{ email → { lastDate, count, dates[], hasReplied } }`. Splits `toRecipients` on `;` for multi-recipient emails. Inbound replies now update `lastDate` (v3.41) AND set `hasReplied:true`. `from` field parsing extracts email from angle brackets (v3.37). Hour-level `seenSends` dedup (v3.41) + `seenIds` dedup.
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

### bridge.js v1.5 — all 8 campaigns + `_folders` array + account names
Merges `ibis_opps`, `ibis_samples`, `ibis_6qa`, `ibis_churn`, `ibis_netnew`, `ibis_multithread`, `ibis_winback`, `ibis_alumni` into one flat contact map keyed by email. Each contact now carries `_folders: string[]` — ALL campaign folders it belongs to (a contact in both Workables and Old Samples gets `_folders: ['Workables', 'Old Samples']`). Used by `findEmailByDate()` for folder-strict date matching.
**v1.5 addition:** Also pushes `outreach_account_names` from `ibis_accounts` localStorage — a slim map `{accountNameLower: {name, domain}}` so content.js can find company names in email subject lines even when no campaign contact exists (the `accountNameMap` / `findAccountNameInText()` system).

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
- **Git identity (must be set on any new machine):**
  ```
  git config --global user.email "daniestarr67@gmail.com"
  git config --global user.name "Dan Starr"
  ```

### Vibe check
- Dan should always feel like he knows what's happening
- If the dashboard looks worse after a change, that's a failure — visual quality always matters
- When in doubt: simpler, cleaner, faster

---

## CLAUDE BEHAVIORAL RULES
*Accumulated from real sessions. These are corrections and confirmations that must carry forward — Claude should not need to relearn these.*

### /check-session exchange counting
When `/check-session` runs, check if a session summary / compaction block exists at the top of the conversation. If yes, this is a continuation window — the prior session's exchanges must be included in the count. A compaction summary typically represents 30–60 prior exchanges. Never say "🟢 You're good" when a compacted summary exists at conversation start unless fewer than 5 new exchanges have happened since.

### Don't run ahead after context compression
After a context compression event, the session summary may list pending tasks. Do NOT auto-execute them. Read the summary for orientation, then either continue the exact last in-progress task (if obviously mid-step) or ask Dan what he wants to do next. Auto-launching a multi-step workflow like `/end-session` without explicit instruction is presumptuous.

### Iterative architectural fixes — never blanket toggles
Dan's stated principle: *"Put in hard work — don't turn stuff off or revert to old systems. Apply fixes that are true, unique, iterative, pushing a new version systematic — the way we improve the version with this fix should ideally cascade and catch other ones that are broken."*
- Never full-disable a feature to make a symptom go away — find the real discriminator
- Never revert to a prior version when iteration hits a dead end — keep improving forward
- Each fix should cascade: the underlying improvement should catch other latent bugs in the same class
- Bump the version with each meaningful fix so versions are discrete, meaningful steps
- Red flags to avoid: "let's just disable X", reverting whole functions, shipping the same narrow patch twice in different places instead of extracting a shared helper

### Worktree detection and merge discipline
At every session start, run `git worktree list`. If the current path contains `.claude/worktrees/`, warn Dan immediately and ensure all commits are followed by merge+push to main. If stale worktrees appear from the main folder, auto-clean all three steps: `git worktree remove --force`, `git branch -d`, `rm -rf` the project history entry. Never confirm something is "live" without verifying it was pushed to main specifically. At `/end-session`, delete the worktree project history entry FIRST before attempting `git worktree remove`.

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

## PORTABILITY & DISASTER RECOVERY
*This project must be able to survive losing the work Windows machine. Everything critical lives in GitHub.*

### What's safe (in GitHub — always recoverable)
- `index.html` — the entire dashboard
- `CLAUDE.md` — project brain, behavioral rules, architecture, open items
- `DESIGN.md` — full design system
- `.claude/commands/` — all slash commands
- `outreach-extension/` — all Chrome extension files
- `cloudflare-worker.js`

### What's NOT in GitHub (must be rebuilt)
- **Browser localStorage** — all account data, notes, priorities, action stages, campaign contacts, revenue cache. This is the biggest risk. If the machine dies, all of Dan's data must be re-uploaded from Salesforce CSVs. The code survives; the data doesn't.
- **Claude memory files** (`~/.claude/projects/.../memory/`) — behavioral guidance files. Now mirrored into the `CLAUDE BEHAVIORAL RULES` section above, so CLAUDE.md is self-sufficient. Memory files are a local performance optimisation, not a requirement.
- **`.claude/settings.local.json`** — two local node-validation permissions. Recreate on new machine by allowing those commands when Claude Code prompts.

### Emergency setup on a new machine
Full step-by-step guide lives in `RECOVERY.md` in this repo. Short version:
1. Clone: `git clone https://github.com/Dabbs4Dan/ibisworld-dashboard`
2. Set git identity (see Git workflow section above)
3. Open Claude Code from the cloned folder
4. Run `/start-session` — CLAUDE.md has everything
5. Re-upload all CSVs from Salesforce to rebuild data
6. Load extension: Chrome → `chrome://extensions` → Developer mode → Load unpacked → `outreach-extension/`

### Architectural rule
**This project must primarily live online in GitHub.** Nothing important should exist only on a local machine. When adding new files, features, or config — ask: "would this survive a machine wipe?" If not, get it into the repo.

---

## OPEN ITEMS

> **🧱 v42–v43 session — Accounts-tab overhaul (July 9 2026).** Full detail in **CURRENT STATE — v43**. Built: full relationship-**history columns** (Key Client/Churn/Opps/Trials) with the unified `histClass` colour system (gold ≥2024 / grey <2014 / red-blue-green by type), **removed the $20K Key-Churn floor**, merged Other Lost → Key Opps, **CA = red Industry** rule everywhere in the bubble columns; **split Priority into Priority (Immediate/Urgent/Prioritize/Working/Team-Sell/Tabled = `acctPrio`) + Stage (action stages = `acctPriority`)**; replaced the Action column with a **favorite star** by the logo + **Favorites** filter (still `hasAction`/Action tab); **action-priority pillbox** (Fire/Wait/Internal/Chill/Won = `actFlags`) merged into the Action Headline cell with matching multi-filter + priority sort; **sticky row-number sidebar**; **typed multi-select filters** (Industry/PIQ/Intl + a self-cleaning dynamic owner list); **uniform grey filter bubbles** with coloured text + **per-option result-count preview** in dropdowns; **Export Excel** (Account + Status, abbreviations spelled out); dropdown **flip-up** near viewport bottom; smoother Status-collapse toggle. Migrations `ibis_prio_split_v42` + `ibis_actflags_v43` (guarded, reversible). Open threads below (🔴 Next).
>
> **🔴 Next / to verify against real data:** (1) **Canadian opps** — CA→red keys off the opp Business field starting with "CA"/"Canada"; if SF labels them differently (e.g. Business "International" + CAD currency), widen `oppGeoInfo` detection. (2) The account **deep-dive page** still shows `acctPriority` (now Stage) under a "Priority" label — relabel/split if wanted. (3) Optionally extend CA→red to the **Active-Client badge + Licenses tab** (currently kept as 🌍 INTL there). (4) Cards view priority chips remain stale (Dan works in Table).

> **🎛 v41 session — Accounts column-header filter system + custom My Opp + priority→stages + deploy fix (July 8 2026).** Rebuilt the Accounts Table filters into per-column header **bubbles** (two-row sticky header: grey bubble strip over the label row); Cards view keeps the old chip bar. Multi bubbles take the option's full colour theme; added **Vertical** + **Revenue-band** + **Stage** + **Has Headline** filters. New **custom My Opp** free-text bubble (grey dot → type → saves to `ibis_local.customOpp`). **Priority column repurposed** to the Action-board stages + Unresponsive/Won/Nurture/unselected (old rarity data backed up to `ibis_priority_legacy` + cleared via `migrateLegacyPriority()`). New **Action Headline** column right of Company (shared `actionHeadline`). Fixed the My Opp sort (was counting account/contact opps → CarMax stuck at top). Full detail in **CURRENT STATE — v41**. **🚨 Also root-caused why pushes stopped deploying**: committed `backups/` had bloated to ~90 MB and stalled the Pages build — fixed with `.nojekyll` + pruning snaps (repo 92 MB → 4.7 MB) + auto-backup script now keeps only 5 snaps in-repo. Open threads below (🔴 Next).

> **🚀 v40 session — Opportunities layer + Accounts UI/perf overhaul (July 2026).** Built the Opportunities report CSV (IndexedDB) + 5 new Accounts columns (My Opp / Other Opp / Key Lost / Other Lost / Key Trials), unified `.ib-*` bubble system (Rotation style), universal fixed-viewport scroll (Accounts/Licenses/Group/Rotation/Dead), sticky header, chip-wrapping, license+opp indexing, per-row enrichment patching, Market/Ent Drop statuses. Full detail in **CURRENT STATE — v40**. **⚠️ Dan must re-upload the Opportunities CSV once** for the Owner-Role-based Other Opp categories (needs the `Owner Role` + `Type` columns re-added to storage this session). Open threads below (🔴 Next).

> **⏸️ SF-native cockpit — session 2, June 2026 (no `index.html` changes; project now PARKED on Dan's instruction).** Built out the cockpit substantially in Salesforce (all private/reversible): the **DA$ Cockpit dashboard** got an **Open-Opps-by-Owner** live table (grouped by Opportunity Owner so my opps and PIQ/global colleagues' opps split out in one pane), **Accounts-by-Vertical removed**, and two solid private reports — **Active Clients (Licenses)** (active = End Date ≥ today, Migration junk filtered, grouped by License Type → 33 active, $626K) and **Open Opps by Owner**. **Biggest learning: how license geography is actually encoded** — US/USP(=Procurement IQ)/CA/AU/UK live ONLY in the License Name string; License Type/Label = contract tier (Direct/Enterprise/Departmental), and Module/Module_Country are useless numeric IDs. Also caught my own error (Direct ≠ international — Toast/Staples are US-Direct) by running the report instead of trusting the truncated preview. **The one unfinished piece:** attaching the Active Clients report as a dashboard pane — blocked by a **Lightning dashboard renderer freeze** (screenshot/add timeouts) and then an **SSO session expiry** (bounced to Microsoft login). Both are tooling issues, not logic — a 4-click finish once re-authed. Full detail + report IDs in the **SALESFORCE NATIVE COCKPIT** section. Dan is **not working this next session.**

> **🗺️ Salesforce-native cockpit session — June 2026 (no `index.html` changes; one reversible SF list view created).** Explored hooking the standalone dashboard closer to Salesforce. **Big finding:** Dan's "US Major Markets" profile lacks "Customize Application" → he **cannot create Visualforce/Lightning/Apex himself** (verified profile + all 12 permission sets + the missing "New" button on Setup → Visualforce Pages). So a custom-branded in-SF page is blocked without an IT grant. Pivoted to the native + invisible route he CAN self-serve: built a personal **"DA$ Cockpit – My Territory"** Account list view (visibility = only-me, territory = "My account teams"). Mapped every cockpit column to a real Account field. Next: finish columns/sort + a private dashboard. Full detail in the new **SALESFORCE NATIVE COCKPIT** section. Also re-confirmed the **Chrome debugger conflict**: ZoomInfo Anywhere (and Loom/Outreach Everywhere/Tomba) grab the CDP debugger and block `clicks`/`screenshot`/`javascript_tool` with "Cannot access a chrome-extension:// URL of different extension" — disable ALL non-Claude debugger extensions + use a fresh tab; `read_page`/`navigate`/`get_page_text` always work even while blocked.

> **🔬 Live-diagnosis session note — June 4 2026 (Claude in Chrome, no code changes).** First time reading Dan's live Outlook overlay. Confirmed the "Us"/subdomain company-label bug, left the CarMax sticky-label question open (needs recipient-domain verification), confirmed "Harris Williams" is a territory data gap (not a bug), and verified 6QA staleness dates are actually correct. Discovered two access walls: the M365/Teams connector is blocked by Conditional Access (AADSTS50158), and the Claude-in-Chrome beta only attached to Outlook this session (dashboard/Salesforce/Power Automate denied). See the four 🔬 rows below.

> **🔧 Chrome-enablement session note — June 2026 (no code changes to index.html).** Root-caused the multi-tab access wall. The fix is the undocumented **"Default for all sites = Allow extension"** switch (Claude in Chrome → Settings → Site permissions) — without it, every new domain is hard-denied with no approval prompt. Flipping it mid-session does NOT unblock the live connection (it binds to reachable domains at connect time); requires a fresh session with the setting set + all 4 tabs open. Captured the full setup in the new **CLAUDE IN CHROME — REMOTE BROWSER WORKFLOW** section + automated it in `/start-session` step 0c (probes all 4 core pages up front, stops if denied). Also confirmed: on dashboard + Outlook, the Outreach Extension's injected scripts block `javascript_tool`/`screenshot` ("different extension" error) but `read_page` works fine. The Outreach diagnosis mission (subdomain fix, CarMax verify, 6QA audit, PA inspection) is **queued for next session** once full browser access is live.

| Priority | Item | Notes |
|---|---|---|
| ✅ Done (v41) | Accounts column-header filter system | Per-column filter bubbles (two-row sticky header); Table view only, Cards keeps old chips. Multi = colour-themed chip + coloured-pill dropdown; toggle = neutral/red. New Vertical + Revenue-band + Stage + Has Headline filters. See CURRENT STATE — v41. |
| ✅ Done (v41) | Custom My Opp free-text bubble | Grey dot → editable bubble saved to `ibis_local.customOpp`; SF/Custom filter; sorts below real SF opps; debounce-clear on remove (fixed shadow-save). |
| ✅ Done (v41) | Priority column → Action-board stages + Unresponsive/Won/Nurture | Old rarity data migrated to `ibis_priority_legacy` + cleared. Doesn't write to Action board yet. |
| ✅ Done (v41) | Action Headline column on Accounts (right of Company) | Shares `ibis_local.actionHeadline` with Action tab; Has-Headline toggle filter. |
| ✅ Done (v41) | Fix My Opp sort (CarMax stuck at top) | Sort now matches the column: SF my-opp (2) → custom (1) → none (0); ignores account/contact opps. |
| ✅ Done (v41) | GitHub Pages deploy fix (.nojekyll + prune backups) | 90 MB of committed `backups/` snaps stalled the Pages build → pushes silently didn't publish. Added `.nojekyll`, pruned snaps (repo → 4.7 MB), auto-backup keeps 5 snaps in-repo. Deploys publish in ~1 min now. |
| 🗺️ Future | Cards-view priority chips are stale | The old rarity chips (Legendary/Rare/…) in Cards view no longer match data after the priority→stages change. Left as-is (Dan uses Table). Convert or remove when convenient. |
| 🗺️ Future | Wire Priority column ↔ Action board | Priority now uses Action-stage options but is NOT connected to the Action tab. Could sync `acctPriority` ↔ `acctActionStage` if Dan wants one source of truth. |
| 🔴 Next | Confirm Won/Nurture priority extras | Dan asked for "Unresponsive" explicitly; I added 🏆 Won + 🌱 Nurture as judgment calls. Confirm/adjust the extra options next session. |
| ✅ Done (v40) | Opportunities report CSV + My Opp / Other Opp / Key Lost / Other Lost / Key Trials columns | IndexedDB storage, Owner-Role categorization, unified `.ib-*` bubbles, in-cell expand, filters. See CURRENT STATE — v40. |
| ✅ Done (v40) | Universal fixed-viewport scroll + sticky header + chip-wrapping | `sizeActiveGrid()` across Accounts/Licenses/Group/Rotation/Dead; fixed Rotation cut-off + tier-diamond-over-header + chips-cut-off-at-zoom. |
| ✅ Done (v40) | Performance: index licenses/opps + per-row enrichment patching | Killed per-row O(n) rescans; enrichment patches just the changed row's rev/score cells. |
| 🔴 Next | Re-upload Opportunities CSV | Owner Role + Type columns were re-added to storage this session — Dan must re-upload once so Other Opp categories (New PIQ / PIQ Renew / New FR / UK Renew…) populate correctly. |
| 🔴 Next | Extend sticky headers + `.ib-*` bubble style to other table tabs | v40 gave Licenses/Group/Rotation the fixed-viewport scroll, but NOT sticky column headers or the clean DM-Sans pill styling — those are still Accounts-only. Easy add if the header disappearing on scroll bothers Dan. |
| 🗺️ Future | Dedicated close-date range filter/sort on opps | Other Opp filter already sorts by furthest-future close date; a "closing before/after X" filter is a bigger feature if wanted. |
| 🗺️ Future | "Other Lost" column name | Kept "Other Lost" (not "Other Opps") to avoid clashing with the adjacent Other Opp column — revisit if Dan wants it renamed. |
| 🗺️ Future | Migrate bulk localStorage stores (client licenses, group) to IndexedDB | Opp report moved to IDB in v40; the storage-warning banner will keep appearing until the other big stores follow. |
| ✅ Done | 🔄 Rotation tab (v38) | New 8th tab, right of Insights. Single departed-rep dataset (accounts/licenses/opps + markup). 14-col lightweight list: Assign · Team Sell · PIQ Rep (auto from Group Embry/Anthony) · Active Opp · Active License · ⭐Company · Vertical · Tier · Revenue · Key Churns · Key Trial · 6sense · Licenses · Opps. All headers sortable. 6 quick filters. Star = key account (gold row). PDF + Excel export (colors + AutoFilter, excludes Assign/Team Sell). Uploads in the 👥 Group CSV menu → Rotation section. See v38 Summary + ROTATION TAB KEYS. |
| 🔴 Next | Rotation: confirm opp CSV field mapping live | Wired to SF opp report schema (Account Name · Opportunity Name · Stage · Amount · Close Date · Created Date · Type) from Dan's screenshots. Active = Stage not Closed Won/Lost; Trial = Amount ≤ $1 OR Closed Won. Verify against a real upload; Key Trial dates currently = Created → Close. |
| 🗺️ Future | Rotation: International churns in Key Churns | Currently Key Churns = Industry/PIQ only (Dan's spec). Add INTL if he wants. Also: multi-pill Excel cells collapse to one color — could split to rows. |
| ✅ Done | SF permissions verified — Dan can't create Visualforce/Lightning/Apex | Profile "US Major Markets" lacks `Customize Application`; 12 perm sets are all feature add-ons; no "New" button on Setup → Visualforce Pages. Native reports/list views/dashboards only. Memory: `project_sf_permissions.md`. See SALESFORCE NATIVE COCKPIT section. |
| ✅ Done | Built personal SF list view "DA$ Cockpit – My Territory" | Only-me visibility, "My account teams" territory filter (50+ accounts). Reversible: Accounts → view → gear → Delete. Columns mid-build (not saved). |
| ⏸️ Paused | SF-native cockpit — PARKED (Dan deprioritized, June 2026 session 2) | Built & saved private: dashboard `DA$ Cockpit` (01ZU1000008Av6uMAC) with Open-Opps-by-Owner table + MY COCKPIT routing widget; removed Accounts-by-Vertical; reports **Active Clients (Licenses)** `00OU1000005tuYAMAY` (33 active, $626K) + **Open Opps by Owner** `00OU1000005u0YjMAI`. Decoded license geography (US/USP=PIQ/CA/AU/UK live only in License Name; no clean geo field). See SALESFORCE NATIVE COCKPIT section for full detail. |
| 🔴 Next (when resumed) | Attach Active Clients pane to dashboard | Blocked by Lightning renderer freeze + SSO session expiry — NOT logic. 4-click finish once logged in: DA$ Cockpit → Edit → + Widget → Chart or Table → "DA$ Cockpit - Active Clients (Licenses)" → Add → Save. Then optional 🌍 International pane (filter License Name contains `- CA -`/`- AU -`/`- UK -`). |
| 🗺️ Future | SF cockpit tracking layer (Status/Priority/Action/Notes inside SF) | Needs org-wide custom fields OR an IT "Customize Application" grant. Deferred — tracking stays in the standalone dashboard for now. |
| 🗺️ Future | Branded Visualforce cockpit (only if IT elevates Dan) | Would mimic the standalone dashboard's look inside SF, but requires IT to grant `Customize Application`. Visible/elevated ask — parked unless Dan pursues it with IT. |
| ✅ Done | Outreach Extension: "Us"/subdomain company label (v3.73) | `domainToName()` (`content.js` ~1689) now strips leading generic subdomain labels via a `GENERIC_SUBDOMAINS` Set (us/mail/corp/emea/email/smtp/na/global/regional codes/infra) before taking the name label — never strips past the registrable domain, so `us.bosch.com` → "Bosch", `mail.corp.bigco.com` → "Bigco", two-part TLDs (`bosch.co.uk`) preserved. Full-domain `COMPANY_NAME_OVERRIDES` check still runs FIRST so keys like `us.issworld.com` resolve before `us` is stripped. Manifest bumped 3.72→3.73. **Reload extension in chrome://extensions to apply.** |
| ✅ Done | Outreach Extension: CarMax sticky-label (v3.74–v3.76) | SETTLED via PA cache: zero `@carmax.com` contacts exist — it was a Strategy-2 over-match. Dan's signature "Business Development **Manager**" put "business" in every email, and the old longest-token anchor picked "business" out of "CarMax Business Services, LLC". Fixed by the two-token corroboration rule (see rework section). Same class fixed "Farmers Insurance"←"Pet Insurance". Verified live in 6QA: all 6 CarMax + the Farmers label gone; Max now correctly shows BlackRock. |
| 🗺️ Blocked | M365 / Teams connector — Conditional Access (AADSTS50158) | 🔬 Dan's customized Microsoft 365 connector authenticates as daniel.starr@ibisworld.com but every Graph call fails `AADSTS50158 "external security challenge not satisfied"` — an IBISWorld Conditional Access policy (managed-device / IT app-approval), NOT a login error; re-auth doesn't clear it. Needs IT to allow-list app id `api://07c030f6-5743-41b7-ba00-0a6e85f37c17` (tenant `d6e1be51-d33d-44fc-a23f-d343cd8b3e78`). Workaround used: Claude in Chrome reading Outlook web. |
| ✅ Fixed | Claude-in-Chrome — per-session domain lockout | 🔧 Root cause: the connection binds to reachable domains at connect time, and the **"Default for all sites" extension setting was not `Allow extension`** → every domain except the dashboard hard-denied with no prompt. Fix: set "Allow extension" (Claude in Chrome → Settings → Site permissions) + `/chrome` "Enabled by default" + open all 4 tabs BEFORE launching + fresh session. Automated in `/start-session` step 0c. Full detail in CLAUDE IN CHROME — REMOTE BROWSER WORKFLOW section. |
| ✅ Done | Outreach diagnosis — full pass complete (v3.74–v3.80) | All four items done. (1) subdomain fix verified live (Bosch reads "Bosch"). (2) CarMax settled = over-match, fixed. (3) audited every 6QA + Workables + Churns row end-to-end vs PA-cache ground truth — staleness/steps/replies were 100% exact; all company mislabels root-caused and fixed (two-token, leaf-join, strict body-scan). (4) `contact_activity.json` inspected: Sent Items IS in the union (342 outbound + 12 inbound of 354), all dates uniform ISO `+00:00`. Then per Dan: thread-scoped the metrics + added the name-pattern bridge + last-resort match. See the rework section. |
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
| ✅ Done | Outreach Extension v3.30–v3.36 debugging pass | Name-based matching (cacheNameMap, accent normalization, leaf node greeting parse), date-fallback removal, instant cache loading, staleness fix (more-recent-of DOM/PA date), step count (PA cache total), folder badge fixes (subfolder bleed guard, live pre-load, OVERDUE_DAYS=2, stable FC_VERSION), Parker favicon (Google API). |
| ✅ Done | Outreach Extension v3.37–v3.43 bug fix pass | Fixed: `from` field parsing for inbound reply detection (angle bracket extraction), `dateFromAriaLabel` pattern priority (day-of-week before time-only), step count double-counting (hour-level dedup + unique-day display), folder badge preload overwriting DOM-scanned counts (`scannedFolders` Set), inbound reply detection via DOM From field (PA flow misses Inbox replies), broad text scan Strategy 4 for matching contacts on reply rows. Simplified staleness to 3 tiers (green/yellow/red). Step count now black/white only. FC_VERSION bumped to v2. |
| 🗺️ Future | PA flow: tag emails with source folder | Currently `_folders[0]` (dashboard campaign primary) used as proxy for Outlook folder — imperfect. Real fix: PA flow should include a `sourceFolder` field on each email. |
| ⚠️ Monitor | Outreach Extension: company bubble accuracy | Company bubble shows for name-matched contacts OR via DOM text fallback (`findAccountNameInText`). Step count available via domain-based cache fallback (v3.60). Contacts with no name match AND no account name in subject/preview get staleness-only badges. |
| 🗺️ Future | Outreach Extension: DOM scraper fallback | If Azure AD app registration isn't possible, build `scraper.js` content script that reads email list from Outlook DOM when user opens thread view. No API needed — reads rendered rows. Triggered on-click only (not background scan). |
| 🗺️ Future | Outreach Extension: Winbacks campaign | Define filter logic (churned accounts, lost stage contacts) + populate from ibis_opps/ibis_licenses |
| 🗺️ Future | Outreach Extension: Samples campaign | Define filter logic + contact list |
| 🗺️ Future | Outreach Extension: Add Campaign modal | UI + storage for custom campaigns |
| 🗺️ Future | Outreach Extension: email compose integration | Pre-fill Outlook compose with contact name + template on click |
| 🗺️ Future | Outreach Extension: activity logging | Log sent emails back to dashboard (surface in Workables tab) |
| ✅ Done | Slash command worktree fix | `/end-session` Step 4b now deletes project history entry FIRST (before git worktree remove) so it's always gone even when session is inside the worktree. `/start-session` now auto-runs full cleanup (remove + branch delete + history delete) when stale worktrees are detected from the main folder. |
| ✅ Done | Action tab: Has Opp filter chip + opp sort (v33) | `💼 Has Opp` chip in Action controls bar. `actionHasOppFilter` bool + `toggleActionHasOppFilter()`. Filters to `hasActiveOpp(name) || hasAnyContactOpp(name)`. Opp column header now sortable (`setActionSortCol('opp')`), sort tracked at `#axsort-opp`. |
| ✅ Done | 3 new campaigns: Multithread / Winback / Powerback (v33) | 😎 Multithread (amber), ❄️ Winback (rose), 🥶 Powerback (teal). All have full function stacks, upload CSV rows, dead contact wiring, CAMPAIGN_DEFS entries. Same schema as all other campaigns. |
| ✅ Done | Alumni campaign (v34) | 🎓 Alumni (indigo `#4f46e5`/`#eef2ff`/`#c7d2fe`). For contacts who were IBISWorld users at a prior company and are now at an account in Dan's book. Same CSV schema. Full function stack, dead wiring, revive, account page panel, campaign cluster oval. Also fixed Multithread/Winback/Powerback missing from campaign dropdown selector. |
| ✅ Done | Campaign addition checklist (v34) | 25-step checklist added to CLAUDE.md under `## ADDING A NEW CAMPAIGN`. Covers all JS + HTML touch points in order. |
| ✅ Done | Universal campaign cluster widget (v33) | `renderCampCluster(name)` — compact oval pills for all 8 campaigns. `.camp-oval` CSS. Replaced 3 separate columns (Workables/Samples/6QA) in Accounts table with one unified Campaigns column. Used in Accounts table, Action table, Account page header. Each oval clickable for preview. |
| ✅ Done | Action tab design pass (v33) | Camp cluster `flex-wrap:nowrap` (ovals no longer stack vertically). Controls bar chips now wrap naturally (removed nowrap from `#controls-action`). Campaigns `<th>` min-width:110px. Opp badge padding 7→8px. Territory dot size 7→8px. |
| 🗺️ Future | Campaigns: Winbacks campaign | NOW DONE as ❄️ Winback (v33). |
| ✅ Done (v39) | Dead Contacts resurrection logic | Built into the campaign engine's `campMerge` — a dead contact that reappears in a CSV re-upload is auto-revived (notes preserved) for all 7 simple campaigns. Workables keeps its bespoke revive. |
| ✅ Done | Dropped-from-CSV accounts hidden from Accounts tab | Bug fix: accounts with `hasAction=true` that were dropped from CSV were still appearing in Accounts tab with orange badge. Fixed: `getFiltered()`, `updateStats()`, and count label now all exclude `_droppedFromCSV:true` accounts. Accounts tab is now a pure live-territory view. Dropped accounts stay in `accounts[]` for Action tab only. |
| ✅ Done | Outreach Extension v3.53–v3.60 — Winback fix + company bubble + domain fallback | **Root cause:** `❄️` = U+2744 + invisible U+FE0F variation selector. `normFolder()` stripped the snowflake but not the variation selector, so `"️ Winback" !== "Winback"` always failed. All other folder emoji (`😎🔥🌱🥶`) don't use variation selectors. **Fix (v3.59):** Added `\p{Mn}` + `\p{Cf}` + explicit `\uFE0E\uFE0F` to normFolder regex. **Also fixed:** `getActiveCampaignFolder()` broadened with `tabindex="0"` treeitem check (v3.57). **bridge.js v1.5:** pushes `outreach_account_names` from `ibis_accounts` so company bubble works for ALL territory accounts, not just campaign contacts. **`findAccountNameInText()` (v3.52):** DOM text fallback scans row text for known account names (catches subject lines like "Enhancements for Allinial Global"). **Domain-based cache fallback (v3.60):** when no email match exists but company domain is known, searches PA cache for any `@domain` email → provides step count + reply status. Diagnostic heartbeat added (v3.56) for future debugging. |
| ✅ Done | Outreach Extension v3.61 — cross-folder company bleed fix + first-email step count | **Bug 1:** Cross-folder greeting match picked wrong company when contact wasn't in the active folder's dashboard campaign (Todd-at-FIS row matched Todd-at-Michaels). **Fix:** removed cross-folder fallback in Strategies 2/3/4. Contacts carry `_folders: [all campaigns]` so folder-restricted match catches all legitimate cases; cross-folder was guessing. **Bug 2:** Step count stuck at 0 for new contacts until next PA sync (PA runs every 2h). **Fix:** if `stepCount === 0 && resolvedEmail && domDate`, bump to 1 — DOM row in the folder is proof of one sent email. |
| ✅ Done | Outreach Extension v3.62 — scope badges to campaign folders only | **Root cause:** `getActiveCampaignFolder()` Step 4 scanned every `[aria-label]`/`[title]` element in the document, matching sidebar treeitems like "❄️ Winback, 3 unread" even when the user was on Inbox. Badges appeared on every email everywhere. **Fix:** Step 4 removed. Step 1 hardened: if document title names a specific non-campaign view (Inbox/Sent Items/Drafts/etc.), return null immediately instead of falling through to stale tree-state detection (Outlook leaves `aria-selected`/`tabindex=0` on sidebar treeitems after navigating away). Extension now only decorates rows inside the 7 campaign folders. |
| ✅ Done | Outreach Extension v3.63 — `\bcc` snippet expander | TextBlaze-style inline expansion. Type `\bcc` anywhere in a compose body (new mail/reply/forward) → trigger text strips, Bcc field opens if hidden, Salesforce email-to-case tracking address pastes into Bcc, toast confirms. `SNIPPETS` array in content.js is extensible — add more triggers (e.g. `\sig`, `\cal`) by appending one entry. |
| 🗺️ Future | More snippet triggers | `SNIPPETS` array is ready for growth — next likely additions: signature block, calendar booking link, "thanks and regards" closer, pricing blurb. |
| ✅ Done | ⚡ Quick Winner priority tier (v35) | New top-priority tier on Accounts table dropdown. Navy (`#1e3a8a`) + white text. Sorts above Legendary (value 0 vs 1). Includes filter chip in the priority-chip row. `ACCT_PRIORITY_OPTS[5]` hard-coded index replaced with key-based `.find()` to survive future tier additions. Touches: CSS `.apr-quickwinner`, `ACCT_PRIORITY_OPTS`, `PRIO_COLORS`, 2 sort maps (Accounts + Action), filter chip + `PRIO_QUICKWINNER` flag in `prioFs` + `knownFlags` + `map`. |
| ✅ Done | Outreach Extension v3.64 — SF BCC tracking filter | `isSFTrackingEmail()` helper rejects `emailtosalesforce@*.salesforce.com` addresses in both inbound and outbound PA cache processing. Salesforce BCC tracking email no longer inflates step counts or triggers false replies. |
| ✅ Done | Outreach Extension v3.65–v3.68 — iterative reply detection tuning | Series of attempts to fix false-reply chips on Dan's follow-up threads (Parker Hannifin, Medline, Univision). v3.65 stripped "forwarded" from aria match. v3.66 added "You replied/forwarded" phrase strip. v3.67 full disable (over-corrected). v3.68 restored with phrase strip. Also added `domain.includes('ibisworld')` rejection in Strategy 2b (Yuyu/eBay brand leak). Ultimately superseded by v3.69. |
| ✅ Done | Outreach Extension v3.69 — PA-first reply detection + universal brand guard | When `cacheData` exists for the matched contact, PA is authoritative: `hasReplied = cacheData.hasReplied \|\| domReply`, aria-label IGNORED (eliminates false positives from Dan's own follow-ups). When no cache entry, fall back to `domReply \|\| hasRowReplyIndicator` (best-effort). Brand-leak rejection moved INSIDE `_synthCacheResult` — returns null when domain or synthesized name contains `ibisworld`. Every caller (S2b/S3b/S4) null-guards consistently. |
| ✅ Done | Outreach Extension v3.70 — DOM truth layer + PA cache-buster | `dateFromAriaLabel` now collects ALL date tokens (priority-ordered, deduped by ISO day) and returns the MOST RECENT — fixes rows where Outlook's aria packs "Thu 4/16 ... You replied Tue 4/21" and we were grabbing the origin date. `getAllDatesFromRow()` gathers from aria + `<time>` + nested aria-labels + leaf spans. Step count floor = `max(PA-unique-days, DOM-date-count, ariaThreadCount, 1)` — PA staleness can never pull step count below realtime DOM truth. `getThreadCountFromAria()` parses "N messages" / "N items" as additional floor. `loadEmailCache()` URL gets `?cb=<timestamp>` to defeat SharePoint CDN serving stale `contact_activity.json`. |
| ✅ Done | Backup / Restore Markup buttons (v35) | New buttons at the bottom of the Upload CSV menu. 💾 Backup Markup downloads `ibis-backup-YYYY-MM-DD.json` containing `ibis_local` + `ibis_dead` + `ibis_sort`. 📥 Restore Markup smart-merges user-markup fields (`hasAction`, `acctStatus`, `acctPriority`, `acctActionStage`, `actionHeadline`, `actionNextDate`, `actionNotes`, `actionKeyContact`, `accountPlan`, `acctOpp*`) back onto current `ibis_local` without clobbering fresh enrichment data (revenue/desc/sentiment). Restores `ibis_dead` + `ibis_sort` wholesale. Calls `renderAll() + renderAction() + renderDead() + updateDeadTabBadge()` after merge. Designed to defend against the localStorage-loss scenario that hit Dan this session (Chrome cleared site data → all markup gone). Key functions: `exportLocalBackup()`, `handleLocalRestore(event)`. Hidden file input: `#local-restore-input`. |
| ✅ Done | RECOVERY.md + portability hardening | New `RECOVERY.md` in repo root: full emergency machine-transfer guide (clone, git auth via PAT, Claude Code install, Chrome extension load, CSV re-upload order, Mac vs Windows differences). `CLAUDE.md` now contains `CLAUDE BEHAVIORAL RULES` section (4 accumulated feedback rules embedded so memory files become optional, not required) + `PORTABILITY & DISASTER RECOVERY` section. Git identity documented (`daniestarr67@gmail.com`). `README.md` expanded from one line to a proper landing page. `/start-session` now detects fresh machine / missing memory files and falls back to CLAUDE.md cleanly. Architectural rule: "This project must primarily live online in GitHub." |
| ✅ Done | Outreach Extension v3.72 — works on PA cache + accounts CSV alone, no campaign data required | **Root cause:** `findContactForRow()` bailed out at Strategy 1 when `contactMap` was empty (no campaign CSVs uploaded), skipping all cache-based fallback strategies. Extension was useless without campaign data — over-architected dependency Dan flagged. **Fix (4 cascading changes):** (1) New `domainAccountMap` — built from `accountNameMap` (accounts CSV via bridge v1.5), provides domain → canonical account name reverse lookup. Works WITHOUT campaign CSVs. (2) Removed the `contactMap-empty` bail in `findContactForRow` — now only bails when BOTH `contactMap` AND `emailCache` are empty. (3) `_synthCacheResult` now prefers `domainAccountMap[domain]?.name` over `domainContactMap[domain]` over `domainToName(domain)`. Same order at lines 863, 915, 989. (4) `_confirmCacheMatch` relaxed: when `_textHint` is null AND `domainAccountMap[res.domain]` exists, accept the match — the known-territory-account match IS the confirmation. Medline/Nisa fix still holds because that case has a `_textHint` catching at the `_hintOk` branch. Architectural shift: campaign CSVs are now **optional enrichment** (titles, folder-strict tiebreaking on ambiguous first names), not required for matching. |
| 🔴 Next | Outreach Extension: Univision/Jose still unmatched after v3.72 | v3.72 fixed most rows (Honeywell, Allinial, Toast, Evergreen, Procurementiq, Tufts all matching cleanly). Univision/Jose row still shows no company bubble + false reply chip + wrong step count. Suspected data issue, not code: Univision's Website field in the accounts CSV may be blank/missing/wrong domain (post-Televisa merger their actual email domain may be `televisaunivision.com` not `univision.com`). Next session: ask Dan for F12 console screenshot filtered by `[IBISWorld]` — look for startup `Contact map: ... territory-domains` count and `⛔ Match failed: [breadcrumbs]` on Jose's row. Breadcrumb will reveal whether (a) cacheNameMap doesn't have Jose at all, (b) cacheNameMap has him but domain isn't in `domainAccountMap`, or (c) something else. Likely fix: confirm Univision's domain in the accounts CSV. |
| ✅ Done | Outreach Extension v3.71 — short-form account matching + unified cache gate + CSX logo | `findAccountNameInText` now has a 2nd pass: for multi-word account-map keys ("Medline Industries Inc."), extract the longest non-stopword ≥4 chars as an **anchor** and whole-word-match it in text. Fixes the root cause of Medline→Nisa: `_textHint` was null because subjects use short form ("Medline") vs dashboard long form. Stop-word list: inc/corp/ltd/industries/holdings/global/etc. **Hoisted cache confirmation gate:** `_confirmCacheMatch()` extracted to top of `findContactForRow`. Strategies 2b, 3b, 4 all funnel through it. Previously S4's cacheNameMap branch bypassed the gate — that was the leak path. Brand-check + text-hint check unified in one helper. **CSX logo fix:** added `csx.com` to `FAVICON_URL_OVERRIDES` (DDG serves broken icon; Google S2 API renders the real logo). |
| ✅ Done | 👥 Group tab (v36) | 4-rep enterprise overlap view. 8 storage keys (per-rep accounts + licenses). One row per (account × owner). Full filter set (owner multi-select, multi-owner toggle, active license, tier, vertical, search). Per-rep license attribution. Owner pills in Account Owner cell show overlap from other reps. See Group Tab Features section. |
| ✅ Done | 📊 Insights tab (v36) | Two-subpage analytics dashboard. Subpage 1: Group Accounts by vertical with per-rep breakdown. Subpage 2: Client Insights derived from SF Active Client Report CSV (~2.6K rows). Three cards: Industry by vertical, Procurement by vertical, Top 25 cross-product. Each top-25 list includes Company Revenue from Wikidata. See Insights Tab Features section. |
| ✅ Done | Wikidata company-revenue lookup (v36) | Direct browser fetch (no Cloudflare Worker — Dan never deployed one). P2139 with P585 year qualifier. 12-currency USD conversion table. PROTECTED cache in `ibis_client_revenue` key — Clear Cache can never wipe it. 350ms throttle, batched saves, cyan progress chip. |
| ✅ Done | Auto-backup system (v36) | 3 layers, fully automatic, zero clicks: (1) in-memory ring of 5 snapshots in `ibis_auto_backup_ring`, triggered by every `localStorage.setItem` to `ALL_STORAGE_KEYS` via Storage.prototype monkey-patch + 30s debounce + 5min safety-net interval + beforeunload save; (2) auto-downloaded `ibis-autobackup-<ts>.json` to Downloads (forced first-of-session backup at +8s, then at most hourly); (3) Windows scheduled task `IBIS Dashboard Auto-Backup` runs hourly, commits latest file from Downloads to `backups/latest.json` + timestamped snapshot, pushes to GitHub. Status pill bottom-left, recovery modal for in-memory snapshots. |
| ✅ Done | Scheduled task path bug fix (v36) | schtasks.exe /TR was splitting the OneDrive path at the first space, causing `ERROR_ACCESS_DENIED`. Rewrote setup-auto-backup-task.ps1 to use PowerShell `ScheduledTasks` cmdlets (`New-ScheduledTaskAction` / `Register-ScheduledTask`) which quote spaces properly. Verified end-to-end: LastTaskResult=0, sync log updates on each run, commits landing in GitHub. |
| ✅ Done | Safe storage cleanup (v36) | Banner button is now "💾 Backup & Free Space". `safeFreeStorage()` auto-downloads full v3 backup FIRST, then shows itemized confirm dialog listing wiped (rev/desc/sentiment) vs preserved (everything else). Reports KB freed in toast. Never touches `ibis_dead`, `ibis_client_revenue`, CSV stores, or markup. |
| ✅ Done | Export/PDF system (v36) | 🖨 Export / PDF buttons on Accounts, Group, Insights → Group Accounts, Insights → Client Insights. Uses `_printWithBanner(title, subtitle, sourceElement)` engine — clones target into `#print-stage`, prepends banner with title + active filters + date, triggers `window.print()`. @media print stylesheet hides all chrome, preserves background colors via print-color-adjust:exact, prevents row-splitting via page-break-inside:avoid. Filter-aware subtitles on Accounts + Group exports enumerate every active filter. |
| ✅ Done | Accounts tab Overlap column + Multi-Owner filter (v36) | New sortable Overlap column right of Revenue. `getOtherRepOverlap(name)` returns OWNERS-EXCLUDING-DAN who also have account in group lists. `renderOverlapBadges(name)` returns colored owner pills. 🔁 Multi-Owner filter chip in controls bar — cross-pollinates with all existing filters (AND-combined). Live updates via hooked group CSV upload handlers. |
| ✅ Done | 🤝 Team Sell priority tier (v36) | New manually-set priority between Quick Winner and Legendary. Teal palette (bg `#ccfbf1` / text `#115e59`). Filter chip `chip-teamsell.active`. All sort maps + filter groups + knownFlags updated. |
| ✅ Done | Backup/Restore v3 — full snapshot (v36) | exportLocalBackup() now captures every ALL_STORAGE_KEYS entry. handleLocalRestore() detects v3 backups and wholesale-restores all keys with a confirm prompt + page reload. Smart-merge on ibis_local preserves fresh enrichment on accounts already enriched in current state. v1/v2 legacy backups still restore in place via the existing partial path. |
| ✅ Done | v37.1 — Write-health monitor + 4th local mirror | Wraps every localStorage.setItem to detect quota failures. Auto-recovery (drop ring → wipe enrichment → retry). Periodic 2-min write probe. Red banner if recovery fails. Scheduled task also writes to Documents\IBIS-Backups\ as independent local mirror (also OneDrive-synced → 2nd cloud). |
| ✅ Done | v37.2 — Discreet header indicator + simpler panel + auto-clean Downloads | Replaced bottom-left pill with small 🛡 shield icon in header (next to Group CSV). Panel collapsed by default: single health status + storage bar + restore CTA, details on click. PS script auto-deletes processed Downloads files. |
| ✅ Done | v37.3 — File System Access API for direct folder writes | One-time picker → writes go straight to Documents\IBIS-Backups\ — no Downloads, no Chrome notification, nothing in download history. Handle stored in IndexedDB (survives sessions). Falls back to legacy <a download> on permission lapse or unsupported browser. |
| ✅ Done | v37.4 — CRITICAL data-loss fix for Notes / Headline / Next Date / Account Plan | Account Plan had ZERO save logic — anything typed was lost on refresh. Notes/Headline/Date only saved on blur. Added triple-protected save (input debounce + blur + beforeunload) + visible "✓ Saved" indicator next to NOTES label. |
| ✅ Done | v37.5 — CRITICAL CSP fix for cloud restore | CSP blocked api.github.com + raw.githubusercontent.com → "Restore from Cloud" button was non-functional and would have failed during a real disaster. Added both to connect-src. Removed disabled state from restore button — always let user try, show error if fetch actually fails. |
| ✅ Done | v37.6 — Honest FSA CTA with "Skip" option | Reworded to explicitly state "browser security requires YOU to click — I can't do this remotely." Added skip button that sets ibis_fsa_cta_dismissed flag. |
| ✅ Done | v37.7 — Added ibis_fsa_cta_dismissed to ALL_STORAGE_KEYS | Minor — preserves dismiss state through restore. |
| ✅ Done | v37.8 — Pre-upload safety snapshots | All 13 CSV upload handlers (Accounts, Licenses, all 8 campaigns, both group CSVs, Client Insights) now call `snapshotBeforeAction('Pre-upload · <name>')` as their first step. Captures full pre-upload state into the ring with a labeled `reason` + fires async file write to `Documents\IBIS-Backups\`. Backups panel displays Pre-upload entries in distinctive blue with shield icon, so they're easy to spot when rolling back. |
| ✅ Done | v37.8 — Silent scheduled task (no cmd window flash) | `auto-backup-run-hidden.vbs` wraps PowerShell launch with `WshShell.Run "...", 0, False` (SW_HIDE). Task action switched from `cmd.exe /c <bat>` to `wscript.exe <vbs>`. No window appears when the hourly task fires. Old `.bat` retained for manual runs. |
| ✅ Done | True Keep status option (4th, blue) | New `truekeep` key in `ACCT_STATUS_OPTS` at index 0. Filter chip added. `getFiltered()` status group recognizes `TRUE_KEEP` flag. Dead tab `STATUS_DISPLAY` + Export PDF `statusLabels` updated. Hardcoded `[3]` fallback replaced with `.find(o => o.key === '')` for future-proofing. Color: `#dbeafe`/`#1e40af` (matches PIQ palette). |
| ✅ Done | ExxonMobil revenue seed + Tier 1 override | Was showing SF fallback at $360M (orders of magnitude wrong) and missing tier. Seeded at $339.25B in `REVENUE_SEEDS`. Introduced new `TIER_OVERRIDES` constant + `applyTierOverridesToAccounts()` function that patches `accounts[]` in memory on init + after every accounts CSV upload. ExxonMobil → Tier 1. Pattern is reusable for any future manual tier override. |
| ✅ Done | License upload count investigation (1142 vs 1121) | Not a bug — 21 Migration rows ($0 junk) are intentionally filtered. Confirmed by reading the CSV directly: 1142 data rows, exactly 21 contain "Migration", all $0. Dashboard's behavior is correct. Future polish: add a subtitle on the total like "1121 of 1142 (21 migrations hidden)" so the discrepancy is self-explanatory. |
| 🟡 Partial (v39) | Storage compression / IndexedDB migration | The backup snapshot ring moved to IndexedDB in v39 — that ended the wipe/refetch churn loop and roughly halved localStorage usage (~3.3 MB of ~10 MB now). Migrating the CSV bulk (licenses + group data) to IndexedDB or LZ-String stays a future option, no longer urgent. |
| 🔴 Next | Frontend redesign passes | The v39 sweep produced a full usability/design catalog (token violations, contrast, focus states, per-tab inconsistencies, 4 different sub-view switcher styles). Next sessions: /design-pass + targeted redesign, using that catalog as the worklist. |
| ✅ Done | Outreach Extension Univision/Jose unmatched (v3.79) | Root cause: Outlook never exposes the email in collapsed-row DOM, and `jcastro@televisaunivision.com` is initial+lastname so name matching couldn't reach it. Fixed by Strategy 3c (name-pattern bridge) + `televisaunivision.com → Univision` override. Jose → Univision, Lara → Allinial now resolve live (inbound rows). |
| 🔴 Next | Load campaign CSVs for initial+lastname / outbound contacts | The clean fix for any contact whose email is `initial+lastname` (ddobbins@coca-cola.com) AND whose row is outbound (only "Hi Dominica" greeting visible). Strategy 6 declines these on same-day ambiguity (by design — don't loosen). Uploading the campaign CSV that contains them gives the extension name↔email↔account directly and fixes the whole class. `contactMap` was 0 contacts all session (no campaign CSVs loaded). |
| 🔴 Next | Reinstall Node on fresh machine | Portable Node v24.16.0 at `%LOCALAPPDATA%\nodejs-portable\` this session (added to user PATH) — needed for `node --check content.js`. Not in GitHub; reinstall on any new machine before editing the extension (winget `OpenJS.NodeJS.LTS` needs admin, or use the portable zip). |
| 🔴 Next | Make GitHub repo private | CLAUDE.md + SF User ID + internal architecture is public. 2-minute fix on GitHub settings. ⚠️ GitHub Pages requires GitHub Pro for private repos — confirm before switching. |
| ✅ Done (v39) | CLAUDE.md doc drift — Powerback references removed | Storage-key lists, ibis_dead schema, campaign sections and bridge.js description now reflect reality: Powerback gone, 🎓 Alumni is the 8th campaign. A few historical ✅ Done rows still mention Powerback as history — intentional. |
| 🗺️ Future | Daily backup integrity check | Once a day, fetch latest GitHub backup, compare hash to local. If diverged for >24h, alert in the panel. Would catch "scheduled task quietly stopped working" scenarios. |
| 🗺️ Future | License total: show "1121 of 1142 (21 migrations hidden)" subtitle | Dan asked why the dashboard total didn't match the CSV row count. Answer was correct (migrations intentionally filtered) but the discrepancy isn't self-explanatory. Small UX win — surface the hidden count under the Total Licenses stat. |
| 🗺️ Future | Insights — additional cards | Currently Group Accounts subpage only has 1 card (vertical breakdown). Easy to add more (by tier, by intent score, by days inactive bucket, etc.) |
| 🗺️ Future | Client Insights — license-type breakdown | Could split each vertical card by license tier (Platinum/Departmental/Academic/etc.) — that data is in the CSV (`License: License Name` contains the tier). |
| 🗺️ Future | Revenue source diversification | Wikidata covers all major enterprises but small private firms show "—". Could layer in another free source (Crunchbase scrape, OpenCorporates) for better coverage. Low priority — top-25 lists are mostly Fortune 500-ish. |
