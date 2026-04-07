// IBISWorld Outreach — background service worker v3.0
// Stripped to icon only. Email API fetching tabled in v3.
// See git history for v2 Graph/OWA fetch implementation.

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

// ── Fetch proxy (content scripts can't fetch cross-origin; route through SW) ─
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'FETCH_URL') {
    fetch(msg.url)
      .then(r => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(data => sendResponse({ ok: true, data }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true; // keep message channel open for async response
  }
});
