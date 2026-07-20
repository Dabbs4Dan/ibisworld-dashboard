// mail-server.js — tiny localhost server that hands the cockpit the Message JSON
// files Power Automate drops in OneDrive/IBIS-Mail/Inbox. Zero-click transport:
// the cockpit (even the HTTPS GitHub Pages one) fetches http://127.0.0.1:8790,
// which browsers allow as a loopback secure-context exception. No File System
// Access folder-pick needed.
//
// Serves ONLY *.json from the mail dir, loopback-only (127.0.0.1), read + delete.
// Run: node mail-server.js ["<inbox dir>"]  (default dir below)

const http = require('http');
const fs = require('fs');
const path = require('path');

const DEFAULT_DIR = 'C:\\Users\\Daniel.starr\\OneDrive - IBISWORLD PTY LTD\\IBIS-Mail\\Inbox';
const DIR = process.argv[2] || DEFAULT_DIR;
const PORT = 8790;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  // Chrome Private Network Access: a public HTTPS site (the live cockpit) calling
  // this loopback server must be explicitly allowed, or the preflight is blocked.
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
}

const server = http.createServer((req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  let url;
  try { url = new URL(req.url, 'http://127.0.0.1'); } catch { res.writeHead(400); return res.end('bad url'); }
  const p = url.pathname;

  if (p === '/' || p === '/ping') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ibis-mail-server ok'); }

  if (p === '/list') {
    let files = [];
    try { files = fs.readdirSync(DIR).filter(f => f.toLowerCase().endsWith('.json')); } catch (e) { }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(files));
  }

  if (p.startsWith('/file/')) {
    const name = decodeURIComponent(p.slice('/file/'.length));
    // hard guard: only a bare *.json filename, no traversal
    if (!name || name.includes('..') || name.includes('/') || name.includes('\\') || !name.toLowerCase().endsWith('.json')) {
      res.writeHead(400); return res.end('bad name');
    }
    const fp = path.join(DIR, name);
    if (req.method === 'DELETE') {
      try { fs.unlinkSync(fp); res.writeHead(200); return res.end('deleted'); }
      catch { res.writeHead(404); return res.end('not found'); }
    }
    try { const data = fs.readFileSync(fp); res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(data); }
    catch { res.writeHead(404); return res.end('not found'); }
  }

  res.writeHead(404); res.end('not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('[ibis-mail-server] listening on http://127.0.0.1:' + PORT);
  console.log('[ibis-mail-server] serving ' + DIR);
});
