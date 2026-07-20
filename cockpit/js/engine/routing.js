// routing.js — maps an email to a territory account by sender/recipient domain.
// This is the reliable match the Outreach extension never had: we have real
// from/to email addresses, so we route by URL/domain, not DOM name-guessing.

const MY_DOMAIN = 'ibisworld.com';

// Free / personal domains never map to an account -> they land in Triage.
const PERSONAL_DOMAINS = new Set([
  'gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'icloud.com',
  'aol.com', 'live.com', 'me.com', 'msn.com', 'proton.me', 'protonmail.com',
  'ymail.com', 'comcast.net', 'verizon.net'
]);

export function normDomain(d) {
  if (!d) return '';
  return String(d).toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .trim();
}

export function domainFromEmail(email) {
  if (!email || !email.includes('@')) return '';
  return normDomain(email.split('@')[1]);
}

// The contact on a message = the party who isn't Dan.
export function otherParty(msg) {
  if (msg.direction === 'inbound') return msg.from || null;
  return (msg.to && msg.to[0]) || null;
}

// Noise = internal colleagues + sales-tool/automated senders. These flood the
// unmatched pile; we route them to a muted bucket so Triage only surfaces genuine
// unmatched *people* (real prospects worth a look).
const NOISE_DOMAINS = new Set([
  'gong.io', 'qualified.com', '6sense.com', 'teams.mail.microsoft',
  'ticketsatwork.com', 'email.ticketsatwork.com',
  'salesforce.com', 'linkedin.com', 'zoominfo.com', 'outreach.io',
  'calendly.com', 'docusign.net', 'microsoft.com', 'office.com'
]);
// Automated role addresses (no human on the other end).
const NOISE_LOCAL = /^(no-?reply|do-?not-?reply|donotreply|notifications?|notify|mailer|mail-?daemon|postmaster|alerts?|updates?|newsletter|automated|auto|app|marketing|bounce|bounces)@/i;
// ESP/bounce subdomains (email.x.com, bounce.x.com, mailer.x.com …).
const NOISE_SUBDOMAIN = /^(email|mail|bounce|bounces|reply|mailer|notif|notifications|marketing|news|em|e)\./;

export function isNoiseSender(email) {
  if (!email) return false;
  const dom = domainFromEmail(email);
  if (dom === MY_DOMAIN) return true;              // internal colleague / notification
  if (NOISE_DOMAINS.has(dom)) return true;         // known sales tools
  if (NOISE_LOCAL.test(email)) return true;        // no-reply / app / notifications@
  if (NOISE_SUBDOMAIN.test(dom)) return true;      // email.brand.com style
  return false;
}

// Manual domain aliases — extra email domains that belong to an account whose
// *website* domain differs (subsidiaries, brand domains, post-merger handles).
// This is the correction hook: populate from Triage review OR from ZoomInfo
// golden-contact data (Dan's primary contact source) to auto-corroborate
// account↔domain. Maps an email domain -> the exact dashboard account name.
// e.g. { 'kohlerco.com': 'Kohler Co.', 'rbi.com': 'Burger King' }
export const DOMAIN_ALIASES = {};

export function buildDomainIndex(accounts) {
  const idx = new Map();
  // aliases first, so a real account's own website domain wins any collision
  for (const [dom, name] of Object.entries(DOMAIN_ALIASES)) {
    const d = normDomain(dom);
    if (d) idx.set(d, name);
  }
  accounts.forEach(a => {
    const d = normDomain(a.domain);
    if (d) idx.set(d, a.name);
  });
  return idx;
}

// Exact match first, then walk up subdomains (mail.corp.kohler.com -> kohler.com).
// Best-effort + never destructive: a miss returns null -> the message goes to Triage.
function matchDomain(dom, idx) {
  if (!dom) return null;
  if (idx.has(dom)) return idx.get(dom);
  const parts = dom.split('.');
  for (let i = 1; i < parts.length - 1; i++) {
    const cand = parts.slice(i).join('.');
    if (idx.has(cand)) return idx.get(cand);
  }
  return null;
}

export function resolveAccount(msg, domainIdx) {
  const party = otherParty(msg);
  const dom = domainFromEmail(party && party.email);
  if (!dom || dom === MY_DOMAIN || PERSONAL_DOMAINS.has(dom)) return null;
  return matchDomain(dom, domainIdx);
}
