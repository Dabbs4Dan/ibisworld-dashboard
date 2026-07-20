// source.js — where mail + accounts come from.
//
// DEV (now): reads bundled sample JSON so the whole cockpit runs with no bridge.
// PROD (next): swap loadRawMessages() to read Message JSON from the OneDrive
//   IBIS-Mail/Inbox folder via the File System Access API (Dan picks the folder
//   once, like the dashboard's backup folder). Accounts come from the dashboard's
//   ibis_accounts. The rest of the app doesn't change — same shapes in.
//
// See EMAIL-COCKPIT.md "DATA CONTRACT".

import { readDashboardAccounts, readArchivedAccounts, accountsFromRaw } from './dashboard.js';

const SAMPLE_ACCOUNTS = './sample/accounts.json';
const SAMPLE_MESSAGES = './sample/messages.json';

// Real territory first: read the dashboard's account list (live) + dead accounts
// (archived) from shared localStorage. Falls back to bundled sample accounts if the
// dashboard has no data on this origin.
// Returns { accounts:[{name,domain,archived}], source:'dashboard'|'sample' }.
export async function loadAccounts() {
  // 1. Same-origin dashboard localStorage (GitHub-hosted cockpit).
  const live = readDashboardAccounts();
  if (live.length) {
    const liveNames = new Set(live.map(a => a.name.toLowerCase().trim()));
    const archived = readArchivedAccounts().filter(a => !liveNames.has(a.name.toLowerCase().trim()));
    return { accounts: [...live, ...archived], source: 'dashboard' };
  }
  // 2. Local mail-server /accounts (cockpit served from localhost) — reads the
  //    dashboard backup file, so real territory loads with no dashboard origin.
  try {
    const r = await fetch('/accounts', { cache: 'no-store' });
    if (r.ok) {
      const { accounts: aRaw, dead: dRaw } = await r.json();
      const combined = accountsFromRaw(aRaw, dRaw);
      if (combined.length) return { accounts: combined, source: 'dashboard' };
    }
  } catch {}
  // 3. Bundled sample.
  const res = await fetch(SAMPLE_ACCOUNTS, { cache: 'no-store' });
  if (!res.ok) throw new Error('accounts fetch failed: ' + res.status);
  const sample = await res.json();
  return { accounts: sample.map(a => ({ ...a, archived: false })), source: 'sample' };
}

// Sample rows carry `daysAgo`; we synthesize an ISO `receivedAt` at load time so
// the demo always shows live states (fresh / overdue / chasing / cold) whenever
// Dan opens it. Real Message JSON already has receivedAt, so this is a no-op there.
export async function loadRawMessages() {
  const res = await fetch(SAMPLE_MESSAGES, { cache: 'no-store' });
  if (!res.ok) throw new Error('messages fetch failed: ' + res.status);
  const rows = await res.json();
  const now = Date.now();
  return rows.map(r => {
    const { daysAgo, ...rest } = r;
    const receivedAt = rest.receivedAt && rest.receivedAt.length
      ? rest.receivedAt
      : new Date(now - (daysAgo || 0) * 86400000).toISOString();
    return { ...rest, receivedAt };
  });
}
