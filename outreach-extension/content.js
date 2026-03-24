// IBISWorld Outreach — content script v1.2
// Reads contacts from chrome.storage.local (written by bridge.js on the dashboard)

(function () {
  'use strict';

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

  const CAMPAIGNS = [
    { id: 'workables', icon: '🎯', name: 'Workables', meta: 'Active contacts' },
    { id: 'winbacks',  icon: '🔄', name: 'Winbacks',  meta: 'Re-engagement'   },
    { id: 'samples',   icon: '📋', name: 'Samples',   meta: 'Trial send-outs' },
  ];

  const EXCLUDED_STAGES = new Set(['Lost']);

  let allContacts      = [];
  let expandedCampaign = null;

  // ── Context guard ─────────────────────────────────────────────────────────
  // ctxOk() must be called at the top of EVERY async callback, not just before
  // the chrome.* call that registers it. The callback runs later; by then the
  // context may be gone. Returning early from the callback is the only safe fix.
  function ctxOk() {
    try { return !!chrome.runtime.id; } catch (_) { return false; }
  }

  // ── Build sidebar ─────────────────────────────────────────────────────────
  function buildSidebar() {
    const el = document.createElement('div');
    el.id = SIDEBAR_ID;
    el.innerHTML = `
      <div id="ibis-sidebar-header">
        <span id="ibis-sidebar-title">📬 Outreach Campaigns</span>
        <div id="ibis-header-btns">
          <button id="ibis-refresh-btn" title="Refresh contacts from dashboard">🔄</button>
          <button id="ibis-sidebar-toggle" title="Collapse sidebar">‹</button>
        </div>
      </div>
      <div id="ibis-sidebar-body">
        <div class="ibis-section-label">Campaigns</div>
        ${CAMPAIGNS.map(campaignBlockHTML).join('')}
        <button id="ibis-add-campaign">
          <span id="ibis-add-campaign-icon">+</span>
          Add Campaign
        </button>
      </div>
      <div id="ibis-sidebar-footer">
        <div id="ibis-footer-status">Syncing contacts…</div>
      </div>
    `;
    return el;
  }

  function campaignBlockHTML(c) {
    return `
      <div class="ibis-campaign-block" data-campaign-id="${c.id}">
        <div class="ibis-campaign-card">
          <div class="ibis-campaign-icon">${c.icon}</div>
          <div class="ibis-campaign-info">
            <div class="ibis-campaign-name">${c.name}</div>
            <div class="ibis-campaign-meta">${c.meta}</div>
          </div>
          <div class="ibis-campaign-badge" id="ibis-badge-${c.id}">0</div>
        </div>
        <div class="ibis-contact-list" id="ibis-contacts-${c.id}"></div>
      </div>`;
  }

  function buildCollapseTab() {
    const el = document.createElement('div');
    el.id = TAB_ID;
    el.innerHTML = '<span class="ibis-tab-i">I</span>';
    el.title = 'Open IBISWorld Outreach';
    return el;
  }

  // ── Inject ────────────────────────────────────────────────────────────────
  function inject() {
    if (!document.body) return;
    if (document.getElementById(SIDEBAR_ID)) return;
    console.log('[IBISWorld Outreach] Injecting sidebar…');

    const sidebar     = buildSidebar();
    const collapseTab = buildCollapseTab();
    document.body.appendChild(sidebar);
    document.body.appendChild(collapseTab);

    // Load persisted state — guard INSIDE the callback, not just outside
    if (ctxOk()) {
      chrome.storage.local.get(
        ['ibis_sidebar_collapsed', 'ibis_badge_top', 'outreach_contacts_raw', 'outreach_contacts_ts'],
        function (result) {
          if (!ctxOk()) return; // context may have died while the callback was queued
          if (result.ibis_sidebar_collapsed) {
            sidebar.classList.add('collapsed');
            collapseTab.classList.add('visible');
            updateToggleIcon(true);
          }
          if (result.ibis_badge_top !== undefined) {
            collapseTab.style.top       = result.ibis_badge_top + 'px';
            collapseTab.style.transform = 'none';
          }
          onContactsLoaded(result.outreach_contacts_raw || null, result.outreach_contacts_ts || null);
        }
      );
    } else {
      updateFooterStatus('Open your dashboard to sync contacts');
    }

    // Live-update when bridge.js pushes fresh data from the dashboard
    if (ctxOk()) {
      chrome.storage.onChanged.addListener(function (changes, area) {
        if (!ctxOk()) return; // guard inside the listener too
        if (area === 'local' && changes.outreach_contacts_raw) {
          onContactsLoaded(changes.outreach_contacts_raw.newValue, Date.now());
        }
      });
    }

    // ── Header: collapse toggle ───────────────────────────────────────────
    document.getElementById('ibis-sidebar-toggle').addEventListener('click', function () {
      const collapsed = sidebar.classList.toggle('collapsed');
      collapseTab.classList.toggle('visible', collapsed);
      updateToggleIcon(collapsed);
      if (ctxOk()) chrome.storage.local.set({ ibis_sidebar_collapsed: collapsed });
    });

    // ── Header: refresh ───────────────────────────────────────────────────
    document.getElementById('ibis-refresh-btn').addEventListener('click', function () {
      updateFooterStatus('Refreshing…');
      if (ctxOk()) chrome.runtime.sendMessage({ type: 'IBIS_REQUEST_REFRESH' });
      setTimeout(function () {
        if (!ctxOk()) return;
        chrome.storage.local.get(['outreach_contacts_raw', 'outreach_contacts_ts'], function (r) {
          if (!ctxOk()) return;
          onContactsLoaded(r.outreach_contacts_raw || null, r.outreach_contacts_ts || null);
        });
      }, 1200);
    });

    // ── Campaign cards ────────────────────────────────────────────────────
    sidebar.querySelectorAll('.ibis-campaign-block').forEach(function (block) {
      block.querySelector('.ibis-campaign-card').addEventListener('click', function () {
        const id = block.dataset.campaignId;
        if (expandedCampaign === id) {
          collapseCampaign(id);
        } else {
          if (expandedCampaign) collapseCampaign(expandedCampaign);
          expandCampaign(id);
        }
      });
    });

    document.getElementById('ibis-add-campaign').addEventListener('click', function () {
      console.log('[IBISWorld Outreach] Add Campaign — coming soon');
    });

    // ── Collapse badge ────────────────────────────────────────────────────
    makeDraggable(collapseTab, function () {
      sidebar.classList.remove('collapsed');
      collapseTab.classList.remove('visible');
      updateToggleIcon(false);
      if (ctxOk()) chrome.storage.local.set({ ibis_sidebar_collapsed: false });
    });

    watchForRemoval(sidebar, collapseTab);
  }

  // ── Contact data ──────────────────────────────────────────────────────────
  function onContactsLoaded(raw, ts) {
    allContacts = parseContacts(raw);
    updateCampaignBadge('workables', allContacts.length);

    if (!raw) {
      updateFooterStatus('Open your dashboard to sync contacts');
      return;
    }

    const timeStr = ts
      ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '';
    updateFooterStatus(
      allContacts.length
        ? allContacts.length + ' contacts · synced ' + timeStr
        : 'No active Workables found'
    );

    if (expandedCampaign === 'workables') renderContactList('workables', allContacts);
  }

  function parseContacts(raw) {
    if (!raw) return [];
    try {
      const opps = JSON.parse(raw);
      return Object.values(opps)
        .filter(function (c) { return !c.archived && !EXCLUDED_STAGES.has(c.stage); })
        .sort(function (a, b) { return (a.accountName || '').localeCompare(b.accountName || ''); });
    } catch (e) {
      console.error('[IBISWorld Outreach] Parse error:', e);
      return [];
    }
  }

  // ── Campaign expand / collapse ────────────────────────────────────────────
  function expandCampaign(id) {
    expandedCampaign = id;
    const block = document.querySelector('[data-campaign-id="' + id + '"]');
    const list  = document.getElementById('ibis-contacts-' + id);
    if (!block || !list) return;
    if (id === 'workables') {
      renderContactList(id, allContacts);
    } else {
      list.innerHTML = '<div class="ibis-contact-empty">No contacts in this campaign yet.</div>';
    }
    block.classList.add('expanded');
    list.classList.add('open');
  }

  function collapseCampaign(id) {
    expandedCampaign = null;
    const block = document.querySelector('[data-campaign-id="' + id + '"]');
    const list  = document.getElementById('ibis-contacts-' + id);
    if (!block || !list) return;
    block.classList.remove('expanded');
    list.classList.remove('open');
  }

  function renderContactList(campaignId, contacts) {
    const list = document.getElementById('ibis-contacts-' + campaignId);
    if (!list) return;
    if (!contacts.length) {
      list.innerHTML = '<div class="ibis-contact-empty">No active Workables contacts.<br><small>Open the dashboard to sync.</small></div>';
      return;
    }
    list.innerHTML = contacts.map(contactRowHTML).join('');
    list.querySelectorAll('.ibis-contact-row').forEach(function (row) {
      row.addEventListener('click', function () {
        var email = row.dataset.email;
        if (email) navigateToContact(email);
      });
    });
  }

  function contactRowHTML(c) {
    var sc      = STAGE_COLORS[c.stage] || { bg: '#f3f4f6', color: '#6b7280' };
    var initial = (c.name || '?').trim()[0].toUpperCase();
    var color   = AVATAR_COLORS[(initial.charCodeAt(0) || 65) % AVATAR_COLORS.length];
    var stage   = c.stage || 'Introduction';
    var email   = (c.email || '').replace(/"/g, '&quot;');
    return '<div class="ibis-contact-row" data-email="' + email + '" title="Search emails with ' + (c.name || '') + '">' +
      '<div class="ibis-contact-avatar" style="background:' + color + '">' + initial + '</div>' +
      '<div class="ibis-contact-info">' +
        '<div class="ibis-contact-name">' + (c.name || 'Unknown') + '</div>' +
        '<div class="ibis-contact-company">' + (c.accountName || '') + '</div>' +
      '</div>' +
      '<span class="ibis-stage-pill" style="background:' + sc.bg + ';color:' + sc.color + '">' + stage + '</span>' +
      '</div>';
  }

  // ── Outlook navigation ────────────────────────────────────────────────────
  function navigateToContact(email) {
    var q = encodeURIComponent('from:' + email + ' OR to:' + email);
    // Preserve /0/ segment for live.com/office.com; newer outlook.cloud.microsoft uses /mail/ directly
    var base = window.location.pathname.startsWith('/mail/0/') ? '/mail/0/' : '/mail/';
    window.location.assign(base + 'search?q=' + q);
  }

  // ── UI helpers ────────────────────────────────────────────────────────────
  function updateCampaignBadge(id, count) {
    var badge = document.getElementById('ibis-badge-' + id);
    if (!badge) return;
    badge.textContent = count;
    badge.classList.toggle('has-contacts', count > 0);
  }

  function updateFooterStatus(msg) {
    var el = document.getElementById('ibis-footer-status');
    if (el) el.textContent = msg;
  }

  function updateToggleIcon(collapsed) {
    var btn = document.getElementById('ibis-sidebar-toggle');
    if (!btn) return;
    btn.textContent = collapsed ? '›' : '‹';
    btn.title = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
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
        document.removeEventListener('mouseup', onUp);
        if (dragged && ctxOk()) chrome.storage.local.set({ ibis_badge_top: parseInt(el.style.top) });
        else if (!dragged) onClick();
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
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
    setTimeout(function () { if (ctxOk() && !document.getElementById(SIDEBAR_ID)) inject(); }, 700);
  }

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  function start() {
    if (document.body) inject();
    else document.addEventListener('DOMContentLoaded', inject, { once: true });

    interceptSPANav();

    var n = 0;
    var t = setInterval(function () {
      if (!ctxOk()) { clearInterval(t); return; } // extension reloaded — stop cleanly
      if (!document.getElementById(SIDEBAR_ID)) inject();
      if (++n >= 8) clearInterval(t);
    }, 1000);
  }

  start();
})();
