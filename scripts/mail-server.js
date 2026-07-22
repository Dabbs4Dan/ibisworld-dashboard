// mail-server.js — the cockpit's local backend. Serves EVERYTHING from one
// localhost origin so there are zero browser security gates (no File System
// Access folder-pick, no Private Network Access block, no mixed content):
//
//   GET /                     -> the cockpit app (static files from ../cockpit)
//   GET /accounts             -> { accounts, dead } from the dashboard backup
//   GET /list                 -> [filenames] of Message JSON in IBIS-Mail/Inbox
//   GET /file/<name>          -> one Message JSON
//   DELETE /file/<name>       -> remove after ingest
//
// Dan opens http://localhost:8790/ and real mail + real territory just load.
// Loopback-only (127.0.0.1). Run: node mail-server.js

const http = require('http');
const fs = require('fs');
const path = require('path');

const INBOX_DIR   = 'C:\\Users\\Daniel.starr\\OneDrive - IBISWORLD PTY LTD\\IBIS-Mail\\Inbox';
const COCKPIT_DIR = path.join(__dirname, '..', 'cockpit');
const BACKUP_FILE = 'C:\\Users\\Daniel.starr\\OneDrive - IBISWORLD PTY LTD\\Documents\\IBIS-Backups\\latest.json';
const PORT = 8790;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
}

// Read a localStorage value out of the dashboard backup (values are JSON strings).
function backupVal(key) {
  try {
    const j = JSON.parse(fs.readFileSync(BACKUP_FILE, 'utf8'));
    let v = j[key];
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch {} }
    return v;
  } catch { return null; }
}

function serveStatic(res, urlPath) {
  let rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  rel = rel.split('?')[0];
  if (rel.includes('..')) { res.writeHead(400); return res.end('bad'); }
  const fp = path.join(COCKPIT_DIR, rel);
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.setHeader('Content-Type', MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.writeHead(200); res.end(data);
  });
}

const server = http.createServer((req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  let url;
  try { url = new URL(req.url, 'http://127.0.0.1'); } catch { res.writeHead(400); return res.end('bad url'); }
  const p = url.pathname;

  if (p === '/ping') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ibis-mail-server ok'); }

  if (p === '/accounts') {
    const accounts = backupVal('ibis_accounts') || [];
    const deadObj = backupVal('ibis_dead') || {};
    const dead = (deadObj && Array.isArray(deadObj.accounts)) ? deadObj.accounts : [];
    // deal intelligence per account, from the dashboard's ibis_local markup —
    // the same stage/priority/status/action signals Dan sets in the dashboard.
    const local = backupVal('ibis_local') || {};
    const deals = {};
    for (const name of Object.keys(local)) {
      const v = local[name];
      if (!v || typeof v !== 'object') continue;
      const d = {};
      if (v.acctActionStage) d.stage = v.acctActionStage;
      if (v.acctPrio) d.prio = v.acctPrio;
      if (v.acctStatus) d.status = v.acctStatus;
      if (v.actionHeadline && String(v.actionHeadline).trim()) d.headline = String(v.actionHeadline).trim();
      if (Array.isArray(v.actFlags) && v.actFlags.length) d.flags = v.actFlags;
      if (v.hasAction) d.hasAction = true;
      if (v.customOpp && String(v.customOpp).trim()) d.customOpp = String(v.customOpp).trim();
      if (v.acctOpp) d.opp = { amt: v.acctOppAmt || '', close: v.acctOppClose || '' };
      if (Object.keys(d).length) deals[name] = d;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ accounts, dead, deals }));
  }

  if (p === '/list') {
    let files = [];
    try { files = fs.readdirSync(INBOX_DIR).filter(f => f.toLowerCase().endsWith('.json')); } catch {}
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(files));
  }

  if (p.startsWith('/file/')) {
    const name = decodeURIComponent(p.slice('/file/'.length));
    if (!name || name.includes('..') || name.includes('/') || name.includes('\\') || !name.toLowerCase().endsWith('.json')) {
      res.writeHead(400); return res.end('bad name');
    }
    const fp = path.join(INBOX_DIR, name);
    if (req.method === 'DELETE') {
      try { fs.unlinkSync(fp); res.writeHead(200); return res.end('deleted'); }
      catch { res.writeHead(404); return res.end('not found'); }
    }
    try { const data = fs.readFileSync(fp); res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(data); }
    catch { res.writeHead(404); return res.end('not found'); }
  }

  // everything else -> the cockpit static app
  return serveStatic(res, p);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('[ibis-mail-server] cockpit at http://127.0.0.1:' + PORT + '/');
  console.log('[ibis-mail-server] inbox : ' + INBOX_DIR);
  console.log('[ibis-mail-server] backup: ' + BACKUP_FILE);
});
