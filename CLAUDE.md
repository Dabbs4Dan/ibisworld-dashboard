# CLAUDE.md — IBISWorld Sales Dashboard
*For Claude Code sessions. Read this before touching any code.*

---

## PROJECT OVERVIEW
Single-file sales intelligence dashboard for Dan Starr, BDM at IBISWorld (US Major Markets).
Built as a personal productivity tool — NOT an official IBISWorld product.

**Live URL:** https://dabbs4dan.github.io/ibisworld-dashboard
**Repo:** github.com/Dabbs4Dan/ibisworld-dashboard (public, main branch)
**File:** `index.html` — single self-contained file, ~1,600+ lines

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
  - `checkStorageSize()` fires on `init()` and after both CSV uploads; logs a console warning if any key exceeds 2MB or total exceeds 4MB
- All CSV parsing happens client-side in the browser

---

## CURRENT STATE — v21 (stable)

### Two tabs live:
1. **📋 Accounts tab** — main territory view
2. **🔑 Licenses tab** — churn/active license data (renamed from "License Intelligence")

### Accounts Tab Features
- SF CSV upload → instant dashboard population
- Change detection → 🆕 flags new accounts
- Cards + Table view toggle
- Custom colored vertical dropdown
- Emoji flags + modal editor per account
- Revenue column with auto-enrichment + progress indicator (bottom-right spinner)
- Logo cascade: UpLead → DuckDuckGo → Google Favicon → Initials
- Accounts CSV button turns ✅ green when freshly uploaded this session
- 6sense buying stage badges
- 🗑️ clear buttons next to each CSV upload — accounts clears `ibis_accounts`+`ibis_updated` only (preserves `ibis_local`); licenses clears `ibis_licenses` only

### Splash Screen
- Fires on every page load/refresh (no sessionStorage gate — JS tab switching never reloads so no risk of retrigger)
- 200px logo, 3.2s display, 0.5s fade
- Radial gradient dark bg, red pulse glow on logo, sheen animation
- Title "Account Intelligence" + subtitle "IBISWorld · US Major Markets" + animated 3-dot loader

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
| ✅ Done | Wikipedia company descriptions | `fetchDescFromWiki()` with `cleanWikiText()` + `isJustCompanyName()` + `isGenericIndustryLabel()` + Wikipedia Search API fallback (step 4). DESC_VERSION=4. Claude revenue call also returns `description` field — overwrites Wikipedia. |
| ✅ Done | 📌 Latest US filter chip | Licenses tab — deduplicates to 1 US Industry row per account (latest end date). Clears type/status filters on activate; those filters deactivate it. |
| ✅ Done | Lost renewal rule (Rule 0) | `applyLicenseRules`: `$0 + US + "renewal" in opp` → forces `_active=false`, `_churnTier=newchurn`. Prevents false PIQ promotion. Shown as US Industry. |
| ✅ Done | Logo flicker fix v2 | `logoResolved{}` cache — once a domain's URL resolves, stored in memory. Re-renders use cached URL at opacity:1 instantly. All three logo render sites (cards, accounts table, licenses table) check cache first. |
| 🗺️ Future | Licenses dropdown overflow | Type/Status filter dropdowns get clipped when only 1–2 rows showing. Needs overflow fix or position:fixed dropdown. |
| 🗺️ Future | Mobile/responsive layout | No media queries exist. Add `@media (max-width: 768px)` for stacked header, scrollable table, full-width search. |
| 🗺️ Future | Opportunities layer | SF "Accounts with Opportunities" report |
| 🗺️ Future | Meetings layer | SF "Activities with Accounts" report |
| 🗺️ Future | Tasks/Samples layer | SF "Tasks and Events" report |
