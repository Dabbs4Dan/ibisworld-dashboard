// IBISWorld Outreach — background service worker v1.2

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

// ── Refresh relay ─────────────────────────────────────────────────────────────
// When the Outlook extension's refresh button is clicked, this finds any open
// dashboard tab and tells bridge.js to re-push ibis_opps into chrome.storage.
chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.type !== 'IBIS_REQUEST_REFRESH') return;

  chrome.tabs.query({ url: 'https://dabbs4dan.github.io/*' }, (tabs) => {
    if (!tabs || tabs.length === 0) {
      console.log('[IBISWorld Outreach] No dashboard tab open — cannot refresh.');
      return;
    }
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, { type: 'IBIS_REFRESH_OPPS' }, () => {
        if (chrome.runtime.lastError) {
          // bridge.js not yet ready in that tab — ignore
        }
      });
    });
  });
});
