// =============================================================================
// IBISWorld Outreach — DOM Overlay v3.16
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

  // Personal/free email domains — never derive a company name from these
  const PERSONAL_DOMAINS = new Set([
    'gmail.com','yahoo.com','hotmail.com','outlook.com','icloud.com',
    'aol.com','live.com','msn.com','protonmail.com','me.com','mac.com',
  ]);

  // Some companies use an email domain that differs from their public website.
  // Map email domain → website domain for reliable favicon lookup.
  // Add entries here as mismatches are discovered.
  const FAVICON_DOMAIN_OVERRIDES = {
    'lge.com': 'lg.com', // LG Electronics staff email → LG website
  };

  // Bump this constant whenever a fresh start for folder counts is needed.
  // On version mismatch the persisted (potentially stale) counts are discarded.
  const FC_VERSION = '3.16';

  // Paste the OneDrive share URL for contact_activity.json here after PA flow
  // creates the file. See setup instructions in the repo.
  const CONTACT_ACTIVITY_URL = 'https://ibisworld-my.sharepoint.com/:u:/p/daniel_starr/IQAgzsMLkpwARZTTD2uMrM6MARtiLz5aePFycFYpNu1AKQ4?e=KtJvva&download=1';

  const CAMPAIGN_FOLDERS = [
    'Workables', '6QA', 'Churns', 'Multithread', 'Winback', 'Old Samples', 'Net New',
  ];

  const LOG = (...a) => console.log('[IBISWorld]', ...a);

  let contactMap       = {};
  let domainContactMap = {}; // domain → accountName (built from contactMap for fallback lookup)
  let folderCounts     = {};
  let debounceTimer    = null;
  let scanning         = false; // re-entry guard — prevents mutation feedback loops
  let emailCache       = {};    // email (lowercase) → ISO date string (last PA-confirmed sent)
  let emailCacheLoaded = false; // true once cache has been successfully populated
  let cacheRetryCount  = 0;    // how many times loadEmailCache has been retried after failure

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
            _folder:     c._folder || null, // Outlook campaign folder, set by bridge.js
          };
        });
        // Build domain → accountName reverse lookup for rows where we only have the domain
        domainContactMap = {};
        Object.values(contactMap).forEach(c => {
          if (c.domain && c.accountName && !domainContactMap[c.domain]) {
            domainContactMap[c.domain] = c.accountName;
          }
        });
        LOG('Contact map:', Object.keys(contactMap).length, 'contacts,', Object.keys(domainContactMap).length, 'domains');
        refreshFolderCountsFromCache(); // seed folder badges if email cache already loaded
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
    updateDebugBadge('loading');
    // Route through background service worker to bypass CORS restrictions.
    // Chrome MV3 service workers can be inactive — if the SW is starting up when
    // sendMessage is called, the response may never arrive. We retry up to 3 times
    // with exponential back-off to handle a sleeping SW gracefully.
    chrome.runtime.sendMessage({ type: 'FETCH_URL', url: CONTACT_ACTIVITY_URL }, (res) => {
      if (chrome.runtime.lastError || !res || !res.ok) {
        const errMsg = chrome.runtime.lastError?.message || res?.error || 'no response';
        LOG('Email cache fetch failed:', errMsg, '| retry:', cacheRetryCount);
        updateDebugBadge('error');
        if (cacheRetryCount < 3) {
          cacheRetryCount++;
          // 3s → 8s → 15s back-off — gives SW time to wake up
          setTimeout(loadEmailCache, cacheRetryCount * cacheRetryCount * 3000);
        }
        return;
      }
      cacheRetryCount = 0; // reset on success
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
    const seenIds = new Set(); // deduplicate emails that appear in multiple folders
    data.forEach(item => {
      // Handle both plain-string and Graph object format for from/toRecipients
      const fromObj = item.from;
      const fromEmail = (
        typeof fromObj === 'string' ? fromObj :
        (fromObj?.emailAddress?.address || fromObj?.address || '')
      ).toLowerCase().trim();
      // Inbound emails (FROM = contact) → mark hasReplied, don't count as a sent step
      if (!fromEmail.endsWith('@' + OWN_DOMAIN)) {
        // Inbound reply — mark hasReplied. Use '' not null so date comparisons work correctly.
        if (!map[fromEmail]) map[fromEmail] = { lastDate: '', count: 0, dates: [], hasReplied: true };
        else map[fromEmail].hasReplied = true;
        return;
      }
      const dt = item.receivedDateTime || item.sentDateTime || item.date;
      if (!dt) return;
      // Deduplicate by email ID (same email can appear in campaign folder AND Sent Items)
      if (item.id) {
        if (seenIds.has(item.id)) return;
        seenIds.add(item.id);
      }
      // toRecipients may be a plain string, "Name <email>" string, or array — handle all
      const toField = item.toRecipients;
      const recipients = Array.isArray(toField) ? toField : (typeof toField === 'string' ? [toField] : []);
      recipients.forEach(r => {
        let raw = (typeof r === 'string' ? r : (r?.emailAddress?.address || r?.address || '')).trim();
        // Handle "Display Name <email@domain.com>" format from some Outlook connectors
        const angleMatch = raw.match(/<([^>@\s]+@[^>@\s]+)>/);
        const em = (angleMatch ? angleMatch[1] : raw).toLowerCase().trim();
        if (!em || !em.includes('@') || em.endsWith('@' + OWN_DOMAIN)) return;
        if (!map[em]) map[em] = { lastDate: dt, count: 0, dates: [] };
        if (!map[em].lastDate || dt > map[em].lastDate) map[em].lastDate = dt; // handle '' from inbound-first entries
        map[em].count++;
        map[em].dates.push(dt); // store all dates for row-to-contact matching
      });
    });
    const isFirstLoad = !emailCacheLoaded && Object.keys(map).length > 0;
    emailCache = map;
    emailCacheLoaded = true;
    const cacheKeys = Object.keys(emailCache);
    LOG('Email cache loaded:', cacheKeys.length, 'contacts');
    // Debug: log top 10 entries so you can verify counts + dates in console
    cacheKeys.slice(0, 10).forEach(e => {
      const v = emailCache[e];
      LOG('  >', e, '→', v.count + 'x, last:', v.lastDate ? v.lastDate.slice(0, 10) : 'none');
    });
    // Only strip + re-scan if currently inside a campaign folder.
    // Without this guard, badges are deleted but scanEmailRows() exits early
    // (no active folder), leaving rows permanently bare until next mutation.
    if (isFirstLoad && getActiveCampaignFolder()) {
      document.querySelectorAll('[data-ibis-processed]').forEach(row => {
        row.removeAttribute('data-ibis-processed');
        const badge = row.querySelector('.ibis-row-badges');
        if (badge) badge.remove();
      });
      scanEmailRows();
    }
    // Always recompute folder badge counts from cache so ALL folder badges
    // show correct numbers without needing to click into each folder.
    refreshFolderCountsFromCache();
    updateDebugBadge('ok');
  }

  // ── Row-to-contact matching via date ─────────────────────────────────────────
  // Campaign folder rows show the date of the FIRST email filed there, but the
  // cache stores ALL dates (campaign folder + Sent Items). Match the row's DOM
  // date against cache entries to resolve the correct email address, then use
  // the cache's lastDate for accurate staleness (most recent sent to that contact).

  function localDateStr(d) {
    // NOTE: getMonth() is 0-indexed — must add 1 and pad to avoid Jan=0 matching Dec=12 collisions
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function findEmailByDate(rowDate) {
    // Global date-based matching: find the cache entry whose sent date most closely
    // matches the DOM row date. No folder constraint — the folder constraint introduced
    // in v3.15 caused ALL matches to fail whenever hasAnyFolderData was true but a
    // contact had the wrong _folder value, breaking every row badge.
    if (!rowDate || !emailCacheLoaded) return null;
    const rowStr = localDateStr(rowDate);

    let bestEmail = null;
    let bestDiff = Infinity;
    for (const [email, entry] of Object.entries(emailCache)) {
      for (const d of (entry.dates || [])) {
        const dt = new Date(d);
        if (isNaN(dt.getTime())) continue;
        if (localDateStr(dt) === rowStr) {
          const diff = Math.abs(dt.getTime() - rowDate.getTime());
          if (diff < bestDiff) { bestDiff = diff; bestEmail = email; }
        }
      }
    }
    return bestEmail;
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

    // First-name greeting fallback removed — too many false matches across contacts
    // with the same first name. Accurate matching handled by date-based cache lookup.
    return null;
  }

  // ── Active folder detection ───────────────────────────────────────────────────

  // Strip leading emoji/symbols so "🔥 6QA" → "6QA", "❄️ Winback" → "Winback"
  // Does NOT strip trailing text, so "Winback 3" stays "Winback 3" (no match to "Winback")
  function normFolder(text) {
    // IMPORTANT: use \p{Extended_Pictographic} NOT \p{Emoji}.
    // \p{Emoji} includes ASCII digits 0-9 (because 1️⃣ etc. exist), which would strip
    // the "6" from "6QA". \p{Extended_Pictographic} only matches actual pictographic emoji.
    return text
      .replace(/^[\s\p{Extended_Pictographic}\p{So}\-–—★→✓•]+/u, '') // strip leading
      .replace(/[\s\p{Extended_Pictographic}\p{So}\-–—★→✓•]+$/u, '') // strip trailing ☆ etc.
      .trim();
  }

  function exactFolderMatch(text) {
    const n = normFolder(text);
    return CAMPAIGN_FOLDERS.find(f => n.toLowerCase() === f.toLowerCase()) || null;
  }

  function getActiveCampaignFolder() {
    // 1. Title: Outlook sets title to "FolderName - Mail - ..." — most reliable
    //    Split on " - " and check only the first segment for exact match
    const titleSegment = document.title.split(/\s[–\-]\s/)[0].trim();
    const fromTitle = exactFolderMatch(titleSegment);
    if (fromTitle) return fromTitle;

    // 2. H1/heading (SPA sometimes lags on title update)
    for (const el of document.querySelectorAll('[role="heading"], h1, h2, h3')) {
      const m = exactFolderMatch(el.textContent.trim());
      if (m) return m;
    }

    // 3. Active treeitem — use aria-label first (most precise), then textContent
    for (const item of document.querySelectorAll('[role="treeitem"]')) {
      const isActive = item.getAttribute('aria-selected') === 'true' ||
                       item.getAttribute('aria-current') === 'true'  ||
                       item.getAttribute('aria-current') === 'page';
      if (!isActive) continue;
      // aria-label often = "FolderName, N unread" — take just the name part
      const label = (item.getAttribute('aria-label') || '').split(',')[0];
      const m = exactFolderMatch(label || item.textContent.trim());
      if (m) return m;
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

  // ── Thread depth from Outlook DOM ────────────────────────────────────────────
  // Outlook renders an expand button on threaded rows: aria-label="Expand conversation, 6 items"
  // Use this as the thread count rather than PA total-sent count (which grows unbounded).

  function getThreadCountFromDOM(row) {
    // 1. Row's own aria-label — Outlook sometimes puts "3 messages" or "3 items" here directly
    const rowLabel = row.getAttribute('aria-label') || '';
    let m = rowLabel.match(/\b(\d+)\s*(?:messages?|items?|emails?)\b/i);
    if (m) return parseInt(m[1], 10);

    // 2. Child element aria-labels — expand button, count badge, etc.
    for (const el of row.querySelectorAll('[aria-label]')) {
      const label = el.getAttribute('aria-label') || '';
      // "Expand conversation, 3 items" / "Expand, 3 messages" / "3 items in conversation"
      if (/expand|conversation/i.test(label)) {
        m = label.match(/(\d+)/);
        if (m && parseInt(m[1], 10) > 1) return parseInt(m[1], 10);
      }
      // Pure count label: "3 messages" / "3 items"
      m = label.match(/^(\d+)\s*(?:messages?|items?)\b/i);
      if (m) return parseInt(m[1], 10);
    }

    // 3. data-count / data-thread-count attributes on row or direct children
    for (const el of [row, ...row.querySelectorAll('[data-count],[data-thread-count]')]) {
      const c = parseInt(el.getAttribute('data-count') || el.getAttribute('data-thread-count') || '', 10);
      if (c > 0) return c;
    }

    return 0;
  }

  // ── Folder count estimation from PA cache ────────────────────────────────────
  // Computes overdue contact counts per campaign folder from the PA email cache
  // + contact map. Called when either data source loads, so ALL folder badges
  // display accurate numbers immediately — without needing to click into each folder.
  // DOM scans (scanEmailRows) override the active folder's count with real-time data.

  function refreshFolderCountsFromCache() {
    if (!emailCacheLoaded || Object.keys(contactMap).length === 0) return;

    // Guard: only run if bridge.js has pushed _folder data (requires opening the dashboard).
    // Without this guard, all counts = 0 and we'd zero out valid DOM-scanned counts.
    const hasFolderData = Object.values(contactMap).some(c => c._folder);
    if (!hasFolderData) {
      LOG('refreshFolderCountsFromCache: no _folder data yet — open dashboard to activate folder badges');
      return;
    }

    const counts = {};
    CAMPAIGN_FOLDERS.forEach(f => { counts[f] = 0; });
    Object.entries(emailCache).forEach(([email, entry]) => {
      if (!entry.lastDate) return; // inbound-only reply — no sent date
      const days = daysSince(new Date(entry.lastDate));
      if (days === null || days < OVERDUE_DAYS) return;
      const c = contactMap[email];
      if (!c?._folder || counts[c._folder] === undefined) return;
      counts[c._folder]++;
    });

    // Update folder counts from cache — but NEVER overwrite the currently active folder.
    // The DOM scan is authoritative for whichever folder the user is inside right now.
    const activeFolder = getActiveCampaignFolder();
    CAMPAIGN_FOLDERS.forEach(f => {
      if (f !== activeFolder) folderCounts[f] = counts[f];
    });

    updateFolderBadges();
    if (ctxOk()) chrome.storage.local.set({
      ibis_folder_counts: JSON.stringify(folderCounts),
      ibis_fc_version:    FC_VERSION,
    });
    LOG('Folder counts from cache:', JSON.stringify(counts));
  }

  // ── Folder nav badges ─────────────────────────────────────────────────────────

  function updateFolderBadges() {
    document.querySelectorAll('[role="treeitem"]').forEach(item => {
      // Use aria-label with comma-split for precise matching.
      // Primary: aria-label exact match — "❄️ Winback, 23 unread" → "Winback" ✓
      //   Also excludes "→ Winback 3, 0 unread" → "Winback 3" → no match ✓
      // Fallback: textContent .includes() for Outlook builds without aria-label attributes.
      const ariaLabel = (item.getAttribute('aria-label') || '').split(',')[0].trim();
      const folderName = (ariaLabel ? exactFolderMatch(ariaLabel) : null)
                      || CAMPAIGN_FOLDERS.find(f => item.textContent.includes(f))
                      || null;
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

    // Debug state snapshot — visible in F12 console, filter "[IBISWorld]"
    LOG(`Scan: folder="${activeFolder}" contacts=${Object.keys(contactMap).length} cacheLoaded=${emailCacheLoaded} cacheEntries=${Object.keys(emailCache).length} retries=${cacheRetryCount}`);

    scanning = true;
    let overdueCount = 0;

    rows.forEach(row => {
      const alreadyProcessed = !!row.dataset.ibisProcessed;
      let storedEmail = row.dataset.ibisEmail || '';
      let emailMatchedViaDOM = row.dataset.ibisMatchDom === '1'; // true = high confidence

      // ── Resolve email address ──
      // Priority: stored (from prior scan) → DOM attrs → date-based cache match
      let cacheEntry = storedEmail ? emailCache[storedEmail] : null;

      if (!storedEmail) {
        // Try DOM attribute scan first (most reliable when email is exposed)
        const found = findContactForRow(row);
        if (found?.email) {
          storedEmail = found.email;
          cacheEntry = emailCache[storedEmail] || null;
          emailMatchedViaDOM = true;
        }
      }

      // ── Date resolution ──
      // Use DOM date for matching, then override with cache's lastDate (real last sent)
      const domDate = getDateFromRow(row);

      if (!storedEmail && emailCacheLoaded && domDate) {
        // Match row to cache entry by its DOM date = date of first email in folder.
        const matched = findEmailByDate(domDate);
        if (matched) {
          storedEmail = matched;
          cacheEntry = emailCache[matched];
          emailMatchedViaDOM = false; // date-matched = lower confidence
        }
      }

      let date = null;
      if (cacheEntry) {
        date = new Date(cacheEntry.lastDate); // real last-sent date from PA
        if (isNaN(date.getTime())) date = null;
      }
      if (!date) date = domDate; // fallback to DOM date

      const days = daysSince(date);

      // Always count for the folder badge — even already-badged rows
      if (days !== null && days >= OVERDUE_DAYS) overdueCount++;

      // Only inject badges once per row
      if (alreadyProcessed) return;
      if (days === null) return;

      const contactInfo = storedEmail
        ? { email: storedEmail, contact: contactMap[storedEmail] || null, domain: storedEmail.split('@')[1] || '' }
        : null;

      // Thread count: prefer Outlook's own conversation depth from DOM (most accurate),
      // fall back to PA cache count (total sent to this contact across all time).
      const resolvedEmail = storedEmail || '';
      const domThreadCount = getThreadCountFromDOM(row);
      const cacheCount = resolvedEmail && emailCache[resolvedEmail] ? emailCache[resolvedEmail].count : 0;
      const stepCount = domThreadCount || cacheCount;

      row.dataset.ibisProcessed = '1';
      if (resolvedEmail) row.dataset.ibisEmail = resolvedEmail;
      if (emailMatchedViaDOM) row.dataset.ibisMatchDom = '1';
      injectRowBadges(row, days, contactInfo, stepCount, emailMatchedViaDOM);
    });

    folderCounts[activeFolder] = overdueCount;
    // Persist so badges show on other folders immediately without needing to click each one
    if (ctxOk()) chrome.storage.local.set({ ibis_folder_counts: JSON.stringify(folderCounts), ibis_fc_version: FC_VERSION });
    updateFolderBadges();
    scanning = false;
    LOG(`"${activeFolder}": ${rows.length} rows, ${overdueCount} overdue`);
  }

  // ── Row badge injection ───────────────────────────────────────────────────────

  function injectRowBadges(row, days, contactInfo, stepCount = 0, highConfidence = false) {
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
    const tooltip  = `Last email sent: ${days === 0 ? 'today' : days + (days === 1 ? ' day' : ' days') + ' ago'}${emailCacheLoaded ? ' (PA data)' : ' (Outlook date)'}`;

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

    // ── Reply indicator ──
    // Green ↩ chip when the contact has sent at least one reply (detected from inbound
    // emails in PA cache that were filed into campaign folders).
    const cacheEntry = contactInfo?.email ? emailCache[contactInfo.email] : null;
    if (cacheEntry?.hasReplied) {
      const replyChip = document.createElement('span');
      replyChip.title = 'Contact has replied';
      p(replyChip, 'display',       'inline-flex');
      p(replyChip, 'align-items',   'center');
      p(replyChip, 'background',    '#f0fdf4');
      p(replyChip, 'border',        '1px solid #86efac');
      p(replyChip, 'border-radius', '999px');
      p(replyChip, 'padding',       '1px 7px');
      p(replyChip, 'font-size',     '11px');
      p(replyChip, 'font-weight',   '700');
      p(replyChip, 'color',         '#16a34a');
      p(replyChip, 'white-space',   'nowrap');
      p(replyChip, 'line-height',   '18px');
      replyChip.textContent = '↩';
      wrap.appendChild(replyChip);
    }

    // ── Company bubble ──
    // Only show when we have real confidence in the match:
    //   - High confidence (email found via DOM scan): show any company
    //   - Low confidence (date-based match): only show if email is a known campaign contact
    //     and NOT a personal domain (avoids wrong-company false positives)
    if (contactInfo) {
      const { contact, domain } = contactInfo;
      const isPersonalDomain = PERSONAL_DOMAINS.has(domain);
      const isKnownContact = !!contact;
      // Skip bubble if: low confidence match + personal domain with no contact entry
      if (!highConfidence && !isKnownContact && isPersonalDomain) {
        // No company bubble — can't reliably link this to a company
      } else
      // Also skip if: low confidence + not a known contact (domain-guessed company = unreliable)
      if (!highConfidence && !isKnownContact) {
        // Skip domain-guessed names for date-matched rows — too many false positives
      } else {
      // For exact matches (high confidence DOM scan): derive name from domain if no contact record.
      // For date-based matches (low confidence): ONLY use exact contact.accountName — never guess from
      // domain, as domainContactMap can map the wrong company when contacts share a date collision.
      const companyName = contact?.accountName || (highConfidence && !isPersonalDomain && domainToName(domain)) || '';
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
          // Use override domain for favicon when email domain ≠ company website domain
          const faviconDomain = FAVICON_DOMAIN_OVERRIDES[domain] || domain;
          img.src = `https://icons.duckduckgo.com/ip3/${faviconDomain}.ico`;
          img.style.cssText = 'width:12px;height:12px;border-radius:2px;flex-shrink:0;object-fit:contain';
          // Fallback chain: DuckDuckGo → Google favicon API → hide
          img.onerror = () => {
            if (!img.dataset.tried) {
              img.dataset.tried = '1';
              img.src = `https://www.google.com/s2/favicons?domain=${faviconDomain}&sz=16`;
              img.onerror = () => { img.style.display = 'none'; };
            }
          };
          bubble.appendChild(img);
        }

        const nameEl = document.createElement('span');
        nameEl.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0';
        nameEl.textContent = companyName.length > 22 ? companyName.slice(0, 20) + '…' : companyName;
        bubble.appendChild(nameEl);
        wrap.appendChild(bubble);
      }
      } // end else (show company)
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

  // ── Debug status badge ────────────────────────────────────────────────────────
  // Small floating indicator bottom-right of the screen showing email cache state.
  // 🟢 = cache loaded OK   🟡 = loading/retrying   🔴 = failed after all retries
  // Click it to dump the full extension state to the console for diagnosis.

  let _debugBadge = null;

  function getOrCreateDebugBadge() {
    if (_debugBadge && document.body.contains(_debugBadge)) return _debugBadge;
    const b = document.createElement('div');
    b.id = 'ibis-debug-badge';
    b.title = 'IBISWorld Outreach — click to log debug state';
    b.style.cssText = [
      'position:fixed', 'bottom:12px', 'right:12px', 'z-index:2147483647',
      'background:#1f2937', 'color:#f9fafb',
      'font-family:monospace', 'font-size:10px', 'font-weight:700',
      'padding:3px 8px', 'border-radius:999px',
      'cursor:pointer', 'user-select:none',
      'display:flex', 'align-items:center', 'gap:4px',
      'opacity:0.75', 'transition:opacity 0.2s',
      'pointer-events:auto',
    ].join(';');
    b.addEventListener('mouseenter', () => { b.style.opacity = '1'; });
    b.addEventListener('mouseleave', () => { b.style.opacity = '0.75'; });
    b.addEventListener('click', () => {
      const state = {
        version: '3.16',
        url: location.href,
        title: document.title,
        activeFolder: getActiveCampaignFolder(),
        contactMapSize: Object.keys(contactMap).length,
        emailCacheLoaded,
        emailCacheSize: Object.keys(emailCache).length,
        cacheRetryCount,
        folderCounts: { ...folderCounts },
        sampleCacheEmails: Object.keys(emailCache).slice(0, 15),
        sampleContacts: Object.entries(contactMap).slice(0, 10).map(([e, c]) => ({
          email: e, name: c.name, account: c.accountName, folder: c._folder
        })),
      };
      LOG('=== DEBUG DUMP ===');
      LOG(JSON.stringify(state, null, 2));
      console.table(
        Object.entries(emailCache).slice(0, 20).map(([e, v]) => ({
          email: e, count: v.count, lastDate: v.lastDate?.slice(0, 10) || '', replied: !!v.hasReplied
        }))
      );
    });
    document.body.appendChild(b);
    _debugBadge = b;
    return b;
  }

  function updateDebugBadge(state) {
    // state: 'loading' | 'ok' | 'error'
    // Only create the badge when there's something interesting to show — avoids
    // cluttering Outlook permanently when everything is working fine.
    if (state === 'ok' && Object.keys(emailCache).length === 0) return;
    const b = getOrCreateDebugBadge();
    const dot  = state === 'ok'      ? '🟢' : state === 'loading' ? '🟡' : '🔴';
    const size = Object.keys(emailCache).length;
    const cont = Object.keys(contactMap).length;
    b.innerHTML = `${dot} IBW ${state === 'ok' ? size + 'e ' + cont + 'c' : state}`;
    // Auto-hide after 8s when everything is working (keep showing if error)
    if (state === 'ok') {
      clearTimeout(b._hideTimer);
      b._hideTimer = setTimeout(() => {
        if (b.parentElement) b.style.opacity = '0.3';
      }, 8000);
    }
  }

  // ── MutationObserver ──────────────────────────────────────────────────────────
  // Only debounced calls here — never call DOM-mutating functions directly
  // from the observer callback (causes infinite mutation loops → freeze).

  function onMutation() {
    clearTimeout(debounceTimer);
    // 350ms: halves the visible flicker window vs 700ms while still preventing
    // mutation feedback loops (badges injected inside setTimeout, not directly
    // from the observer callback).
    debounceTimer = setTimeout(() => {
      updateFolderBadges();
      scanEmailRows();
    }, 350);
  }

  // ── Init ──────────────────────────────────────────────────────────────────────

  function init() {
    if (!ctxOk()) return;
    LOG('v3.16 init on', location.hostname);

    // IMPORTANT: seed folderCounts from storage FIRST, then start all async data loads.
    // loadContactMap() and loadEmailCache() call refreshFolderCountsFromCache() in their
    // callbacks — they must find folderCounts already populated so they don't race with
    // the storage.get() callback and produce an empty initial state.
    chrome.storage.local.get(['ibis_folder_counts', 'ibis_fc_version'], (res) => {
      try {
        if (res.ibis_fc_version === FC_VERSION && res.ibis_folder_counts) {
          Object.assign(folderCounts, JSON.parse(res.ibis_folder_counts));
        }
      } catch (_) {}

      updateFolderBadges();       // show persisted counts immediately while data loads
      loadContactMap();
      setInterval(loadContactMap, 60_000);
      loadEmailCache();
      setInterval(loadEmailCache, 2 * 60 * 60 * 1000);
      // Heartbeat keeps folder badges alive after Outlook re-renders the nav.
      setInterval(updateFolderBadges, 1500);
      new MutationObserver(onMutation).observe(document.body, { childList: true, subtree: true });
      setTimeout(() => {
        LOG('Initial scan — title:', document.title, '| email cache entries:', Object.keys(emailCache).length);
        scanEmailRows();
      }, 1800);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else setTimeout(init, 500);

})();
