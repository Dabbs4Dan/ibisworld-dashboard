// SF API Test — service worker. Reads Dan's Salesforce session cookie and
// tests live read + write-capability. Creates NOTHING in Salesforce (read-only).

const INSTANCE = 'https://ibisworld-inc.my.salesforce.com';
const API = 'v60.0';

async function getSid() {
  const all = await chrome.cookies.getAll({ name: 'sid' });
  const c = all.find(x => x.domain.includes('my.salesforce.com'))
         || all.find(x => x.domain.includes('salesforce.com'));
  return c ? c.value : null;
}

async function sf(path) {
  const sid = await getSid();
  if (!sid) return { noCookie: true };
  const res = await fetch(INSTANCE + path, {
    headers: { 'Authorization': 'Bearer ' + sid, 'Accept': 'application/json' }
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) {}
  return { status: res.status, json, text };
}

async function runTest() {
  // 1. READ
  const q = encodeURIComponent('SELECT Id, Name FROM Account ORDER BY LastModifiedDate DESC LIMIT 5');
  const r = await sf(`/services/data/${API}/query?q=${q}`);
  if (r.noCookie) return { ok: false, reason: 'no_cookie' };
  if (r.status !== 200) {
    const t = String(r.text);
    let reason = 'unknown';
    if (t.includes('INVALID_SESSION_ID')) reason = 'whitelisting';
    else if (/API_DISABLED|FUNCTIONALITY_NOT_ENABLED|not enabled/i.test(t)) reason = 'api_disabled';
    return { ok: false, reason, status: r.status, raw: t.slice(0, 500) };
  }
  const accounts = (r.json.records || []).map(a => a.Name);
  // 2. WRITE-CAPABILITY (describe calls are read-only — nothing is created)
  let write = { task: null, event: null, opp: null };
  try {
    const [task, evt, opp] = await Promise.all([
      sf(`/services/data/${API}/sobjects/Task/describe`),
      sf(`/services/data/${API}/sobjects/Event/describe`),
      sf(`/services/data/${API}/sobjects/Opportunity/describe`)
    ]);
    write = {
      task: !!(task.json && task.json.createable),
      event: !!(evt.json && evt.json.createable),
      opp: !!(opp.json && opp.json.updateable)
    };
  } catch (e) {}
  return { ok: true, accounts, write };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'RUN_SF_TEST') {
    runTest().then(sendResponse).catch(e => sendResponse({ ok: false, reason: 'exception', raw: String(e) }));
    return true; // async response
  }
});
