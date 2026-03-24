// IBISWorld Outreach — dashboard bridge v1.2
// Runs as a content script on dabbs4dan.github.io/ibisworld-dashboard.
// Pushes ibis_opps from the dashboard's localStorage into chrome.storage.local
// so the Outlook extension can read it without any iframe or postMessage trickery.

(function () {
  'use strict';

  function pushContactsToExtension() {
    try {
      const raw = localStorage.getItem('ibis_opps');
      chrome.storage.local.set({
        outreach_contacts_raw: raw || null,
        outreach_contacts_ts:  Date.now(),
      }, () => {
        console.log('[IBISWorld Bridge] Pushed ibis_opps to extension storage.',
          raw ? `${Object.keys(JSON.parse(raw)).length} contacts.` : 'Empty.');
      });
    } catch (e) {
      console.warn('[IBISWorld Bridge] Push failed:', e);
    }
  }

  // Push immediately on page load
  pushContactsToExtension();

  // Re-push automatically if the user uploads a new CSV (ibis_opps changes)
  window.addEventListener('storage', (e) => {
    if (e.key === 'ibis_opps') {
      console.log('[IBISWorld Bridge] ibis_opps changed — re-pushing.');
      pushContactsToExtension();
    }
  });

  // Respond to manual refresh requests triggered by the refresh button in Outlook
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'IBIS_REFRESH_OPPS') {
      console.log('[IBISWorld Bridge] Refresh requested — re-pushing.');
      pushContactsToExtension();
    }
  });
})();
