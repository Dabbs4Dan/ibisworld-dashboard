// =============================================================================
// IBISWorld Outreach — DOM Overlay v3.5
// =============================================================================
// Feature A — Folder badge: orange count on campaign folders, grey "0" when clear.
// Feature B — Row badges: staleness dot + days + company bubble (from greeting).
// Feature C — Email cache: fetches contact_activity.json from OneDrive (written
//             by the PA flow every 2h) to get real last-sent dates instead of
//             Outlook DOM dates (which show last received, not last sent).
//
// Debug: F12 → Console → filter "[IBISWorld]"
// =============================================================================

(function () {
  'use strict';

  const OVERDUE_DAYS = 3;
  const DEBOUNCE_MS  = 700;
  const OWN_DOMAIN   = 'ibisworld.com';

  // Paste the OneDrive share URL for contact_activity.json here after PA flow
  // creates the file. See setup instructions in the repo.
  const CONTACT_ACTIVITY_URL = 'https://ibisworld-my.sharepoint.com/:u:/p/daniel_starr/IQAgzsMLkpwARZTTD2uMrM6MARtiLz5aePFycFYpNu1AKQ4?e=KtJvva&download=1';

  const CAMPAIGN_FOLDERS = [
    'Workables', '6QA', 'Churns', 'Multithread', 'Winback', 'Old Samples', 'Net New',
  ];

  const LOG = (...a) => console.log('[IBISWorld]', ...a);

  let contactMap       = {};
  let folderCounts     = {};
  let debounceTimer    = null;
  let scanning         = false; // re-entry guard — prevents mutation feedback loops
  let emailCache       = {};    // email (lowercase) → ISO date string (last PA-confirmed sent)
  let emailCacheLoaded = false; // true once cache has been successfully populated

  function ctxOk() {
    try { return !!chrome.runtime.id; } catch (_) { return false; }
  }

  // ── Contact map ───────────────────────────────────────────────────────────────

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

  // ── Email activity cache (PA flow data) ──────────────────────────────────────
  // PA flow writes contact_activity.json: [{to, date}, ...] sorted newest-first.
  // We build a map: email → most-recent-sent-date (ISO string).
  // On first successful load, we clear all processed row markers so badges get
  // re-injected using real sent dates instead of the Outlook DOM dates.

  function loadEmailCache() {
    if (!CONTACT_ACTIVITY_URL || !ctxOk()) return;
    // Route through background service worker to bypass CORS restrictions
    chrome.runtime.sendMessage({ type: 'FETCH_URL', url: CONTACT_ACTIVITY_URL }, (res) => {
      if (!res || !res.ok) {
        LOG('Email cache fetch failed:', res?.error || 'no response');
        return;
      }
      processEmailCache(res.data);
    });
  }

  function processEmailCache(data) {
    if (!Array.isArray(data)) return;
    // Debug: log first item's from/toRecipients shape to confirm field format
    if (data.length > 0) {
      const s = data[0];
      LOG('Cache item shape — from:', JSON.stringify(s.from), '| toRecipients[0]:', JSON.stringify((s.toRecipients||[])[0]), '| date field:', s.receivedDateTime || s.sentDateTime || s.date);
    }
    const map = {};
    data.forEach(item => {
      // Handle both plain-string and Graph object format for from/toRecipients
      const fromObj = item.from;
      const fromEmail = (
        typeof fromObj === 'string' ? fromObj :
        (fromObj?.emailAddress?.address || fromObj?.address || '')
      ).toLowerCase().trim();
      // Only count emails Dan sent (outgoing = from ibisworld.com)
      if (!fromEmail.endsWith('@' + OWN_DOMAIN)) return;
      const dt = item.receivedDateTime || item.sentDateTime || item.date;
      if (!dt) return;
      // toRecipients may be a plain email string or an array — handle both
      const toField = item.toRecipients;
      const recipients = Array.isArray(toField) ? toField : (typeof toField === 'string' ? [toField] : []);
      recipients.forEach(r => {
        const em = (
          typeof r === 'string' ? r :
          (r?.emailAddress?.address || r?.address || '')
        ).toLowerCase().trim();
        if (!em || em.endsWith('@' + OWN_DOMAIN)) return;
        if (!map[em]) map[em] = { lastDate: dt, count: 0 };
        if (dt > map[em].lastDate) map[em].lastDate = dt;
        map[em].count++;
      });
    });
    const isFirstLoad = !emailCacheLoaded && Object.keys(map).length > 0;
    emailCache = map;
    emailCacheLoaded = true;
    LOG('Email cache loaded:', Object.keys(emailCache).length, 'contacts');
    if (isFirstLoad) {
      document.querySelectorAll('[data-ibis-processed]').forEach(row => {
        row.removeAttribute('data-ibis-processed');
        const badge = row.querySelector('.ibis-row-badges');
        if (badge) badge.remove();
      });
      scanEmailRows();
    }
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
          if (!/\b20\d\d\b/.test(str)) {
            d.setFullYear(now.getFullYear());
            if (d > now) d.setFullYear(now.getFullYear() - 1);
          }
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

  // ── Date extraction from a row ────────────────────────────────────────────────
  // Centralised so we can call it for BOTH counting and badge injection.

  function getDateFromRow(row) {
    // 1. aria-label (most reliable)
    let date = dateFromAriaLabel(row.getAttribute('aria-label') || '');
    if (date) return date;
    // 2. <time> element
    const timeEl = row.querySelector('time');
    if (timeEl) {
      const dt = timeEl.getAttribute('datetime');
      date = dt ? new Date(dt) : null;
      if (!date || isNaN(date.getTime())) date = parseOutlookDate(timeEl.textContent.trim());
      if (date && !isNaN(date.getTime())) return date;
    }
    // 3. Short text spans (date-like strings)
    for (const el of [...row.querySelectorAll('span')].filter(e => e.childElementCount === 0)) {
      const t = el.textContent.trim();
      if (t.length > 0 && t.length < 20) {
        date = parseOutlookDate(t);
        if (date) return date;
      }
    }
    return null;
  }

  // ── Contact / company lookup ──────────────────────────────────────────────────
  // For outgoing emails (From: Daniel Starr), we extract the recipient's first name
  // from the email preview greeting ("Hey Thomas," / "Hi Dajin,") and match against
  // the contact map. This is the most reliable approach for campaign folder emails.

  function findContactForRow(row) {
    // 1. Scan for non-ibisworld email addresses in element attributes
    for (const el of [row, ...row.querySelectorAll('[title*="@"],[aria-label*="@"],[data-email],[href*="mailto"]')]) {
      for (const attr of ['title', 'aria-label', 'data-email', 'href']) {
        const val = el.getAttribute(attr);
        if (!val || !val.includes('@')) continue;
        const emails = val.match(/[\w.+'\-]+@[\w.\-]+\.[a-z]{2,}/gi);
        if (!emails) continue;
        for (const email of emails) {
          const em = email.toLowerCase();
          if (!em.endsWith(OWN_DOMAIN) && !em.endsWith('.' + OWN_DOMAIN)) {
            return { email: em, contact: contactMap[em] || null, domain: em.split('@')[1] };
          }
        }
      }
    }

    // 2. Extract first name from email preview greeting: "Hey Thomas," / "Hi Dajin,"
    //    Outlook shows the start of the email body as preview text in the row.
    const previewEl = [...row.querySelectorAll('span, div')]
      .filter(el => el.childElementCount === 0 && el.textContent.trim().length > 20)
      .sort((a, b) => b.textContent.length - a.textContent.length)[0];

    if (previewEl) {
      const preview = previewEl.textContent.trim();
      const greetMatch = preview.match(/^(?:Hey|Hi|Hello|Dear)\s+([A-Z][a-z]{1,20})[,\s!]/);
      if (greetMatch) {
        const firstName = greetMatch[1].toLowerCase();
        for (const [email, c] of Object.entries(contactMap)) {
          const contactFirstName = (c.name || '').split(' ')[0].toLowerCase();
          if (contactFirstName && contactFirstName === firstName) {
            return { email, contact: c, domain: email.split('@')[1] };
          }
        }
        // No contact match — still show the domain bubble if we can get it
        // (we can't without the email, so return null)
      }
    }

    return null;
  }

  // ── Active folder detection ───────────────────────────────────────────────────

  function getActiveCampaignFolder() {
    const fromTitle = CAMPAIGN_FOLDERS.find(f => document.title.includes(f));
    if (fromTitle) return fromTitle;
    for (const el of document.querySelectorAll('[role="heading"], h1, h2, h3')) {
      const match = CAMPAIGN_FOLDERS.find(f => el.textContent.includes(f));
      if (match) return match;
    }
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

  function updateFolderBadges() {
    document.querySelectorAll('[role="treeitem"]').forEach(item => {
      const folderName = CAMPAIGN_FOLDERS.find(f => item.textContent.includes(f));
      if (!folderName) return;

      const count = folderCounts[folderName];
      if (count === undefined) return; // not scanned yet — show nothing

      let badge = item.querySelector('.ibis-folder-badge');

      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'ibis-folder-badge';

        item.style.setProperty('position', 'relative', 'important');
        // Force overflow visible up the ancestor chain
        let node = item;
        for (let i = 0; i < 5; i++) {
          if (!node) break;
          node.style.setProperty('overflow', 'visible', 'important');
          node = node.parentElement;
        }

        applyFolderBadgeStyle(badge, count > 0);
        item.appendChild(badge);
      } else {
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
    s.setProperty('padding',         '0 5px',            'important');
    s.setProperty('min-width',       '16px',             'important');
    s.setProperty('height',          '16px',             'important');
    s.setProperty('border-radius',   '999px',            'important');
    s.setProperty('white-space',     'nowrap',           'important');
    s.setProperty('z-index',         '9999',             'important');
    s.setProperty('pointer-events',  'none',             'important');
    s.setProperty('line-height',     '16px',             'important');
  }

  // ── Email row scanning ────────────────────────────────────────────────────────
  //
  // CRITICAL FIX v3.4: We now count overdue rows from ALL rows on every scan,
  // not just newly-processed ones. Previously, on the 2nd scan all rows were
  // skipped (already had badges), overdueCount stayed 0, and overwrote the
  // correct folder count — causing the badge to reset to grey "0".

  function scanEmailRows() {
    if (scanning) return; // re-entry guard
    const activeFolder = getActiveCampaignFolder();
    if (!activeFolder) { LOG('No active campaign folder. Title:', document.title); return; }

    const rows = getEmailRows();
    if (!rows.length) { LOG('No rows found.'); return; }

    scanning = true;
    let overdueCount = 0;

    rows.forEach(row => {
      const alreadyProcessed = !!row.dataset.ibisProcessed;
      const storedEmail      = row.dataset.ibisEmail || '';

      // ── Date + step resolution: PA cache wins, DOM date is fallback ──
      const cacheEntry = storedEmail ? emailCache[storedEmail] : null;
      let date = null;

      if (cacheEntry) {
        date = new Date(cacheEntry.lastDate);
        if (isNaN(date.getTime())) date = null;
      }
      if (!date) date = getDateFromRow(row);

      const days = daysSince(date);

      // Always count for the folder badge — even already-badged rows
      if (days !== null && days >= OVERDUE_DAYS) overdueCount++;

      // Only inject badges once per row
      if (alreadyProcessed) return;
      if (days === null) return;

      // Resolve contact info — use stored email shortcut when available
      let contactInfo;
      if (storedEmail) {
        contactInfo = { email: storedEmail, contact: contactMap[storedEmail] || null, domain: storedEmail.split('@')[1] || '' };
      } else {
        contactInfo = findContactForRow(row);
        // If cache has data for this contact, prefer cache date
        if (contactInfo?.email && emailCache[contactInfo.email]) {
          const entry = emailCache[contactInfo.email];
          const d = new Date(entry.lastDate);
          if (!isNaN(d.getTime())) date = d;
        }
      }

      // Step count = number of emails Dan has sent to this contact
      const resolvedEmail = contactInfo?.email || '';
      const stepCount = resolvedEmail && emailCache[resolvedEmail] ? emailCache[resolvedEmail].count : 0;

      row.dataset.ibisProcessed = '1';
      if (resolvedEmail) row.dataset.ibisEmail = resolvedEmail;
      injectRowBadges(row, days, contactInfo, stepCount);
    });

    folderCounts[activeFolder] = overdueCount;
    // Persist so badges show on other folders immediately without needing to click each one
    if (ctxOk()) chrome.storage.local.set({ ibis_folder_counts: JSON.stringify(folderCounts) });
    updateFolderBadges();
    scanning = false;
    LOG(`"${activeFolder}": ${rows.length} rows, ${overdueCount} overdue`);
  }

  // ── Row badge injection ───────────────────────────────────────────────────────

  function injectRowBadges(row, days, contactInfo, stepCount = 0) {
    const wrap = document.createElement('span');
    wrap.className = 'ibis-row-badges';
    p(wrap, 'display',        'inline-flex');
    p(wrap, 'align-items',    'center');
    p(wrap, 'gap',            '4px');
    p(wrap, 'vertical-align', 'middle');
    p(wrap, 'flex-shrink',    '0');
    p(wrap, 'white-space',    'nowrap');
    p(wrap, 'pointer-events', 'none');
    p(wrap, 'margin',         '0 8px');

    // ── Staleness chip ──
    const dotColor =
      days === 0          ? '#16a34a' :  // today   — green
      days < OVERDUE_DAYS ? '#d97706' :  // 1-2d    — amber
      days < 8            ? '#ea580c' :  // 3-7d    — orange
      days < 14           ? '#dc2626' :  // 8-13d   — red
                            '#9f1239';   // 14d+    — crimson

    const glowColor =
      days === 0          ? 'rgba(22,163,74,0.45)'  :
      days < OVERDUE_DAYS ? 'rgba(217,119,6,0.45)'  :
      days < 8            ? 'rgba(234,88,12,0.45)'  :
      days < 14           ? 'rgba(220,38,38,0.45)'  :
                            'rgba(159,18,57,0.45)';

    const dayLabel = days === 0 ? 'today' : days + 'd';
    const tooltip  = `Last email in this folder: ${days === 0 ? 'today' : days + (days === 1 ? ' day' : ' days') + ' ago'}`;

    const chip = document.createElement('span');
    chip.title = tooltip;
    p(chip, 'display',       'inline-flex');
    p(chip, 'align-items',   'center');
    p(chip, 'gap',           '4px');
    p(chip, 'background',    '#ffffff');
    p(chip, 'border',        '1px solid #e5e7eb');
    p(chip, 'border-radius', '999px');
    p(chip, 'padding',       '1px 7px 1px 5px');
    p(chip, 'white-space',   'nowrap');
    p(chip, 'line-height',   '18px');
    p(chip, 'cursor',        'default');

    chip.innerHTML =
      `<span style="width:8px;height:8px;border-radius:50%;background:${dotColor};` +
      `box-shadow:0 0 5px 2px ${glowColor};flex-shrink:0;display:inline-block"></span>` +
      `<span style="font-family:monospace;font-size:10px;font-weight:700;color:#374151">${dayLabel}</span>`;
    wrap.appendChild(chip);

    // ── Step count chip (only when PA data is available) ──
    // Color-coded: grey (1-2) → amber (3) → red (4+)
    // Tells Dan at a glance which email in his sequence this is.
    if (stepCount > 0) {
      const stepColor =
        stepCount >= 4 ? '#dc2626' :   // red  — at/past the 4-email limit
        stepCount === 3 ? '#d97706' :  // amber — one more before limit
                          '#6b7280';   // grey  — early in sequence

      const stepBg =
        stepCount >= 4 ? '#fef2f2' :
        stepCount === 3 ? '#fffbeb' :
                          '#f9fafb';

      const stepChip = document.createElement('span');
      stepChip.title = `${stepCount} email${stepCount === 1 ? '' : 's'} sent`;
      p(stepChip, 'display',       'inline-flex');
      p(stepChip, 'align-items',   'center');
      p(stepChip, 'gap',           '3px');
      p(stepChip, 'background',    stepBg);
      p(stepChip, 'border',        `1px solid ${stepCount >= 4 ? '#fecaca' : stepCount === 3 ? '#fde68a' : '#e5e7eb'}`);
      p(stepChip, 'border-radius', '999px');
      p(stepChip, 'padding',       '1px 7px 1px 6px');
      p(stepChip, 'white-space',   'nowrap');
      p(stepChip, 'line-height',   '18px');
      p(stepChip, 'cursor',        'default');
      stepChip.innerHTML =
        `<span style="font-size:10px;line-height:1">✉</span>` +
        `<span style="font-family:monospace;font-size:10px;font-weight:700;color:${stepColor}">${stepCount}</span>`;
      wrap.appendChild(stepChip);
    }

    // ── Company bubble ──
    if (contactInfo) {
      const { contact, domain } = contactInfo;
      const companyName = contact?.accountName || domainToName(domain);
      if (companyName) {
        const bubble = document.createElement('span');
        bubble.title = companyName;
        p(bubble, 'display',       'inline-flex');
        p(bubble, 'align-items',   'center');
        p(bubble, 'gap',           '4px');
        p(bubble, 'background',    '#f9fafb');
        p(bubble, 'color',         '#374151');
        p(bubble, 'border',        '1px solid #e5e7eb');
        p(bubble, 'border-radius', '999px');
        p(bubble, 'padding',       '1px 8px 1px 4px');
        p(bubble, 'white-space',   'nowrap');
        p(bubble, 'max-width',     '150px');
        p(bubble, 'overflow',      'hidden');
        p(bubble, 'line-height',   '18px');
        p(bubble, 'font-size',     '10px');
        p(bubble, 'font-weight',   '500');
        p(bubble, 'font-family',   'sans-serif');

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

    // ── Inject after the sender name ──
    // Force overflow:visible up the chain so Outlook doesn't clip the badge,
    // then insert immediately after the sender name leaf element.

    const fromEl = findFromElement(row);
    if (fromEl) {
      let node = fromEl.parentElement;
      while (node && node !== row) {
        node.style.setProperty('overflow', 'visible', 'important');
        node = node.parentElement;
      }
      row.style.setProperty('overflow', 'visible', 'important');
      fromEl.insertAdjacentElement('afterend', wrap);
      return;
    }

    // Fallback: absolute-position in the row at a safe left offset
    row.style.setProperty('position', 'relative', 'important');
    row.style.setProperty('overflow', 'visible', 'important');
    p(wrap, 'position',  'absolute');
    p(wrap, 'top',       '50%');
    p(wrap, 'left',      '210px');
    p(wrap, 'transform', 'translateY(-50%)');
    p(wrap, 'z-index',   '100');
    row.appendChild(wrap);
  }

  // ── Sender name detection ─────────────────────────────────────────────────────

  function findFromElement(row) {
    const leaves = [...row.querySelectorAll('span, div, p')].filter(el => {
      if (el.childElementCount > 0) return false;
      const t = el.textContent.trim();
      return t.length >= 4 && t.length <= 55 && !/^[A-Z]{1,4}$/.test(t);
    });
    for (const el of leaves) {
      const t = el.textContent.trim();
      if (/^\d{1,2}(:|\/)|^(today|yesterday|mon|tue|wed|thu|fri|sat|sun|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(t)) continue;
      return el;
    }
    return null;
  }

  // ── Style helper ──────────────────────────────────────────────────────────────
  // Shorthand for setProperty with !important.

  function p(el, prop, val) {
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
    return { bg: `hsl(${hue},60%,93%)`, color: `hsl(${hue},55%,28%)`, border: `hsl(${hue},50%,78%)` };
  }

  // ── MutationObserver ──────────────────────────────────────────────────────────
  // Only debounced calls here — never call DOM-mutating functions directly
  // from the observer callback (causes infinite mutation loops → freeze).

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
    LOG('v3.5 init on', location.hostname);
    // Restore persisted folder counts so badges show before user visits each folder
    chrome.storage.local.get(['ibis_folder_counts'], (res) => {
      try {
        if (res.ibis_folder_counts) Object.assign(folderCounts, JSON.parse(res.ibis_folder_counts));
        updateFolderBadges();
      } catch (_) {}
    });
    loadContactMap();
    setInterval(loadContactMap, 60_000);
    loadEmailCache();
    // Refresh email cache every 2h — matches PA flow frequency
    setInterval(loadEmailCache, 2 * 60 * 60 * 1000);
    // Heartbeat keeps folder badges alive after Outlook re-renders the nav.
    // Uses a long-ish interval (1.5s) to avoid fighting with Outlook's renders.
    setInterval(updateFolderBadges, 1500);
    new MutationObserver(onMutation).observe(document.body, { childList: true, subtree: true });
    setTimeout(() => {
      LOG('Initial scan — title:', document.title, '| email cache entries:', Object.keys(emailCache).length);
      scanEmailRows();
    }, 1800);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else setTimeout(init, 500);

})();
