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

// ── OWA email fetch ───────────────────────────────────────────────────────────
// Runs here (background SW) instead of the content script to avoid CORS.
// Background service workers are fully exempt from CORS for host_permissions
// origins. The user's office365 session cookies are included automatically.
const OWA_API_BASE = 'https://outlook.office365.com/owa/api/v2.0/me/messages';

async function fetchOWAEmails(email, depth) {
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
    const hint = resp.status === 401 ? 'Auth expired — user may need to re-login to Outlook' :
                 resp.status === 403 ? 'Forbidden — possible auth or rate-limit issue' :
                 resp.status === 404 ? 'API path not found' : body.slice(0, 150);
    console.warn('[IBISWorld BG] OWA', resp.status, 'for', email, '|', hint);
    throw new Error('OWA ' + resp.status + ': ' + hint);
  }

  const ct = resp.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    const body = await resp.text().catch(() => '');
    console.warn('[IBISWorld BG] Non-JSON for', email, '| type:', ct, '| snippet:', body.slice(0, 150));
    throw new Error('Non-JSON (' + ct.split(';')[0] + ')');
  }

  const data = await resp.json();
  const msgs = data.value || [];
  console.log('[IBISWorld BG] ✓', msgs.length, 'emails for', email);
  return msgs;
}

// ── Message handler ───────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;

  // Route: email fetch (content script → background → OWA → content script)
  if (msg.type === 'FETCH_EMAILS') {
    fetchOWAEmails(msg.email, msg.depth)
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
