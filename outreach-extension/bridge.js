// IBISWorld Outreach — dashboard bridge v1.5
// Runs as a content script on dabbs4dan.github.io/ibisworld-dashboard.
// Merges contacts from ALL 8 campaign stores into outreach_contacts_raw
// so the Outlook extension has the full contact map for company bubble matching.
// v1.4: _folder (single string) → _folders (array) — a contact can belong to
// multiple Outlook campaign folders simultaneously. content.js uses includes().
// v1.5: Also pushes account names from ibis_accounts → outreach_account_names
// so content.js can show company bubbles for accounts without campaign contacts.

(function () {
  'use strict';

  // All campaign localStorage keys + a label + the matching Outlook folder name.
  // folder: null = no dedicated Outlook folder for this campaign yet.
  const CAMPAIGN_KEYS = [
    { key: 'ibis_opps',        label: 'Workables',   folder: 'Workables'   },
    { key: 'ibis_samples',     label: 'Old Samples',  folder: 'Old Samples' },
    { key: 'ibis_6qa',         label: '6QA',          folder: '6QA'         },
    { key: 'ibis_churn',       label: 'Churn',        folder: 'Churns'      }, // Outlook folder = "Churns"
    { key: 'ibis_netnew',      label: 'Net New',      folder: 'Net New'     },
    { key: 'ibis_multithread', label: 'Multithread',  folder: 'Multithread' },
    { key: 'ibis_winback',     label: 'Winback',      folder: 'Winback'     },
    { key: 'ibis_alumni',      label: 'Alumni',       folder: null          }, // no Outlook folder yet
  ];

  function pushContactsToExtension() {
    try {
      // Merge all campaign stores into one flat map keyed by email (lowercase).
      // Later campaigns overwrite earlier ones on the same email — that's fine,
      // we only need accountName + name for the overlay, which are the same
      // regardless of which campaign the contact belongs to.
      const merged = {};
      let totalCount = 0;

      CAMPAIGN_KEYS.forEach(({ key, folder }) => {
        const raw = localStorage.getItem(key);
        if (!raw) return;
        try {
          const store = JSON.parse(raw);
          Object.entries(store).forEach(([email, contact]) => {
            if (!email || !contact) return;
            const em = email.toLowerCase().trim();
            if (!merged[em]) {
              // First time seeing this email — use this campaign's contact data.
              // _folders is an array so we can collect ALL folders this contact belongs to.
              merged[em] = { ...contact, _folders: folder ? [folder] : [] };
            } else {
              // Already seen — preserve original contact data (accountName etc.) but
              // add this campaign's folder to the _folders array if not already there.
              if (folder && !merged[em]._folders.includes(folder)) {
                merged[em]._folders = [...merged[em]._folders, folder];
              }
            }
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
    if (e.key === 'ibis_accounts') {
      console.log('[IBISWorld Bridge] Accounts changed cross-tab — re-pushing names.');
      pushAccountNamesToExtension();
    }
  });

  // ── Push account names to extension (v1.5) ───────────────────────────────────
  // ibis_accounts stores the raw CSV rows. Each has "Account Name" and "Website".
  // We push a slim map: { accountNameLower: { name, domain } } so content.js can
  // find company names in email subject lines even when no campaign contact exists.

  function pushAccountNamesToExtension() {
    try {
      const raw = localStorage.getItem('ibis_accounts');
      if (!raw) return;
      const accounts = JSON.parse(raw);
      if (!Array.isArray(accounts)) return;
      const nameMap = {};
      accounts.forEach(a => {
        const name = (a['Account Name'] || a.accountName || a.name || '').trim();
        if (!name) return;
        // Extract domain from Website field (strip protocol + trailing slash)
        let domain = (a['Website'] || a.website || '').trim()
          .replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').toLowerCase();
        nameMap[name.toLowerCase()] = { name, domain };
      });
      chrome.storage.local.set({ outreach_account_names: JSON.stringify(nameMap) }, () => {
        console.log(`[IBISWorld Bridge] Pushed ${Object.keys(nameMap).length} account names.`);
      });
    } catch (e) {
      console.warn('[IBISWorld Bridge] Account names push failed:', e);
    }
  }

  // Push accounts on load (alongside contacts)
  pushAccountNamesToExtension();

  // Manual refresh from Outlook extension refresh button
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'IBIS_REFRESH_OPPS') {
      console.log('[IBISWorld Bridge] Refresh requested — re-pushing.');
      pushContactsToExtension();
      pushAccountNamesToExtension();
    }
  });
})();
