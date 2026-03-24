// IBISWorld Outreach — content script v2.0
// Priority engine + 3-view sidebar. Reads contacts from bridge.js via
// chrome.storage.local, silently fetches email history from OWA API,
// buckets contacts by urgency, and surfaces a clean action list in Outlook.

(function () {
  'use strict';

  // ── Constants ─────────────────────────────────────────────────────────────

  const SIDEBAR_ID = 'ibis-outreach-sidebar';
  const TAB_ID     = 'ibis-collapse-tab';
  const BADGE_H    = 40;

  const STAGE_COLORS = {
    'Introduction':   { bg: '#fef9c3', color: '#854d0e' },
    'Walkthrough':    { bg: '#dbeafe', color: '#1e40af' },
    'Proposal':       { bg: '#dcfce7', color: '#166534' },
    'Stalled':        { bg: '#ffedd5', color: '#9a3412' },
    'Lost':           { bg: '#fee2e2', color: '#991b1b' },
    'Future Revisit': { bg: '#ede9fe', color: '#5b21b6' },
  };

  const AVATAR_COLORS = [
    '#4f46e5','#0891b2','#059669','#d97706',
    '#7c3aed','#db2777','#0284c7','#be185d',
  ];

  const EXCLUDED_STAGES = new Set(['Lost']);

  // Priority buckets — order here = display order on home screen
  const BUCKETS = [
    { id: 'scheduled',     icon: '📅', label: 'Scheduled',     color: '#7c3aed', bg: '#ede9fe', desc: 'Follow-up due'    },
    { id: 'email_today',   icon: '🔴', label: 'Email Today',    color: '#dc2626', bg: '#fee2e2', desc: '3d+ no reply'     },
    { id: 'active',        icon: '🟢', label: 'Active Thread',  color: '#16a34a', bg: '#dcfce7', desc: 'They replied'     },
    { id: 'sent_recently', icon: '🟡', label: 'Sent Recently',  color: '#d97706', bg: '#fef9c3', desc: 'Awaiting reply'   },
    { id: 'ice',           icon: '🧊', label: 'On Ice',         color: '#6b7280', bg: '#f3f4f6', desc: 'Stalled / Future' },
  ];

  // OWA fetch routes through background.js to avoid CORS. Content scripts cannot
  // make credentialed cross-origin requests even with host_permissions — but
  // background service workers can. See background.js → FETCH_EMAILS handler.

  // ── State ─────────────────────────────────────────────────────────────────

  let allContacts     = [];   // Priority Engine: non-archived, non-Lost contacts
  let allWorkables    = [];   // Workables campaign: all non-archived (includes Lost)
  let emailCache      = {};   // keyed by contact email address
  let scanProgress    = { done: 0, total: 0 };
  let scanActive      = false;
  let scanFailures    = 0;
  let currentView     = 'home';   // 'home' | 'list' | 'thread' | 'debug'
  let currentBucketId = null;
  let currentContact  = null;

  // Diagnostic state — shown in the debug panel (footer tap)
  let diagState = {
    owaOk:        null,   // null=untested · true=working · false=failing
    owaError:     null,   // last error string
    fetched:      0,      // successful fetches this session
    failed:       0,      // failed fetches this session
    errors:       [],     // last 8 {email, error}
    lastScanTime: null,   // timestamp of most recent completed scan
    msalFound:    null,   // null=untested · true=MSAL token found · false=not found
  };

  // ── Context guard ─────────────────────────────────────────────────────────

  function ctxOk() {
    try { return !!chrome.runtime.id; } catch (_) { return false; }
  }

  // ── Priority engine ───────────────────────────────────────────────────────

  function getPriorityBucket(contact, cache) {
    const stage = contact.stage || 'Introduction';

    // Stage always gates first
    if (['Stalled', 'Future Revisit'].includes(stage)) return 'ice';

    // Scheduled: nextDate exists and is today or past (date-only, local time)
    if (contact.nextDate) {
      const nd = new Date(contact.nextDate + 'T00:00:00');
      const today = new Date(); today.setHours(0, 0, 0, 0);
      if (nd <= today) return 'scheduled';
    }

    // Without real email data, default to email_today — they still need an action
    if (!cache || cache.failed || !cache.ts) return 'email_today';

    if (cache.isActiveThread)  return 'active';
    if (cache.daysSinceLastOutbound !== null &&
        cache.daysSinceLastOutbound <= IBIS_CONFIG.EMAIL_TODAY_DAYS) return 'sent_recently';
    return 'email_today';
  }

  function getBucketContacts(bucketId) {
    const contacts = allContacts.filter(
      c => getPriorityBucket(c, emailCache[c.email]) === bucketId
    );

    return contacts.sort((a, b) => {
      const ca = emailCache[a.email];
      const cb = emailCache[b.email];
      // Each bucket sorts by its most actionable signal
      if (bucketId === 'scheduled') {
        return new Date(a.nextDate) - new Date(b.nextDate); // most overdue first
      }
      if (bucketId === 'email_today') {
        const da = ca?.daysSinceLastOutbound ?? 9999;
        const db = cb?.daysSinceLastOutbound ?? 9999;
        return db - da; // longest silence first
      }
      if (bucketId === 'active') {
        const da = ca?.daysSinceLastInbound ?? 9999;
        const db = cb?.daysSinceLastInbound ?? 9999;
        return da - db; // most recent reply first
      }
      if (bucketId === 'sent_recently') {
        const da = ca?.daysSinceLastOutbound ?? 9999;
        const db = cb?.daysSinceLastOutbound ?? 9999;
        return da - db; // most recently sent first
      }
      return (a.accountName || '').localeCompare(b.accountName || '');
    });
  }

  // ── Email fetching ────────────────────────────────────────────────────────

  // Extract Microsoft auth token from the page's MSAL localStorage cache.
  // The new Outlook (outlook.cloud.microsoft) stores MSAL access tokens here.
  // Content scripts share the page's localStorage (same origin), so we can
  // read the token and pass it to the background SW for Graph API calls.
  function extractMSALToken() {
    const stores = [localStorage, sessionStorage];
    for (const store of stores) {
      try {
        for (let i = 0; i < store.length; i++) {
          const key = store.key(i);
          if (!key || !key.toLowerCase().includes('accesstoken')) continue;
          try {
            const val = JSON.parse(store.getItem(key));
            if (val && typeof val.secret === 'string' && val.secret.length > 100) {
              const exp = parseInt(val.expiresOn || val.extended_expires_on || '0', 10);
              if (exp === 0 || exp > Math.floor(Date.now() / 1000) + 60) {
                return val.secret;
              }
            }
          } catch (_) {}
        }
      } catch (_) {}
    }
    return null;
  }

  // Fetch is routed through background.js — background SWs are exempt from CORS
  // for host_permissions origins. Graph API token extracted from page localStorage
  // is passed along so the BG SW can use it as a Bearer token (Graph first, OWA fallback).
  function fetchEmailHistory(email) {
    return new Promise((resolve, reject) => {
      if (!ctxOk()) { reject(new Error('Extension context invalid')); return; }
      const graphToken = extractMSALToken();
      if (diagState.msalFound === null) diagState.msalFound = !!graphToken;
      chrome.runtime.sendMessage(
        { type: 'FETCH_EMAILS', email, depth: IBIS_CONFIG.EMAIL_HISTORY_DEPTH, graphToken },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (!response?.ok) {
            reject(new Error(response?.error || 'Background fetch failed'));
            return;
          }
          resolve(response.emails);
        }
      );
    });
  }

  function processEmails(emails) {
    const danEmail = IBIS_CONFIG.MY_EMAIL.toLowerCase();
    let lastOutboundDate = null;
    let lastInboundDate  = null;
    const processed      = [];

    for (const em of emails) {
      const fromAddr = (em.From?.EmailAddress?.Address || '').toLowerCase();
      const isOut    = fromAddr === danEmail;
      const date     = new Date(em.ReceivedDateTime);

      if (isOut  && (!lastOutboundDate || date > lastOutboundDate)) lastOutboundDate = date;
      if (!isOut && (!lastInboundDate  || date > lastInboundDate))  lastInboundDate  = date;

      processed.push({
        subject:   em.Subject || '(No subject)',
        date:      em.ReceivedDateTime,
        direction: isOut ? 'outbound' : 'inbound',
        daysAgo:   Math.floor((Date.now() - date.getTime()) / 86400000),
      });
    }

    const now    = Date.now();
    const daysOut = lastOutboundDate ? Math.floor((now - lastOutboundDate.getTime()) / 86400000) : null;
    const daysIn  = lastInboundDate  ? Math.floor((now - lastInboundDate.getTime())  / 86400000) : null;

    // Active thread: contact replied AND their reply is more recent than Dan's last send
    const isActiveThread = !!(
      lastInboundDate && (!lastOutboundDate || lastInboundDate > lastOutboundDate)
    );

    // Stale: N consecutive outbound-only OR total silence > threshold
    let outboundStreak = 0;
    for (const e of processed) {
      if (e.direction === 'outbound') outboundStreak++;
      else break;
    }
    const daysSinceAny = Math.min(daysOut ?? Infinity, daysIn ?? Infinity);
    const isStale = outboundStreak >= IBIS_CONFIG.STALE_OUTBOUND_STREAK
      || daysSinceAny > IBIS_CONFIG.STALE_DAYS_THRESHOLD;

    return {
      ts:                    Date.now(),
      lastOutboundDate:      lastOutboundDate?.toISOString() || null,
      lastInboundDate:       lastInboundDate?.toISOString()  || null,
      daysSinceLastOutbound: daysOut,
      daysSinceLastInbound:  daysIn,
      isActiveThread,
      isStale,
      outboundStreak,
      totalEmailCount: emails.length,
      emails:          processed.slice(0, 10), // keep latest 10 for thread view
    };
  }

  // ── Scan queue ────────────────────────────────────────────────────────────

  async function runScanQueue(contacts) {
    if (scanActive) return;
    const CACHE_TTL_MS = IBIS_CONFIG.CACHE_TTL_MINUTES * 60 * 1000;

    const toScan = contacts.filter(c => {
      if (!c.email) return false;
      const cached = emailCache[c.email];
      if (!cached) return true;
      return (Date.now() - (cached.ts || 0)) > CACHE_TTL_MS;
    });

    if (!toScan.length) {
      updateFooterStatus(allContacts.length + ' contacts · enriched');
      return;
    }

    scanActive   = true;
    scanFailures = 0;
    scanProgress = { done: 0, total: toScan.length };
    updateProgressUI();

    const batchSize = IBIS_CONFIG.BATCH_SIZE;
    for (let i = 0; i < toScan.length; i += batchSize) {
      if (!ctxOk()) break;
      await Promise.all(toScan.slice(i, i + batchSize).map(c => scanOne(c)));
      if (i + batchSize < toScan.length) await sleep(1200);
    }

    scanActive            = false;
    diagState.lastScanTime = Date.now();
    updateProgressUI();
    renderCurrentView();
    updateFooterStatus(allContacts.length + ' contacts · tap for diagnostics');
  }

  async function scanOne(contact) {
    try {
      const raw    = await fetchEmailHistory(contact.email);
      const result = processEmails(raw);
      emailCache[contact.email] = result;
      // Track success
      diagState.owaOk = true;
      diagState.fetched++;
      if (ctxOk()) {
        const patch = {};
        patch['ec_' + contact.email] = result;
        chrome.storage.local.set(patch);
      }
    } catch (e) {
      console.warn('[IBISWorld] Scan failed:', contact.email, e.message);
      scanFailures++;
      emailCache[contact.email] = { ts: Date.now(), failed: true, error: e.message };
      // Track failure
      diagState.owaOk    = diagState.owaOk === true ? true : false; // stay true if any succeeded
      diagState.owaError = e.message;
      diagState.failed++;
      diagState.errors   = [{ email: contact.email, error: e.message }, ...diagState.errors].slice(0, 8);
    }
    scanProgress.done++;
    updateProgressUI();
    // Live-update home bucket counts after each contact resolves
    if (currentView === 'home') updateBucketCounts();
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ── Sidebar shell ─────────────────────────────────────────────────────────

  function buildSidebar() {
    const el = document.createElement('div');
    el.id = SIDEBAR_ID;
    el.innerHTML = `
      <div id="ibis-sidebar-header">
        <span id="ibis-sidebar-title">📬 Outreach</span>
        <div id="ibis-header-btns">
          <button id="ibis-refresh-btn" title="Re-scan all contacts">🔄</button>
          <button id="ibis-sidebar-toggle" title="Collapse sidebar">‹</button>
        </div>
      </div>
      <div id="ibis-progress-wrap">
        <div id="ibis-progress-bar"><div id="ibis-progress-fill"></div></div>
        <div id="ibis-progress-label"></div>
      </div>
      <div id="ibis-sidebar-body" class="ibis-body-padded"></div>
      <div id="ibis-sidebar-footer">
        <div id="ibis-footer-status">Syncing contacts…</div>
      </div>
    `;
    return el;
  }

  function buildCollapseTab() {
    const el = document.createElement('div');
    el.id    = TAB_ID;
    el.innerHTML = '<span class="ibis-tab-i">I</span>';
    el.title = 'Open IBISWorld Outreach';
    return el;
  }

  // ── View router ───────────────────────────────────────────────────────────

  function navTo(view, opts) {
    opts = opts || {};
    const body = document.getElementById('ibis-sidebar-body');
    if (body) {
      body.classList.toggle('ibis-body-padded', view === 'home');
      body.classList.toggle('ibis-body-flush',  view !== 'home');
      body.classList.toggle('ibis-body-debug',  view === 'debug');
    }
    currentView     = view;
    if (opts.bucket  !== undefined) currentBucketId = opts.bucket;
    if (opts.contact !== undefined) currentContact  = opts.contact;
    renderCurrentView();
  }

  function renderCurrentView() {
    if (currentView === 'home')   renderHomeBody();
    if (currentView === 'list')   renderContactListBody();
    if (currentView === 'thread') renderThreadBody();
    if (currentView === 'debug')  renderDebugBody();
  }

  // ── View 1: Home — priority bucket cards ─────────────────────────────────

  function renderHomeBody() {
    const body = document.getElementById('ibis-sidebar-body');
    if (!body) return;

    const bucketCardsHTML = BUCKETS.map(b => {
      const count = getBucketContacts(b.id).length;
      const active = count > 0;
      return `
        <div class="ibis-bucket-card${active ? ' has-contacts' : ''}" data-bucket="${b.id}">
          <div class="ibis-bucket-icon-wrap" style="background:${b.bg}">
            <span class="ibis-bucket-icon-inner">${b.icon}</span>
          </div>
          <div class="ibis-bucket-info">
            <div class="ibis-bucket-name">${b.label}</div>
            <div class="ibis-bucket-desc">${b.desc}</div>
          </div>
          <div class="ibis-bucket-count${active ? ' active-count' : ''}"
               id="ibis-count-${b.id}"
               style="${active ? 'background:' + b.bg + ';color:' + b.color + ';border-color:' + b.color + '40' : ''}"
          >${count}</div>
        </div>`;
    }).join('');

    const wCount  = allWorkables.length;  // all non-archived contacts (includes Lost)
    const wActive = wCount > 0;

    body.innerHTML = `
      <div class="ibis-section-label">Priority Engine</div>
      ${bucketCardsHTML}
      <div class="ibis-section-label" style="margin-top:8px">Campaigns</div>
      <div class="ibis-bucket-card${wActive ? ' has-contacts' : ''}" data-bucket="workables">
        <div class="ibis-bucket-icon-wrap" style="background:#fef3c7"><span class="ibis-bucket-icon-inner">🎯</span></div>
        <div class="ibis-bucket-info">
          <div class="ibis-bucket-name">Workables</div>
          <div class="ibis-bucket-desc">Full pipeline</div>
        </div>
        <div class="ibis-bucket-count${wActive ? ' active-count' : ''}"
             id="ibis-count-workables"
             style="${wActive ? 'background:#fef3c7;color:#b45309;border-color:#b4530940' : ''}"
        >${wCount}</div>
      </div>
      <div class="ibis-bucket-card placeholder">
        <div class="ibis-bucket-icon-wrap" style="background:#e0f2fe"><span class="ibis-bucket-icon-inner">🔄</span></div>
        <div class="ibis-bucket-info">
          <div class="ibis-bucket-name">Winbacks</div>
          <div class="ibis-bucket-desc">Re-engagement</div>
        </div>
        <div class="ibis-bucket-count">—</div>
      </div>
      <div class="ibis-bucket-card placeholder">
        <div class="ibis-bucket-icon-wrap" style="background:#f3e8ff"><span class="ibis-bucket-icon-inner">📋</span></div>
        <div class="ibis-bucket-info">
          <div class="ibis-bucket-name">Samples</div>
          <div class="ibis-bucket-desc">Trial send-outs</div>
        </div>
        <div class="ibis-bucket-count">—</div>
      </div>
    `;

    body.querySelectorAll('.ibis-bucket-card:not(.placeholder)').forEach(card => {
      card.addEventListener('click', () => navTo('list', { bucket: card.dataset.bucket }));
    });
  }

  function updateBucketCounts() {
    BUCKETS.forEach(b => {
      const el = document.getElementById('ibis-count-' + b.id);
      if (!el) return;
      const count  = getBucketContacts(b.id).length;
      const active = count > 0;
      el.textContent = count;
      el.style.background  = active ? b.bg    : '';
      el.style.color       = active ? b.color : '';
      el.style.borderColor = active ? b.color + '40' : '';
      const card = el.closest('.ibis-bucket-card');
      if (card) card.classList.toggle('has-contacts', active);
    });
  }

  // ── View 2: Contact list — contacts in a bucket ───────────────────────────

  function renderContactListBody() {
    const body = document.getElementById('ibis-sidebar-body');
    if (!body) return;

    const isWorkables = currentBucketId === 'workables';
    const bucket      = BUCKETS.find(b => b.id === currentBucketId);

    let contacts;
    if (isWorkables) {
      // Show all contacts sorted by urgency (most actionable first)
      const PRIORITY = { email_today: 0, active: 1, sent_recently: 2, scheduled: 3, ice: 4 };
      contacts = [...allContacts].sort((a, b) => {
        const pa = PRIORITY[getPriorityBucket(a, emailCache[a.email])] ?? 5;
        const pb = PRIORITY[getPriorityBucket(b, emailCache[b.email])] ?? 5;
        if (pa !== pb) return pa - pb;
        return (a.accountName || '').localeCompare(b.accountName || '');
      });
    } else {
      contacts = getBucketContacts(currentBucketId);
    }

    const headerIcon  = isWorkables ? '🎯' : (bucket ? bucket.icon  : '');
    const headerLabel = isWorkables ? 'Workables' : (bucket ? bucket.label : '');

    const rowsHTML = contacts.length
      ? contacts.map(contactRowHTML).join('')
      : `<div class="ibis-contact-empty">No contacts here yet.<br>
           <small>${scanActive ? 'Scan in progress…' : 'All caught up!'}</small>
         </div>`;

    body.innerHTML = `
      <div class="ibis-list-header">
        <button class="ibis-back-btn" id="ibis-back-to-home">← Home</button>
        <div class="ibis-list-title">
          <span>${headerIcon}</span>
          <span>${headerLabel}</span>
          <span class="ibis-list-count">${contacts.length}</span>
        </div>
      </div>
      <div class="ibis-contact-list-body">${rowsHTML}</div>
    `;

    document.getElementById('ibis-back-to-home').addEventListener('click', () => navTo('home'));

    body.querySelectorAll('.ibis-contact-row').forEach(row => {
      row.addEventListener('click', () => {
        // Workables list includes Lost contacts (allWorkables); other lists use allContacts
        const pool    = isWorkables ? allWorkables : allContacts;
        const contact = pool.find(c => c.email === row.dataset.email);
        if (contact) navTo('thread', { contact });
      });
    });
  }

  function contactRowHTML(c) {
    const sc      = STAGE_COLORS[c.stage] || { bg: '#f3f4f6', color: '#6b7280' };
    const initial = (c.name || '?').trim()[0].toUpperCase();
    const color   = AVATAR_COLORS[(initial.charCodeAt(0) || 65) % AVATAR_COLORS.length];
    const cache   = emailCache[c.email];
    const email   = (c.email || '').replace(/"/g, '&quot;');
    const chip    = timingChipHTML(c, cache);
    const stale   = cache?.isStale
      ? '<span class="ibis-stale-dot" title="Stale — consider closing out">⚫</span>' : '';
    const nextAct = c.nextAction && c.nextAction !== '—'
      ? `<div class="ibis-contact-next-action">${c.nextAction}</div>` : '';

    return `
      <div class="ibis-contact-row" data-email="${email}" title="View thread with ${c.name || ''}">
        <div class="ibis-contact-avatar" style="background:${color}">${initial}</div>
        <div class="ibis-contact-info">
          <div class="ibis-contact-name">${c.name || 'Unknown'}${stale}</div>
          <div class="ibis-contact-company">${c.accountName || ''}</div>
          ${nextAct}
        </div>
        <div class="ibis-contact-right">
          ${chip}
          <span class="ibis-stage-pill" style="background:${sc.bg};color:${sc.color}">${c.stage || 'Introduction'}</span>
        </div>
      </div>`;
  }

  function timingChipHTML(contact, cache) {
    if (!cache || cache.failed) {
      return '<span class="ibis-timing-chip tc-unknown">?</span>';
    }
    const bucket = getPriorityBucket(contact, cache);

    if (bucket === 'scheduled' && contact.nextDate) {
      const days  = Math.floor((Date.now() - new Date(contact.nextDate + 'T00:00:00')) / 86400000);
      const label = days === 0 ? 'due today' : days + 'd overdue';
      return `<span class="ibis-timing-chip tc-scheduled">${label}</span>`;
    }
    if (bucket === 'active' && cache.daysSinceLastInbound !== null) {
      return `<span class="ibis-timing-chip tc-active">replied ${cache.daysSinceLastInbound}d ago</span>`;
    }
    if (bucket === 'sent_recently' && cache.daysSinceLastOutbound !== null) {
      return `<span class="ibis-timing-chip tc-sent">sent ${cache.daysSinceLastOutbound}d ago</span>`;
    }
    if (bucket === 'email_today') {
      const label = cache.daysSinceLastOutbound !== null
        ? cache.daysSinceLastOutbound + 'd silent' : 'no emails yet';
      return `<span class="ibis-timing-chip tc-urgent">${label}</span>`;
    }
    return '';
  }

  // ── View 3: Thread view — single contact detail ───────────────────────────

  function renderThreadBody() {
    const body = document.getElementById('ibis-sidebar-body');
    if (!body) return;

    const c       = currentContact;
    const cache   = emailCache[c.email];
    const sc      = STAGE_COLORS[c.stage] || { bg: '#f3f4f6', color: '#6b7280' };
    const initial = (c.name || '?').trim()[0].toUpperCase();
    const color   = AVATAR_COLORS[(initial.charCodeAt(0) || 65) % AVATAR_COLORS.length];
    const bucket  = BUCKETS.find(b => b.id === currentBucketId);

    // Status bar — the key cadence signal
    let statusHTML = '';
    if (!cache || cache.failed) {
      statusHTML = `<div class="ibis-thread-status tc-unknown">⏳ Scanning email history…</div>`;
    } else if (cache.isActiveThread && cache.daysSinceLastInbound !== null) {
      statusHTML = `<div class="ibis-thread-status tc-active">
        🟢 They replied <strong>${cache.daysSinceLastInbound}d ago</strong> — your move
      </div>`;
    } else if (cache.daysSinceLastOutbound !== null) {
      statusHTML = `<div class="ibis-thread-status tc-waiting">
        🟡 You emailed <strong>${cache.daysSinceLastOutbound}d ago</strong> — no reply yet
      </div>`;
    } else {
      statusHTML = `<div class="ibis-thread-status tc-cold">No email history found</div>`;
    }

    // Email thread list
    let threadHTML = '';
    if (!cache || cache.failed) {
      threadHTML = '<div class="ibis-contact-empty">No email data yet — check back shortly.</div>';
    } else if (!cache.emails || !cache.emails.length) {
      threadHTML = '<div class="ibis-contact-empty">No emails found for this contact.</div>';
    } else {
      threadHTML = cache.emails.map(em => `
        <div class="ibis-thread-row" data-email="${(c.email || '').replace(/"/g, '&quot;')}">
          <div class="ibis-thread-dir-badge ${em.direction}">${em.direction === 'outbound' ? '↑' : '↓'}</div>
          <div class="ibis-thread-email-info">
            <div class="ibis-thread-subject">${em.subject}</div>
            <div class="ibis-thread-meta">${em.daysAgo === 0 ? 'Today' : em.daysAgo + 'd ago'} · ${em.direction}</div>
          </div>
        </div>`).join('');
    }

    body.innerHTML = `
      <div class="ibis-thread-wrap">
        <div class="ibis-thread-nav">
          <button class="ibis-back-btn" id="ibis-back-to-list">← ${bucket ? bucket.label : 'Back'}</button>
        </div>

        <div class="ibis-thread-contact-header">
          <div class="ibis-contact-avatar ibis-thread-avatar" style="background:${color}">${initial}</div>
          <div class="ibis-thread-contact-info">
            <div class="ibis-thread-contact-name">${c.name || 'Unknown'}</div>
            <div class="ibis-thread-contact-company">${c.accountName || ''}</div>
            <span class="ibis-stage-pill" style="background:${sc.bg};color:${sc.color}">${c.stage || 'Introduction'}</span>
          </div>
        </div>

        ${statusHTML}

        ${c.nextDate  ? `<div class="ibis-thread-meta-row">📅 <span>Next: ${c.nextDate}</span></div>` : ''}
        ${c.nextAction && c.nextAction !== '—'
          ? `<div class="ibis-thread-meta-row">⚡ <span>${c.nextAction}</span></div>` : ''}
        ${c.notes     ? `<div class="ibis-thread-notes">${c.notes}</div>` : ''}

        <div class="ibis-section-label" style="margin:14px 0 4px">Email Thread</div>
        <div class="ibis-thread-list">${threadHTML}</div>

        <button class="ibis-search-outlook-btn" id="ibis-open-search">
          Search in Outlook ↗
        </button>
      </div>
    `;

    document.getElementById('ibis-back-to-list').addEventListener('click', () => navTo('list'));
    document.getElementById('ibis-open-search').addEventListener('click', () => navigateToContact(c.email));

    body.querySelectorAll('.ibis-thread-row').forEach(row => {
      row.addEventListener('click', () => navigateToContact(row.dataset.email));
    });
  }

  // ── View 4: Diagnostics panel ─────────────────────────────────────────────

  function renderDebugBody() {
    const body = document.getElementById('ibis-sidebar-body');
    if (!body) return;

    const owaOk    = diagState.owaOk;
    const owaIcon  = owaOk === true  ? '✅' : owaOk === false ? '❌' : '⏳';
    const owaLabel = owaOk === true  ? 'Working'
                   : owaOk === false ? (diagState.owaError || 'Failing')
                   : 'Not yet tested';
    const owaColor = owaOk === true  ? '#16a34a' : owaOk === false ? '#dc2626' : '#9ca3af';

    const msalOk    = diagState.msalFound;
    const msalIcon  = msalOk === true ? '🔑' : msalOk === false ? '🔒' : '⏳';
    const msalLabel = msalOk === true ? 'MSAL token found (Graph API active)'
                    : msalOk === false ? 'No token — OWA cookie fallback'
                    : 'Not checked yet';
    const msalColor = msalOk === true ? '#16a34a' : msalOk === false ? '#9ca3af' : '#9ca3af';

    const total   = allContacts.length;
    const cEmails = Object.keys(emailCache).filter(k => allContacts.find(c => c.email === k));
    const nCached = cEmails.filter(k => emailCache[k] && !emailCache[k].failed).length;
    const nFailed = cEmails.filter(k => emailCache[k]?.failed).length;
    const nPend   = total - cEmails.length;

    const lastScan = diagState.lastScanTime
      ? new Date(diagState.lastScanTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : 'Not yet';

    const errHTML = diagState.errors.length
      ? diagState.errors.map(e => `
          <div class="ibis-diag-err-row">
            <span class="ibis-diag-err-email">${e.email}</span>
            <span class="ibis-diag-err-msg">${e.error}</span>
          </div>`).join('')
      : '<div class="ibis-diag-none">No errors this session</div>';

    body.innerHTML = `
      <div class="ibis-list-header">
        <button class="ibis-back-btn" id="ibis-diag-back">← Home</button>
        <div class="ibis-list-title"><span>🔧</span><span>Diagnostics</span></div>
      </div>
      <div class="ibis-diag-body">

        <div class="ibis-diag-section">
          <div class="ibis-diag-label">Auth token</div>
          <div class="ibis-diag-value" style="color:${msalColor}">${msalIcon} ${msalLabel}</div>
        </div>

        <div class="ibis-diag-section">
          <div class="ibis-diag-label">Email API</div>
          <div class="ibis-diag-value" style="color:${owaColor}">${owaIcon} ${owaLabel}</div>
        </div>

        <div class="ibis-diag-section">
          <div class="ibis-diag-label">Contacts loaded</div>
          <div class="ibis-diag-value">${total} active in pipeline</div>
        </div>

        <div class="ibis-diag-section">
          <div class="ibis-diag-label">Email scan</div>
          <div class="ibis-diag-value">
            <span style="color:#16a34a">✓ ${nCached}</span> cached ·
            <span style="color:#dc2626">✗ ${nFailed}</span> failed ·
            <span style="color:#9ca3af">⏳ ${nPend}</span> pending
          </div>
        </div>

        <div class="ibis-diag-section">
          <div class="ibis-diag-label">Last scan completed</div>
          <div class="ibis-diag-value">${lastScan}</div>
        </div>

        <div class="ibis-diag-section ibis-diag-err-section">
          <div class="ibis-diag-label">Recent errors (${diagState.errors.length})</div>
          <div class="ibis-diag-err-list">${errHTML}</div>
        </div>

        <button class="ibis-diag-rescan-btn" id="ibis-diag-rescan">↺ Clear cache &amp; rescan all</button>
      </div>
    `;

    document.getElementById('ibis-diag-back').addEventListener('click', () => navTo('home'));
    document.getElementById('ibis-diag-rescan').addEventListener('click', () => {
      const keys = Object.keys(emailCache).map(e => 'ec_' + e);
      emailCache  = {};
      diagState   = { owaOk: null, owaError: null, fetched: 0, failed: 0, errors: [], lastScanTime: null, msalFound: null };
      if (ctxOk()) chrome.storage.local.remove(keys);
      scanActive  = false;
      navTo('home');
      runScanQueue(allContacts);
    });
  }

  // ── Progress bar ──────────────────────────────────────────────────────────

  function updateProgressUI() {
    const wrap  = document.getElementById('ibis-progress-wrap');
    const fill  = document.getElementById('ibis-progress-fill');
    const label = document.getElementById('ibis-progress-label');
    if (!wrap || !fill || !label) return;

    if (!scanProgress.total) { wrap.classList.remove('active'); return; }

    const pct = Math.round((scanProgress.done / scanProgress.total) * 100);
    fill.style.width = pct + '%';

    if (scanActive) {
      label.textContent = 'Enriching ' + scanProgress.done + '/' + scanProgress.total + '…';
      wrap.classList.add('active');
    } else {
      const failNote = scanFailures > 0 ? ' (' + scanFailures + ' unavailable)' : '';
      label.textContent = 'Email history loaded' + failNote;
      setTimeout(() => wrap && wrap.classList.remove('active'), 2500);
    }

    // If consistent failures, surface a warning in the footer
    if (scanFailures >= 3 && scanProgress.done >= 3) {
      updateFooterStatus('⚠️ Email scan limited — Outlook API may be unavailable');
    }
  }

  // ── Outlook navigation ────────────────────────────────────────────────────

  function navigateToContact(email) {
    const q    = encodeURIComponent('from:' + email + ' OR to:' + email);
    const base = window.location.pathname.startsWith('/mail/0/') ? '/mail/0/' : '/mail/';
    window.location.assign(base + 'search?q=' + q);
  }

  // ── Contact parsing ───────────────────────────────────────────────────────

  function parseContacts(raw) {
    if (!raw) { allWorkables = []; return []; }
    try {
      const opps       = JSON.parse(raw);
      const all        = Object.values(opps);
      const sorted     = all.sort((a, b) => (a.accountName || '').localeCompare(b.accountName || ''));
      allWorkables     = sorted.filter(c => !c.archived);                    // all non-archived (for Workables campaign, includes Lost)
      const active     = allWorkables.filter(c => !EXCLUDED_STAGES.has(c.stage)); // Priority Engine (excludes Lost)
      const archived   = all.filter(c => c.archived).length;
      const lost       = allWorkables.filter(c => EXCLUDED_STAGES.has(c.stage)).length;
      console.log(`[IBISWorld] Contacts: ${active.length} active | ${archived} archived | ${lost} lost (total: ${all.length})`);
      return active;
    } catch (e) {
      console.error('[IBISWorld] Parse error:', e);
      allWorkables = [];
      return [];
    }
  }

  // ── UI helpers ────────────────────────────────────────────────────────────

  function updateFooterStatus(msg) {
    const el = document.getElementById('ibis-footer-status');
    if (el) el.textContent = msg;
  }

  function updateToggleIcon(collapsed) {
    const btn = document.getElementById('ibis-sidebar-toggle');
    if (!btn) return;
    btn.textContent = collapsed ? '›' : '‹';
    btn.title       = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
  }

  // ── Inject ────────────────────────────────────────────────────────────────

  function inject() {
    if (!document.body) return;
    if (document.getElementById(SIDEBAR_ID)) return;
    console.log('[IBISWorld Outreach] Injecting sidebar v2.0…');

    const sidebar     = buildSidebar();
    const collapseTab = buildCollapseTab();
    document.body.appendChild(sidebar);
    document.body.appendChild(collapseTab);

    if (!ctxOk()) {
      updateFooterStatus('Open your dashboard to sync contacts');
      return;
    }

    // ── Load all persisted state ──────────────────────────────────────────
    chrome.storage.local.get(null, function (result) {
      if (!ctxOk()) return;

      // Sidebar collapsed / badge position
      if (result.ibis_sidebar_collapsed) {
        sidebar.classList.add('collapsed');
        collapseTab.classList.add('visible');
        updateToggleIcon(true);
      }
      if (result.ibis_badge_top !== undefined) {
        collapseTab.style.top       = result.ibis_badge_top + 'px';
        collapseTab.style.transform = 'none';
      }

      // Restore email cache from storage (keys prefixed ec_)
      emailCache = {};
      for (const [key, val] of Object.entries(result)) {
        if (key.startsWith('ec_')) emailCache[key.slice(3)] = val;
      }

      // Contacts
      allContacts = parseContacts(result.outreach_contacts_raw || null);

      // Initial render
      renderHomeBody();

      const ts      = result.outreach_contacts_ts;
      const timeStr = ts
        ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : '';
      updateFooterStatus(allContacts.length + ' contacts · synced ' + timeStr);

      // Kick off email enrichment queue
      if (allContacts.length > 0) runScanQueue(allContacts);
    });

    // ── Live updates when bridge pushes new contacts ──────────────────────
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (!ctxOk()) return;
      if (area === 'local' && changes.outreach_contacts_raw) {
        allContacts = parseContacts(changes.outreach_contacts_raw.newValue);
        if (currentView === 'home') updateBucketCounts();
        runScanQueue(allContacts);
      }
    });

    // ── Footer: tap to open diagnostics ──────────────────────────────────
    document.getElementById('ibis-footer-status').addEventListener('click', function () {
      if (currentView === 'debug') navTo('home');
      else navTo('debug');
    });

    // ── Header: collapse toggle ───────────────────────────────────────────
    document.getElementById('ibis-sidebar-toggle').addEventListener('click', function () {
      const collapsed = sidebar.classList.toggle('collapsed');
      collapseTab.classList.toggle('visible', collapsed);
      updateToggleIcon(collapsed);
      if (ctxOk()) chrome.storage.local.set({ ibis_sidebar_collapsed: collapsed });
    });

    // ── Header: refresh — clears email cache + re-scans ──────────────────
    document.getElementById('ibis-refresh-btn').addEventListener('click', function () {
      const keysToRemove = Object.keys(emailCache).map(e => 'ec_' + e);
      emailCache = {};
      if (ctxOk()) chrome.storage.local.remove(keysToRemove);
      scanActive = false;
      runScanQueue(allContacts);
      updateFooterStatus('Re-scanning email history…');
      if (ctxOk()) chrome.runtime.sendMessage({ type: 'IBIS_REQUEST_REFRESH' });
    });

    // ── Collapse badge drag ───────────────────────────────────────────────
    makeDraggable(collapseTab, function () {
      sidebar.classList.remove('collapsed');
      collapseTab.classList.remove('visible');
      updateToggleIcon(false);
      if (ctxOk()) chrome.storage.local.set({ ibis_sidebar_collapsed: false });
    });

    watchForRemoval(sidebar, collapseTab);
  }

  // ── Drag (vertical only, right-wall pinned) ───────────────────────────────

  function makeDraggable(el, onClick) {
    var startY, startTop, dragged;
    el.addEventListener('mousedown', function (e) {
      e.preventDefault();
      dragged  = false;
      var rect = el.getBoundingClientRect();
      startTop = rect.top;
      startY   = e.clientY;
      el.style.top       = startTop + 'px';
      el.style.transform = 'none';

      function onMove(ev) {
        var dy = ev.clientY - startY;
        if (Math.abs(dy) > 4) dragged = true;
        el.style.top = Math.max(8, Math.min(window.innerHeight - BADGE_H - 8, startTop + dy)) + 'px';
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',  onUp);
        if (dragged && ctxOk()) chrome.storage.local.set({ ibis_badge_top: parseInt(el.style.top) });
        else if (!dragged) onClick();
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',  onUp);
    });
  }

  // ── SPA resilience ────────────────────────────────────────────────────────

  function watchForRemoval(sidebar, collapseTab) {
    var observer = new MutationObserver(function () {
      if (!document.body.contains(sidebar)) {
        observer.disconnect();
        collapseTab.remove();
        setTimeout(function () { if (ctxOk()) inject(); }, 400);
      }
    });
    observer.observe(document.body, { childList: true });
  }

  function interceptSPANav() {
    var _push    = history.pushState.bind(history);
    var _replace = history.replaceState.bind(history);
    history.pushState    = function () { _push.apply(history, arguments);    onNav(); };
    history.replaceState = function () { _replace.apply(history, arguments); onNav(); };
    window.addEventListener('popstate', onNav);
  }

  function onNav() {
    setTimeout(function () {
      if (ctxOk() && !document.getElementById(SIDEBAR_ID)) inject();
    }, 700);
  }

  // ── Bootstrap ─────────────────────────────────────────────────────────────

  function start() {
    if (document.body) inject();
    else document.addEventListener('DOMContentLoaded', inject, { once: true });
    interceptSPANav();

    var n = 0;
    var t = setInterval(function () {
      if (!ctxOk()) { clearInterval(t); return; }
      if (!document.getElementById(SIDEBAR_ID)) inject();
      if (++n >= 8) clearInterval(t);
    }, 1000);
  }

  start();
})();
