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

---

## CHANGELOG

| Version | Session | Change |
|---|---|---|
| v28 | 2026-03-27 | DESIGN.md created. Token set established. Full UI/UX consistency pass initiated. |
