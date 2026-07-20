// mailbox.js — the live-mail bridge on the cockpit side.
//
// Reads the Message JSON files Power Automate drops into OneDrive/IBIS-Mail/Inbox
// (via the File System Access API — Dan picks the folder once, handle persists in
// IndexedDB), maps each to our Message shape, stores it in IndexedDB, then DELETES
// the source file so OneDrive stays a near-empty transport slot, not a database.
//
// Security: mail content only ever lives in IndexedDB (this browser) + OneDrive
// (Dan's disk). Nothing is uploaded; there are zero external calls here.

import { putMessages, kvSet, kvGet } from './store.js';

const MY_EMAIL = 'daniel.starr@ibisworld.com';
const HANDLE_KEY = 'inbox_dir_handle';

// --- folder connection (File System Access) -------------------------------

export function fsaSupported() {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

// One-time gesture: Dan picks OneDrive/IBIS-Mail/Inbox. Handle is saved for next time.
export async function connectInbox() {
  const handle = await window.showDirectoryPicker({ id: 'ibis-mail-inbox', mode: 'readwrite' });
  await kvSet(HANDLE_KEY, handle);
  return handle;
}

async function verifyPermission(handle) {
  if (!handle || !handle.queryPermission) return false;
  const opts = { mode: 'readwrite' };
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  if ((await handle.requestPermission(opts)) === 'granted') return true;
  return false;
}

// Returns the stored, permitted handle — or null if not connected / permission lapsed.
export async function getInboxHandle({ prompt = false } = {}) {
  const handle = await kvGet(HANDLE_KEY);
  if (!handle) return null;
  if (prompt) return (await verifyPermission(handle)) ? handle : null;
  // Non-prompting path: only usable if permission is already granted (no user gesture).
  if (handle.queryPermission && (await handle.queryPermission({ mode: 'readwrite' })) === 'granted') return handle;
  return null;
}

export async function isConnected() {
  return !!(await kvGet(HANDLE_KEY));
}

// --- ingest ---------------------------------------------------------------

// Reads every *.json in the folder, maps + stores, deletes the file. Returns
// { ingested, deleted, skipped }.
export async function ingest(handle) {
  if (!handle) return { ingested: 0, deleted: 0, skipped: 0 };
  const mapped = [];
  const goodFiles = [];
  let skipped = 0;

  for await (const [name, entry] of handle.entries()) {
    if (entry.kind !== 'file' || !name.toLowerCase().endsWith('.json')) continue;
    try {
      const file = await entry.getFile();
      const text = (await file.text()).trim();
      if (!text || text[0] !== '{') { skipped++; continue; } // legacy junk ("new email received…")
      const raw = JSON.parse(text);
      const msg = mapV3(raw);
      if (msg && msg.id) { mapped.push(msg); goodFiles.push(name); }
      else skipped++;
    } catch (e) {
      console.warn('[cockpit] skip unreadable mail file', name, e);
      skipped++;
    }
  }

  const ingested = await putMessages(mapped);

  // Only delete files we successfully stored (never lose un-ingested mail).
  let deleted = 0;
  for (const name of goodFiles) {
    try { await handle.removeEntry(name); deleted++; } catch (e) { console.warn('[cockpit] could not delete', name, e); }
  }
  if (ingested) await kvSet('last_ingest_ts', Date.now());
  return { ingested, deleted, skipped };
}

// --- zero-click transport: the local mail-server (scripts/mail-server.js) --------
// The HTTPS cockpit can fetch this loopback address (browser secure-context
// exception), so no File System Access folder-pick is needed. If the server is
// running, mail flows automatically.

// Relative: when the cockpit is served BY the mail-server (http://localhost:8790/)
// these are same-origin (no CORS / PNA / mixed-content gates). On the GitHub-hosted
// cockpit they 404 harmlessly and we fall back to File System Access.
const LOCAL_SERVER = '';

export async function localServerAvailable() {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 1500);
    const r = await fetch(LOCAL_SERVER + '/ping', { signal: c.signal, cache: 'no-store' });
    clearTimeout(t);
    return r.ok;
  } catch { return false; }
}

// del defaults false: dedup-by-id makes re-reads harmless, and we don't want to
// remove real mail until the app is trusted. Flip to true once solid.
export async function ingestFromLocalServer({ del = false } = {}) {
  let names = [];
  try {
    names = await (await fetch(LOCAL_SERVER + '/list', { cache: 'no-store' })).json();
  } catch { return { ingested: 0, total: 0, error: 'list failed' }; }
  if (!Array.isArray(names)) return { ingested: 0, total: 0, error: 'bad list' };

  const mapped = [];
  const got = [];
  for (const name of names) {
    try {
      const raw = await (await fetch(LOCAL_SERVER + '/file/' + encodeURIComponent(name), { cache: 'no-store' })).json();
      const m = mapV3(raw);
      if (m && m.id) { mapped.push(m); got.push(name); }
    } catch (e) { /* skip unreadable file */ }
  }
  const ingested = await putMessages(mapped);
  if (del) {
    for (const name of got) {
      try { await fetch(LOCAL_SERVER + '/file/' + encodeURIComponent(name), { method: 'DELETE' }); } catch {}
    }
  }
  if (ingested) await kvSet('last_ingest_ts', Date.now());
  return { ingested, total: names.length };
}

// --- mapping: raw "When a new email arrives (V3)" body -> our Message shape ----
// Defensive about field name/casing so it works regardless of connector variant.

function pick(o, ...keys) {
  for (const k of keys) if (o && o[k] != null && o[k] !== '') return o[k];
  return undefined;
}

function parseAddr(str) {
  if (!str) return { name: '', email: '' };
  if (typeof str === 'object') {
    // Graph-style { emailAddress: { name, address } } or { name, address }
    const ea = str.emailAddress || str;
    return { name: (ea.name || '').trim(), email: String(ea.address || ea.email || '').trim().toLowerCase() };
  }
  const m = String(str).match(/<([^>]+)>/);
  const email = (m ? m[1] : str).toString().trim().toLowerCase();
  const name = m ? String(str).replace(/<[^>]+>/, '').replace(/"/g, '').trim() : '';
  return { name, email };
}

function parseList(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.map(parseAddr).filter(a => a.email);
  return String(val).split(/[;,]/).map(s => s.trim()).filter(Boolean).map(parseAddr).filter(a => a.email);
}

function stripHtml(html) {
  if (!html) return '';
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

export function mapV3(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const from = parseAddr(pick(raw, 'From', 'from', 'Sender', 'sender'));
  const to = parseList(pick(raw, 'To', 'to', 'ToRecipients', 'toRecipients'));
  const cc = parseList(pick(raw, 'Cc', 'cc', 'CcRecipients', 'ccRecipients'));
  const receivedAt = pick(raw, 'ReceivedDateTime', 'receivedDateTime', 'DateTimeReceived', 'dateTimeReceived', 'SentDateTime', 'sentDateTime') || new Date().toISOString();
  const id = String(pick(raw, 'InternetMessageId', 'internetMessageId', 'Id', 'id') || (from.email + '|' + receivedAt));
  const conversationId = String(pick(raw, 'ConversationId', 'conversationId') || id);
  const bodyHtml = pick(raw, 'Body', 'body') || '';
  const direction = from.email === MY_EMAIL ? 'outbound' : 'inbound';

  return {
    id,
    conversationId,
    direction,
    from,
    to,
    cc,
    subject: pick(raw, 'Subject', 'subject') || '(no subject)',
    preview: pick(raw, 'BodyPreview', 'bodyPreview') || stripHtml(bodyHtml).slice(0, 200),
    bodyText: stripHtml(bodyHtml),
    receivedAt,
    hasAttachments: !!pick(raw, 'HasAttachment', 'hasAttachments', 'hasAttachment'),
    folder: 'Inbox',
    account: ''
  };
}
