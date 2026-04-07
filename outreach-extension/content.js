// =============================================================================
// IBISWorld Outreach — DOM Overlay v3.3
// =============================================================================
// Feature A — Folder badge: colored count pill on campaign folder nav items.
//             Orange when overdue threads exist, grey "0" when clear.
// Feature B — Row badges: vibrant staleness dot + days + thread count + company bubble.
//
// Debug: F12 → Console → filter "[IBISWorld]" to see what the overlay finds.
// =============================================================================

(function () {
  'use strict';

  // ── Config ───────────────────────────────────────────────────────────────────

  const OVERDUE_DAYS = 3;
  const DEBOUNCE_MS  = 300;
  const OWN_DOMAIN   = 'ibisworld.com';

  const CAMPAIGN_FOLDERS = [
    'Workables', '6QA', 'Churns', 'Multithread', 'Winback', 'Old Samples', 'Net New',
  ];

  const LOG = (...a) => console.log('[IBISWorld]', ...a);

  // ── State ────────────────────────────────────────────────────────────────────

  let contactMap    = {};   // email → { accountName, domain, name }
  let folderCounts  = {};   // folderName → overdueCount (null = not scanned yet)
  let debounceTimer = null;

  function ctxOk() {
    try { return !!chrome.runtime.id; } catch (_) { return false; }
  }

  // ── Contact map (from bridge.js) ──────────────────────────────────────────────

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
            name:        c.name || '',
          };
        });
        LOG('Contact map:', Object.keys(contactMap).length, 'contacts');
      } catch (_) {}
    });
  }

  // ── Date parsing ──────────────────────────────────────────────────────────────

  const MONTHS_LONG  = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const DAYS_LONG    = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const DAYS_SHORT   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  function parseOutlookDate(str) {
    if (!str) return null;
    str = str.trim();
    const now = new Date();
    if (/\d{1,2}:\d{2}\s*(am|pm)/i.test(str) || /^\d{1,2}:\d{2}$/.test(str)) return new Date(now);
    if (/^today/i.test(str))     return new Date(now);
    if (/^yesterday/i.test(str)) { const d = new Date(now); d.setDate(d.getDate() - 1); return d; }
    for (let i = 0; i < 7; i++) {
      if (str.startsWith(DAYS_LONG[i]) || str.startsWith(DAYS_SHORT[i])) {
        const d = new Date(now);
        d.setDate(d.getDate() - ((now.getDay() - i + 7) % 7 || 7));
        return d;
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
      if (m) { const d = parseOutlookDate(m[0]); if (d) return d; }
    }
    return null;
  }

  // ── Thread count extraction ───────────────────────────────────────────────────
  // Outlook sometimes shows "(3)" or "3 messages" in the row.

  function getThreadCount(row) {
    const ariaLabel = row.getAttribute('aria-label') || '';
    // "5 messages" / "3 items"
    const m = ariaLabel.match(/(\d+)\s+(?:messages?|items?|conversations?)/i);
    if (m) return parseInt(m[1]);
    // Subject may have "(3)" suffix
    const subj = ariaLabel.match(/\((\d{1,2})\)/);
    if (subj) return parseInt(subj[1]);
    // Small standalone number span — likely the thread count indicator
    const nums = [...row.querySelectorAll('span')].filter(el => {
      if (el.childElementCount > 0) return false;
      const t = el.textContent.trim();
      return /^\d{1,2}$/.test(t) && parseInt(t) >= 2;
    });
    if (nums.length > 0) return parseInt(nums[0].textContent.trim());
    return null;
  }

  // ── Contact lookup — handles OUTGOING emails ──────────────────────────────────
  // For emails sent by Dan (sender = ibisworld.com), we scan the entire row
  // for any non-ibisworld email address to find the recipient.

  function findContactForRow(row) {
    // 1. Scan elements with likely email attributes (not every element — too slow)
    const checkAttrs = ['title', 'aria-label', 'data-email', 'href', 'data-address'];
    for (const el of [row, ...row.querySelectorAll('[title*="@"],[aria-label*="@"],[data-email],[href*="mailto"]')]) {
      for (const attr of checkAttrs) {
        const val = el.getAttribute(attr);
        if (!val || !val.includes('@')) continue;
        const emails = val.match(/[\w.+'\\-]+@[\w.\\-]+\.[a-z]{2,}/gi);
        if (!emails) continue;
        for (const email of emails) {
          const em = email.toLowerCase();
          if (em.endsWith(OWN_DOMAIN) || em.endsWith('.' + OWN_DOMAIN)) continue;
          return { email: em, contact: contactMap[em] || null, domain: em.split('@')[1] };
        }
      }
    }

    // 2. "To: Name" pattern in aria-label — match contact by name
    const ariaLabel = row.getAttribute('aria-label') || '';
    const toMatch = ariaLabel.match(/^To:\s*([^,.\n]+)/i) || ariaLabel.match(/To:\s*([^,.\n]+)/i);
    if (toMatch) {
      const recipientName = toMatch[1].trim().toLowerCase();
      for (const [email, c] of Object.entries(contactMap)) {
        if (c.name && c.name.toLowerCase() === recipientName) {
          return { email, contact: c, domain: email.split('@')[1] };
        }
      }
    }

    return null;
  }

  // ── Active folder detection ───────────────────────────────────────────────────

  function getActiveCampaignFolder() {
    // Primary: page title contains folder name ("6QA - Daniel Starr - Outlook")
    const fromTitle = CAMPAIGN_FOLDERS.find(f => document.title.includes(f));
    if (fromTitle) return fromTitle;
    // Fallback: heading elements
    for (const el of document.querySelectorAll('[role="heading"], h1, h2, h3')) {
      const match = CAMPAIGN_FOLDERS.find(f => el.textContent.includes(f));
      if (match) return match;
    }
    // Fallback: selected treeitem
    for (const item of document.querySelectorAll('[role="treeitem"]')) {
      const isActive = item.getAttribute('aria-selected') === 'true' ||
                       item.getAttribute('aria-current') === 'true'  ||
                       item.getAttribute('aria-current') === 'page';
      if (!isActive) continue;
      const match = CAMPAIGN_FOLDERS.find(f => item.textContent.includes(f));
      if (match) return match;
    }
    return null;
  }

  // ── Email row detection ───────────────────────────────────────────────────────

  function getEmailRows() {
    let rows = [...document.querySelectorAll('[role="option"]')];
    if (rows.length > 0) return rows;
    rows = [...document.querySelectorAll('[role="listitem"][aria-label]')];
    if (rows.length > 0) return rows;
    return [...document.querySelectorAll('[data-convid]')];
  }

  // ── Folder nav badges ─────────────────────────────────────────────────────────
  // Called on EVERY mutation (no debounce) so badges survive Outlook's re-renders.

  function updateFolderBadges() {
    document.querySelectorAll('[role="treeitem"]').forEach(item => {
      const folderName = CAMPAIGN_FOLDERS.find(f => item.textContent.includes(f));
      if (!folderName) return;

      const count = folderCounts[folderName];
      if (count === undefined) return; // not yet scanned — don't show anything

      let badge = item.querySelector('.ibis-folder-badge');

      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'ibis-folder-badge';

        // Force the treeitem + its ancestors to not clip our badge
        item.style.setProperty('position', 'relative', 'important');
        let node = item;
        for (let i = 0; i < 5; i++) {
          if (!node) break;
          node.style.setProperty('overflow', 'visible', 'important');
          node = node.parentElement;
        }

        applyFolderBadgeStyle(badge, count > 0);
        item.appendChild(badge);
      } else {
        // Update color if overdue state changed
        applyFolderBadgeStyle(badge, count > 0);
      }

      badge.textContent = String(count);
    });
  }

  function applyFolderBadgeStyle(el, isOverdue) {
    const bg = isOverdue ? '#f97316' : '#9ca3af';
    const s  = el.style;
    s.setProperty('display',         'inline-flex',      'important');
    s.setProperty('align-items',     'center',           'important');
    s.setProperty('justify-content', 'center',           'important');
    s.setProperty('position',        'absolute',         'important');
    s.setProperty('right',           '6px',              'important');
    s.setProperty('top',             '50%',              'important');
    s.setProperty('transform',       'translateY(-50%)', 'important');
    s.setProperty('background',      bg,                 'important');
    s.setProperty('color',           '#ffffff',          'important');
    s.setProperty('font-size',       '10px',             'important');
    s.setProperty('font-weight',     '700',              'important');
    s.setProperty('font-family',     'monospace',        'important');
    s.setProperty('padding',         '1px 5px',          'important');
    s.setProperty('min-width',       '16px',             'important');
    s.setProperty('border-radius',   '999px',            'important');
    s.setProperty('white-space',     'nowrap',           'important');
    s.setProperty('z-index',         '9999',             'important');
    s.setProperty('pointer-events',  'none',             'important');
    s.setProperty('line-height',     '16px',             'important');
  }

  // ── Email row scanning ────────────────────────────────────────────────────────

  function scanEmailRows() {
    const activeFolder = getActiveCampaignFolder();
    if (!activeFolder) { LOG('No active campaign folder. Title:', document.title); return; }

    const rows = getEmailRows();
    if (!rows.length) { LOG('No email rows found.'); return; }

    let overdueCount = 0;

    rows.forEach(row => {
      if (row.querySelector('.ibis-row-badges')) return; // already processed

      // ── Date extraction ──
      let date = dateFromAriaLabel(row.getAttribute('aria-label') || '');
      if (!date) {
        const timeEl = row.querySelector('time');
        if (timeEl) {
          date = new Date(timeEl.getAttribute('datetime') || '');
          if (isNaN(date.getTime())) date = parseOutlookDate(timeEl.textContent.trim());
        }
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

      const contactInfo = findContactForRow(row);
      const threadCount = getThreadCount(row);

      injectRowBadges(row, days, contactInfo, threadCount);
    });

    folderCounts[activeFolder] = overdueCount;
    updateFolderBadges();
    LOG(`"${activeFolder}": ${rows.length} rows, ${overdueCount} overdue`);
  }

  // ── Row badge injection ───────────────────────────────────────────────────────

  function injectRowBadges(row, days, contactInfo, threadCount) {
    const wrap = document.createElement('span');
    wrap.className = 'ibis-row-badges';
    iProp(wrap, 'display',         'inline-flex');
    iProp(wrap, 'align-items',     'center');
    iProp(wrap, 'gap',             '4px');
    iProp(wrap, 'vertical-align',  'middle');
    iProp(wrap, 'flex-shrink',     '0');
    iProp(wrap, 'white-space',     'nowrap');
    iProp(wrap, 'pointer-events',  'none');
    iProp(wrap, 'margin',          '0 8px');

    // ── Staleness chip ──
    const dotColor =
      days === 0          ? '#16a34a' :  // today  — green
      days < OVERDUE_DAYS ? '#d97706' :  // 1-2d   — amber
      days < 8            ? '#ea580c' :  // 3-7d   — orange
      days < 14           ? '#dc2626' :  // 8-13d  — red
                            '#9f1239';   // 14d+   — crimson

    const glowColor =
      days === 0          ? 'rgba(22,163,74,0.5)'   :
      days < OVERDUE_DAYS ? 'rgba(217,119,6,0.5)'   :
      days < 8            ? 'rgba(234,88,12,0.5)'   :
      days < 14           ? 'rgba(220,38,38,0.5)'   :
                            'rgba(159,18,57,0.5)';

    const dayLabel = days === 0 ? 'today' : days + 'd';

    const chip = document.createElement('span');
    chip.title = `Last email in this folder: ${days === 0 ? 'today' : days + (days === 1 ? ' day' : ' days') + ' ago'}`;
    iProp(chip, 'display',       'inline-flex');
    iProp(chip, 'align-items',   'center');
    iProp(chip, 'gap',           '4px');
    iProp(chip, 'background',    '#ffffff');
    iProp(chip, 'border',        '1px solid #e5e7eb');
    iProp(chip, 'border-radius', '999px');
    iProp(chip, 'padding',       '1px 7px 1px 5px');
    iProp(chip, 'white-space',   'nowrap');
    iProp(chip, 'line-height',   '18px');
    iProp(chip, 'cursor',        'default');

    chip.innerHTML =
      `<span style="width:8px;height:8px;border-radius:50%;background:${dotColor};` +
      `box-shadow:0 0 5px 2px ${glowColor};flex-shrink:0;display:inline-block"></span>` +
      `<span style="font-family:monospace;font-size:10px;font-weight:700;color:#374151">${dayLabel}</span>`;
    wrap.appendChild(chip);

    // ── Thread count chip ──
    if (threadCount && threadCount >= 2) {
      const tc = document.createElement('span');
      tc.title = `${threadCount} messages in thread`;
      iProp(tc, 'display',       'inline-flex');
      iProp(tc, 'align-items',   'center');
      iProp(tc, 'background',    '#eff6ff');
      iProp(tc, 'border',        '1px solid #bfdbfe');
      iProp(tc, 'border-radius', '999px');
      iProp(tc, 'padding',       '1px 6px');
      iProp(tc, 'white-space',   'nowrap');
      iProp(tc, 'line-height',   '18px');
      iProp(tc, 'font-family',   'monospace');
      iProp(tc, 'font-size',     '10px');
      iProp(tc, 'font-weight',   '600');
      iProp(tc, 'color',         '#2563eb');
      tc.textContent = `✉ ${threadCount}`;
      wrap.appendChild(tc);
    }

    // ── Company bubble ──
    if (contactInfo) {
      const { contact, domain } = contactInfo;
      const companyName = contact?.accountName || domainToName(domain);
      if (companyName) {
        const { bg, color, border } = domainToColor(domain || companyName);
        const bubble = document.createElement('span');
        bubble.title = companyName;
        iProp(bubble, 'display',       'inline-flex');
        iProp(bubble, 'align-items',   'center');
        iProp(bubble, 'gap',           '4px');
        iProp(bubble, 'background',    bg);
        iProp(bubble, 'color',         color);
        iProp(bubble, 'border',        `1px solid ${border}`);
        iProp(bubble, 'border-radius', '999px');
        iProp(bubble, 'padding',       '1px 8px 1px 4px');
        iProp(bubble, 'white-space',   'nowrap');
        iProp(bubble, 'max-width',     '150px');
        iProp(bubble, 'overflow',      'hidden');
        iProp(bubble, 'line-height',   '18px');
        iProp(bubble, 'font-size',     '10px');
        iProp(bubble, 'font-weight',   '500');
        iProp(bubble, 'font-family',   'sans-serif');

        if (domain) {
          const img = document.createElement('img');
          img.src = `https://icons.duckduckgo.com/ip3/${domain}.ico`;
          img.style.cssText = 'width:12px;height:12px;border-radius:2px;flex-shrink:0;object-fit:contain';
          img.onerror = () => { img.style.display = 'none'; };
          bubble.appendChild(img);
        }

        const nameEl = document.createElement('span');
        nameEl.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0';
        nameEl.textContent = companyName.length > 22 ? companyName.slice(0, 20) + '…' : companyName;
        bubble.appendChild(nameEl);
        wrap.appendChild(bubble);
      }
    }

    // ── Inject badge wrap after the sender name element ───────────────────────
    // Strategy: find the leaf span containing the sender name, then insert
    // our wrap right after it. Force overflow:visible on ancestor chain so
    // Outlook's clipping containers don't hide the badge.

    const fromEl = findFromElement(row);
    if (fromEl) {
      // Unlock overflow on every ancestor up to the row
      let node = fromEl.parentElement;
      while (node && node !== row) {
        node.style.setProperty('overflow', 'visible', 'important');
        node = node.parentElement;
      }
      row.style.setProperty('overflow', 'visible', 'important');
      fromEl.insertAdjacentElement('afterend', wrap);
      return;
    }

    // Fallback: absolute-position badge near the left side of the row
    // (better than appending to row end which goes bottom-left)
    row.style.setProperty('position', 'relative', 'important');
    row.style.setProperty('overflow', 'visible', 'important');
    iProp(wrap, 'position',  'absolute');
    iProp(wrap, 'top',       '50%');
    iProp(wrap, 'left',      '220px');
    iProp(wrap, 'transform', 'translateY(-50%)');
    iProp(wrap, 'z-index',   '100');
    row.appendChild(wrap);
  }

  // ── Sender name detection ─────────────────────────────────────────────────────
  // Find the leaf node that contains the sender/recipient name.
  // Rules:
  //  - Must be a leaf (no child elements)
  //  - 4–55 chars (excludes avatar initials like "DS" and long subjects)
  //  - Not all-uppercase abbreviation
  //  - Not a date string

  function findFromElement(row) {
    const leaves = [...row.querySelectorAll('span, div, p')].filter(el => {
      if (el.childElementCount > 0) return false;
      const t = el.textContent.trim();
      return t.length >= 4 && t.length <= 55 && !/^[A-Z]{2,4}$/.test(t);
    });
    for (const el of leaves) {
      const t = el.textContent.trim();
      if (/^\d{1,2}(:|\/)|^(today|yesterday|mon|tue|wed|thu|fri|sat|sun|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(t)) continue;
      return el;
    }
    return null;
  }

  // ── Inline style helper ───────────────────────────────────────────────────────
  // All row badge styles use !important to beat Outlook's high-specificity rules.

  function iProp(el, prop, val) {
    el.style.setProperty(prop, val, 'important');
  }

  // ── Utilities ─────────────────────────────────────────────────────────────────

  function domainToName(domain) {
    if (!domain) return '';
    return domain.replace(/^www\./, '').split('.')[0]
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  function domainToColor(seed) {
    let h = 5381;
    for (let i = 0; i < (seed || '').length; i++) h = ((h << 5) + h) ^ seed.charCodeAt(i);
    const hue = Math.abs(h) % 360;
    return {
      bg:     `hsl(${hue},60%,93%)`,
      color:  `hsl(${hue},55%,28%)`,
      border: `hsl(${hue},50%,78%)`,
    };
  }

  // ── MutationObserver ──────────────────────────────────────────────────────────
  // IMPORTANT: do NOT call updateFolderBadges() directly in onMutation.
  // Setting styles on DOM elements triggers further mutations → infinite loop → freeze.
  // Instead, debounce everything and use a heartbeat interval for badge persistence.

  function onMutation() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      updateFolderBadges();
      scanEmailRows();
    }, DEBOUNCE_MS);
  }

  // ── Init ──────────────────────────────────────────────────────────────────────

  function init() {
    if (!ctxOk()) return;
    LOG('v3.3 init on', location.hostname);
    loadContactMap();
    setInterval(loadContactMap, 60_000);
    // Heartbeat: re-inject folder badges every 600ms in case Outlook re-renders the nav.
    // This keeps badges alive without causing mutation feedback loops.
    setInterval(updateFolderBadges, 600);
    new MutationObserver(onMutation).observe(document.body, { childList: true, subtree: true });
    setTimeout(() => {
      LOG('Initial scan — title:', document.title);
      scanEmailRows();
    }, 1500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else setTimeout(init, 500);

})();
