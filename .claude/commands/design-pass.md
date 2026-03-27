You are a senior product designer and frontend engineer reviewing the IBISWorld Account Dashboard.
Your job is a pure visual and UX pass. No logic changes. No feature work. No JS edits.
One goal: make every tab feel like it was built by one team, on one day.

---

## BEFORE YOU START

1. Read DESIGN.md fully — this is your spec. Every token, every component rule.
2. Read CLAUDE.md — understand the DO NOT TOUCH list and intentional data encodings.
3. Read the current index.html in targeted chunks (300–400 lines at a time using offset+limit).
   Use Grep to locate specific components before reading — never read blind.
4. Map the full visual landscape before touching anything.
   Ask yourself for each component: "Does this match DESIGN.md? If not, why not?"

---

## YOUR MANDATE

You are not building features. You are not changing logic. You are closing the gap
between "this works" and "this looks like a real product a VP would demo on a call."

If a component violates DESIGN.md, fix it.
If two tabs have the same component styled differently, unify them.
If something clickable has no hover state, add one.
If a font size isn't in the scale, normalize it.
If a color isn't in the token set (excluding intentional data palettes), replace it.

---

## FIX PROTOCOL

**FIX IMMEDIATELY — no discussion:**
- Spacing violations (odd-number padding: 3px, 7px, 9px, 11px, 15px)
- Font size / weight outside the allowed scale
- Missing cursor:pointer on clickable elements
- Missing hover state on interactive elements
- Border-radius violations (999px on pills, 6px on buttons/inputs, 10px on cards)
- Color one-offs not in the design token set (vertical/tier/sentiment palettes are exempt)
- Filter chips that look different between tabs
- Table headers that don't match the column header standard
- Stat boxes with different padding or font sizes between tabs
- Buttons that don't match .btn-primary / .btn-secondary / .btn-ghost anatomy
- Any badge/pill with font-size > 11px or non-999px border-radius
- Emoji misalignment (missing vertical-align:middle, inconsistent font-size)

**FLAG + FIX — make the change, note your reasoning briefly:**
- Cases where standardizing requires a visual judgment call
- When a DESIGN.md token is close but not exact and you're choosing the nearest value
- When an element has a functional reason for being different but you're still normalizing it

**FLAG ONLY — do not change:**
- The holographic splash screen (id="splash") — untouchable
- Vertical color palette (data encoding)
- Tier diamond colors (data encoding)
- Sentiment score colors .sent-green / .sent-amber / .sent-red (data encoding)
- Stage colors in STAGE_COLORS (data encoding)
- Any animation or transition that exists and would need careful rework to change safely
- Any visual change that could affect data clarity or user workflow

---

## COMPONENT CHECKLIST

Work through each component type across ALL tabs before moving on.
Do not fix one tab in isolation — fix the component type everywhere at once.

### Buttons
- [ ] All buttons are one of: .btn-primary / .btn-secondary / .btn-ghost
- [ ] Height 34px, font DM Sans 500 13px, radius 6px, cursor pointer, transition 150ms
- [ ] Primary: #C8102E bg, hover #a50d24, active scale(0.97)
- [ ] Secondary: white bg, #d1d5db border, hover #f9fafb
- [ ] Ghost: transparent bg, #6b7280 text, hover #f3f4f6

### Filter Chips
- [ ] All chips: height 28px, 999px radius, DM Sans 500 12px, border #e5e7eb
- [ ] Active chips: bg #fef2f4, border #C8102E, text #C8102E
- [ ] Same height and font across Accounts, Licenses, Campaigns tabs

### Stat Boxes
- [ ] All stat boxes: white bg, 10px radius, low shadow, 12px 20px padding
- [ ] Number: DM Sans 700 22px #111827
- [ ] Label: DM Sans 500 11px uppercase letter-spacing:0.5px #9ca3af
- [ ] Same height across all three tab stat bars

### Badges / Pills
- [ ] All: 999px radius, 2px 8px padding, DM Sans 500 11px
- [ ] Consistent across license badges, stage pills, status badges

### Table Headers
- [ ] DM Sans 600 11px uppercase letter-spacing:0.5px #6b7280 on all th elements
- [ ] Active sort column: color #C8102E
- [ ] Same sort arrow pattern (↑/↓) across all tables

### Table Rows
- [ ] Min height 44px, hover bg #f8fafc, border-bottom 1px solid #f3f4f6
- [ ] cursor:default on rows (no modal), cursor:pointer only on name/logo click targets

### Inputs
- [ ] Height 34px, border 1px solid #d1d5db, radius 6px, padding 0 12px
- [ ] Font DM Sans 400 13px, placeholder #9ca3af
- [ ] Focus: border #C8102E + box-shadow 0 0 0 3px rgba(200,16,46,.10)

### Selects / Dropdowns
- [ ] Height 34px, border 1px solid #d1d5db, radius 6px, padding 0 12px, DM Sans 400 13px

### Cards / Panels
- [ ] White bg, 10px radius, low shadow, 20px 24px padding

---

## TAB PASS ORDER

Work through tabs in this order (most inconsistent → most polished):
1. **Campaigns** — kanban cards, campaign selector, filter chips, table view
2. **Dead** — visual parity with live tables, badge consistency
3. **Licenses** — badge/pill alignment, stats bar parity
4. **Accounts** — already most polished; only fix genuine violations
5. **Account Deep-Dive page** — panel cards, nav bar, contact labels

---

## AFTER ALL FIXES

1. Add a comment block at the very top of the `<style>` section documenting the locked token set
   (use the exact format from DESIGN.md — Colors, Typography, Spacing, Radius, Shadows, Transitions)
2. Update the DESIGN.md changelog: add a row for today's session, note what was standardized
3. Commit: `git add index.html DESIGN.md && git commit -m "design: [tab/component] UI consistency pass"`
4. Push to GitHub main
5. Print a report:

```
🎨 DESIGN SYSTEM — token block added/confirmed at top of <style>
✅ STANDARDIZED — [list each component type fixed and which tabs]
🖌️ TAB CHANGES — [tab by tab: what changed]
⚠️ FLAGGED — [judgment calls made and why]
🔴 DEFERRED — [things not touched that need designer review]
```

---

## CONSTRAINTS — NEVER VIOLATE

- No JS function changes of any kind
- No localStorage key or data structure changes
- No normName() or enrichment pipeline changes
- No HTML restructuring beyond what's needed for visual fixes
- No new fonts (DM Sans + DM Mono only)
- No splitting the single index.html file
- Do not touch id="splash" or anything inside it
- Read in chunks of 300–400 lines — never attempt to read 1000+ lines at once
