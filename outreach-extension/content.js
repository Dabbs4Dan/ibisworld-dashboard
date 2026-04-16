// =============================================================================
// IBISWorld Outreach — DOM Overlay v3.55
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

  const OVERDUE_DAYS = 2;
  const OWN_DOMAIN   = 'ibisworld.com';
  const OWN_NAMES    = new Set(['daniel', 'dan', 'starr']); // filter Dan's own name from greeting parse

  // Personal/free email domains — never derive a company name from these
  const PERSONAL_DOMAINS = new Set([
    'gmail.com','yahoo.com','hotmail.com','outlook.com','icloud.com',
    'aol.com','live.com','msn.com','protonmail.com','me.com','mac.com',
  ]);

  // Some companies use an email domain that differs from their public website.
  // Map email domain → website domain for reliable favicon lookup.
  // Add entries here as mismatches are discovered.
  const FAVICON_DOMAIN_OVERRIDES = {
    'lge.com':    'lg.com',           // LG Electronics staff email → LG website
  };

  // Direct favicon URL overrides — when DuckDuckGo doesn't index a domain well,
  // use Google Favicon API (most reliable, caches all major sites).
  const FAVICON_URL_OVERRIDES = {
    'parker.com': 'https://www.google.com/s2/favicons?domain=parker.com&sz=32',
  };

  // Company name overrides — when the email domain doesn't match the real account name.
  // domainToName("guckenheimer.com") → "Guckenheimer" but the real account is "ISS-Guckenheimer".
  const COMPANY_NAME_OVERRIDES = {
    'guckenheimer.com':  'ISS-Guckenheimer',
    'us.issworld.com':   'ISS-Guckenheimer',
  };

  // Bump this ONLY when counting methodology changes (not on every release).
  // On version mismatch the persisted (potentially stale) counts are discarded.
  // Bumping every release was causing all folder badges to disappear until
  // each folder was physically visited — defeating the pre-load system.
  const FC_VERSION = 'v2'; // bumped v3.41: clears stale preload estimates

  // Paste the OneDrive share URL for contact_activity.json here after PA flow
  // creates the file. See setup instructions in the repo.
  const CONTACT_ACTIVITY_URL = 'https://ibisworld-my.sharepoint.com/:u:/p/daniel_starr/IQAgzsMLkpwARZTTD2uMrM6MARtiLz5aePFycFYpNu1AKQ4?e=KtJvva&download=1';

  const CAMPAIGN_FOLDERS = [
    'Workables', '6QA', 'Churns', 'Multithread', 'Winback', 'Old Samples', 'Net New',
  ];

  const LOG = (...a) => console.log('[IBISWorld]', ...a);

  let contactMap       = {};
  let domainContactMap = {}; // domain → accountName (built from contactMap for fallback lookup)
  let accountNameMap   = {}; // accountName (lowercase) → { name (original case), domain } — for DOM text company matching
  let folderCounts     = {};
  let debounceTimer    = null;
  let scanning         = false;   // re-entry guard — prevents mutation feedback loops
  let emailCache       = {};      // email (lowercase) → { lastDate, count, dates[], hasReplied }
  let emailCacheLoaded = false;   // true once cache has been successfully populated
  let contactMapLoaded = false;   // true once contact map has been loaded with data
  let cacheRetryCount  = 0;      // how many times loadEmailCache has been retried after failure
  let cacheNameMap     = {};     // firstName (lowercase) → [{email, domain, nameParts}] — derived from email cache addresses
  let lastScanTime     = 0;      // timestamp of last completed scan — prevents scan spam
  let lastActiveFolder = null;   // tracks folder nav changes so we can strip stale badges
  let folderChangeTime = 0;     // timestamp of last folder nav — allows rapid re-scans for 5s
  let scannedFolders   = new Set(); // folders DOM-scanned this session — preload won't overwrite

  function ctxOk() {
    try { return !!chrome.runtime.id; } catch (_) { return false; }
  }

  // ── Contact map ───────────────────────────────────────────────────────────────

  function loadContactMap() {
    if (!ctxOk() || !chrome.storage) return;
    chrome.storage.local.get(['outreach_contacts_raw', 'outreach_account_names'], (res) => {
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
            // bridge v1.4+ sends _folders (array). Fall back to legacy _folder string for
            // contacts pushed by older bridge versions still in chrome.storage.
            _folders: Array.isArray(c._folders) ? c._folders : (c._folder ? [c._folder] : []),
          };
        });
        // Build domain → accountName reverse lookup for rows where we only have the domain
        domainContactMap = {};
        Object.values(contactMap).forEach(c => {
          if (c.domain && c.accountName && !domainContactMap[c.domain]) {
            domainContactMap[c.domain] = c.accountName;
          }
        });
        // Build accountName → {name, domain} reverse lookup for DOM text fallback matching.
        // Start with account names from the ACCOUNTS CSV (pushed by bridge v1.5).
        // This is the key data source — it has ALL accounts in Dan's territory,
        // even those without any campaign contacts.
        accountNameMap = {};
        let bridgeAcctCount = 0;
        try {
          const acctNames = JSON.parse(res.outreach_account_names || '{}');
          Object.entries(acctNames).forEach(([key, val]) => {
            if (val.name) { accountNameMap[key] = val; bridgeAcctCount++; }
          });
        } catch (_) {}
        // Layer on top: account names from campaign contacts (may have better domain info)
        let contactAcctCount = 0;
        Object.values(contactMap).forEach(c => {
          if (c.accountName) {
            const key = c.accountName.toLowerCase().trim();
            if (!accountNameMap[key]) {
              accountNameMap[key] = { name: c.accountName, domain: c.domain || '' };
              contactAcctCount++;
            }
          }
        });
        const mapSize = Object.keys(contactMap).length;
        LOG('Contact map:', mapSize, 'contacts,', Object.keys(domainContactMap).length, 'domains,', Object.keys(accountNameMap).length, 'accounts (bridge:', bridgeAcctCount, '+ contacts:', contactAcctCount + ')');
        // Log whether "allinial global" is in the map (debugging specific issue)
        const allinialCheck = accountNameMap['allinial global'];
        LOG('Account name check: "allinial global" →', allinialCheck ? `✅ ${allinialCheck.name} (domain: ${allinialCheck.domain})` : '❌ NOT FOUND — open dashboard to push account names');

        // On first load with data, strip stale badges and re-scan — ensures name-based
        // matching runs even if rows were previously date-matched (wrong) before map loaded.
        if (!contactMapLoaded && mapSize > 0) {
          contactMapLoaded = true;
          if (getActiveCampaignFolder()) {
            LOG('Contact map first load — re-scanning rows for name matching');
            document.querySelectorAll('[data-ibis-processed]').forEach(row => {
              row.removeAttribute('data-ibis-processed');
              row.removeAttribute('data-ibis-email');
              row.removeAttribute('data-ibis-match-dom');
              const badge = row.querySelector('.ibis-row-badges');
              if (badge) badge.remove();
            });
            lastScanTime = 0;
            scanEmailRows();
          }
        }
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
      const toSample = Array.isArray(s.toRecipients) ? JSON.stringify(s.toRecipients[0]) : JSON.stringify(s.toRecipients);
      LOG(`Cache shape: ${data.length} items | from: ${JSON.stringify(s.from)} | toRecipients (${typeof s.toRecipients}): ${toSample} | date: ${s.receivedDateTime || s.sentDateTime || s.date || 'none'}`);
    }
    const map = {};
    const seenIds = new Set(); // deduplicate emails that appear in multiple folders
    const seenSends = new Set(); // secondary dedup: recipient+minute catches same email with different IDs
    data.forEach(item => {
      // Handle both plain-string and Graph object format for from/toRecipients
      const fromObj = item.from;
      let fromRaw = (
        typeof fromObj === 'string' ? fromObj :
        (fromObj?.emailAddress?.address || fromObj?.address || '')
      ).toLowerCase().trim();
      // Extract email from "Display Name <email@domain.com>" format (PA V3 returns plain strings)
      const fromAngle = fromRaw.match(/<([^>@\s]+@[^>@\s]+)>/);
      const fromEmail = (fromAngle ? fromAngle[1] : fromRaw).trim();
      // Inbound emails (FROM = contact) → mark hasReplied + update lastDate so
      // staleness reflects the most recent email in either direction (not just outbound).
      if (fromEmail.includes('@') && !fromEmail.endsWith('@' + OWN_DOMAIN)) {
        const inDt = item.receivedDateTime || item.sentDateTime || item.date || '';
        if (!map[fromEmail]) map[fromEmail] = { lastDate: inDt, count: 0, dates: [], hasReplied: true };
        else {
          map[fromEmail].hasReplied = true;
          if (inDt && (!map[fromEmail].lastDate || inDt > map[fromEmail].lastDate)) {
            map[fromEmail].lastDate = inDt;
          }
        }
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
      // Split semicolon-separated multi-recipient strings (e.g. "a@x.com;b@x.com;c@x.com")
      const recipients = Array.isArray(toField)
        ? toField
        : (typeof toField === 'string'
          ? toField.split(';').map(s => s.trim()).filter(Boolean)
          : []);
      recipients.forEach(r => {
        let raw = (typeof r === 'string' ? r : (r?.emailAddress?.address || r?.address || '')).trim();
        // Handle "Display Name <email@domain.com>" format from some Outlook connectors
        const angleMatch = raw.match(/<([^>@\s]+@[^>@\s]+)>/);
        const em = (angleMatch ? angleMatch[1] : raw).toLowerCase().trim();
        if (!em || !em.includes('@') || em.endsWith('@' + OWN_DOMAIN)) return;
        // Secondary dedup: same recipient + same hour = same email in a different folder.
        // Outlook assigns different item.id to campaign folder copy vs Sent Items copy,
        // so seenIds misses these. Truncate datetime to hour to catch timestamp diffs
        // (Outlook can shift receivedDateTime by several minutes between folder copies).
        const sendKey = em + '|' + (dt || '').slice(0, 13);
        if (seenSends.has(sendKey)) return;
        seenSends.add(sendKey);
        // Tertiary dedup: 2-hour rolling window catches midnight-edge duplicates.
        // Same email in Sent Items (23:59 UTC) vs campaign folder (00:01 UTC) has
        // different hours AND different calendar days — seenSends misses these.
        // Check if any existing date for this recipient is within ±2 hours.
        const dtMs = new Date(dt).getTime();
        if (!isNaN(dtMs) && map[em]?.dates?.length > 0) {
          if (map[em].dates.some(d => Math.abs(new Date(d).getTime() - dtMs) < 7200000)) return;
        }
        if (!map[em]) map[em] = { lastDate: dt, count: 0, dates: [] };
        if (!map[em].lastDate || dt > map[em].lastDate) map[em].lastDate = dt; // handle '' from inbound-first entries
        map[em].count++;
        map[em].dates.push(dt); // store all dates for row-to-contact matching
      });
    });
    const prevSize = Object.keys(emailCache).length;
    emailCache = map;
    emailCacheLoaded = true;
    buildCacheNameMap(); // index email addresses by first name for greeting matching
    // Persist processed cache for instant load next session (avoids 5-10s SharePoint wait)
    if (ctxOk()) chrome.storage.local.set({ ibis_email_cache_map: map });
    const cacheKeys = Object.keys(emailCache);
    LOG('Email cache loaded:', cacheKeys.length, 'contacts (was', prevSize, ')');
    // Debug: log first 20 cache entries to verify
    cacheKeys.slice(0, 20).forEach(e => {
      const v = emailCache[e];
      LOG('  📧', e, '→', v.count + 'x, last:', v.lastDate ? v.lastDate.slice(0, 10) : 'none', v.hasReplied ? '↩replied' : '');
    });
    if (cacheKeys.length > 20) LOG(`  ... and ${cacheKeys.length - 20} more`);
    // ALWAYS re-scan when fresh PA data arrives. The instant cache (from previous session)
    // may be stale — new contacts, updated dates, new replies. Re-scanning is cheap
    // (milliseconds for a few rows) and guarantees fresh data is always reflected.
    if (getActiveCampaignFolder()) {
      document.querySelectorAll('[data-ibis-processed]').forEach(row => {
        row.removeAttribute('data-ibis-processed');
        row.removeAttribute('data-ibis-email');      // clear stale email match
        row.removeAttribute('data-ibis-match-dom');  // clear stale confidence flag
        const badge = row.querySelector('.ibis-row-badges');
        if (badge) badge.remove();
      });
      lastScanTime = 0; // reset rate-limit so re-scan fires immediately (not blocked by 2s guard)
      scanEmailRows();
    }
    // Pre-load estimates for folders not yet DOM-scanned this session.
    // scannedFolders protection ensures DOM-scanned results are never overwritten.
    preloadFolderCounts();
    updateDebugBadge('ok');
  }

  // ── Pre-load folder count estimates ──────────────────────────────────────────
  // Uses PA email cache + contactMap _folders to estimate overdue counts for folders
  // not yet physically visited. Called from processEmailCache on every fresh cache load.
  //
  // KEY LIMITATION: dashboard campaign ≠ Outlook folder. A contact in ibis_samples
  // might have emails filed under Workables. To reduce false counts:
  //   - Only count contacts with a SINGLE unambiguous folder assignment
  //   - Multi-folder contacts are skipped (their Outlook folder is unknowable)
  //   - Never overwrite active folder or DOM-scanned folders (real scans are truth)
  function preloadFolderCounts() {
    if (!emailCacheLoaded || Object.keys(contactMap).length === 0) return;

    const activeFolder = getActiveCampaignFolder();
    const estimates = {};
    CAMPAIGN_FOLDERS.forEach(f => { estimates[f] = 0; });
    Object.entries(emailCache).forEach(([email, entry]) => {
      if (!entry.lastDate) return;
      const days = daysSince(new Date(entry.lastDate));
      if (days === null || days < OVERDUE_DAYS) return;
      const c = contactMap[email];
      if (!c?._folders?.length) return;
      // Only count contacts with a single unambiguous folder. Multi-folder contacts
      // (e.g. in both Workables + Old Samples) could have emails in either folder —
      // counting them toward _folders[0] inflates that folder's badge incorrectly.
      if (c._folders.length > 1) return;
      const folder = c._folders[0];
      if (estimates[folder] !== undefined) estimates[folder]++;
    });
    CAMPAIGN_FOLDERS.forEach(f => {
      // Never overwrite the active folder or any folder already DOM-scanned this session.
      if (f === activeFolder || scannedFolders.has(f)) return;
      folderCounts[f] = estimates[f];
    });
    if (ctxOk()) chrome.storage.local.set({ ibis_folder_counts: JSON.stringify(folderCounts), ibis_fc_version: FC_VERSION });
    updateFolderBadges();
    LOG('Pre-load estimates:', JSON.stringify(estimates));
  }

  // ── Cache name index ─────────────────────────────────────────────────────────
  // Derive first names from email addresses in the PA cache so we can match
  // greeting text ("Hi Ren") against contacts NOT in the dashboard campaign stores.
  // e.g. "ren.thomas@evergreen.edu" → firstName "ren", nameParts ["ren","thomas"]

  function buildCacheNameMap() {
    cacheNameMap = {};
    for (const email of Object.keys(emailCache)) {
      const atIdx = email.indexOf('@');
      if (atIdx < 0) continue;
      const local  = email.substring(0, atIdx);
      const domain = email.substring(atIdx + 1);
      // Split local part by . _ - +  ("ren.thomas" → ["ren","thomas"])
      // Filter out parts with digits ("keneljoseph97") or very short parts
      const parts = local.split(/[._\-+]/).filter(p => p.length >= 2 && !/\d/.test(p));
      if (parts.length === 0) continue;
      const firstName = parts[0].toLowerCase();
      if (OWN_NAMES.has(firstName)) continue; // don't index Dan's own name
      if (!cacheNameMap[firstName]) cacheNameMap[firstName] = [];
      cacheNameMap[firstName].push({ email, domain, nameParts: parts });
    }
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

  function findEmailByDate(rowDate, preferFolder) {
    // Folder-STRICT date matching (v3.29+).
    //
    // With 107+ contacts in the PA cache, date collisions are very common — many contacts
    // are emailed on the same day. The old "noFolderBest" fallback allowed ANY untagged
    // contact (in Sent Items but not in any dashboard campaign) to match into any folder,
    // producing completely wrong company bubbles (e.g. Gmail/Evergreen in LG's 6QA row).
    //
    // Rule: ONLY return a contact whose _folders includes the active folder.
    //       If no such contact matches, return null — show staleness only, no company bubble.
    //       Never return untagged contacts; never return contacts from other folders.
    //
    // Exception: when bridge hasn't pushed any _folders data yet (hasFolderData = false),
    //            fall back to globalBest so the extension isn't completely dark on first load.
    if (!rowDate || !emailCacheLoaded) return null;

    // Calendar-day of the row date
    const rowDayMs = new Date(rowDate.getFullYear(), rowDate.getMonth(), rowDate.getDate()).getTime();

    // hasFolderData: true once bridge v1.4 has pushed _folders data.
    const hasFolderData = Object.values(contactMap).some(c => c._folders && c._folders.length > 0);

    let folderBest = null, folderDiff = Infinity;
    let globalBest = null, globalDiff = Infinity; // only used when hasFolderData = false

    for (const [email, entry] of Object.entries(emailCache)) {
      const c        = contactMap[email];
      const cFolders = c?._folders || [];
      const inFolder = preferFolder && cFolders.includes(preferFolder);

      for (const d of (entry.dates || [])) {
        const dt = new Date(d);
        if (isNaN(dt.getTime())) continue;
        // ±1 calendar day tolerance — Outlook shows time-strings for <24h emails, parsed as "today",
        // while PA cache stores the actual send date (yesterday). Without tolerance Kyri never matches.
        const dtDayMs = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
        if (Math.abs(dtDayMs - rowDayMs) > 86400000) continue;
        const diff = Math.abs(dt.getTime() - rowDate.getTime());
        if (inFolder && diff < folderDiff) { folderDiff = diff; folderBest = email; }
        if (!hasFolderData && diff < globalDiff) { globalDiff = diff; globalBest = email; }
      }
    }

    // Strict: only return folder-matched contacts. Null = show staleness only, no company bubble.
    return hasFolderData ? folderBest : globalBest;
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
    // Calendar-day comparison — midnight to midnight.
    // Using raw millisecond division gives wrong results near day boundaries:
    // an email sent at 6pm yesterday = "0d" at 7am today (only 13h elapsed).
    // Comparing midnight-stripped dates gives the correct calendar answer: 1d.
    const now = new Date();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dateMidnight  = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    return Math.max(0, Math.floor((todayMidnight - dateMidnight) / 86400000));
  }

  function dateFromAriaLabel(label) {
    if (!label) return null;
    // CRITICAL: day-of-week and date patterns MUST come BEFORE time-only.
    // Outlook aria-labels contain "Mon 3:01 PM" — if time matches first, we return
    // "today" instead of last Monday. Checking day/date first ensures "Mon" is parsed
    // as the day-of-week, and time-only ("3:01 PM") is the last-resort = today.
    const patterns = [
      /\bToday\b/i,
      /\bYesterday\b/i,
      /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/i,
      /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/i,
      /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/,
      /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:,\s*\d{4})?\b/i,
      /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}(?:,\s*\d{4})?\b/i,
      /\d{1,2}:\d{2}\s*(AM|PM)/i,
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

  // ── Contact / company lookup (v3.31 — multi-strategy matching pipeline) ──────
  //
  // Priority order:
  //   1. DOM email scan — Outlook sometimes exposes recipient email in attributes
  //   2. Greeting name parse — "Hi Naveen, ..." → match first name against contacts
  //   2b. Greeting name vs email cache addresses (for contacts not in dashboard)
  //   3. From name parse — non-Dan sender names (inbound/mixed threads)
  //   3b. From name vs email cache addresses
  //   4. Returns null → row gets staleness-only badge (no company/step/reply)
  //
  // Name matching tries folder-restricted first, then cross-folder fallback.
  // Date tiebreaking used when multiple contacts share the same first name.

  // Strip diacritics so "Élise" matches "Elise" in name comparisons.
  function stripAccents(s) { return s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }

  const GREETING_GENERIC = new Set(['There', 'All', 'Team', 'Everyone', 'Folks', 'Friend', 'Sir', 'Madam']);
  const GREETING_RE = /\b(?:Hi|Hey|Hello|Dear)\s+([A-Z][a-z]{2,20})\b/;

  function extractGreetingName(row) {
    // Dan's outbound emails consistently start with "Hi/Hey/Hello [Name], ..."
    // Extract the first name from the preview text visible in the row.
    //
    // CRITICAL (v3.31): Search individual leaf text nodes, NOT row.textContent.
    // Outlook's DOM concatenates sibling elements without spaces:
    //   "IBISWorld Sample for Toast" + "Hi Pierre, I received..." = "ToastHi Pierre"
    // The \b before "Hi" breaks in concatenated text (both t and H are word chars).
    // But each leaf span's textContent has proper boundaries: "Hi Pierre, ..." starts
    // at position 0 where \b matches correctly.
    for (const el of row.querySelectorAll('*')) {
      if (el.childElementCount > 0) continue;
      if (el.closest('.ibis-row-badges')) continue;
      const t = el.textContent || '';
      if (t.length < 4 || t.length > 300) continue;
      const m = t.match(GREETING_RE);
      if (!m) continue;
      const name = m[1];
      if (GREETING_GENERIC.has(name) || OWN_NAMES.has(name.toLowerCase())) continue;
      return name;
    }
    // Fallback: search full row text with relaxed pattern (no leading \b).
    // Handles edge cases where preview text is in a container element, not a leaf.
    const fullText = row.textContent || '';
    const m = fullText.match(/(?:Hi|Hey|Hello|Dear)\s+([A-Z][a-z]{2,20})\b/);
    if (m) {
      const name = m[1];
      if (!GREETING_GENERIC.has(name) && !OWN_NAMES.has(name.toLowerCase())) return name;
    }
    return null;
  }

  function getNonDanFromNames(row) {
    // For inbound/mixed threads, the From field shows non-Dan sender names.
    // e.g., "Élise Doucet; Daniel Starr" → ["Élise Doucet"]
    const fromEl = findFromElement(row);
    if (!fromEl) return [];
    const text = fromEl.textContent.trim();
    return text.split(';')
      .map(s => s.trim())
      .filter(s => s.length >= 3 && !/\bdaniel\s*starr\b/i.test(s));
  }

  function matchContactsByFirstName(firstName, folder) {
    // Find contacts whose first name matches, optionally restricted to a folder.
    // folder = null means search ALL contacts (cross-folder fallback).
    const results = [];
    const lower = stripAccents(firstName).toLowerCase();
    for (const [email, c] of Object.entries(contactMap)) {
      if (folder && !c._folders?.includes(folder)) continue;
      const cFirst = stripAccents((c.name || '').split(/\s+/)[0]).toLowerCase();
      if (cFirst === lower) {
        results.push({ email, contact: c, domain: c.domain || email.split('@')[1] || '' });
      }
    }
    return results;
  }

  function matchContactsByFullName(fullName, folder) {
    // Try exact full-name match, then fall back to first-name-only.
    const results = [];
    const lower = stripAccents(fullName).toLowerCase().trim();
    for (const [email, c] of Object.entries(contactMap)) {
      if (folder && !c._folders?.includes(folder)) continue;
      if (stripAccents(c.name || '').toLowerCase().trim() === lower) {
        results.push({ email, contact: c, domain: c.domain || email.split('@')[1] || '' });
      }
    }
    if (results.length > 0) return results;
    // Fall back to first-name-only match
    const firstName = fullName.split(/\s+/)[0];
    return firstName && firstName.length >= 3 ? matchContactsByFirstName(firstName, folder) : [];
  }

  function tiebreakByDate(candidates, rowDate) {
    // When multiple contacts match by name, use PA cache dates to pick the best one.
    if (!rowDate || !emailCacheLoaded || candidates.length === 0) return null;
    const rowDayMs = new Date(rowDate.getFullYear(), rowDate.getMonth(), rowDate.getDate()).getTime();
    let best = null, bestDiff = Infinity;
    for (const cand of candidates) {
      const entry = emailCache[cand.email];
      if (!entry?.dates) continue;
      for (const d of entry.dates) {
        const dt = new Date(d);
        if (isNaN(dt.getTime())) continue;
        const dtDayMs = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
        if (Math.abs(dtDayMs - rowDayMs) > 86400000) continue; // ±1 day tolerance
        const diff = Math.abs(dt.getTime() - rowDate.getTime());
        if (diff < bestDiff) { bestDiff = diff; best = cand; }
      }
    }
    return best;
  }

  // Build a synthetic contactInfo result for a cache-only match (contact not in dashboard campaigns).
  function _synthCacheResult(cm, confidence) {
    const isPersonal = PERSONAL_DOMAINS.has(cm.domain);
    const accountName = !isPersonal ? (domainContactMap[cm.domain] || domainToName(cm.domain)) : '';
    const synthName = cm.nameParts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
    return {
      email: cm.email,
      contact: { accountName, domain: cm.domain, name: synthName, _folders: [] },
      domain: cm.domain,
      confidence,
    };
  }

  function findContactForRow(row, activeFolder, domDate) {
    // Diagnostic breadcrumbs — visible in F12 console when filtering [IBISWorld]
    const _diag = [];

    // ── Strategy 1: DOM email scan (highest confidence) ──
    for (const el of [row, ...row.querySelectorAll('[title*="@"],[aria-label*="@"],[data-email],[href*="mailto"]')]) {
      for (const attr of ['title', 'aria-label', 'data-email', 'href']) {
        const val = el.getAttribute(attr);
        if (!val || !val.includes('@')) continue;
        const emails = val.match(/[\w.+'\-]+@[\w.\-]+\.[a-z]{2,}/gi);
        if (!emails) continue;
        for (const email of emails) {
          const em = email.toLowerCase();
          if (!em.endsWith(OWN_DOMAIN) && !em.endsWith('.' + OWN_DOMAIN)) {
            return { email: em, contact: contactMap[em] || null, domain: em.split('@')[1], confidence: 'email' };
          }
        }
      }
    }

    _diag.push('S1:no-dom-email');
    if (Object.keys(contactMap).length === 0) { _diag.push('BAIL:contactMap-empty'); LOG('  ⛔ Match failed:', _diag.join(' → ')); return null; }

    // ── Strategy 2: Greeting name parse ("Hi Naveen, ...") ──
    const greetingName = extractGreetingName(row);
    if (greetingName) {
      _diag.push(`S2:greeting="${greetingName}"`);
      // Try folder-restricted first, then cross-folder fallback
      let matches = matchContactsByFirstName(greetingName, activeFolder);
      if (matches.length === 0) matches = matchContactsByFirstName(greetingName, null);
      if (matches.length === 1) return { ...matches[0], confidence: 'greeting' };
      if (matches.length > 1) {
        const best = domDate ? tiebreakByDate(matches, domDate) : null;
        if (best) return { ...best, confidence: 'greeting+date' };
        return { ...matches[0], confidence: 'greeting' }; // first match as last resort
      }
      _diag.push('S2:0-matches');
    } else {
      _diag.push('S2:no-greeting');
    }

    // ── Strategy 2b: Greeting name against email cache addresses ──
    // For contacts not in any dashboard campaign store but present in the PA email cache.
    // e.g. "Hi Ren" → cache has "ren.thomas@evergreen.edu" → match by first name "ren".
    if (greetingName && Object.keys(cacheNameMap).length > 0) {
      const lookupKey = stripAccents(greetingName).toLowerCase();
      const cacheMatches = cacheNameMap[lookupKey] || [];
      _diag.push(`S2b:cache-lookup="${lookupKey}" hits=${cacheMatches.length}`);
      if (cacheMatches.length === 1) {
        const cm = cacheMatches[0];
        return _synthCacheResult(cm, 'cache_name');
      }
      if (cacheMatches.length > 1) {
        const candidates = cacheMatches.map(cm => ({
          email: cm.email,
          contact: { accountName: '', domain: cm.domain, name: '', _folders: [] },
          domain: cm.domain,
        }));
        const best = domDate ? tiebreakByDate(candidates, domDate) : null;
        if (best) {
          const isP = PERSONAL_DOMAINS.has(best.domain);
          best.contact.accountName = !isP ? (domainContactMap[best.domain] || domainToName(best.domain)) : '';
          return { ...best, confidence: 'cache_name+date' };
        }
        // No date tiebreak possible — pick first
        return _synthCacheResult(cacheMatches[0], 'cache_name');
      }
    } else if (greetingName) {
      _diag.push('S2b:cacheNameMap-empty');
    }

    // ── Strategy 3: From name parse (non-Dan sender in inbound/mixed threads) ──
    const senderNames = getNonDanFromNames(row);
    _diag.push(`S3:senders=${senderNames.length > 0 ? senderNames.join(',') : 'none'}`);
    for (const senderName of senderNames) {
      // Try full name match first (contactMap)
      let matches = matchContactsByFullName(senderName, activeFolder);
      if (matches.length === 0) matches = matchContactsByFullName(senderName, null);
      if (matches.length === 1) return { ...matches[0], confidence: 'sender' };

      // Try first name only (contactMap)
      const firstName = senderName.split(/\s+/)[0];
      if (firstName && firstName.length >= 3) {
        let fMatches = matchContactsByFirstName(firstName, activeFolder);
        if (fMatches.length === 0) fMatches = matchContactsByFirstName(firstName, null);
        if (fMatches.length === 1) return { ...fMatches[0], confidence: 'sender_first' };
        if (fMatches.length > 1) {
          const best = domDate ? tiebreakByDate(fMatches, domDate) : null;
          if (best) return { ...best, confidence: 'sender_first+date' };
        }
      }

      // ── Strategy 3b: From name against email cache addresses ──
      if (firstName && firstName.length >= 3 && Object.keys(cacheNameMap).length > 0) {
        const lower = firstName.toLowerCase();
        if (!OWN_NAMES.has(lower)) {
          const cacheMatches = cacheNameMap[lower] || [];
          if (cacheMatches.length === 1) return _synthCacheResult(cacheMatches[0], 'cache_sender');
          if (cacheMatches.length > 1 && domDate) {
            const candidates = cacheMatches.map(cm => ({
              email: cm.email,
              contact: { accountName: '', domain: cm.domain, name: senderName, _folders: [] },
              domain: cm.domain,
            }));
            const best = tiebreakByDate(candidates, domDate);
            if (best) {
              const isP = PERSONAL_DOMAINS.has(best.domain);
              best.contact.accountName = !isP ? (domainContactMap[best.domain] || domainToName(best.domain)) : '';
              return { ...best, confidence: 'cache_sender+date' };
            }
          }
        }
      }
    }

    // ── Strategy 4: Broad text scan for any known contact first name ──
    // When greeting/from strategies fail (e.g. latest message is an inbound reply
    // so preview shows the contact's text, not Dan's "Hi [Name]"), scan the entire
    // row text for ANY known contact first name. Folder-restricted first.
    const rowText = stripAccents(row.textContent || '').toLowerCase();
    if (rowText.length > 0) {
      // Build candidate list from contactMap (folder-restricted first, then all)
      for (const folderRestrict of [activeFolder, null]) {
        for (const [email, c] of Object.entries(contactMap)) {
          if (folderRestrict && !c._folders?.includes(folderRestrict)) continue;
          const cName = c.name || '';
          const firstName = stripAccents(cName.split(/\s+/)[0] || '').toLowerCase();
          if (!firstName || firstName.length < 3 || OWN_NAMES.has(firstName)) continue;
          // Check if the contact's first name appears as a whole word in the row
          const re = new RegExp('\\b' + firstName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
          if (re.test(rowText)) {
            return { email, contact: c, domain: email.split('@')[1] || '', confidence: 'text_scan' };
          }
        }
      }
      // Also try cacheNameMap for contacts not in dashboard campaigns
      for (const [firstName, entries] of Object.entries(cacheNameMap)) {
        if (firstName.length < 3 || OWN_NAMES.has(firstName)) continue;
        const re = new RegExp('\\b' + firstName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
        if (re.test(rowText) && entries.length === 1) {
          return _synthCacheResult(entries[0], 'cache_text_scan');
        }
      }
    }

    _diag.push('S4:no-text-match');

    // ── Strategy 5: Date + domain correlation (PA-cache-only contacts) ──
    // Last resort for contacts NOT in dashboard campaigns. If name matching fails
    // (e.g. email is "ljones@allinial.com" but greeting says "Hey Lara"), try to
    // correlate the email domain with company text visible in the row (subject/preview).
    // Requires: ±1 day date match + domain text appears in row + exactly 1 candidate.
    if (domDate && emailCacheLoaded && rowText.length > 0) {
      const rowDayMs = new Date(domDate.getFullYear(), domDate.getMonth(), domDate.getDate()).getTime();
      const candidates = [];
      let dateMatchCount = 0;
      for (const [email, entry] of Object.entries(emailCache)) {
        if (contactMap[email]) continue; // already tried via Strategies 1-4
        if (!entry.dates?.length) continue;
        // Check if any send date is within ±1 calendar day of the row date
        const dateMatch = entry.dates.some(d => {
          const dt = new Date(d);
          if (isNaN(dt.getTime())) return false;
          const dtDayMs = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
          return Math.abs(dtDayMs - rowDayMs) <= 86400000;
        });
        if (!dateMatch) continue;
        dateMatchCount++;
        // Check if the email domain (minus TLD) appears in the row text
        const domain = email.split('@')[1] || '';
        if (PERSONAL_DOMAINS.has(domain)) continue;
        const domainBase = domain.split('.')[0].toLowerCase(); // "allinial" from "allinial.com"
        if (domainBase.length >= 3 && rowText.includes(domainBase)) {
          candidates.push({ email, domain, entry });
        }
      }
      _diag.push(`S5:dateHits=${dateMatchCount} domainHits=${candidates.length}`);
      if (candidates.length === 1) {
        const c = candidates[0];
        const accountName = domainContactMap[c.domain] || domainToName(c.domain);
        const local = c.email.split('@')[0];
        const parts = local.split(/[._\-+]/).filter(p => p.length >= 2 && !/\d/.test(p));
        const synthName = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
        LOG(`  Strategy 5 match: ${c.email} (domain "${c.domain}" found in row text)`);
        return {
          email: c.email,
          contact: { accountName, domain: c.domain, name: synthName, _folders: [] },
          domain: c.domain,
          confidence: 'date_domain',
        };
      }
    } else {
      _diag.push(`S5:skip(date=${!!domDate} cache=${emailCacheLoaded} text=${rowText.length})`);
    }

    LOG('  ⛔ Match failed:', _diag.join(' → '));
    return null; // no match — row gets staleness-only badge (no company/step/reply)
  }

  // ── DOM reply indicator detection ─────────────────────────────────────────────
  // v3.51 removed the old hasRowReplyIndicator — it scanned child elements for
  // "Reply"/"Forward" which matched Outlook's ACTION BUTTONS on every row.
  // v3.51 restores a MUCH narrower check: only the row's own aria-label for
  // PAST-TENSE status text ("replied"/"forwarded"). Action buttons use present
  // tense ("Reply"/"Forward"), so past-tense matching is safe.

  function hasRowReplyIndicator(row) {
    const aria = (row.getAttribute('aria-label') || '');
    // Past-tense ONLY — "replied" and "forwarded" are status indicators.
    // "reply", "replies", "forward" are action verbs on buttons — do NOT match.
    if (/\breplied\b|\bforwarded\b/i.test(aria)) return true;
    return false;
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
    rows = [...document.querySelectorAll('[data-convid]')];
    if (rows.length > 0) return rows;
    // v3.55: broader fallback — Outlook sometimes renders single-email folders
    // without role="option" or data-convid. Look for rows with aria-label
    // containing a date pattern (these are email rows, not headers/dividers).
    rows = [...document.querySelectorAll('[role="treeitem"][aria-label], [role="row"][aria-label], [aria-label*="Daniel Starr"]')].filter(el => {
      const label = el.getAttribute('aria-label') || '';
      // Must look like an email row: contains a date/time reference
      return /\b(AM|PM|today|yesterday|mon|tue|wed|thu|fri|sat|sun|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(label);
    });
    return rows;
  }

  // getThreadCountFromDOM REMOVED (v3.33) — Outlook's DOM thread count is the
  // full cross-folder conversation count (e.g. 10) not the per-thread-in-folder
  // count (e.g. 3). No reliable per-thread source exists from the list view.

  // ── Folder count model (v3.26+): scan-only, no estimation ───────────────────
  // folderCounts[f] is set ONLY when we physically navigate to folder f and scan
  // its DOM rows. This is the only reliable source of truth — estimating counts
  // from PA cache + dashboard campaign membership was wrong because:
  //   - dashboard campaign ≠ Outlook folder (e.g. a contact in ibis_samples may
  //     have their emails filed under the Workables Outlook folder, not Old Samples)
  //   - inflated / false counts for physically empty folders (e.g. Old Samples = 1
  //     when folder is empty, because Elise is in ibis_samples campaign in dashboard)
  //
  // How counts work:
  //   - On load: restored from ibis_folder_counts (chrome.storage) — previous session scan results
  //   - FC_VERSION bump: clears all persisted counts → fresh start, rebuild as folders are visited
  //   - Visit folder → scanEmailRows() → folderCounts[f] = realCount → persisted
  //   - Empty folder → scanEmailRows() resets to 0 → grey badge shown
  //   - Folders not yet visited in this version: no badge shown (undefined filtered in updateFolderBadges)

  // ── Folder nav badges ─────────────────────────────────────────────────────────

  function updateFolderBadges() {
    document.querySelectorAll('[role="treeitem"]').forEach(item => {
      // Primary: aria-label exact match (most reliable — "❄️ Winback, 23 unread" → "Winback").
      // Fallback: textContent .includes() with letter-suffix guard (v3.34).
      // The guard prevents "Multithreads" matching "Multithread" — if the character
      // immediately after the folder name is a letter, it's a different word (subfolder).
      const ariaLabel = (item.getAttribute('aria-label') || '').split(',')[0].trim();
      const folderName = (ariaLabel ? exactFolderMatch(ariaLabel) : null)
                      || CAMPAIGN_FOLDERS.find(f => {
                           const idx = item.textContent.indexOf(f);
                           if (idx < 0) return false;
                           const after = item.textContent[idx + f.length] || '';
                           return !/[a-zA-Z]/.test(after); // reject "Multithreads" (s is a letter)
                         })
                      || null;
      if (!folderName) return;

      const count = folderCounts[folderName];
      if (count === undefined) return; // not scanned yet — show nothing

      let badge = item.querySelector('.ibis-folder-badge');
      const isOverdue = count > 0;
      const countStr  = String(count);

      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'ibis-folder-badge';
        badge.dataset.ibisOverdue = String(isOverdue);

        item.style.setProperty('position', 'relative', 'important');
        // Force overflow visible up the ancestor chain
        let node = item;
        for (let i = 0; i < 5; i++) {
          if (!node) break;
          node.style.setProperty('overflow', 'visible', 'important');
          node = node.parentElement;
        }

        applyFolderBadgeStyle(badge, isOverdue);
        badge.textContent = countStr;  // set before appendChild to avoid second mutation
        item.appendChild(badge);
        return; // newly created — nothing more to update
      }

      // Only mutate the DOM when the displayed value has actually changed.
      // Setting textContent even to the same string creates a childList mutation,
      // which re-triggers the MutationObserver → infinite scan loop. Guard prevents this.
      if (badge.dataset.ibisOverdue !== String(isOverdue)) {
        badge.dataset.ibisOverdue = String(isOverdue);
        applyFolderBadgeStyle(badge, isOverdue);
      }
      if (badge.textContent !== countStr) {
        badge.textContent = countStr;
      }
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
    // Rate-limit: don't scan more than once per 2 seconds.
    // Outlook's DOM mutates constantly (unread counts, animations) — without this guard
    // the debounce keeps resetting and we scan dozens of times per minute needlessly.
    // EXCEPTION: for 5 seconds after a folder change, bypass the rate limit. Outlook's
    // SPA loads email rows progressively — the first scan sees partial rows, and follow-up
    // scans need to fire quickly to get the correct count as rows finish loading.
    const now = Date.now();
    const recentFolderChange = (now - folderChangeTime) < 5000;
    if (!recentFolderChange && now - lastScanTime < 2000) return;

    const activeFolder = getActiveCampaignFolder();
    if (!activeFolder) return; // silently skip — no log spam when on non-folder pages

    // When the user navigates to a different campaign folder, strip all stale row badges
    // and row-processed markers so rows are re-matched against the current email cache.
    // Without this, rows processed before the cache loaded (or from a prior folder visit)
    // keep their wrong data-ibis-processed stamp and never get re-evaluated.
    if (activeFolder !== lastActiveFolder) {
      LOG(`Folder change: "${lastActiveFolder}" → "${activeFolder}" — stripping stale badges`);
      document.querySelectorAll('[data-ibis-processed]').forEach(row => {
        row.removeAttribute('data-ibis-processed');
        row.removeAttribute('data-ibis-email');
        row.removeAttribute('data-ibis-match-dom');
        const badge = row.querySelector('.ibis-row-badges');
        if (badge) badge.remove();
      });
      lastActiveFolder = activeFolder;
      folderChangeTime = now; // enable 5s rapid-scan grace period
      // Trigger a background cache refresh on folder nav — ensures freshest PA data
      // when Dan actually looks at a folder. Won't block the scan (async).
      loadEmailCache();
    }

    const rows = getEmailRows();
    // Fast path: all rows already processed → no work needed.
    // Overdue count was already set on the last full scan; it only changes when
    // new rows appear, cache loads, or folder changes — all of which clear the
    // data-ibis-processed flags, so this fast path won't fire in those cases.
    if (rows.length > 0 && rows.every(r => r.dataset.ibisProcessed)) {
      lastScanTime = Date.now();
      scannedFolders.add(activeFolder); // protect from preload overwrite
      return;
    }
    if (!rows.length) {
      // v3.55: always log when getEmailRows returns 0 — helps debug missing badges
      LOG(`"${activeFolder}": 0 rows found by getEmailRows(). DOM check: option=${document.querySelectorAll('[role="option"]').length} listitem=${document.querySelectorAll('[role="listitem"]').length} convid=${document.querySelectorAll('[data-convid]').length}`);
      // Empty folder — reset badge count to 0 so stale counts don't persist
      if (emailCacheLoaded && activeFolder && folderCounts[activeFolder] !== 0) {
        folderCounts[activeFolder] = 0;
        if (ctxOk()) chrome.storage.local.set({ ibis_folder_counts: JSON.stringify(folderCounts), ibis_fc_version: FC_VERSION });
        updateFolderBadges();
      }
      scannedFolders.add(activeFolder); // protect from preload overwrite
      lastScanTime = Date.now();
      return;
    }

    // Debug state snapshot — visible in F12 console, filter "[IBISWorld]"
    LOG(`Scan: folder="${activeFolder}" contacts=${Object.keys(contactMap).length} cacheLoaded=${emailCacheLoaded} cacheEntries=${Object.keys(emailCache).length} retries=${cacheRetryCount}`);

    scanning = true;
    let overdueCount = 0;

    try {
      rows.forEach(row => {
        const alreadyProcessed = !!row.dataset.ibisProcessed;
        let storedEmail = row.dataset.ibisEmail || '';
        let emailMatchedViaDOM = row.dataset.ibisMatchDom === '1'; // true = high confidence

        // ── Date resolution (computed early — needed for name tiebreaking) ──
        const domDate = getDateFromRow(row);

        // ── Resolve email address ──
        // Priority: stored → DOM email → greeting name → From name → date fallback
        let cacheEntry = storedEmail ? emailCache[storedEmail] : null;

        if (!storedEmail) {
          // Multi-strategy matching: DOM email → greeting parse → From name parse
          const found = findContactForRow(row, activeFolder, domDate);
          if (found?.email) {
            storedEmail = found.email;
            cacheEntry = emailCache[storedEmail] || null;
            emailMatchedViaDOM = true; // all name-based matches are high confidence
            if (!alreadyProcessed) LOG(`  Match [${found.confidence}]: ${storedEmail} → ${found.contact?.accountName || '(no account)'}`);
          }
        }

        // Date-fallback REMOVED (v3.31) — with 107+ contacts, date collisions caused
        // wrong company names on most rows. Unmatched rows now show staleness-only.

        // Staleness date: use the MORE RECENT of DOM date and PA cache date (v3.34).
        // DOM date = when the email was filed in this campaign folder (could be weeks ago).
        // PA cache date = most recent email sent to this contact (from any context).
        // For outreach tracking, Dan wants "when did I last contact this person?" →
        // the more recent date is always the right answer.
        // v3.32 tried DOM-only but that was wrong: Dajin showed 16d (original filed
        // email from 3/25) when Dan sent a follow-up 4d ago (4/6 in PA cache).
        let date = domDate;
        if (storedEmail && cacheEntry?.lastDate) {
          const paDate = new Date(cacheEntry.lastDate);
          if (!isNaN(paDate.getTime()) && (!date || paDate > date)) {
            date = paDate; // PA cache has a more recent sent date
          }
        }

        const days = daysSince(date);

        // Always count for the folder badge — even already-badged rows
        if (days !== null && days >= OVERDUE_DAYS) overdueCount++;

        // Only inject badges once per row
        if (alreadyProcessed) return;
        // v3.54: NEVER skip a row silently. If date is null, still inject company bubble.
        // Old code: `if (days === null) return` — caused zero badges on rows where
        // date parsing failed, with no logging and no fallback. Now we continue and
        // let injectRowBadges handle null days gracefully.
        if (days === null && !alreadyProcessed) {
          LOG('⚠️ Date parse failed for row — will still inject company bubble. aria-label:', (row.getAttribute('aria-label') || '').slice(0, 80));
        }

        const contactInfo = storedEmail
          ? { email: storedEmail, contact: contactMap[storedEmail] || null, domain: storedEmail.split('@')[1] || '' }
          : null;

        // Step count: unique DAYS Dan emailed this contact (deduped to day level).
        // PA cache aggregates across all threads/folders, so raw count can be inflated
        // by the same email appearing in multiple PA source arrays.
        const resolvedEmail = storedEmail || '';
        const cacheData = resolvedEmail ? emailCache[resolvedEmail] : null;
        let stepCount = 0;
        if (cacheData?.dates?.length) {
          const uniqueDays = new Set(cacheData.dates.map(d => (d || '').slice(0, 10)));
          stepCount = uniqueDays.size;
        }

        // Reply detection — three sources:
        // 1. PA cache hasReplied: inbound email filed in campaign folder
        // 2. DOM From field: row's From shows non-Dan sender name
        // 3. Row aria-label status: Outlook marks rows with "Replied"/"Forwarded"
        //    (past tense only — safe from action button false positives)
        const domReply = getNonDanFromNames(row).length > 0;
        const rowReplyIcon = hasRowReplyIndicator(row);
        const hasReplied = cacheData?.hasReplied || domReply || rowReplyIcon;

        // Debug: log what we found for each row
        if (!alreadyProcessed && resolvedEmail) {
          LOG(`Row match: ${resolvedEmail} | domDate=${domDate?.toISOString().slice(0,10)} | paDate=${cacheEntry?.lastDate?.slice(0,10)||'none'} | steps=${stepCount} | replied=${hasReplied} | days=${days}`);
        }

        row.dataset.ibisProcessed = '1';
        if (resolvedEmail) row.dataset.ibisEmail = resolvedEmail;
        if (emailMatchedViaDOM) row.dataset.ibisMatchDom = '1';
        injectRowBadges(row, days, contactInfo, stepCount, emailMatchedViaDOM, hasReplied);
      });
    } catch (err) {
      LOG('Scan error (non-fatal):', err.message);
    } finally {
      // Always reset scanning flag — prevents permanent lock if any exception occurs
      folderCounts[activeFolder] = overdueCount;
      scannedFolders.add(activeFolder); // mark as DOM-scanned — preload won't overwrite
      if (ctxOk()) chrome.storage.local.set({ ibis_folder_counts: JSON.stringify(folderCounts), ibis_fc_version: FC_VERSION });
      updateFolderBadges();
      lastScanTime = Date.now();
      scanning = false;
      LOG(`"${activeFolder}": ${rows.length} rows, ${overdueCount} overdue`);
    }
  }

  // ── Row badge injection ───────────────────────────────────────────────────────

  function injectRowBadges(row, days, contactInfo, stepCount = 0, highConfidence = false, hasReplied = false) {
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

    // ── Staleness chip (skip if days unknown) ──
    if (days !== null) {
      const dotColor =
        days <= 2 ? '#16a34a' :  // 0-2d  — green
        days <= 5 ? '#d97706' :  // 3-5d  — yellow/amber
                    '#dc2626';   // 6d+   — red

      const glowColor =
        days <= 2 ? 'rgba(22,163,74,0.45)'  :
        days <= 5 ? 'rgba(217,119,6,0.45)'  :
                    'rgba(220,38,38,0.45)';

      const dayLabel = days === 0 ? 'today' : days + 'd';
      const tooltip  = `Last contact: ${days === 0 ? 'today' : days + (days === 1 ? ' day' : ' days') + ' ago'}`;

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
    }

    // ── Step count chip ──
    // Shows total emails sent to this contact (PA cache count). Gives Dan a quick
    // "how many times have I reached out to this person" signal.
    if (stepCount > 0) {
      const stepChip = document.createElement('span');
      stepChip.title = `${stepCount} unique day${stepCount === 1 ? '' : 's'} you emailed this contact (across all threads)`;
      p(stepChip, 'display',       'inline-flex');
      p(stepChip, 'align-items',   'center');
      p(stepChip, 'gap',           '3px');
      p(stepChip, 'background',    '#f9fafb');
      p(stepChip, 'border',        '1px solid #e5e7eb');
      p(stepChip, 'border-radius', '999px');
      p(stepChip, 'padding',       '1px 7px 1px 6px');
      p(stepChip, 'white-space',   'nowrap');
      p(stepChip, 'line-height',   '18px');
      p(stepChip, 'cursor',        'default');
      stepChip.innerHTML =
        `<span style="font-size:10px;line-height:1">✉</span>` +
        `<span style="font-family:monospace;font-size:10px;font-weight:700;color:#374151">${stepCount}</span>`;
      wrap.appendChild(stepChip);
    }

    // ── Reply indicator ──
    // Green ↩ chip when the contact has replied. Detected two ways:
    // 1. PA cache hasReplied (inbound email in campaign folder)
    // 2. DOM From field shows non-Dan name (works even if reply is in Inbox only)
    if (hasReplied) {
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
    // Resolve the company name + favicon domain. Three tiers:
    //   1. contactInfo exists → use contact's accountName / domain (highest confidence)
    //   2. No contact match → scan row text (subject/preview) for a known dashboard account name
    //   3. Neither → no company bubble
    let companyName = '';
    let faviconDomain = '';

    if (contactInfo) {
      const { contact, domain } = contactInfo;
      const isPersonalDomain = PERSONAL_DOMAINS.has(domain);
      companyName = contact?.accountName
        || (!isPersonalDomain && domainContactMap[domain])
        || (highConfidence && !isPersonalDomain ? domainToName(domain) : '')
        || '';
      if (companyName && domain) {
        faviconDomain = FAVICON_DOMAIN_OVERRIDES[domain] || domain;
      }
    }

    // Fallback: scan row text for any known account name from the dashboard.
    // This catches rows like "IBISWorld Enhancements for Allinial Global" where
    // the contact is NOT in any campaign store and NOT in the PA email cache,
    // but the company name is visible right in the subject line.
    if (!companyName) {
      const rowTextRaw = row.textContent || '';
      const found = findAccountNameInText(rowTextRaw);
      if (found) {
        companyName = found.name;
        faviconDomain = found.domain ? (FAVICON_DOMAIN_OVERRIDES[found.domain] || found.domain) : '';
      }
    }

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

      if (faviconDomain) {
        const img = document.createElement('img');
        const directUrl = FAVICON_URL_OVERRIDES[faviconDomain];
        img.src = directUrl || `https://icons.duckduckgo.com/ip3/${faviconDomain}.ico`;
        img.style.cssText = 'width:12px;height:12px;border-radius:2px;flex-shrink:0;object-fit:contain';
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
      if (el.closest('.ibis-row-badges')) return false; // skip our own injected badges
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
    const clean = domain.replace(/^www\./, '');
    if (COMPANY_NAME_OVERRIDES[clean]) return COMPANY_NAME_OVERRIDES[clean];
    return clean.split('.')[0]
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  // Find a known account name inside row text (subject/preview).
  // Returns { name, domain } or null. Searches longest names first to prefer
  // "Allinial Global" over a hypothetical "Allinial" or "Global".
  // Skips very short names (< 4 chars) to avoid false matches on common words.
  let _sortedAccountNames = null;
  function findAccountNameInText(text) {
    if (!text || Object.keys(accountNameMap).length === 0) return null;
    // Cache sorted keys (longest first) — only rebuild when map changes
    if (!_sortedAccountNames || _sortedAccountNames._size !== Object.keys(accountNameMap).length) {
      _sortedAccountNames = Object.keys(accountNameMap).filter(k => k.length >= 4).sort((a, b) => b.length - a.length);
      _sortedAccountNames._size = Object.keys(accountNameMap).length;
    }
    const lower = text.toLowerCase();
    for (const key of _sortedAccountNames) {
      if (lower.includes(key)) {
        return accountNameMap[key];
      }
    }
    return null;
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
        version: '3.45',
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
          email: e, name: c.name, account: c.accountName, folders: c._folders
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
    // 300ms debounce: short enough to fire despite Outlook's constant DOM mutations.
    // Outlook mutates every ~500ms (unread counts, animations) — a longer debounce
    // (e.g. 1500ms) would reset on every mutation and NEVER fire.
    // Scan spam is handled by the 2-second lastScanTime guard inside scanEmailRows(),
    // not here. These two guards solve different problems and work together.
    debounceTimer = setTimeout(() => {
      updateFolderBadges();
      scanEmailRows();
    }, 300);
  }

  // ── Init ──────────────────────────────────────────────────────────────────────

  function init() {
    if (!ctxOk()) return;
    LOG('v3.55 init on', location.hostname);

    // IMPORTANT: seed folderCounts from storage FIRST, then start all async data loads.
    // Counts are restored from the previous session's DOM scans. They are never estimated
    // from PA cache — only real folder scans update folderCounts (see v3.26 model above).
    chrome.storage.local.get(['ibis_folder_counts', 'ibis_fc_version', 'ibis_email_cache_map'], (res) => {
      try {
        if (res.ibis_fc_version === FC_VERSION && res.ibis_folder_counts) {
          Object.assign(folderCounts, JSON.parse(res.ibis_folder_counts));
        }
      } catch (_) {}

      // Instant email cache from previous session — badges appear immediately instead
      // of waiting 5-10s for the SharePoint fetch. Fresh data loads in the background.
      if (res.ibis_email_cache_map && typeof res.ibis_email_cache_map === 'object') {
        const size = Object.keys(res.ibis_email_cache_map).length;
        if (size > 0) {
          emailCache = res.ibis_email_cache_map;
          emailCacheLoaded = true;
          buildCacheNameMap();
          LOG('Instant cache:', size, 'contacts from previous session');
        }
      }

      updateFolderBadges();       // show persisted counts immediately while data loads
      loadContactMap();
      setInterval(loadContactMap, 60_000);
      loadEmailCache();           // fetch fresh data from SharePoint (overwrites on success)
      setInterval(loadEmailCache, 15 * 60 * 1000); // refresh every 15min (PA flow runs every 2h)
      // Heartbeat keeps folder badges alive after Outlook re-renders the nav.
      setInterval(updateFolderBadges, 1500);
      // Recovery heartbeat — detect rows that lost their badges (Outlook re-render)
      // and force a re-scan. Staggered from folder badge heartbeat to spread load.
      // v3.54: Also checks for rows that have data-ibis-processed but NO badge HTML.
      // Outlook re-renders can strip injected HTML while leaving data attributes.
      setInterval(() => {
        const af = getActiveCampaignFolder();
        if (!af) return;
        const rows = getEmailRows();
        if (rows.length === 0) return;
        const needsScan = rows.some(r =>
          !r.dataset.ibisProcessed || // never processed
          (r.dataset.ibisProcessed && !r.querySelector('.ibis-row-badges')) // processed but HTML gone
        );
        if (needsScan) {
          // Strip stale processed flags from rows missing badge HTML
          rows.forEach(r => {
            if (r.dataset.ibisProcessed && !r.querySelector('.ibis-row-badges')) {
              r.removeAttribute('data-ibis-processed');
              r.removeAttribute('data-ibis-email');
              r.removeAttribute('data-ibis-match-dom');
            }
          });
          LOG('Recovery: rows missing badges — re-scanning');
          lastScanTime = 0; // bypass 2s rate limit for recovery
          scanEmailRows();
        }
      }, 3500);
      new MutationObserver(onMutation).observe(document.body, { childList: true, subtree: true });
      setTimeout(() => {
        LOG('Initial scan — title:', document.title, '| email cache entries:', Object.keys(emailCache).length);
        scanEmailRows();
      }, 400); // fast — instant cache means data is ready immediately
      // Fallback scans for slow Outlook SPA loads — title/treeitems may not exist at 400ms
      setTimeout(() => { updateFolderBadges(); scanEmailRows(); }, 2000);
      setTimeout(() => { updateFolderBadges(); scanEmailRows(); }, 5000);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else setTimeout(init, 200); // was 500ms — shaved for faster startup

})();
