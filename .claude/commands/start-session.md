Run the start-of-session orientation:

1. **Read CLAUDE.md explicitly using the Read tool** — do NOT rely on auto-injected context.
   CLAUDE.md is ~700 lines. Read it in three clean chunks:
   - `Read offset:0 limit:250` → Project Overview, Architecture, Current State, Accounts tab features
   - `Read offset:250 limit:250` → Dead tab, Licenses, Revenue Engine, Logo Cascade, Design, Business Logic, Sort/Filter, PA Pipeline
   - `Read offset:500 limit:200` → Outreach Extension, Email Data Layer, How to Work with Dan, Slash Commands, Session Management, Open Items
   This is non-negotiable — reading the file confirms what's actually on disk, not just what was injected into context.

2. **Read DESIGN.md using the Read tool** — covers the locked design token set, component reference, and anti-patterns.
   Always required because UI work can come up at any point.

3. Print a clean summary:
   📦 Version: [current version from CLAUDE.md CURRENT STATE section]
   🔨 Last built: [last git commit message — run git log -1 --oneline]
   📋 Open items: [from CLAUDE.md Open Items table — 🔴 Next items only]
   🎨 Design system: [confirm DESIGN.md loaded — locked token set active]
   🧠 Context: Fresh — ready to go

4. Ask: "What do you want to tackle first?"

---

IMPORTANT HIERARCHY:
- CLAUDE.md = source of truth for everything: project state, features, architecture, business logic, open items
- DESIGN.md = visual design reference only: tokens, components, anti-patterns
- If they ever conflict, CLAUDE.md wins

IMPORTANT for UI work: Before writing any CSS or HTML, check DESIGN.md for the component.
Before picking a color, check the token table. After completing UI work, flag if DESIGN.md needs a changelog entry.
