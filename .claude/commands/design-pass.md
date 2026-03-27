You are a senior product designer and frontend engineer reviewing the IBISWorld Account Dashboard.
Your job is a pure visual and UX pass. No logic changes. No feature work. No JS edits.
One goal: make every tab feel like it was built by one team, on one day.

---

## SCOPE

This command accepts an optional tab name argument. Check the user's message for one of these:

- `/design-pass campaigns` → only fix the Campaigns tab
- `/design-pass accounts` → only fix the Accounts tab
- `/design-pass licenses` → only fix the Licenses tab
- `/design-pass dead` → only fix the Dead tab
- `/design-pass account-page` → only fix the Account Deep-Dive page
- `/design-pass all` → full pass across all tabs (slow — use in a fresh session)
- `/design-pass` (no argument) → ask: "Which tab? (campaigns / accounts / licenses / dead / account-page / all)"

When scoped to a single tab: read only the CSS and HTML relevant to that tab. Do not read unrelated sections. This keeps the context window manageable and the pass fast and reliable.

---

## BEFORE YOU START

1. Read DESIGN.md fully — this is your spec. Every token, every component rule.
2. Read CLAUDE.md — understand the DO NOT TOUCH list and intentional data encodings.
3. Use Grep to locate the CSS classes and HTML for the scoped tab before reading anything.
   Read in chunks of 300–400 lines max. Never read 1000+ lines at once.
4. Map the visual landscape for the scoped tab before touching anything.

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
- Spacing violations (odd-number padding: 3px, 7px, 9px, 11px, 15px → nearest token)
- Font size / weight outside the allowed scale
- Missing cursor:pointer on clickable elements
- Missing hover state on interactive elements
- Border-radius violations (999px pills, 6px buttons/inputs, 10px cards)
- Color one-offs not in the design token set (vertical/tier/sentiment palettes exempt)
- Filter chips that look different between tabs
- Table headers that don't match the column header standard
- Stat boxes with different padding or font sizes between tabs
- Buttons not matching .btn-primary / .btn-secondary / .btn-ghost anatomy
- Any badge/pill with font-size > 11px or non-999px border-radius
- Emoji misalignment (missing vertical-align:middle)

**FLAG + FIX — make the change, note your reasoning briefly:**
- Cases where standardizing requires a visual judgment call
- When a DESIGN.md token is close but not exact and you're choosing the nearest value

**FLAG ONLY — do not change:**
- The holographic splash screen (id="splash") — untouchable
- Vertical color palette, tier diamond colors, sentiment colors, stage colors — data encodings
- Any animation that would need careful rework to change safely

---

## TAB COMPONENT MAP

Use this to know which CSS classes and HTML IDs to grep for each tab:

**campaigns:**
CSS: `.opp-card`, `.opp-col`, `.opp-col-header`, `.opp-stage-pill`, `.campaign-stat-*`, `.campaign-selector-*`, `.cold-section`, `.opp-tbl-wrap`, `.opp-next-select`
HTML: `#stats-campaigns`, `#controls-campaigns`, `#content-campaigns`

**accounts:**
CSS: `.acct-status-*`, `.acct-priority-*`, `.wkbl-dot`, `.smpl-dot`, `.tier-badge`, `.vert-bubble`, `.sent-badge`, `.cards-grid`, `.account-card`
HTML: `#stats-accounts`, `#controls-accounts`, `#content-accounts`

**licenses:**
CSS: `.lic-type-badge`, `.lic-status-badge`, `.lic-filter-trigger`, `.lic-dropdown`, `.lic-sort-arrow`, `.alb-*`
HTML: `#stats-licenses`, `#controls-licenses`, `#content-licenses`

**dead:**
CSS: `.dead-section-wrap`, `.dead-section-header`, `.dvt-btn`, `.dvt-count`
HTML: `#stats-dead`, `#controls-dead`, `#content-dead`, `#dead-accts-section`, `#dead-lics-section`, `#dead-contacts-section`

**account-page:**
CSS: `.ap-panel`, `.ap-panel-title`, `.ap-stat-*`, `.ap-stage-pill`, `.ap-days-chip`, `.ap-plan-textarea`, `.ap-churn-callout`, `.acct-page-nav`
HTML: `#account-page`, `#acct-page-nav`

**all (global):**
CSS: `:root`, `thead th`, `tbody tr`, `td`, `.chip`, `.view-btn`, `.view-toggle`, `.stat-item`, `.stat-label`, `.stat-value`, `.search-wrap`, `select`, `.controls`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`
HTML: all tabs

---

## COMPONENT CHECKLIST (apply to scoped tab only)

- [ ] Buttons: height 34px, DM Sans 500 13px, radius 6px, cursor pointer, transition 150ms
- [ ] Filter chips: height 28px, 999px radius, DM Sans 500 12px, border #e5e7eb
- [ ] Stat boxes: white bg / 10px radius / low shadow / 12px 20px padding / number 22px 700 / label 11px 500 uppercase
- [ ] Badges/pills: 999px radius, 2px 8px padding, DM Sans 500 11px
- [ ] Table headers: DM Sans 600 11px uppercase letter-spacing:0.5px #6b7280; active sort: #C8102E
- [ ] Table rows: min 44px, hover #f8fafc, border-bottom 1px #f3f4f6
- [ ] Inputs: height 34px, border 1px #d1d5db, radius 6px, focus ring rgba(200,16,46,.10)
- [ ] Selects: height 34px, border 1px #d1d5db, radius 6px, DM Sans 400 13px
- [ ] Cards/panels: white bg, 10px radius, low shadow, 20px 24px padding
- [ ] All clickable elements: cursor:pointer + visible hover state + transition 150ms

---

## AFTER ALL FIXES

1. Update DESIGN.md changelog with today's date, tab scoped, what was standardized
2. Commit: `git add index.html DESIGN.md && git commit -m "design: [tab] UI consistency pass"`
3. Push to GitHub main
4. Print report:

```
🎨 DESIGN SYSTEM — token block confirmed
✅ STANDARDIZED — [components fixed, tab scoped]
🖌️ CHANGES — [what changed visually]
⚠️ FLAGGED — [judgment calls]
🔴 DEFERRED — [not touched, needs designer review]
```

---

## CONSTRAINTS — NEVER VIOLATE

- No JS function changes of any kind
- No localStorage key or data structure changes
- No HTML restructuring beyond minimal visual fixes
- No new fonts (DM Sans + DM Mono only)
- Do not touch id="splash"
- Read in chunks of 300–400 lines max
