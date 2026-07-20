// dashboard.js — the bridge to the dashboard's real territory.
//
// The cockpit and the dashboard are served from the same origin (same repo), so
// they share browser localStorage. We read the dashboard's `ibis_accounts` here
// and map each account to the cockpit's { name, domain } shape. The domain logic
// mirrors index.html (getDomain / overrides / guessDomain) so an email routes to
// the same account the dashboard would show a logo for.

const LOGO_DOMAIN_OVERRIDES = {
  'Alibaba Group':        'alibabagroup.com',
  'Berkshire Hathaway':   'berkshirehathaway.com',
  'Conocophillips':       'conocophillips.com',
  'Dow':                  'dow.com',
  'Steel Dynamics, Inc.': 'steeldynamics.com',
  'Enterprise Mobility':  'enterprisemobility.com',
  'Novelis':              'novelis.com',
  'Vitol, Inc.':          'vitol.com',
  'Glencore':             'glencore.com',
  'SkyKnight Capital':    'skyknightcapital.com',
  "Women's Business Development Center of Aurora": 'wbdc.org',
  'New York SBDC Network': 'nysbdc.org'
};

function getField(acc, ...keys) {
  for (const k of keys) if (acc[k] !== undefined && acc[k] !== '') return acc[k];
  return '';
}

function getDomain(w) {
  if (!w || !String(w).trim()) return null;
  try {
    w = String(w).trim().replace(/\/.*$/, '');
    if (!w.startsWith('http')) w = 'https://' + w;
    return new URL(w).hostname.replace('www.', '');
  } catch { return null; }
}

function getDomainOverride(name) {
  if (!name) return null;
  if (LOGO_DOMAIN_OVERRIDES[name]) return LOGO_DOMAIN_OVERRIDES[name];
  const lower = name.toLowerCase().trim();
  for (const k in LOGO_DOMAIN_OVERRIDES) {
    if (k.toLowerCase().trim() === lower) return LOGO_DOMAIN_OVERRIDES[k];
  }
  return null;
}

function guessDomain(name) {
  if (!name) return null;
  const orgKeywords = /\b(center|centre|network|association|foundation|institute|bureau|authority|coalition|council|alliance|society|trust|sbdc|nonprofit|charity|ngo|government|gov)\b/i;
  const tld = orgKeywords.test(name) ? '.org' : '.com';
  const d = name.trim()
    .replace(/\b(inc\.?|llc\.?|corp\.?|ltd\.?|co\.?|plc|s\.a\.?|pty\.?|group|holdings|international|global|technologies|technology|services|solutions|consulting|capital|partners|management|financial|enterprises|industries|systems|networks|network|corporation|center|centre|association|foundation|institute|the|of|for|and|an|a)\b/gi, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();
  return d.length > 1 ? d + tld : null;
}

// Build the cockpit account list from raw dashboard rows (used by the local-server
// /accounts path, which reads them from the dashboard backup file).
export function accountsFromRaw(accountsRaw, deadRaw) {
  const live = Array.isArray(accountsRaw) ? mapRows(accountsRaw, false) : [];
  const liveNames = new Set(live.map(a => a.name.toLowerCase().trim()));
  const dead = Array.isArray(deadRaw)
    ? mapRows(deadRaw, true).filter(a => !liveNames.has(a.name.toLowerCase().trim()))
    : [];
  return [...live, ...dead];
}

function mapRows(rows, archived) {
  const out = [];
  const seen = new Set();
  rows.forEach(a => {
    const name = getField(a, 'Account Name', 'AccountName');
    if (!name) return;
    const key = name.toLowerCase().trim();
    if (seen.has(key)) return;
    seen.add(key);
    const domain = getDomainOverride(name) || getDomain(getField(a, 'Website')) || guessDomain(name);
    out.push({ name, domain: domain || '', archived: !!archived });
  });
  return out;
}

// Returns the dashboard's live territory as [{ name, domain, archived:false }], or
// [] if the dashboard has no data on this origin (fresh browser / different site).
export function readDashboardAccounts() {
  let raw;
  try { raw = localStorage.getItem('ibis_accounts'); } catch { return []; }
  if (!raw) return [];
  let rows;
  try { rows = JSON.parse(raw); } catch { return []; }
  if (!Array.isArray(rows) || !rows.length) return [];
  return mapRows(rows, false);
}

// Returns removed/dead accounts from the dashboard's ibis_dead store as
// [{ name, domain, archived:true }]. These become the Archive section — their
// folders (and any mail) persist instead of vanishing when an account is dropped.
export function readArchivedAccounts() {
  let raw;
  try { raw = localStorage.getItem('ibis_dead'); } catch { return []; }
  if (!raw) return [];
  let dead;
  try { dead = JSON.parse(raw); } catch { return []; }
  const rows = dead && Array.isArray(dead.accounts) ? dead.accounts : [];
  if (!rows.length) return [];
  return mapRows(rows, true);
}
