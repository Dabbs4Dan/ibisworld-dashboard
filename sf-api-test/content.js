// Runs on the dashboard (dabbs4dan.github.io). Asks the service worker to run
// the Salesforce test, then paints the result into the page so Claude can read it.

(function () {
  function paint(text) {
    let box = document.getElementById('sf-api-test-banner');
    if (!box) {
      box = document.createElement('div');
      box.id = 'sf-api-test-banner';
      box.style.cssText =
        'position:fixed;top:0;left:0;right:0;z-index:2147483647;padding:14px 18px;' +
        'font:14px/1.5 system-ui,sans-serif;background:#0b1220;color:#fff;' +
        'box-shadow:0 2px 12px rgba(0,0,0,.5);white-space:pre-wrap;';
      document.documentElement.appendChild(box);
    }
    box.textContent = text;
  }

  paint('SF-API-TEST: running…');

  try {
    chrome.runtime.sendMessage({ type: 'RUN_SF_TEST' }, function (r) {
      if (chrome.runtime.lastError || !r) {
        paint('SF-API-TEST RESULT: NO_RESPONSE (' + (chrome.runtime.lastError && chrome.runtime.lastError.message) + ')');
        return;
      }
      if (r.ok) {
        paint('SF-API-TEST RESULT: SUCCESS | accounts=[' + r.accounts.join(', ') + '] | '
          + 'write_tasks=' + r.write.task + ' write_meetings=' + r.write.event + ' update_opps=' + r.write.opp);
      } else if (r.reason === 'whitelisting') {
        paint('SF-API-TEST RESULT: BLOCKED_WHITELISTING (org blocks session REST — use Option B)');
      } else if (r.reason === 'api_disabled') {
        paint('SF-API-TEST RESULT: API_DISABLED (API Enabled is OFF on profile — use Option B)');
      } else if (r.reason === 'no_cookie') {
        paint('SF-API-TEST RESULT: NO_COOKIE (not logged into Salesforce in this browser)');
      } else {
        paint('SF-API-TEST RESULT: FAIL reason=' + r.reason + ' status=' + r.status + ' raw=' + (r.raw || ''));
      }
    });
  } catch (e) {
    paint('SF-API-TEST RESULT: EXCEPTION ' + String(e));
  }
})();
