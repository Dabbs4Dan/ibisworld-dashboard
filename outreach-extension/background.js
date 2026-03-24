// IBISWorld Outreach — background service worker v2.1

// ── Extension icon (OffscreenCanvas — no PNG files needed) ───────────────────
function drawIcon(size) {
  const canvas = new OffscreenCanvas(size, size);
  const ctx    = canvas.getContext('2d');

  const r = size * 0.18;
  ctx.fillStyle = '#C8102E';
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(size - r, 0);
  ctx.arcTo(size, 0,    size, r,        r);
  ctx.lineTo(size, size - r);
  ctx.arcTo(size, size, size - r, size, r);
  ctx.lineTo(r, size);
  ctx.arcTo(0, size,    0, size - r,    r);
  ctx.lineTo(0, r);
  ctx.arcTo(0, 0,       r, 0,           r);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle    = '#ffffff';
  ctx.font         = `900 ${Math.round(size * 0.6)}px Georgia, 'Times New Roman', serif`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('I', size / 2, size / 2 + size * 0.03);

  return ctx.getImageData(0, 0, size, size);
}

async function setExtensionIcon() {
  try {
    const imageData = {};
    for (const size of [16, 32, 48, 128]) imageData[size] = drawIcon(size);
    await chrome.action.setIcon({ imageData });
  } catch (e) {
    console.warn('[IBISWorld Outreach] Could not set icon:', e);
  }
}

chrome.runtime.onInstalled.addListener(setExtensionIcon);
chrome.runtime.onStartup.addListener(setExtensionIcon);
setExtensionIcon();

// ── Email fetch — Graph API (primary) + OWA (fallback) ───────────────────────
// Graph API: content script extracts MSAL token from page localStorage and
// passes it here. Background SW calls Graph with Bearer token — no CORS issues.
// OWA fallback: credentialed cookie-based request to office365.com. Works if
// the user's session includes office365.com cookies (older Outlook setups).

const OWA_API_BASE = 'https://outlook.office365.com/owa/api/v2.0/me/messages';

// Primary: Microsoft Graph API using MSAL token from page localStorage
async function fetchViaGraph(email, depth, token) {
  // $search with ConsistencyLevel:eventual finds messages where the email appears
  // in From, To, CC, or body — sufficient for from/to history detection.
  const url = 'https://graph.microsoft.com/v1.0/me/messages' +
    '?$search=' + encodeURIComponent('"' + email + '"') +
    '&$select=subject,from,toRecipients,receivedDateTime' +
    '&$top=' + (depth || 20);

  const resp = await fetch(url, {
    headers: {
      'Authorization': 'Bearer ' + token,
      'Accept':        'application/json',
      'ConsistencyLevel': 'eventual',
    },
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error('Graph ' + resp.status + ': ' + body.slice(0, 120));
  }

  const ct = resp.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    const body = await resp.text().catch(() => '');
    throw new Error('Graph non-JSON: ' + ct.split(';')[0] + ' | ' + body.slice(0, 80));
  }

  const data = await resp.json();
  // Normalize Graph schema → OWA schema (what processEmails in content.js expects)
  return (data.value || []).map(m => ({
    ReceivedDateTime: m.receivedDateTime,
    Subject:          m.subject,
    From:             { EmailAddress: { Address: m.from?.emailAddress?.address || '' } },
    ToRecipients:     (m.toRecipients || []).map(r => ({
      EmailAddress: { Address: r.emailAddress?.address || '' },
    })),
  }));
}

// Fallback: classic OWA REST API with session cookies
async function fetchViaOWA(email, depth) {
  const q   = `"from:${email} OR to:${email}"`;
  const url = OWA_API_BASE +
    '?$search='  + encodeURIComponent(q) +
    '&$select=Subject,From,ToRecipients,ReceivedDateTime' +
    '&$top='     + (depth || 20) +
    '&$orderby=ReceivedDateTime%20desc';

  const resp = await fetch(url, {
    credentials: 'include',
    headers: { 'Accept': 'application/json' },
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    const hint = resp.status === 401 ? 'Auth expired — re-login to Outlook' :
                 resp.status === 403 ? 'Forbidden — auth or rate-limit issue' :
                 resp.status === 404 ? 'API path not found' : body.slice(0, 150);
    console.warn('[IBISWorld BG] OWA', resp.status, 'for', email, '|', hint);
    throw new Error('OWA ' + resp.status + ': ' + hint);
  }

  const ct = resp.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    const body = await resp.text().catch(() => '');
    console.warn('[IBISWorld BG] OWA non-JSON for', email, '| type:', ct, '| body:', body.slice(0, 150));
    throw new Error('Non-JSON (' + ct.split(';')[0] + ')');
  }

  const data = await resp.json();
  const msgs = data.value || [];
  console.log('[IBISWorld BG] ✓ OWA', msgs.length, 'emails for', email);
  return msgs;
}

// Dispatcher: Graph (graphToken) → OWA Bearer (owaToken) → OWA cookies
async function fetchOWAEmails(email, depth, graphToken, owaToken) {
  if (graphToken) {
    try {
      const msgs = await fetchViaGraph(email, depth, graphToken);
      console.log('[IBISWorld BG] ✓ Graph API', msgs.length, 'emails for', email);
      return msgs;
    } catch (e) {
      console.warn('[IBISWorld BG] Graph failed for', email, ':', e.message);
    }
  }
  if (owaToken) {
    try {
      const msgs = await fetchViaOWABearer(email, depth, owaToken);
      console.log('[IBISWorld BG] ✓ OWA Bearer', msgs.length, 'emails for', email);
      return msgs;
    } catch (e) {
      console.warn('[IBISWorld BG] OWA Bearer failed for', email, ':', e.message);
    }
  }
  // Last resort: OWA with session cookies (may fail if cookies are wrong domain)
  return fetchViaOWA(email, depth);
}

// OWA v2.0 REST with a Bearer token (works when token is Exchange-scoped)
async function fetchViaOWABearer(email, depth, token) {
  const q   = `"from:${email} OR to:${email}"`;
  const url = OWA_API_BASE +
    '?$search='  + encodeURIComponent(q) +
    '&$select=Subject,From,ToRecipients,ReceivedDateTime' +
    '&$top='     + (depth || 20) +
    '&$orderby=ReceivedDateTime%20desc';

  const resp = await fetch(url, {
    headers: {
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/json',
    },
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error('OWA Bearer ' + resp.status + ': ' + body.slice(0, 100));
  }

  const ct = resp.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    throw new Error('OWA Bearer non-JSON: ' + ct.split(';')[0]);
  }

  const data = await resp.json();
  return data.value || [];
}

// ── Message handler ───────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;

  // Route: email fetch (content script → background → OWA → content script)
  if (msg.type === 'FETCH_EMAILS') {
    fetchOWAEmails(msg.email, msg.depth, msg.graphToken, msg.owaToken)
      .then(emails => sendResponse({ ok: true,  emails }))
      .catch(err   => sendResponse({ ok: false, error: err.message }));
    return true; // keeps message channel open for async sendResponse
  }

  // Route: dashboard refresh relay (refresh button → background → bridge.js)
  if (msg.type === 'IBIS_REQUEST_REFRESH') {
    chrome.tabs.query({ url: 'https://dabbs4dan.github.io/*' }, (tabs) => {
      if (!tabs || tabs.length === 0) {
        console.log('[IBISWorld Outreach] No dashboard tab open — cannot refresh.');
        return;
      }
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, { type: 'IBIS_REFRESH_OPPS' }, () => {
          if (chrome.runtime.lastError) { /* bridge not ready — ignore */ }
        });
      });
    });
  }
});
