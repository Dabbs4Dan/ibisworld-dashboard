// =============================================================================
// ARCHIVED CONTENT SCRIPT — v2 (sidebar + priority engine + Graph/OWA API)
// Tabled in v3. Full implementation preserved in git history (commit 9487fe9).
// =============================================================================

// =============================================================================
// IBISWorld Outreach — DOM Overlay v3.2
// =============================================================================
// Feature A — Folder badge: orange "N overdue" pill on campaign folder nav items.
// Feature B — Row badges: staleness dot+days chip + company bubble per email row.
//
// Debug: F12 → Console → filter "[IBISWorld]" to see what the overlay finds.
// =============================================================================

(function () {
  'use strict';

  // ── Config ──────────────────────────────────────────────────────────────────

  const OVERDUE_DAYS = 3;
  const DEBOUNCE_MS  = 350;

  // Dan's own domain — skip company bubble when sender is internal
  const OWN_DOMAIN   = 'ibisworld.com';

  const CAMPAIGN_FOLDERS = [
    'Workables', '6QA', 'Churns', 'Multithread', 'Winback', 'Old Samples', 'Net New',
  ];

  const LOG = (...a) => console.log('[IBISWorld]', ...a);

  // ── State ───────────────────────────────────────────────────────────────────

  let contactMap    = {};
  let folderCounts  = {};
  let debounceTimer = null;

  function ctxOk() {
    try { return !!chrome.runtime.id; } catch (_) { return false; }
  }

  // ── Contact map (from bridge.js) ─────────────────────────────────────────────

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
        LOG('Contact map:', Object.keys(contactMap).length, 'contacts');
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
    if (/^yesterday/i.test(str)) { const d = new Date(now); d.setDate(d.getDate() - 1); return d; }
    for (let i = 0; i < 7; i++) {
      if (str.startsWith(DAYS_LONG[i]) || str.startsWith(DAYS_SHORT[i])) {
        const d = new Date(now); d.setDate(d.getDate() - ((now.getDay() - i + 7) % 7 || 7)); return d;
      }
    }
    for (let mi = 0; mi < 12; mi++) {
      if (str.startsWith(MONTHS_LONG[mi]) || str.startsWith(MONTHS_SHORT[mi])) {
        const d = new Date(str);
        if (!isNaN(d.getTime())) {
          if (!/\b20\d\d\b/.test(str)) { d.setFullYear(now.getFullYear()); if (d > now) d.setFullYear(now.getFullYear() - 1); }
          return d;
        }
      }
    }
    // Numeric: "4/7/2026", "3/30/2026"
    const num = str.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
    if (num) {
      const y = num[3] ? parseInt(num[3]) : now.getFullYear();
      const d = new Date(y < 100 ? 2000 + y : y, parseInt(num[1]) - 1, parseInt(num[2]));
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  }

  function daysSince(date) {
    if (!date || isNaN(date.getTime())) return null;
    return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
  }

  function dateFromAriaLabel(label) {
    if (!label) return null;
    const patterns = [
      /\d{1,2}:\d{2}\s*(AM|PM)/i, /\bToday\b/i, /\bYesterday\b/i,
      /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/i,
      /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:,\s*\d{4})?\b/i,
      /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}(?:,\s*\d{4})?\b/i,
      /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/,
    ];
    for (const p of patterns) {
      const m = label.match(p);
      if (m) { const d = parseOutlookDate(m[0]); if (d) return d; }
    }
    return null;
  }

  // ── Active folder detection ──────────────────────────────────────────────────

  function getActiveCampaignFolder() {
    // Primary: tab title = "6QA - Daniel Starr - Outlook" (no emoji, reliable)
    const fromTitle = CAMPAIGN_FOLDERS.find(f => document.title.includes(f));
    if (fromTitle) return fromTitle;
    // Fallback: any visible heading
    for (const el of document.querySelectorAll('[role="heading"], h1, h2, h3')) {
      const match = CAMPAIGN_FOLDERS.find(f => el.textContent.includes(f));
      if (match) return match;
    }
    // Fallback: selected treeitem
    for (const item of document.querySelectorAll('[role="treeitem"]')) {
      const isActive = item.getAttribute('aria-selected') === 'true' || item.getAttribute('aria-current') === 'true' || item.getAttribute('aria-current') === 'page';
      if (!isActive) continue;
      const match = CAMPAIGN_FOLDERS.find(f => item.textContent.includes(f));
      if (match) return match;
    }
    return null;
  }

  // ── Get email rows ────────────────────────────────────────────────────────────

  function getEmailRows() {
    let rows = [...document.querySelectorAll('[role="option"]')];
    if (rows.length > 0) return rows;
    rows = [...document.querySelectorAll('[role="listitem"][aria-label]')];
    if (rows.length > 0) return rows;
    rows = [...document.querySelectorAll('[data-convid]')];
    return rows;
  }

  // ── Folder nav badges ────────────────────────────────────────────────────────
  // All CSS applied inline with setProperty('important') to beat Outlook's specificity.
  // Badge is position:absolute within the treeitem so it doesn't break text truncation.

  function updateFolderBadges() {
    document.querySelectorAll('[role="treeitem"]').forEach(item => {
      const folderName = CAMPAIGN_FOLDERS.find(f => item.textContent.includes(f));
      if (!folderName) return;

      const count = folderCounts[folderName] || 0;
      let badge   = item.querySelector('.ibis-folder-badge');

      if (count === 0) { badge?.remove(); return; }

      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'ibis-folder-badge';

        // Force the treeitem to be position:relative and overflow:visible so our
        // absolute-positioned badge isn't clipped by Outlook's fixed-width nav column.
        item.style.setProperty('position', 'relative', 'important');
        item.style.setProperty('overflow', 'visible', 'important');

        // Walk up and also force overflow visible on the parent nav container
        const nav = item.parentElement;
        if (nav) nav.style.setProperty('overflow', 'visible', 'important');

        // All badge styles inline — don't rely on overlay.css being applied
        applyBadgeStyle(badge);
        item.appendChild(badge);
      }

      badge.textContent = count === 1 ? '1 overdue' : `${count} overdue`;
    });
  }

  function applyBadgeStyle(el) {
    const s = el.style;
    s.setProperty('display',          'inline-flex',     'important');
    s.setProperty('align-items',      'center',          'important');
    s.setProperty('position',         'absolute',        'important');
    s.setProperty('right',            '4px',             'important');
    s.setProperty('top',              '50%',             'important');
    s.setProperty('transform',        'translateY(-50%)', 'important');
    s.setProperty('background',       '#f97316',         'important');
    s.setProperty('color',            '#ffffff',         'important');
    s.setProperty('font-size',        '10px',            'important');
    s.setProperty('font-weight',      '700',             'important');
    s.setProperty('font-family',      'monospace',       'important');
    s.setProperty('padding',          '1px 6px',         'important');
    s.setProperty('border-radius',    '999px',           'important');
    s.setProperty('white-space',      'nowrap',          'important');
    s.setProperty('z-index',          '9999',            'important');
    s.setProperty('pointer-events',   'none',            'important');
    s.setProperty('line-height',      '16px',            'important');
  }

  // ── Email row scanning ───────────────────────────────────────────────────────

  function scanEmailRows() {
    const activeFolder = getActiveCampaignFolder();
    if (!activeFolder) { LOG('No active campaign folder detected. Title:', document.title); return; }

    const rows = getEmailRows();
    if (!rows.length) { LOG('No email rows found.'); return; }

    let overdueCount = 0;

    rows.forEach(row => {
      if (row.querySelector('.ibis-row-badges')) return;

      // ── Date extraction ──
      let date = dateFromAriaLabel(row.getAttribute('aria-label') || '');
      if (!date) {
        const timeEl = row.querySelector('time');
        if (timeEl) date = new Date(timeEl.getAttribute('datetime') || '') || parseOutlookDate(timeEl.textContent.trim());
      }
      if (!date) {
        for (const el of [...row.querySelectorAll('span, div')].filter(e => e.childElementCount === 0)) {
          const t = el.textContent.trim();
          if (t.length > 0 && t.length < 25) { date = parseOutlookDate(t); if (date) break; }
        }
      }

      const days = daysSince(date);
      if (days === null) return;
      if (days >= OVERDUE_DAYS) overdueCount++;

      // ── Sender email extraction ──
      let senderEmail = '';
      for (const el of row.querySelectorAll('[title*="@"], [aria-label*="@"]')) {
        const m = (el.getAttribute('title') || el.getAttribute('aria-label') || '').match(/[\w.+'\-]+@[\w.\-]+\.[a-z]{2,}/i);
        if (m) { senderEmail = m[0].toLowerCase(); break; }
      }
      const contact = senderEmail ? contactMap[senderEmail] : null;
      const domain  = senderEmail ? senderEmail.split('@')[1] : null;

      injectRowBadges(row, days, contact, domain);
    });

    folderCounts[activeFolder] = overdueCount;
    updateFolderBadges();
    LOG(`"${activeFolder}": ${rows.length} rows scanned, ${overdueCount} overdue`);
  }

  // ── Row badge injection ──────────────────────────────────────────────────────

  function injectRowBadges(row, days, contact, domain) {
    const wrap = document.createElement('span');
    wrap.className = 'ibis-row-badges';
    applyWrapStyle(wrap);

    // ── Staleness chip ──────────────────────────────────────────────────────
    const dotColor =
      days === 0          ? '#16a34a' :
      days < OVERDUE_DAYS ? '#d97706' :
      days < 8            ? '#dc2626' :
                            '#991b1b';

    const chip = document.createElement('span');
    applyChipStyle(chip, dotColor);
    chip.title = `Last activity: ${days === 0 ? 'today' : days + (days === 1 ? ' day' : ' days') + ' ago'}`;
    chip.innerHTML =
      `<span style="width:7px;height:7px;border-radius:50%;background:${dotColor};flex-shrink:0;display:inline-block;margin-right:3px"></span>` +
      `<span style="font-family:monospace;font-size:10px;font-weight:700;color:#374151">${days === 0 ? 'today' : days + 'd'}</span>`;
    wrap.appendChild(chip);

    // ── Company bubble ──────────────────────────────────────────────────────
    // Skip if sender is from Dan's own domain (outgoing email, no contact info to show)
    const skipBubble = !domain || domain === OWN_DOMAIN || domain.endsWith('.' + OWN_DOMAIN);
    const companyName = !skipBubble ? (contact?.accountName || domainToName(domain)) : '';

    if (companyName) {
      const { bg, color, border } = domainToColor(domain || companyName);
      const bubble = document.createElement('span');
      applyBubbleStyle(bubble, bg, color, border);
      bubble.title = companyName;

      const img = document.createElement('img');
      img.src = `https://icons.duckduckgo.com/ip3/${domain}.ico`;
      img.style.cssText = 'width:12px;height:12px;border-radius:2px;flex-shrink:0;object-fit:contain;margin-right:4px';
      img.onerror = () => img.style.display = 'none';
      bubble.appendChild(img);

      const nameEl = document.createElement('span');
      nameEl.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:120px;display:inline-block';
      nameEl.textContent = companyName.length > 22 ? companyName.slice(0, 20) + '…' : companyName;
      bubble.appendChild(nameEl);
      wrap.appendChild(bubble);
    }

    // ── Inject between From and Subject ─────────────────────────────────────
    // Strategy: find the direct-row-child container holding the sender name,
    // insert our wrap immediately after it so it sits between From and Subject.
    // Key fix: findFromElement now SKIPS avatar initials (e.g. "DS", "AM").

    const fromEl = findFromElement(row);
    if (fromEl) {
      // Walk up to find the direct child of the row (the From column container)
      const fromColumn = walkUpToRowChild(row, fromEl);
      if (fromColumn) {
        fromColumn.insertAdjacentElement('afterend', wrap);
        return;
      }
      fromEl.insertAdjacentElement('afterend', wrap);
      return;
    }

    // Fallback: prepend to the subject area (longest text block in the row)
    const subjectEl = findSubjectContainer(row);
    if (subjectEl) { subjectEl.prepend(wrap); return; }

    row.appendChild(wrap);
  }

  // Walk from el up to its ancestor that is a direct child of `row`.
  function walkUpToRowChild(row, el) {
    let node = el;
    while (node && node.parentElement && node.parentElement !== row) {
      node = node.parentElement;
    }
    return (node && node.parentElement === row) ? node : null;
  }

  // Find the element most likely to be the sender name.
  // FIX v3.2: excludes avatar initials (2-3 uppercase chars like "DS", "AM", "ZR").
  function findFromElement(row) {
    const leaves = [...row.querySelectorAll('span, div, p')].filter(el => {
      if (el.childElementCount > 0) return false;
      const t = el.textContent.trim();
      // Requirements for a sender name:
      // - At least 4 chars (rules out "DS", "AM", "ZR" avatar initials)
      // - Not a pure uppercase abbreviation (rules out "DS", "IBW", etc.)
      // - Not date-like
      // - Not too long (not the subject preview)
      return t.length >= 4 && t.length <= 55 &&
             !/^[A-Z]{2,4}$/.test(t);
    });

    for (const el of leaves) {
      const t = el.textContent.trim();
      if (/^\d{1,2}(:|\/)|^(today|yesterday|mon|tue|wed|thu|fri|sat|sun|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(t)) continue;
      return el;
    }
    return null;
  }

  // Find the subject text container — used as fallback injection point.
  function findSubjectContainer(row) {
    const leaves = [...row.querySelectorAll('span, div')].filter(e =>
      e.childElementCount === 0 && e.textContent.trim().length > 10
    );
    leaves.sort((a, b) => b.textContent.length - a.textContent.length);
    if (!leaves.length) return null;
    return leaves[0].parentElement || leaves[0];
  }

  // ── Inline styles (not relying on overlay.css to beat Outlook specificity) ──

  function applyWrapStyle(el) {
    el.style.cssText = [
      'display:inline-flex', 'align-items:center', 'gap:4px',
      'vertical-align:middle', 'flex-shrink:0', 'white-space:nowrap',
      'margin:0 6px', 'pointer-events:none',
    ].join(';');
  }

  function applyChipStyle(el) {
    el.style.cssText = [
      'display:inline-flex', 'align-items:center',
      'background:#f9fafb', 'border:1px solid #e5e7eb',
      'border-radius:999px', 'padding:1px 7px 1px 5px',
      'white-space:nowrap', 'line-height:18px', 'cursor:default',
    ].join(';');
  }

  function applyBubbleStyle(el, bg, color, border) {
    el.style.cssText = [
      'display:inline-flex', 'align-items:center',
      `background:${bg}`, `color:${color}`, `border:1px solid ${border}`,
      'border-radius:999px', 'padding:1px 7px 1px 5px',
      'white-space:nowrap', 'max-width:150px',
      'overflow:hidden', 'line-height:18px',
      'font-size:10px', 'font-weight:500',
    ].join(';');
  }

  // ── Utilities ────────────────────────────────────────────────────────────────

  function domainToName(domain) {
    return domain.replace(/^www\./, '').split('.')[0]
      .replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  function domainToColor(seed) {
    let h = 5381;
    for (let i = 0; i < (seed || '').length; i++) h = ((h << 5) + h) ^ seed.charCodeAt(i);
    const hue = Math.abs(h) % 360;
    return { bg: `hsl(${hue},55%,93%)`, color: `hsl(${hue},50%,30%)`, border: `hsl(${hue},45%,78%)` };
  }

  // ── MutationObserver ─────────────────────────────────────────────────────────

  function onMutation() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => { updateFolderBadges(); scanEmailRows(); }, DEBOUNCE_MS);
  }

  // ── Init ─────────────────────────────────────────────────────────────────────

  function init() {
    if (!ctxOk()) return;
    LOG('v3.2 init on', location.hostname);
    loadContactMap();
    setInterval(loadContactMap, 60000);
    new MutationObserver(onMutation).observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { LOG('Initial scan, title:', document.title); updateFolderBadges(); scanEmailRows(); }, 1500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else setTimeout(init, 500);

})();
