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
| v43 | 2026-07-09 | **Filter-bubble redesign → one uniform system.** Every header filter bubble is now the same grey capsule (`.hf-bubble` bg `#f4f5f7`, 26px, 1px `#e5e7eb` border); the **text/emoji carry the option colour** (`optColor()` picks the darker of the option's bg/text so solid options like 🆘 Immediate stay readable on grey). Multi bubble active = white fill + `border-color:currentColor` + bold + `+N`; unselected = uniformly muted text (`.hf-dim .hf-txt opacity:.6`). Removed the old per-colour bubble fills + heavy caret divider (caret now a plain grey chevron). Dropdown options gained a right-aligned **result-count** (`.hf-opt-count`, dimmed when zero). |
| v43 | 2026-07-09 | **Favorite star** (`.fav-star`) — Rotation-tab star glyph, ☆ grey `#cbd5e1` outline → ★ gold `#f4b829`, 17px (a touch larger than Rotation's 15px), sits in the Company cell by the logo (replaced the circle+bolt). **Favorites filter bubble** (`.hf-fav`) matches: grey ☆ → gold ★ + soft gold capsule when active. **Action-priority pillbox** (`.act-pillbox`/`.act-seg`) — segmented "pillbox", 19px, 6px radius, no shadow, thin `#e2e8f0` score-line dividers; off segments greyed (`filter:grayscale(.35) opacity(.72)`), on segments fill a symmetric 600-level colour (🔥`#dc2626` ⏳`#d97706` 🌿`#16a34a` 🥶`#2563eb` 🎉`#9333ea`). **Custom My Opp bubble** now matches the regular opp pill height (21px, no shadow) and its ✎/× auto-collapse unless `:hover`/`:focus-within` (flush-left when idle). |
| v43 | 2026-07-09 | **Priority (`acctPrio`) colours:** 🆘 Immediate solid crimson `#b91c1c`/white · 🚨 Urgent `#fee2e2`/`#b91c1c` · 📌 Prioritize `#ffedd5`/`#c2410c` · 🛠 Working `#dbeafe`/`#1d4ed8` · 🤝 Team-Sell `#ccfbf1`/`#115e59` · 🗄 Tabled `#e2e8f0`/`#475569`. **History-column colour system** `histClass(type,year)` (Key Client/Churn/Opps/Trials): gold `.rot-churn-new` ≥2024 · grey `.rot-churn-old` <2014 · else 🔴 `.rot-churn-ind` / 🔵 `.rot-churn-piq` / 🟢 **new** `.rot-churn-intl` (`#ecfdf5`/`#047857`). **Row-number sidebar** (`.row-num-cell`) sticky `left:0`, 20px, 9px DM Mono. Status collapse toggle got a grey border + `:active` press-scale + rAF-deferred reflow. Portals flip up near the viewport bottom via shared `placePortal()`. |
| v41 | 2026-07-08 | **Priority column repurposed to Action-board stages + Action Headline column.** The Priority dropdown (`ACCT_PRIORITY_OPTS`) now mirrors the 8 Action stages (same emoji + colours: 🚀 New Sequence green, 👥 Multi-threading indigo, 💼 Active Opp amber, 📋 Active Proposal purple, ⏸ Stalled orange-red, 🔮 Future Reconnect slate, 🛟 Internal Support cyan, 🗄 Tabled grey) plus 🚫 Unresponsive (rose), 🏆 Won (gold), 🌱 Nurture (emerald), and `—` unselected. Colours applied inline via `prioStyle()` (no per-option CSS class). `#acct-priority-portal` gained max-height + scroll for the longer list. Old rarity-tier assignments migrated to `ibis_priority_legacy` (recoverable) and cleared. New **Action Headline** column right of Company: same `.action-headline-input` underline field as the Action tab (shared `ibis_local.actionHeadline`), header filter is a `Has Headline` toggle bubble. Custom My Opp now uses inline colours only. |
| v41 | 2026-07-08 | **Accounts Table column-header filter system — visual pass 2.** Two-row sticky `thead`: `.hf-row` (grey `#f0f2f5` strip, sticky `top:0`, holds the filter bubbles, flush-left with the column label's 14px padding) above `.hf-labels` (sortable labels, sticky `top:40px`, all baselines aligned — fixes the prior cut-off/misaligned headers). Bubbles are 30px tall to match the overflow bubbles (`Has Workables` etc.). **Multi filters** render the real data-encoded pill (`.hf-pill`) as the preview (top selection, dimmed via `.hf-dim` when nothing selected) + `+N` (`.hf-more-n`) + a pronounced uniform 11px caret (`.hf-caret`). **Toggle filters** (`.hf-toggle`) stay neutral, turn red when active. Dropdown (`#hf-portal`) options each show their coloured pill with the fully spelled-out label (e.g. "New Procurement IQ"). New filters: **Vertical** (palette-coloured) and **Revenue bands** ($50B+/$10B–50B/$1B–10B/$50M–1B/<$50M/No revenue). **Custom My Opp bubble** (`.ib-myopp-custom`): grey dashed contenteditable pill created by clicking the My Opp grey dot — cyan focus ring, `:empty:before` placeholder, `.myopp-x` remove button; saves to `ibis_local[name].customOpp` (debounced input + blur + prune-protected). Other Opp header now sorts by furthest close date. Toolbar "All Verticals" hidden in Table view (column bubble handles it). |
| v40 | 2026-07-07 | **Unified opp/churn bubble system (`.ib-*`) for the Accounts tab — mirrors the Rotation pill aesthetic (Dan's stated quality bar).** DM **Sans**, 11px, one colour per pill, **only the lead label bold** (`.ib-lead` 700, rest 500), thin separator lines (`.ib-sep` = 1px×10px `currentColor` @0.22 opacity), content-sized (never clipped — no `max-width`). Two pill shapes: `.ib-solid` (single bg) and `.ib-pill` (split: `.ib-stg` dark segment white-text + `.ib-bdy` light body). Cell = `.ib-cell` > `.ib-bubbles` (2-col `max-content` grid; `.ib-1col` = single column for Other Opp so 2 opps stack, not widen). In-cell expand: cap 4 bubbles then `.ib-more` (dark-grey `#475569` "+N"), grows the cell in place. Colour tokens reuse the Rotation churn palette (`.rot-churn-ind/piq/old/new`) for Key Churn + Key Lost; `.ib-global` indigo (Other Lost); `.ib-trial` purple (Key Trials); `.ib-myopp-active` blue / `.ib-myopp-won` green; Other Opp categories `OTHER_OPP_COLORS` (blue PIQ-renew / green new-PIQ / purple new-intl / cyan intl-renew / amber ind / stone). **Status column** gained 📣 Market (lime `#ecfccb`/`#4d7c0f`) + 🏢 Ent Drop (reddish-brown `#eaddd6`/`#7c2d12`). **Layout:** `.acct-main-table` grow-and-scroll (`width:auto;min-width:100%`), sticky header (`thead`/`th` `position:sticky;z-index:30` — fixes tier-diamond bleed), `.td-name` ellipsis clamp, `#controls-accounts .filter-chips { flex:1 1 100% }` so chips wrap at any zoom. Universal fixed-viewport scroll (`sizeActiveGrid()` — table fills to viewport bottom, body scroll locked) applied to all table tabs. |
| v39 | 2026-07-02 | **Code-sweep cleanup (no visual redesign).** Dead CSS removed: old campaign count-dot family (`.wkbl-dot`/`.smpl-dot`/`.sixqa-dot`/`.churn-dot`/`.netnew-dot`/`.multithread-dot`/`.winback-dot` — superseded by `.camp-oval` in v33), `.ap-contact-*` legacy contact-row family, `.ap-plan-*` (Account Plan panel removed), `.upload-btn-license`, `#autoback-indicator`, `.ab-list`, `.in-territory`, `.lic-signal`, `.patch-badge`, `.csv-chip-zero`, `.company-vertical`, `.campaign-selector-divider`, `.action-kanban-sub`. `.stat-item:hover` opacity dim removed (stat tiles aren't clickable — hover implied they were). Wikidata progress chip moved to `bottom:64px` so it never covers `#opp-toast`. `.btn-primary/.btn-secondary/.btn-ghost` retained as the canonical button set though currently unused in markup. Full usability/design-violation catalog from the sweep is saved for the upcoming redesign session. |
| v38 | 2026-07-02 | **Rotation tab styling.** Assign/Team Sell pill-dropdowns: `.rot-assign-select` (per-rep solid fill via `.set.rot-owner-{rep}` — reuses group owner colors) + `.rot-teamsell-select` (light-blue neon `.set` = bg `#e0f2fe`, border `#7dd3fc`, `box-shadow` cyan glow). Both 10px, centered (`text-align-last:center`), `max-width:88px`. Shared pill base `.rot-pill` (999px, 10px, 2px×8px) with color modifiers: churns `.rot-churn-ind` red / `.rot-churn-piq` blue / `.rot-churn-old` grey (pre-2020) / `.rot-churn-new` gold (2024+); `.rot-opp-pill` gold (active opp); `.rot-trial-pill` purple. **Star / key account**: `.rot-star` (☆ grey `#cbd5e1` → ★ gold `#f59e0b` on `.on`, hover scale) left of company name; starred row `#rot-table tbody tr.rot-row-key { background:#fffdf3 }` (very-light gold, close to white). Excel export uses the same hex palette as inline cell fills. All colors drawn from existing tokens/data-encoding palettes — no new one-offs. |
| v36 | 2026-05-27 | **Group tab styling**: owner pills (`.grp-owner-pill` + `.grp-pill-{owner}` variants — Dan=red `#C8102E`, Christian=blue `#2563eb`, Embry=green `#059669`, Anthony=purple `#7c3aed`). Overlap pills (`.grp-overlap-pill`, 10px font, 2px×8px padding, `flex-wrap:nowrap` so multi-overlap stays single-line). Multi-owner row subtle highlight (`#grp-table tbody tr.grp-row-multi { background:#fffbeb }`). Owner cell `white-space:nowrap` to keep pills inline. |
| v36 | 2026-05-27 | **Insights cards**: `.ins-card` (10px radius, low shadow), `.ins-card-header` (title + sub-text), `.ins-list` (row container). Per-row anatomy: vertical pill + count + horizontal bar with per-rep segments + total. New `.ins-row-revenue` (DM Mono 12px right-aligned). New `.ins-subsection-header` for "Top 25 standalone" subsections inside cards (11px uppercase muted, fafafa bg, border-top divider). |
| v36 | 2026-05-27 | **Client Insights table rows**: `.cli-cross-row` (12px padding, flex layout) + `.cli-cross-row-header` (10px uppercase muted, fafafa bg). Columns: rank (28px DM Mono) · name (flex auto, 13px 600 weight) · vertical pill (160px flex-basis) · revenue (130px DM Mono right) · industry/procurement/total amounts (amber/blue/bold). |
| v36 | 2026-05-27 | **Insights sub-tab switcher**: `.ins-subtabs` (10px top padding, border-bottom). `.ins-subtab` (transparent, 8×16px, 13px 600). `.ins-subtab.active` (red color + 2px red border-bottom). |
| v36 | 2026-05-27 | **🤝 Team Sell priority tier**: `.apr-teamsell` (bg `#ccfbf1`, color `#115e59`) + `.chip-teamsell.active` (same bg, border `#5eead4`). Teal palette is unique within priority tiers (no overlap with quickwinner/legendary/veryrare/rare/uncommon/common). |
| v36 | 2026-05-27 | **Auto-backup status pill** (bottom-left): `#autoback-indicator` — dark navy bg `#0f172a`, white, 11px 600, 6×12px pill, `border-radius:999px`. `:hover` lightens to `#1e293b` + 1px translate. Hidden in `@media print`. |
| v36 | 2026-05-27 | **Recovery snapshot modal**: `#autoback-modal` (full-screen overlay + centered card). `.ab-card` (12px radius, 520px max-width, big shadow). `.ab-row` (flex with rank/time/size + red Restore button). `.ab-card-footer` (fafafa bg with hint text). |
| v36 | 2026-05-27 | **CSV loading overlay**: `#csv-loading-overlay` (full-screen dark backdrop) + `.csv-loading-card` (white centered, spinner + filename + KB). 24px spinner via `@keyframes csv-spin`. Fired by `showCsvLoadingOverlay(msg)` for any large CSV upload. |
| v36 | 2026-05-27 | **Export button**: `.export-btn` (white bg, border, 32px height, 12px 600, gap:6px with emoji). Placed far-right in controls bars on Accounts/Group + in subtab row on Insights. Hidden in `@media print`. |
| v36 | 2026-05-27 | **Print stylesheet**: `@media print` rules. Hides all chrome (header, view-nav, controls, stats-bar, upload-menu-wrap, storage banners, toasts, overlays, ins-subtabs, .no-print, .export-btn). Reveals only `#print-stage` (positioned absolute, 100% width). `print-color-adjust:exact` on all elements preserves colored pills/badges. `page-break-inside:avoid` on `tr`, `.ins-row`, `.cli-cross-row` prevents row splitting. `.print-banner` (red 2px border-bottom, title + meta) prepended by `_printWithBanner()` engine. `@page { margin:14mm 12mm }`. |
| v32 | 2026-04-06 | Action tab design pass: `.camp-cluster` changed from `flex-wrap:wrap` to `nowrap` — ovals now stay on one row in table cells. Campaigns `<th>` min-width:110px added to Action + Accounts tables. `#controls-action` nowrap removed — filter chips now wrap cleanly like all other tabs. `.action-opp-badge` padding corrected 7px→8px. `.action-terr-dot` size corrected 7px→8px (aligned with `.sixqa-terr-dot`). |
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
| v28 | 2026-03-28 | Account page design pass: normalized 12 odd-pixel spacing values (7px→8px, 9px→8px, 5px→4px, 22px→20px, 10px→12px, 14px→16px); `.ap-header`, `.ap-action-block`, `.ap-panel` border-radius 12px→10px (modal radius reserved for battle card/modals only); `.ap-panel` padding 16px 18px→16px 20px; `.ap-action-block` padding 18px 22px→20px 24px; `.ap-header` padding 18px 22px→20px 24px; `.action-stage-select` now has visible border + chevron background-image so it's clearly a dropdown. |
| v29 | 2026-03-28 | Action cards redesign pass: 10px radius (was 8px), position:relative, align-items:flex-start in card-top. Column width 200px→240px. Card padding 10px→12px. Opp badge (absolute top-right, blue pill). Territory dot (green/grey, 7px circle). |
| v29 | 2026-03-28 | Action stage select option color fix: `.action-stage-select option { background:#fff !important; color:#111827 !important }` — prevents selected stage color bleeding into open dropdown list. Stage select min-width 130px→110px, tighter padding. |
| v29 | 2026-03-28 | Action stage column header dropdown: Stage th now has ▾ filter trigger using `.lic-dropdown` checkbox pattern. Active Client th is a toggle filter (click = show only accounts with active licenses). Both sync with existing filter chips. |
| v29 | 2026-04-01 | Action stage select redesigned to light tint color scheme — matches existing STAGE_COLORS badge pattern. Dark fills replaced with light bg tints + dark colored text. Border: `1px solid #d1d5db`. Chevron: `#374151`. Hover: `border-color:#9ca3af + low shadow`. `ACTION_STAGES` color/bg values updated. |
| v29 | 2026-04-01 | Contact preview portal: `#contact-preview-portal` added at body level, `z-index:9700`. CSS classes: `.cprev-header`, `.cprev-row`, `.cprev-name`, `.cprev-title`, `.cprev-empty`. Opens on click of `.wkbl-dot` or `.smpl-dot` bubbles. Both bubbles get `cursor:pointer + transition:opacity 150ms + :hover opacity:0.82`. |
| v29 | 2026-04-01 | Workables column reverted to count bubble — moved from after Opp to between Score and Samples. Same `.wkbl-dot` (purple) and `.smpl-dot` (green) bubble anatomy, now clickable. |
| v29 | 2026-03-28 | Key Contact row added to AP action block: `.ap-key-contact-row` flex container, `.ap-key-contact-label` (uppercase 11px muted), `.ap-key-contact-input` (underline style, transitions), `.ap-key-contact-auto` (purple pill for auto-populated workable). |
| v29 | 2026-03-28 | Account page header: company description (`local.desc`) shown below name, 12px muted, max-width 560px. |
| v29 | 2026-03-28 | Accounts table Workables column redesigned: contact name + title display (purple dot + name bold 12px + title muted 10px) instead of count bubble. Column moved to right of Opp. |
| v30 | 2026-04-02 | Action stage system: 8 stages now, all visually distinct. Multi-threading #0f766e teal → #4338ca indigo (was too similar to New Sequence green). Tabled stage added (grey #6b7280/#f3f4f6), hidden from main view by default. |
| v30 | 2026-04-02 | Action stage filter chips: `_applyActionChipColor()` — inactive chips show subtle tint (bg+color from stage, 55% opacity); active chips full color + fontWeight:600. `initActionChipColors()` on page load. This replaces the generic blue `.chip.active` for action stage chips. |
| v30 | 2026-04-02 | Territory dot in Action table: new column after Company using `.sixqa-terr-dot` class (8×8px circle). Green = in CSV, grey = skeleton/dropped. Reuses existing CSS rather than introducing new class. |
| v30 | 2026-04-02 | Account page Campaigns panel: replaced per-contact card grid with grouped mini-table columns. `.ap-campaigns-table` (flex, gap 12px, flex-wrap). `.ap-camp-col` (flex:1 1 140px, border, border-radius:8px). `.ap-camp-header` (colored bg per campaign). `.ap-camp-row` (contact row, border-bottom between items). `.ap-camp-avatar` (24px circle). `.ap-camp-days` (DM Mono muted). |
| v30 | 2026-04-02 | Old Samples + 6QA tables wrapped in `.table-wrap` (white bg, border-radius:10px, border) to match Workables table style. Row anatomy updated to flex company cell + logo + `acct-name-link` — consistent with Workables table. |
| v30 | 2026-04-02 | Card footer opp overflow fix: `.card-footer { flex-wrap:wrap; gap:6px }`. In-card `.opp-amt-input` narrowed to 50px, `.opp-close-input` to 66px. Active opp widget wraps to second row cleanly when card is narrow. |
| v32 | 2026-04-02 | Notes field upgraded to rich text editor. `.ap-notes-editor` wrapper (border-radius:8px, cyan `#22d3ee` focus ring). `.ap-notes-toolbar` (bg `#fafafa`, border-bottom `#f0f2f5`). `.ap-notes-tool` buttons (B/I/🔗/•/Tx) with `.nt-active` indigo tint state (`#e0e7ff`/`#4338ca`). `.ap-notes-sep` (1px divider). Replaces old floating inline toolbar. |
| v32 | 2026-04-02 | Key contact write-in chips: `.ap-kc-write-chip` (blue `#eff6ff`/`#bfdbfe` border, `border-radius:999px`). `.ap-kc-chip-x` delete button. `.ap-kc-all` flex-wrap container holds all auto + write-in chips + input inline. |
| v32 | 2026-04-02 | Net New campaign bubble: `.netnew-dot` — identical anatomy to `.wkbl-dot`/`.smpl-dot`/`.churn-dot`. Blue `#2563eb` bg, white text, `border-radius:10px`, `cursor:pointer`, `hover:opacity:0.82`. |
| v37 | 2026-05-27 | **Header backup indicator** — `#header-backup-icon` discreet shield button (34px square, white bg, 1px border-radius:6px). Replaces bottom-left pill. Contains a 7px `#header-backup-dot` that color-codes by health: green `#16a34a` / amber `#d97706` / red `#dc2626` (pulsing via `@keyframes ibis-dot-pulse`). Hover: bg `#f9fafb`, border `#9ca3af`. Tooltip shows full status. |
| v37 | 2026-05-27 | **Backups panel** — `.ab-card.bp-wide` (max-width:640px). Sections separated by `.bp-section` (16px 22px padding, border-bottom). Storage bar: `.bp-storage-bar` (8px tall, `#f3f4f6` track) + `.bp-storage-fill` (color-coded green/amber/red, 250ms transition). Layer status rows: `.bp-layer` (flex, 10px vertical padding) + `.bp-layer-dot` (9px circle, `box-shadow:0 0 0 3px rgba(0,0,0,.04)` ring, ok/warn/err/pending variants). Primary CTA: `.bp-restore-btn` (full width, IBIS red, 10px radius, 14px font, 14px padding, hover translateY(-1px)). Secondary: `.bp-action-btn` (50% flex, white bg, border `#e5e7eb`, 8px radius). |
| v37 | 2026-05-27 | **FSA setup CTA banner** — Inside Backups panel. `.bp-section` with `background:#eff6ff;border-left:3px solid #2563eb`. Icon + 2-column flex (text + button column). Body uses bold for action verbs ("Click 'Set it up'") and italic for caveats. Includes "Skip — don't ask again" secondary button (`color:#6b7280`, smaller text). When FSA is active: green variant (`#f0fdf4` bg, `#16a34a` border) with Disable button. |
| v37 | 2026-05-27 | **Save-state indicators** — Inline `<span>` next to field labels (NOTES, Account Plan). Default green "✓ Saved" (`color:#16a34a`). When typing: amber "● Saving…" (`color:#d97706`). 150ms transition between states. Font: 10px DM Mono. Pattern: every text input that uses debounced auto-save MUST have one of these visible. |
| v37 | 2026-05-27 | **Save-failure banner** — `#save-failure-banner` (full-bleed top, `z-index:10001`, gradient red `#991b1b → #dc2626`, 14px 22px padding, animated slide-in). Only appears when write-health auto-recovery fails. Contains failure reason, key name, time, and an Open Backups button. White inverted button style (`background:#fff;color:#991b1b`). Critical UX — must be impossible to miss. |
| v37 | 2026-05-27 | **Empty-state cloud restore** — Dark "☁️ Restore Everything from Cloud" button (`background:#0f172a`) shown alongside the upload CSV button. Equal visual weight — appears whenever localStorage is empty (fresh machine, wiped browser, cache cleared). One-click recovery path for the disaster scenario. |
| v37.8 | 2026-05-29 | **🔒 True Keep status (4th option, blue)** — new status added at index 0 of `ACCT_STATUS_OPTS` (strongest conviction first). Portal option `.ast-truekeep` uses `#dbeafe`/`#1e40af` — matches PIQ blue palette, visually distinct from green Keep, yellow Monitor, red Drop. Filter chip `.chip-truekeep.active` uses `#dbeafe`/`#93c5fd`/`#1e40af`. Pattern: future status additions must use a unique color from the locked palette (not invent new tones) and use `.find(o => o.key === '')` for the dash fallback (not hardcoded array index). |
| v37.8 | 2026-05-29 | **Pre-upload snapshot labels in Backups panel** — `ab-row-time` cell now accepts an optional `reason` line below the timestamp. Pre-upload snapshots get a blue tint (`color:#0369a1`) with shield emoji prefix (`🛡 `). Automatic snapshots remain unlabeled. Font: 10px DM Mono. Makes pre-upload safety snapshots visually distinguishable from background auto-saves in the restore list. |
