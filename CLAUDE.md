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
- **localStorage** for persistence — two separate stores to avoid 5MB limit:
  - `ibis_local` → flags, notes, UI state
  - `ibis_revenue` → revenue cache
- All CSV parsing happens client-side in the browser

---

## CURRENT STATE — v20 (stable)

### Two tabs live:
1. **📋 Accounts tab** — main territory view
2. **🔑 License Intelligence tab** — churn/active license data

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
- Sortable columns, filter chips, stats bar
- Company logos from matched account domain

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

---

## NEXT FEATURE — LICENSE BADGES ON ACCOUNT ROWS
Bridge license data as mini-badges onto each account row in the Accounts tab:
> `💰 $28K · churned 2024` `🔵 PIQ Active` `🌍 Intl`

- Match key: Account Name (case-insensitive trim)
- Logic already exists in license engine — just needs to surface in account cards/table rows

### Future data layers (not started):
| Layer | SF Report |
|---|---|
| 3️⃣ Opportunities | Accounts with Opportunities |
| 4️⃣ Meetings | Activities with Accounts |
| 5️⃣ Tasks/Samples | Tasks and Events |

---

## HOW TO WORK WITH DAN
- One task at a time — never stack multiple changes
- Confirm before committing anything to git
- Always test logic against edge cases in the CSV schemas above
- When in doubt about a feature, ask before building
