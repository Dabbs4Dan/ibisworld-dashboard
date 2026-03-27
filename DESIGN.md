# DESIGN.md — IBISWorld Account Dashboard
*Visual design system. Read alongside CLAUDE.md at session start.*
*Claude Code: this file is loaded by `/start-session`. Consult before building or modifying any UI component.*

---

## WHEN TO USE THIS FILE
- Before writing any CSS or HTML
- Before adding a new button, badge, input, chip, table, card, or panel
- When a component looks inconsistent with another tab
- When `/end-session` asks "did you add or change any UI components?"

---

## LOCKED DESIGN TOKENS

### Colors
| Role | Value | Notes |
|---|---|---|
| Brand red | `#C8102E` | IBISWorld primary — buttons, active states, focus rings |
| Background | `#f0f2f5` | App canvas — never change |
| Surface | `#ffffff` | Cards, panels, inputs, dropdowns |
| Border light | `#e5e7eb` | Dividers, chip borders, table row separators |
| Border medium | `#d1d5db` | Input borders, button borders |
| Text primary | `#111827` | Headings, data values |
| Text secondary | `#6b7280` | Labels, column headers |
| Text muted | `#9ca3af` | Placeholders, stat labels, section caps |
| Success green | `#16a34a` | Active licenses, keep status, positive values |
| Warning amber | `#d97706` | New churn, stalled stage, monitor status |
| Danger red | `#dc2626` | Drop status, churned, lost |
| Info blue | `#2563eb` | PIQ badges, informational elements |

**Do NOT use these for data encoding** (vertical colors + tier colors are intentional — see CLAUDE.md):
- Vertical palette: 19 named colors mapping industry → background tint
- Tier diamonds: T1=Navy/Steel, T2=Forest/Emerald, T3=Sienna/Orange, T4=Charcoal/Grey

### Typography
| Role | Font | Weight | Size | Notes |
|---|---|---|---|---|
| Page title | DM Sans | 600 | 20px | Tab names, page headers |
| Section header | DM Sans | 600 | 15px | Panel titles, column group headers |
| Label / cap | DM Sans | 500 | 11px | Uppercase + letter-spacing:0.5px. Stat labels, th headers |
| Body | DM Sans | 400 | 13px | Default text, descriptions |
| Body medium | DM Sans | 500 | 13px | Button text, chip text, interactive labels |
| Monospace data | DM Mono | 500 | 12px | Revenue, counts, scores, dates, codes |
| Stat number | DM Sans | 700 | 22–24px | KPI values in stats bars |

**Allowed font sizes:** 10, 11, 12, 13, 14, 15, 16, 20, 22, 24px. Flag anything else.
**Allowed font weights:** 400, 500, 600, 700. Flag anything else.

### Spacing Scale
`4px · 8px · 12px · 16px · 20px · 24px · 32px`
Use only these values for margin, padding, gap. Normalize odd numbers (3px, 7px, 9px, 11px, 15px) to nearest token.

### Border Radius Scale
| Context | Value |
|---|---|
| Pills, badges, chips | `999px` |
| Buttons, inputs, selects | `6px` |
| Cards, panels, popovers | `10px` |
| Modals | `12px` |

### Shadows
| Level | Value | Use |
|---|---|---|
| Low | `0 1px 3px rgba(0,0,0,.08)` | Cards, stat boxes |
| Mid | `0 4px 12px rgba(0,0,0,.10)` | Dropdowns, portal menus, popovers |
| High | `0 8px 24px rgba(0,0,0,.14)` | Modals, battle card |

### Transitions
All interactive elements: `transition: 150ms ease`

---

## COMPONENT REFERENCE

---

### Controls Bar — THE canonical tab toolbar

Every tab has exactly one `.controls` bar between the stats bar and the content. All controls bars share the same structure. **Do not reinvent this per tab.**

```
Structure (all direct flex children of .controls):
  [View Toggle] · [Search Wrap] · [Sort Select?] · [Filter Select?] · [.filter-chips group]

CSS: display:flex; gap:8px; align-items:center; flex-wrap:wrap;
     padding:12px 24px; border-bottom:1px solid #e5e7eb;
```

**Rules:**
- View toggle (Cards/Table) always comes first, leftmost
- Search bar is always `flex: 0 0 220px` — never full-width
- Filter chips always grouped in `.filter-chips` — `display:flex; gap:6px; flex-wrap:wrap`
- If a tab needs inner wrapper divs (e.g. for campaign switching), set `display:contents` on them so their children participate in the parent flex row directly
- Never nest a block-level div inside `.controls` unless it has `display:contents` — doing so breaks the single-row layout

**What NOT to do:**
- Do NOT put a full-width block inside `.controls` (causes stacking)
- Do NOT use a separate row for chips — they belong in the same flex row

---

### Stats Bar — Campaign/Tab Selector Variant

When a stat item is a *selector* (not a pure KPI), it must look clearly interactive:

```
button.campaign-stat-btn:
  bg: #fff · border: 1px solid #d1d5db · border-radius: 6px
  padding: 5px 12px 5px 10px · margin-top: 4px
  hover/open: border-color #C8102E + box-shadow 0 0 0 3px rgba(200,16,46,.08)

  Name inside: DM Sans 700, 20px, #111827
  Chevron: 13px, #6b7280, rotates 180deg when open
  Count badge: 12px, bg #f3f4f6, color #6b7280, border-radius 999px, padding 2px 8px
```

**Rule:** A KPI value that is also a dropdown MUST have a visible border. Borderless = looks like static text.

---

### Buttons — 3 variants only

| Variant | Class | When to use |
|---|---|---|
| Primary | `.btn-primary` | Main actions: Upload CSV, Save, Confirm |
| Secondary | `.btn-secondary` | Secondary actions: Table/Cards toggle, view options |
| Ghost | `.btn-ghost` | Tertiary: Prev/Next arrows, close buttons |

```
Height: 34px · Padding: 0 14px (ghost: 0 10px)
Font: DM Sans 500, 13px · Border-radius: 6px
Primary: bg #C8102E, white text · hover: #a50d24 · active: scale(0.97)
Secondary: bg #fff, border 1px #d1d5db, text #374151 · hover: #f9fafb
Ghost: bg transparent, text #6b7280 · hover: bg #f3f4f6
```

### Filter Chips

One canonical class: `.filter-chip`

```
Height: 28px · Padding: 0 12px · Border-radius: 999px
Font: DM Sans 500, 12px
Default: bg #fff, border 1px #e5e7eb, text #6b7280
Active: .filter-chip.active → bg #fef2f4, border #C8102E, text #C8102E
Hover: border #d1d5db, text #374151, bg #f9fafb
```

All filter chips across ALL tabs use this same base. Color-specific active states use modifier classes only.

### Stat Boxes (KPI Cards)

Used in: Accounts stats bar, Licenses stats bar, Campaigns stats bar

```
bg #fff · border-radius: 10px · shadow: low
Padding: 12px 20px
Number: DM Sans 700, 22px, #111827
Label: DM Sans 500, 11px, uppercase, letter-spacing:0.5px, #9ca3af
All stat boxes same height — no tab should look taller/wider than another
```

### Badges / Pills

All semantic labels share the same anatomy:

```
Border-radius: 999px · Padding: 2px 8px
Font: DM Sans 500, 11px
No badge should exceed 13px font or deviate in padding
```

| Badge | Class | Color |
|---|---|---|
| Active license | `.alb-piq`, `.alb-intl` | Blue/green tones |
| Churn | `.alb-churn` | Amber |
| Trial | `.alb-trial` | Purple |
| US Industry | `.alb-us` (or similar) | Yellow |
| License type | `.lic-type-badge` | See Licenses tab |
| Stage | `.stage-tag` + `.stage-[Name]` | See STAGE_COLORS in JS |
| Tier | `.tier-badge.tier-1` through `.tier-4` | Intentional — do not change |
| Sentiment | `.sent-badge.sent-green/amber/red` | Data encoding — do not change |

### Table Headers

Every `<th>` across all sortable tables:

```
Font: DM Sans 600, 11px, uppercase, letter-spacing: 0.5px
Color: #6b7280
Active sort column: color #C8102E
Sort arrows: ↑ / ↓ pattern, same size/color everywhere
```

### Table Rows

```
Min height: 44px · Border-bottom: 1px solid #f3f4f6
Hover: background #f8fafc
cursor: default (rows don't open modals)
cursor: pointer only on explicitly clickable targets (name/logo)
```

### Inputs & Search Bars

```
Height: 34px · Border: 1px solid #d1d5db · Border-radius: 6px
Padding: 0 12px · Font: DM Sans 400, 13px
Placeholder: #9ca3af
Focus: border-color #C8102E + box-shadow 0 0 0 3px rgba(200,16,46,.10)
```

### Selects / Dropdowns

```
Height: 34px · Border: 1px solid #d1d5db · Border-radius: 6px
Padding: 0 12px · Font: DM Sans 400, 13px · bg: #fff
```

Custom portal menus (status, priority, campaign):
```
bg #fff · border-radius: 10px · shadow: mid
Option rows: 32px height, padding: 0 · inner text: 8px 16px
Hover: #f9fafb
```

### Cards / Panels

```
bg #fff · border-radius: 10px · shadow: low
Padding: 20px 24px
Section cap above content group: DM Sans 600, 11px, uppercase, #9ca3af, letter-spacing:0.5px
```

### Modals / Popovers (battle card, debug panel)

```
bg #fff · border-radius: 12px · shadow: high
Backdrop: rgba(0,0,0,0.35)
Header: 20px 24px padding, border-bottom 1px #f3f4f6, DM Sans 600 16px
Body: 20px 24px padding
Footer (if any): 16px 24px padding, border-top 1px #f3f4f6, right-aligned buttons
```

---

## INTERACTIVE STATE RULES

Every clickable element must have:
- `cursor: pointer`
- A visible hover state (background change, color shift, or underline)
- `transition: 150ms ease`

Focus states on inputs/buttons: red ring — `box-shadow: 0 0 0 3px rgba(200,16,46,.10)`

No hover = broken. Flag it and fix it.

---

## ANTI-PATTERNS — NEVER DO THESE

- Hardcoded one-off colors not in the token set (except vertical/tier palettes)
- Font sizes outside the allowed scale
- `border-radius: 4px` on pills (must be 999px) or `border-radius: 50px` on buttons (must be 6px)
- Different button heights across tabs
- Filter chips that look different between Accounts and Campaigns tabs
- Table `<th>` that doesn't match the column header standard
- Any `onclick` element missing `cursor:pointer`
- Padding using odd numbers (3px, 7px, 9px, 11px, 15px)
- Mixing emoji icons and text icons for the same concept in different places
- Stat boxes with different internal padding between tabs
- `box-shadow` values not in the shadow scale

---

## DO NOT TOUCH

- **Splash screen** (`id="splash"`) — intentionally holographic, outside design system
- **Vertical color palette** — data encoding, intentional
- **Tier diamond colors** — data encoding, intentional
- **Sentiment score colors** (`.sent-green`, `.sent-amber`, `.sent-red`) — data encoding
- **Stage colors** (`STAGE_COLORS` in JS) — data encoding
- Any JS function, logic, or localStorage operation

### Account-Level Opp Widget

Used in: Accounts table (Opp column), Action tab table, Account page header

```
Inactive (grey dot): .opp-dot-btn → .opp-dot
  cursor:pointer; opens active state on click

Active (blue pill): .opp-active-wrap → display:inline-flex
  "Opp" pill (.opp-sf-pill) + amount input (.opp-amt-input) + close date input (.opp-close-input)
  Box-shadow glow: 0 0 0 3px rgba(0,174,240,0.15)

Table cell containing opp widget:
  padding: 0 8px; vertical-align: middle
  (No vertical padding — prevents white slivers above/below active pill)
```

**Rule:** Every account row always shows an interactive grey dot — never a plain dash. Opp state is account-level (`ibis_local[name].acctOpp`), not tied to contact email keys.

**Active state rows:**
- Table row: `.tr-opp-active` → `background: #eff6ff` (very light blue)
- Account card: `.card-opp-active` → `border-color:#00aef0; box-shadow: 0 0 0 2px rgba(0,174,240,0.15), 0 0 12px rgba(0,174,240,0.12)`
- Account page header: `.ap-header-opp-active` → `border-color:#00aef0; box-shadow: 0 0 0 3px rgba(0,174,240,0.15), 0 0 16px rgba(0,174,240,0.14)`

---

### AP Action Block (Account Deep-Dive Page)

Full-width card that appears between the header and the 3-column panel grid.

```
.ap-action-block:
  bg #fff · border 1px var(--border) · border-radius 12px
  padding 18px 22px · margin-bottom 18px

Layout: .ap-action-top (flex row, gap 16px, flex-wrap) → field labels above inputs
  then full-width textarea below

Fields:
  .ap-action-input: height 32px · border 1.5px var(--border) · border-radius 6px
    padding 0 10px · font DM Sans 500 13px · bg #fafafa
    focus: border-color #22d3ee + bg #fff

  .ap-action-notes: full-width textarea · min-height 80px
    border 1.5px var(--border) · border-radius 8px · padding 10px 12px
    focus: border-color #22d3ee + bg #fff

  .ap-action-field-label: DM Sans 600, 10px, uppercase, letter-spacing 0.5px, color var(--text-muted)
```

**Data persistence:** `ibis_local[name].actionHeadline`, `actionNextDate`, `actionNotes` — same keys used by Action tab table inputs.

---

### Action Tab — Pill Row Pattern

Action tab table uses a pill-shaped row wrapper so all company rows are uniform width.

```
.actn-pill:
  display:flex; width:100%; align-items:stretch
  border: 1.5px solid #efefef · border-radius: 999px
  padding: 0 0 0 10px · gap: 0 · min-height: 36px
  box-sizing: border-box

.actn-pill .td-company:
  flex:1; align-self:center; padding: 5px 0
```

**Rule:** All pills fill 100% of their cell width. Logo sits flush left inside the pill with no padding gap. Tier badge and priority dropdown sit on the right side of the pill.

---

### Campaign Selector Dropdown — Z-Index Rule

The campaign selector menu (`#campaign-selector-menu`) is `position:fixed` at body level.

**Critical:** Must use `z-index: 9800` minimum. The `.controls` div (which renders after `.stats-bar` in DOM order) creates a stacking context that would cover a `z-index: 9400` menu.

```
.campaign-selector-menu:
  position: fixed · z-index: 9800 · background: #fff
  border-radius: 10px · shadow: high · padding: 5px 0

.campaign-selector-item:
  display:flex; align-items:center; gap:10px; padding: 9px 16px
  font: DM Sans 500 13px · background: #fff (explicit — prevents transparency)
  hover: background #f0f2f5
```

**Click-outside rule:** The close handler must check BOTH `wrap.contains(e.target)` AND `menu.contains(e.target)` before closing — the menu is outside the wrap in the DOM, so clicking a menu item would otherwise trigger "click outside wrap" and close before the item's onclick fires.

---

## CHANGELOG

| Version | Session | Change |
|---|---|---|
| v28 | 2026-03-27 | DESIGN.md created. Token set established. Full UI/UX consistency pass initiated. |
| v28 | 2026-03-27 | Global badge/pill radius pass: all badges, pills, filter chips, stage tags, status/priority triggers unified to `border-radius:999px` across all tabs. |
| v28 | 2026-03-27 | Campaigns tab spacing pass: opp-card padding, stage pill padding, kanban header font, controls bar, stats bar gap/margin, opp-next-select radius, opp-amt-input border-width, patch-badge padding all normalized to design token scale. |
| v28 | 2026-03-27 | Global table pass: `td` + `thead th` padding 10px→12px, `td-logo` radius 5px→6px across all tables. |
| v28 | 2026-03-27 | `:root` CSS vars aligned to design tokens: `--text-primary` #1a1a2e→#111827, `--text-secondary` #4a5568→#6b7280, `--text-muted` #9aa5b4→#9ca3af, `--border` #e8ecf0→#e5e7eb, `--border-hover` #cbd2d9→#d1d5db. |
| v28 | 2026-03-27 | `/design-pass` command updated to accept tab scope argument: `campaigns`, `accounts`, `licenses`, `dead`, `account-page`, `all`. Includes component map per tab. |
| v28 | 2026-03-27 | Controls bar + campaign selector fixes. Added canonical Controls Bar and Stats Bar Selector patterns to COMPONENT REFERENCE. Campaigns controls now single-row (display:contents fix). Campaign dropdown now has visible border/hover affordance. |
| v28 | 2026-03-27 | Account-level Opp Widget pattern documented: grey dot always visible, active pill state, row/card/header active states (light blue bg + neon blue border). Opp td must use padding:0 to prevent white slivers. |
| v28 | 2026-03-27 | AP Action Block documented: full-width card between AP header and panel grid. Fields use cyan (#22d3ee) focus color. Same ibis_local keys as Action tab table. |
| v28 | 2026-03-27 | Action tab pill row pattern documented: `.actn-pill` uniform width fills column, all rows identical height regardless of company name length. |
| v28 | 2026-03-27 | Campaign selector dropdown z-index rule documented: must be ≥9800. Click-outside handler must check both wrap AND menu containers. Items need explicit `background:#fff`. |
