// IBISWorld Outreach — dashboard bridge v1.3
// Runs as a content script on dabbs4dan.github.io/ibisworld-dashboard.
// Merges contacts from ALL 8 campaign stores into outreach_contacts_raw
// so the Outlook extension has the full contact map for company bubble matching.

(function () {
  'use strict';

  // All campaign localStorage keys + a label for each
  const CAMPAIGN_KEYS = [
    { key: 'ibis_opps',        label: 'Workables'   },
    { key: 'ibis_samples',     label: 'Old Samples' },
    { key: 'ibis_6qa',         label: '6QA'         },
    { key: 'ibis_churn',       label: 'Churn'       },
    { key: 'ibis_netnew',      label: 'Net New'     },
    { key: 'ibis_multithread', label: 'Multithread' },
    { key: 'ibis_winback',     label: 'Winback'     },
    { key: 'ibis_powerback',   label: 'Powerback'   },
  ];

  function pushContactsToExtension() {
    try {
      // Merge all campaign stores into one flat map keyed by email (lowercase).
      // Later campaigns overwrite earlier ones on the same email — that's fine,
      // we only need accountName + name for the overlay, which are the same
      // regardless of which campaign the contact belongs to.
      const merged = {};
      let totalCount = 0;

      CAMPAIGN_KEYS.forEach(({ key }) => {
        const raw = localStorage.getItem(key);
        if (!raw) return;
        try {
          const store = JSON.parse(raw);
          Object.entries(store).forEach(([email, contact]) => {
            if (!email || !contact) return;
            merged[email.toLowerCase().trim()] = contact;
            totalCount++;
          });
        } catch (_) {}
      });

      const mergedJson = JSON.stringify(merged);
      chrome.storage.local.set({
        outreach_contacts_raw: mergedJson,
        outreach_contacts_ts:  Date.now(),
      }, () => {
        console.log(`[IBISWorld Bridge] Pushed ${Object.keys(merged).length} contacts from ${CAMPAIGN_KEYS.length} campaigns.`);
      });
    } catch (e) {
      console.warn('[IBISWorld Bridge] Push failed:', e);
    }
  }

  // Push immediately on page load
  pushContactsToExtension();

  // Poll for same-window localStorage changes across all campaign keys
  const snapshots = {};
  CAMPAIGN_KEYS.forEach(({ key }) => { snapshots[key] = localStorage.getItem(key); });

  setInterval(function () {
    let changed = false;
    CAMPAIGN_KEYS.forEach(({ key }) => {
      const current = localStorage.getItem(key);
      if (current !== snapshots[key]) {
        snapshots[key] = current;
        changed = true;
      }
    });
    if (changed) {
      console.log('[IBISWorld Bridge] Campaign data changed — re-pushing.');
      pushContactsToExtension();
    }
  }, 3000);

  // Cross-tab storage changes
  window.addEventListener('storage', (e) => {
    if (CAMPAIGN_KEYS.some(({ key }) => key === e.key)) {
      console.log('[IBISWorld Bridge] Storage changed cross-tab — re-pushing.');
      pushContactsToExtension();
    }
  });

  // Manual refresh from Outlook extension refresh button
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'IBIS_REFRESH_OPPS') {
      console.log('[IBISWorld Bridge] Refresh requested — re-pushing.');
      pushContactsToExtension();
    }
  });
})();
