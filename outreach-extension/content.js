// =============================================================================
// ARCHIVED CONTENT SCRIPT — v2 (sidebar + priority engine + Graph/OWA API)
// Tabled in v3. Full implementation preserved in git history (commit 9487fe9).
// Reason: replaced with lightweight DOM overlay — no external APIs needed.
// =============================================================================

// =============================================================================
// IBISWorld Outreach — DOM Overlay v3.1
// =============================================================================
// Pure DOM overlay. Reads Outlook's rendered HTML. No external APIs.
//
// Feature A — Folder badge:
//   Orange "N overdue" pill injected next to each campaign folder in the left nav.
//   Count = threads in that folder where last activity >= OVERDUE_DAYS.
//   Cached per-folder; refreshes each time you open the folder.
//
// Feature B — Row badges (shown when inside a campaign folder):
//   Colored staleness dot + days count chip, plus a company name bubble.
//   Injected between the From name and the Subject on each email row.
//
// Debug: open DevTools console and filter by "[IBISWorld]" to see what's found.
// =============================================================================

(function () {
  'use strict';

  // ── Config ──────────────────────────────────────────────────────────────────

  const OVERDUE_DAYS = 3;
  const DEBOUNCE_MS  = 400;

  // Must match folder names as they appear in Outlook.
  // Emoji prefixes are fine — we use .includes(), not startsWith().
  const CAMPAIGN_FOLDERS = [
    'Workables', '6QA', 'Churns', 'Multithread', 'Winback', 'Old Samples', 'Net New',
  ];

  const LOG = (...a) => console.log('[IBISWorld]', ...a);

  // ── State ───────────────────────────────────────────────────────────────────

  let contactMap    = {};
  let folderCounts  = {};
  let debounceTimer = null;

  // ── Context guard ────────────────────────────────────────────────────────────

  function ctxOk() {
    try { return !!chrome.runtime.id; } catch (_) { return false; }
  }

  // ── Contact map (from bridge.js via chrome.storage.local) ───────────────────

  function loadContactMap() {
    if (!ctxOk() || !chrome.storage) return;
    chrome.storage.local.get(['outreach_contacts_raw'], (res) => {
      try {
        const raw = JSON.parse(res.outreach_contacts_raw || '{}');
        contactMap = {};
        Object.values(raw).forEach(c => {
          if (!c.email) return;
          const e = c.email.toLowerCase().trim();
          contactMap[e] = { accountName: c.accountName || '', domain: e.split('@')[1] || '' };
        });
        LOG('Contact map:', Object.keys(contactMap).length, 'contacts loaded');
      } catch (_) {}
    });
  }

  // ── Date parsing ─────────────────────────────────────────────────────────────

  const MONTHS_LONG  = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const DAYS_LONG    = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const DAYS_SHORT   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  function parseOutlookDate(str) {
    if (!str) return null;
    str = str.trim();
    const now = new Date();

    if (/\d{1,2}:\d{2}\s*(am|pm)/i.test(str) || /^\d{1,2}:\d{2}$/.test(str)) return new Date(now);
    if (/^today/i.test(str)) return new Date(now);
    if (/^yesterday/i.test(str)) {
      const d = new Date(now); d.setDate(d.getDate() - 1); return d;
    }

    for (let i = 0; i < 7; i++) {
      if (str.startsWith(DAYS_LONG[i]) || str.startsWith(DAYS_SHORT[i])) {
        const d    = new Date(now);
        const diff = (now.getDay() - i + 7) % 7 || 7;
        d.setDate(d.getDate() - diff);
        return d;
      }
    }

    for (let mi = 0; mi < 12; mi++) {
      if (str.startsWith(MONTHS_LONG[mi]) || str.startsWith(MONTHS_SHORT[mi])) {
        const d = new Date(str);
        if (!isNaN(d.getTime())) {
          if (!/\b20\d\d\b/.test(str)) {
            d.setFullYear(now.getFullYear());
            if (d > now) d.setFullYear(now.getFullYear() - 1);
          }
          return d;
        }
      }
    }

    // Numeric: "4/7/2026", "3/30/2026"
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

  // Extract a date from the row's aria-label string.
  // Outlook packs date info in aria-label, e.g.:
  //   "Daniel Starr, IBISWorld Sample Request, Yesterday, 1:13 PM, Has attachment"
  function dateFromAriaLabel(label) {
    if (!label) return null;
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
  // Uses .includes() throughout — handles emoji-prefixed folder names like "🔥 6QA".

  function getActiveCampaignFolder() {
    // ── Strategy 1: browser tab title ──────────────────────────────────────────
    // Most reliable. Outlook sets title = "FolderName - User - Outlook".
    // Doesn't include emoji so clean text match works.
    const title = document.title || '';
    const fromTitle = CAMPAIGN_FOLDERS.find(f => title.includes(f));
    if (fromTitle) {
      LOG('Active folder (from title):', fromTitle);
      return fromTitle;
    }

    // ── Strategy 2: visible heading elements ────────────────────────────────────
    const headingEls = document.querySelectorAll('[role="heading"], h1, h2, h3');
    for (const el of headingEls) {
      const t = el.textContent.trim();
      const match = CAMPAIGN_FOLDERS.find(f => t.includes(f));
      if (match) {
        LOG('Active folder (from heading):', match);
        return match;
      }
    }

    // ── Strategy 3: selected/active treeitem ────────────────────────────────────
    for (const item of document.querySelectorAll('[role="treeitem"]')) {
      const isActive =
        item.getAttribute('aria-selected') === 'true' ||
        item.getAttribute('aria-current') === 'true'  ||
        item.getAttribute('aria-current') === 'page';
      if (!isActive) continue;
      const t = item.textContent.trim();
      const match = CAMPAIGN_FOLDERS.find(f => t.includes(f));
      if (match) {
        LOG('Active folder (from treeitem):', match);
        return match;
      }
    }

    LOG('Active folder: none detected. Title was:', title);
    return null;
  }

  // ── Get email rows ────────────────────────────────────────────────────────────
  // Try selectors in order — new Outlook (cloud.microsoft) varies by version.

  function getEmailRows() {
    // Most common: listbox > option
    let rows = [...document.querySelectorAll('[role="option"]')];
    if (rows.length > 0) { LOG('Rows found via [role=option]:', rows.length); return rows; }

    // Alternative: listitem with aria-label (some OWA versions)
    rows = [...document.querySelectorAll('[role="listitem"][aria-label]')];
    if (rows.length > 0) { LOG('Rows found via [role=listitem]:', rows.length); return rows; }

    // New Outlook: conversation list items with data-convid
    rows = [...document.querySelectorAll('[data-convid]')];
    if (rows.length > 0) { LOG('Rows found via [data-convid]:', rows.length); return rows; }

    // Last resort: any element with a long, date-containing aria-label
    rows = [...document.querySelectorAll('[aria-label]')].filter(el => {
      const label = el.getAttribute('aria-label') || '';
      return label.length > 20 && dateFromAriaLabel(label) !== null;
    });
    if (rows.length > 0) { LOG('Rows found via aria-label scan:', rows.length); return rows; }

    LOG('No email rows found. Check DOM structure in DevTools.');
    return [];
  }

  // ── Folder nav badges ────────────────────────────────────────────────────────

  function updateFolderBadges() {
    document.querySelectorAll('[role="treeitem"]').forEach(item => {
      const itemText   = item.textContent || '';
      const folderName = CAMPAIGN_FOLDERS.find(f => itemText.includes(f));
      if (!folderName) return;

      const count = folderCounts[folderName] || 0;
      let badge   = item.querySelector('.ibis-folder-badge');

      if (count === 0) { badge?.remove(); return; }

      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'ibis-folder-badge';
        // Find the text node containing the folder name and inject after its parent element.
        // Uses .includes() — handles emoji-prefixed names like "🔥 6QA".
        const labelEl = findFolderLabel(item, folderName);
        if (labelEl) labelEl.appendChild(badge);
        else item.appendChild(badge);
      }
      badge.textContent = count === 1 ? '1 overdue' : `${count} overdue`;
    });
  }

  function findFolderLabel(treeItem, folderName) {
    const walker = document.createTreeWalker(treeItem, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      // Use .includes() not startsWith() — folder name may have emoji prefix
      if (node.textContent.trim().includes(folderName)) {
        return node.parentElement;
      }
    }
    return null;
  }

  // ── Email row scanning ───────────────────────────────────────────────────────

  function scanEmailRows() {
    const activeFolder = getActiveCampaignFolder();
    if (!activeFolder) return;

    const rows = getEmailRows();
    if (rows.length === 0) return;

    let overdueCount = 0;

    rows.forEach(row => {
      if (row.querySelector('.ibis-row-badges')) return; // already badged this render

      // ── 1. Extract date ──────────────────────────────────────────────────────
      const ariaLabel = row.getAttribute('aria-label') || '';
      let date = dateFromAriaLabel(ariaLabel);

      if (!date) {
        const timeEl = row.querySelector('time');
        if (timeEl) {
          const dt = timeEl.getAttribute('datetime');
          date = dt ? new Date(dt) : parseOutlookDate(timeEl.textContent.trim());
        }
      }

      if (!date) {
        // Scan leaf text nodes for date-like short strings
        const leaves = [...row.querySelectorAll('span, div, td')].filter(
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
      if (days === null) return;

      const isOverdue = days >= OVERDUE_DAYS;
      if (isOverdue) overdueCount++;

      // ── 2. Extract sender email (best-effort) ─────────────────────────────────
      let senderEmail = '';
      for (const el of row.querySelectorAll('[title*="@"], [aria-label*="@"]')) {
        const attr  = el.getAttribute('title') || el.getAttribute('aria-label') || '';
        const match = attr.match(/[\w.+'\-]+@[\w.\-]+\.[a-z]{2,}/i);
        if (match) { senderEmail = match[0].toLowerCase(); break; }
      }

      const contact = senderEmail ? contactMap[senderEmail] : null;
      const domain  = senderEmail ? senderEmail.split('@')[1] : null;

      injectRowBadges(row, days, contact, domain);
    });

    folderCounts[activeFolder] = overdueCount;
    updateFolderBadges();
    LOG(`Scanned ${rows.length} rows in "${activeFolder}": ${overdueCount} overdue`);
  }

  // ── Row badge injection ──────────────────────────────────────────────────────

  function injectRowBadges(row, days, contact, domain) {
    const wrap = document.createElement('span');
    wrap.className = 'ibis-row-badges';

    // Staleness chip
    const dotColor =
      days === 0          ? '#16a34a' :
      days < OVERDUE_DAYS ? '#d97706' :
      days < 8            ? '#dc2626' :
                            '#991b1b';

    const chip = document.createElement('span');
    chip.className = 'ibis-stale-chip';
    chip.title = `Last activity: ${days === 0 ? 'today' : days + (days === 1 ? ' day' : ' days') + ' ago'}`;
    chip.innerHTML =
      `<span class="ibis-dot" style="background:${dotColor}"></span>` +
      `<span class="ibis-days">${days === 0 ? 'today' : days + 'd'}</span>`;
    wrap.appendChild(chip);

    // Company bubble
    const companyName    = contact?.accountName || (domain ? domainToName(domain) : '');
    const effectiveSeed  = domain || companyName;

    if (companyName) {
      const { bg, color, border } = domainToColor(effectiveSeed);
      const bubble = document.createElement('span');
      bubble.className = 'ibis-company-bubble';
      bubble.title     = companyName;
      bubble.style.cssText = `background:${bg};color:${color};border-color:${border}`;

      if (domain) {
        const img     = document.createElement('img');
        img.src       = `https://icons.duckduckgo.com/ip3/${domain}.ico`;
        img.className = 'ibis-co-logo';
        img.onerror   = () => img.style.display = 'none';
        bubble.appendChild(img);
      }

      const nameEl      = document.createElement('span');
      nameEl.className  = 'ibis-co-name';
      nameEl.textContent = companyName.length > 22 ? companyName.slice(0, 20) + '…' : companyName;
      bubble.appendChild(nameEl);
      wrap.appendChild(bubble);
    }

    // ── Injection: find From cell and insert after it ─────────────────────────
    // Strategy 1: table cell — classic OWA layout
    const firstTd = row.querySelector('td');
    if (firstTd) {
      firstTd.appendChild(wrap);
      return;
    }

    // Strategy 2: find the From-name element.
    // It's a short-text leaf node that doesn't look like a date or subject preview.
    // In new Outlook rows the sender name is typically the first short text block.
    const fromEl = findFromElement(row);
    if (fromEl) {
      // Insert wrap as a sibling after the From element's parent container
      const parent = fromEl.parentElement;
      if (parent && parent !== row) {
        parent.insertAdjacentElement('afterend', wrap);
      } else {
        fromEl.insertAdjacentElement('afterend', wrap);
      }
      return;
    }

    // Fallback: prepend to row (always visible, positioning may be off)
    row.prepend(wrap);
  }

  // Find the element most likely to be the sender name within a row.
  function findFromElement(row) {
    const allLeaves = [...row.querySelectorAll('span, div, p')].filter(el => {
      if (el.childElementCount > 0) return false;
      const t = el.textContent.trim();
      return t.length > 1 && t.length < 55;
    });

    for (const el of allLeaves) {
      const t = el.textContent.trim();
      // Skip date-like strings
      if (/^\d{1,2}(:|\/)|^(today|yesterday|mon|tue|wed|thu|fri|sat|sun|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(t)) continue;
      // Skip subject-preview-length text (usually 60+ chars) — we want the short From name
      if (t.length > 55) continue;
      return el;
    }
    return null;
  }

  // ── Utilities ────────────────────────────────────────────────────────────────

  function domainToName(domain) {
    return domain.replace(/^www\./, '').split('.')[0]
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  // Deterministic pastel color from domain/company seed — same input = same color always.
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
    LOG('Overlay v3.1 initialising on', location.hostname);

    loadContactMap();
    setInterval(loadContactMap, 60 * 1000);

    const observer = new MutationObserver(onMutation);
    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      LOG('Running initial scan...');
      updateFolderBadges();
      scanEmailRows();
    }, 1500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 500);
  }

})();
