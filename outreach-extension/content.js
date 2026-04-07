// =============================================================================
// ARCHIVED CONTENT SCRIPT — v2 (sidebar + priority engine + Graph/OWA API)
// Tabled in v3. Full implementation preserved in git history (commit bf60db7).
// Reason: replaced with lightweight DOM overlay that needs no external APIs.
// =============================================================================

// =============================================================================
// IBISWorld Outreach — DOM Overlay v3.0
// =============================================================================
// Pure DOM overlay. Reads Outlook's rendered HTML. No external APIs.
//
// Feature A — Folder badge:
//   Orange "N overdue" pill on each campaign folder in the left nav tree.
//   Count = threads in that folder where last activity >= OVERDUE_DAYS.
//   Badge is cached per folder — updates each time you open the folder.
//
// Feature B — Row badges (shown when inside a campaign folder):
//   Between "From" and "Subject" on each email row:
//     • Colored dot + days chip  (green < 3d · orange 3-7d · red 8d+)
//     • Company bubble: favicon + name, colored uniquely per domain
//
// Company data: tries chrome.storage (bridge.js contact map) for account names.
// Falls back to guessing company from the sender's email domain.
//
// DOM selectors note:
//   We use ARIA roles ([role="option"], [role="treeitem"]) which are stable
//   across Outlook updates. The within-row injection point uses multiple
//   fallback strategies — adjust INJECT_SELECTOR in config if layout shifts.
// =============================================================================

(function () {
  'use strict';

  // ── Config ──────────────────────────────────────────────────────────────────

  const OVERDUE_DAYS = 3;         // Days of inactivity before a thread is "overdue"
  const DEBOUNCE_MS  = 400;       // Observer debounce (ms) — Outlook re-renders constantly

  // Exact folder names as they appear in your Outlook left nav
  const CAMPAIGN_FOLDERS = [
    'Workables', '6QA', 'Churns', 'Multithread', 'Winback', 'Old Samples', 'Net New',
  ];

  // Selector for finding the "From" region within a row so we know where to inject.
  // If badges appear in the wrong place after a UI update, tweak this.
  // Strategy order: try each until one works.
  const FROM_STRATEGIES = [
    // Strategy 1: table-based layout — first <td>
    (row) => row.querySelector('td:first-child'),
    // Strategy 2: flex/grid — find the first short leaf-text span (likely sender name)
    (row) => {
      const spans = [...row.querySelectorAll('span, div')].filter(el =>
        el.childElementCount === 0 &&
        el.textContent.trim().length > 1 &&
        el.textContent.trim().length < 60
      );
      return spans[0] || null;
    },
  ];

  // ── State ───────────────────────────────────────────────────────────────────

  let contactMap    = {};  // sender email (lc) → { accountName, domain }
  let folderCounts  = {};  // folderName → overdue count (cached on last visit)
  let debounceTimer = null;

  // ── Context guard ────────────────────────────────────────────────────────────

  function ctxOk() {
    try { return !!chrome.runtime.id; } catch (_) { return false; }
  }

  // ── Contact map (from bridge.js via chrome.storage.local) ───────────────────
  // Gives us accountName for known contacts — enhances the company bubble.

  function loadContactMap() {
    if (!ctxOk() || !chrome.storage) return;
    chrome.storage.local.get(['outreach_contacts_raw'], (res) => {
      try {
        const raw = JSON.parse(res.outreach_contacts_raw || '{}');
        contactMap = {};
        Object.values(raw).forEach(c => {
          if (!c.email) return;
          const e = c.email.toLowerCase().trim();
          contactMap[e] = {
            accountName: c.accountName || '',
            domain:      e.split('@')[1] || '',
          };
        });
      } catch (_) {}
    });
  }

  // ── Date parsing ─────────────────────────────────────────────────────────────
  // Outlook displays dates in the row's aria-label as human-readable strings.
  // We parse those first (most reliable), then fall back to scanning child elements.

  const MONTHS_LONG  = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const DAYS_LONG    = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const DAYS_SHORT   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  function parseOutlookDate(str) {
    if (!str) return null;
    str = str.trim();
    const now = new Date();

    // Time string (today): "3:45 PM", "10:30"
    if (/^\d{1,2}:\d{2}/.test(str) || /\d{1,2}:\d{2}\s*(am|pm)/i.test(str)) {
      return new Date(now);
    }
    if (/^today/i.test(str)) return new Date(now);
    if (/^yesterday/i.test(str)) {
      const d = new Date(now); d.setDate(d.getDate() - 1); return d;
    }

    // Day of week: "Monday", "Mon" → earlier this week
    for (let i = 0; i < 7; i++) {
      if (str.startsWith(DAYS_LONG[i]) || str.startsWith(DAYS_SHORT[i])) {
        const d    = new Date(now);
        const diff = (now.getDay() - i + 7) % 7 || 7;
        d.setDate(d.getDate() - diff);
        return d;
      }
    }

    // "April 7, 2025" / "Apr 7, 2025" / "Apr 7"
    for (let mi = 0; mi < 12; mi++) {
      if (str.startsWith(MONTHS_LONG[mi]) || str.startsWith(MONTHS_SHORT[mi])) {
        const d = new Date(str);
        if (!isNaN(d.getTime())) {
          // No year in string → assume current year; push back one year if date is future
          if (!/\b20\d\d\b/.test(str)) {
            d.setFullYear(now.getFullYear());
            if (d > now) d.setFullYear(now.getFullYear() - 1);
          }
          return d;
        }
      }
    }

    // Numeric: "4/7/2025" or "4/7"
    const num = str.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
    if (num) {
      const y    = num[3] ? parseInt(num[3]) : now.getFullYear();
      const fullY = y < 100 ? 2000 + y : y;
      const d    = new Date(fullY, parseInt(num[1]) - 1, parseInt(num[2]));
      return isNaN(d.getTime()) ? null : d;
    }

    return null;
  }

  function daysSince(date) {
    if (!date || isNaN(date.getTime())) return null;
    return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
  }

  // Pull a date from an Outlook row's aria-label string.
  // Example: "Laura Jimenez, SKO Recap, Monday, April 7, 2025, Has attachment"
  function dateFromAriaLabel(label) {
    if (!label) return null;
    // Try patterns from most specific to least
    const patterns = [
      /\d{1,2}:\d{2}\s*(AM|PM)/i,
      /\bToday\b/i,
      /\bYesterday\b/i,
      /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/i,
      /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:,\s*\d{4})?\b/i,
      /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}(?:,\s*\d{4})?\b/i,
      /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/,
    ];
    for (const p of patterns) {
      const m = label.match(p);
      if (m) {
        const d = parseOutlookDate(m[0]);
        if (d) return d;
      }
    }
    return null;
  }

  // ── Active folder detection ──────────────────────────────────────────────────
  // Checks the main content heading and selected treeitem.

  function getActiveCampaignFolder() {
    // Primary: look for a heading that matches a campaign folder name
    const headings = document.querySelectorAll('[role="heading"], h1, h2');
    for (const h of headings) {
      const t = h.textContent.trim();
      const match = CAMPAIGN_FOLDERS.find(f => t === f || t.startsWith(f + ' '));
      if (match) return match;
    }
    // Fallback: selected treeitem
    const sel = document.querySelector(
      '[role="treeitem"][aria-selected="true"], [role="treeitem"].is-selected'
    );
    if (sel) {
      const t = sel.textContent.trim();
      return CAMPAIGN_FOLDERS.find(f => t.startsWith(f)) || null;
    }
    return null;
  }

  // ── Folder nav badges ────────────────────────────────────────────────────────

  function updateFolderBadges() {
    document.querySelectorAll('[role="treeitem"]').forEach(item => {
      const itemText  = item.textContent;
      const folderName = CAMPAIGN_FOLDERS.find(f => itemText.includes(f));
      if (!folderName) return;

      const count = folderCounts[folderName] || 0;
      let badge   = item.querySelector('.ibis-folder-badge');

      if (count === 0) { badge?.remove(); return; }

      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'ibis-folder-badge';
        // Inject next to the folder name text — find its direct text container
        const labelEl = findFolderLabel(item, folderName);
        if (labelEl) labelEl.appendChild(badge);
        else item.appendChild(badge);
      }
      badge.textContent = count === 1 ? '1 overdue' : `${count} overdue`;
    });
  }

  // Walk text nodes to find the smallest element containing the folder name.
  // This avoids wrapping the entire treeitem (which includes child folder rows).
  function findFolderLabel(treeItem, folderName) {
    const walker = document.createTreeWalker(treeItem, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.textContent.trim().startsWith(folderName)) {
        return node.parentElement;
      }
    }
    return null;
  }

  // ── Email row scanning ───────────────────────────────────────────────────────

  function scanEmailRows() {
    const activeFolder = getActiveCampaignFolder();
    if (!activeFolder) return; // Only badge rows when inside a campaign folder

    let overdueCount = 0;

    document.querySelectorAll('[role="option"]').forEach(row => {
      // Skip rows we've already badged this render cycle
      if (row.querySelector('.ibis-row-badges')) return;

      // ── 1. Extract date ──────────────────────────────────────────────────
      const ariaLabel = row.getAttribute('aria-label') || '';
      let date = dateFromAriaLabel(ariaLabel);

      if (!date) {
        // Fallback A: <time> element
        const timeEl = row.querySelector('time');
        if (timeEl) {
          const dt = timeEl.getAttribute('datetime');
          date = dt ? new Date(dt) : parseOutlookDate(timeEl.textContent.trim());
        }
      }

      if (!date) {
        // Fallback B: scan leaf text nodes for date-like strings
        const leaves = [...row.querySelectorAll('span, div')].filter(
          el => el.childElementCount === 0 && el.textContent.trim().length > 0
        );
        for (const el of leaves) {
          const t = el.textContent.trim();
          if (t.length < 25) {
            date = parseOutlookDate(t);
            if (date) break;
          }
        }
      }

      const days = daysSince(date);
      if (days === null) return; // Can't determine date — skip this row

      const isOverdue = days >= OVERDUE_DAYS;
      if (isOverdue) overdueCount++;

      // ── 2. Extract sender email (best-effort) ────────────────────────────
      // Outlook sometimes puts the email in title/aria-label attributes.
      // This succeeds often on hover-loaded rows; skips gracefully when absent.
      let senderEmail = '';
      const emailAttrEls = row.querySelectorAll('[title*="@"], [aria-label*="@"]');
      for (const el of emailAttrEls) {
        const attr  = el.getAttribute('title') || el.getAttribute('aria-label') || '';
        const match = attr.match(/[\w.+'\-]+@[\w.\-]+\.[a-z]{2,}/i);
        if (match) { senderEmail = match[0].toLowerCase(); break; }
      }

      const contact = senderEmail ? contactMap[senderEmail] : null;
      const domain  = senderEmail ? senderEmail.split('@')[1] : null;

      // ── 3. Inject badges ─────────────────────────────────────────────────
      injectRowBadges(row, days, isOverdue, contact, domain);
    });

    // Cache the count → folder badge will reflect it next updateFolderBadges() call
    folderCounts[activeFolder] = overdueCount;
    updateFolderBadges();
  }

  // ── Row badge injection ──────────────────────────────────────────────────────

  function injectRowBadges(row, days, isOverdue, contact, domain) {
    const wrap = document.createElement('span');
    wrap.className = 'ibis-row-badges';

    // ── Staleness chip: colored dot + "Nd" ──────────────────────────────────
    const dotColor =
      days === 0             ? '#16a34a' :   // green  — today
      days < OVERDUE_DAYS    ? '#d97706' :   // orange — 1-2d
      days < 8               ? '#dc2626' :   // red    — 3-7d (overdue)
                               '#991b1b';    // dark red — 8d+ (very stale)

    const chip = document.createElement('span');
    chip.className = 'ibis-stale-chip';
    chip.title     = `Last activity: ${days === 0 ? 'today' : days + ' day' + (days !== 1 ? 's' : '') + ' ago'}`;
    chip.innerHTML =
      `<span class="ibis-dot" style="background:${dotColor}"></span>` +
      `<span class="ibis-days">${days === 0 ? 'today' : days + 'd'}</span>`;
    wrap.appendChild(chip);

    // ── Company bubble: favicon + name, unique pastel color ─────────────────
    const companyName = contact?.accountName || (domain ? domainToName(domain) : '');
    const effectiveDomain = domain || (contact?.domain) || '';

    if (companyName) {
      const { bg, color, border } = domainToColor(effectiveDomain || companyName);

      const bubble = document.createElement('span');
      bubble.className = 'ibis-company-bubble';
      bubble.title     = companyName;
      bubble.style.cssText = `background:${bg};color:${color};border-color:${border}`;

      if (effectiveDomain) {
        const img    = document.createElement('img');
        img.src      = `https://icons.duckduckgo.com/ip3/${effectiveDomain}.ico`;
        img.className = 'ibis-co-logo';
        img.onerror  = () => img.style.display = 'none';
        bubble.appendChild(img);
      }

      const nameEl      = document.createElement('span');
      nameEl.className  = 'ibis-co-name';
      nameEl.textContent = companyName.length > 22
        ? companyName.slice(0, 20) + '…'
        : companyName;
      bubble.appendChild(nameEl);
      wrap.appendChild(bubble);
    }

    // ── Find injection point: between From and Subject ───────────────────────
    // Try each strategy in order until one finds a target.
    let injected = false;
    for (const strategy of FROM_STRATEGIES) {
      const target = strategy(row);
      if (target) {
        // Insert wrap as sibling AFTER the From element
        target.insertAdjacentElement('afterend', wrap);
        injected = true;
        break;
      }
    }
    if (!injected) row.appendChild(wrap);
  }

  // ── Utilities ────────────────────────────────────────────────────────────────

  // Convert domain → human-readable company name guess
  // "cloud.microsoft" → "Cloud Microsoft", "lyft.com" → "Lyft"
  function domainToName(domain) {
    return domain
      .replace(/^www\./, '')
      .split('.')[0]
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  // Deterministic pastel color from a seed string (domain or company name).
  // Same input always gives same color — no random flickering between renders.
  function domainToColor(seed) {
    let h = 5381;
    for (let i = 0; i < seed.length; i++) h = ((h << 5) + h) ^ seed.charCodeAt(i);
    const hue = Math.abs(h) % 360;
    return {
      bg:     `hsl(${hue}, 55%, 93%)`,
      color:  `hsl(${hue}, 50%, 30%)`,
      border: `hsl(${hue}, 45%, 78%)`,
    };
  }

  // ── MutationObserver ─────────────────────────────────────────────────────────
  // Outlook's SPA re-renders constantly. Debounce keeps CPU cost minimal.

  function onMutation() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      updateFolderBadges();
      scanEmailRows();
    }, DEBOUNCE_MS);
  }

  // ── Init ─────────────────────────────────────────────────────────────────────

  function init() {
    if (!ctxOk()) return;

    loadContactMap();
    setInterval(loadContactMap, 60 * 1000); // refresh contact map every minute

    const observer = new MutationObserver(onMutation);
    observer.observe(document.body, { childList: true, subtree: true });

    // Initial scan — wait for Outlook to finish rendering
    setTimeout(() => {
      updateFolderBadges();
      scanEmailRows();
    }, 1500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 500); // slight delay so Outlook SPA finishes mounting
  }

})();
