// render.js — pure view helpers. Take the model + app state, return HTML strings.
// No data logic here; that lives in engine/. Event wiring lives in main.js.

import { TRIAGE, accountCounts, bucketCounts, subBucketCounts, focusThreads } from '../engine/model.js';
import { BUCKETS } from '../engine/buckets.js';
import { stageInfo, prioInfo } from '../engine/deals.js';

// deal-progression pills (stage + priority) from the dashboard signals
export function dealPills(deal, { compact = false } = {}) {
  if (!deal) return '';
  const out = [];
  const s = stageInfo(deal.stage);
  const p = prioInfo(deal.prio);
  if (s) out.push(`<span class="deal-pill ${s.cls}">${s.emoji}${compact ? '' : ' ' + escHtml(s.label)}</span>`);
  if (p) out.push(`<span class="deal-pill ${p.cls}">${p.emoji}${compact ? '' : ' ' + escHtml(p.label)}</span>`);
  return out.length ? `<span class="deal-pills">${out.join('')}</span>` : '';
}

export function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Strip Outlook/gateway tags that clutter subjects: [SPAM], [External], [EXT], etc.
function cleanSubject(s) {
  return String(s || '')
    .replace(/\[(spam|external|ext|suspected spam|caution|bulk)\]\s*/gi, '')
    .replace(/^(re|fw|fwd)\s*:\s*(re|fw|fwd)\s*:/i, '$1:')
    .trim() || '(no subject)';
}

function ago(days) {
  if (days == null) return '';
  if (days >= 60) return '~' + Math.round(days / 30) + 'mo';
  if (days <= 0) return 'today';
  return days + 'd';
}

export function stateLabel(state) {
  switch (state.key) {
    case 'your_move': return 'they replied · your move';
    case 'owe':       return 'you owe a reply · ' + ago(state.days);
    case 'waiting':   return 'waiting on them · ' + ago(state.days);
    case 'chasing':   return 'chasing · ' + (state.depth || 2) + ' deep, no bite';
    case 'cold':      return 'cold · re-engage?';
    default:          return state.label;
  }
}

// Company logo cascade (mirrors the dashboard): UpLead -> DuckDuckGo -> Google -> initials.
// window.__ckLogo caches the winning URL per domain so re-renders skip the cascade (no flicker).
if (typeof window !== 'undefined' && !window.__ckLogo) window.__ckLogo = {};

export function folderLogo(domain, name) {
  const initials = String(name || '').split(/\s+/).map(w => w[0]).filter(Boolean).join('').slice(0, 2).toUpperCase();
  if (!domain) return `<span class="flogo flogo-init">${escHtml(initials)}</span>`;
  const cached = window.__ckLogo[domain];
  if (cached === '__init__') return `<span class="flogo flogo-init">${escHtml(initials)}</span>`;
  if (cached) return `<span class="flogo"><img src="${cached}" alt="" loading="lazy"></span>`;
  const onerr = `if(this.src.indexOf('uplead')>-1){this.src='https://icons.duckduckgo.com/ip3/${domain}.ico'}else if(this.src.indexOf('duckduckgo')>-1){this.src='https://www.google.com/s2/favicons?domain=${domain}&sz=64'}else{window.__ckLogo['${domain}']='__init__';const p=this.parentNode;p.classList.add('flogo-init');p.textContent='${escHtml(initials)}'}`;
  const onload = `window.__ckLogo['${domain}']=this.src`;
  return `<span class="flogo"><img src="https://logo.uplead.com/${domain}" alt="" loading="lazy" onload="${onload}" onerror="${onerr}"></span>`;
}

function navRow({ active, emoji, logo, label, count, indent, cls, data, extra }) {
  const attrs = Object.entries(data || {}).map(([k, v]) => `data-${k}="${escHtml(v)}"`).join(' ');
  const icon = logo != null ? logo : (emoji ? `<span class="nav-emoji">${emoji}</span>` : '');
  return `<div class="nav-row ${active ? 'active' : ''} ${cls || ''}" ${attrs} style="padding-left:${8 + (indent || 0) * 14}px">
    <span class="nav-label">${icon}${escHtml(label)}${extra || ''}</span>
    ${count != null ? `<span class="nav-count">${count}</span>` : ''}
  </div>`;
}

function accountRow(r, active, deal) {
  return navRow({
    active, logo: folderLogo(r.domain, r.name), label: r.name, count: r.count,
    cls: 'nav-acct', data: { sel: 'account', name: r.name },
    extra: dealPills(deal, { compact: true })
  });
}

export function renderSidebar(model, sel, acctFilter) {
  const { threads } = model;
  const { liveRows, archivedRows, triage, muted } = accountCounts(threads, model);
  const bCounts = bucketCounts(threads);

  const filter = (acctFilter || '').toLowerCase().trim();
  const byActivity = (a, b) => (b.count - a.count) || a.name.localeCompare(b.name);
  const filterFn = r => !filter || r.name.toLowerCase().includes(filter);
  // Only surface account folders that actually have mail (the "active" accounts) —
  // no clutter of 171 empty folders. Searching reveals all matches regardless.
  const hasFilter = !!filter;
  const withMail = r => hasFilter || r.count > 0;
  const visibleLive = liveRows.filter(withMail).filter(filterFn).sort(byActivity);
  const visibleArchived = archivedRows.filter(withMail).filter(filterFn).sort(byActivity);

  const subFor = (name) => {
    const sub = subBucketCounts(threads, name);
    return BUCKETS.filter(b => sub[b.key]).map(b => navRow({
      active: sel.type === 'subbucket' && sel.name === name && sel.bucket === b.key,
      label: b.label, count: sub[b.key], indent: 1, cls: 'nav-sub',
      data: { sel: 'subbucket', name, bucket: b.key }
    })).join('');
  };

  const deals = model.deals || {};
  const acctBlock = (r) => accountRow(r, sel.type === 'account' && sel.name === r.name, deals[r.name]);
  const focusCount = focusThreads(threads).length;

  let html = '';

  if (focusCount) {
    html += navRow({
      active: sel.type === 'focus', emoji: '🔥', label: 'Focus',
      count: focusCount, cls: 'nav-top nav-focus', data: { sel: 'focus' }
    });
  }

  html += navRow({
    active: sel.type === 'all', emoji: '📥', label: 'All territory',
    count: threads.length - muted, cls: 'nav-top', data: { sel: 'all' }
  });
  html += navRow({
    active: sel.type === 'triage', emoji: '🆕', label: 'New contacts',
    count: triage, cls: 'nav-top nav-triage', data: { sel: 'triage' }
  });

  html += `<div class="nav-heading">Your accounts <span class="nav-heading-note">with mail</span></div>`;
  if (visibleLive.length) html += visibleLive.map(acctBlock).join('');
  else html += `<div class="nav-none">${hasFilter ? 'no match' : 'no account mail yet'}</div>`;

  if (visibleArchived.length) {
    html += `<div class="nav-heading">Dropped accounts <span class="nav-heading-note">removed from your book</span></div>`;
    html += visibleArchived.map(acctBlock).join('');
  }

  if (muted) {
    html += `<div class="nav-heading">Filed away</div>`;
    html += navRow({
      active: sel.type === 'muted', emoji: '🔕', label: 'Muted',
      count: muted, cls: 'nav-muted', data: { sel: 'muted' }
    });
  }
  return html;
}

export function renderFilterbar(slice) {
  const chips = [
    { key: 'all', label: 'all' },
    { key: 'inbound', label: 'inbound' },
    { key: 'owe', label: 'owes my reply' },
    { key: 'chasing', label: 'chasing' },
    { key: 'cold', label: 'cold' }
  ];
  return `<span class="slice-lead">slice:</span>` + chips.map(c =>
    `<span class="chip ${slice === c.key ? 'chip-on' : ''}" data-slice="${c.key}">${c.label}</span>`
  ).join('');
}

function threadRow(t, open) {
  const c = t.contact || {};
  const dom = emailDomain(c.email);
  const logo = folderLogo(dom, t.account || c.name || c.email);
  const detail = open ? threadDetail(t) : '';
  return `<div class="thread ${open ? 'open' : ''}" data-cid="${escHtml(t.cid)}">
    <div class="thread-head" data-cid="${escHtml(t.cid)}">
      <span class="thread-logo">${logo}</span>
      <div class="thread-main">
        <div class="thread-top">
          <span class="thread-name">${escHtml(c.name || c.email || '(unknown)')}</span>
          <span class="thread-age">${ago(t.daysSince)}</span>
        </div>
        <div class="thread-acct">${escHtml(t.account || 'New contact')}${dealPills(t.deal, { compact: true })}</div>
        <div class="thread-subj">${escHtml(cleanSubject(t.subject))}</div>
        <div class="thread-badges"><span class="badge ${t.state.cls}">${t.state.emoji} ${escHtml(stateLabel(t.state))}</span>${t.deal && t.deal.headline ? `<span class="thread-note">✎ ${escHtml(t.deal.headline)}</span>` : ''}</div>
      </div>
    </div>
    ${detail}
  </div>`;
}

function emailDomain(e) { return (e || '').split('@')[1] || ''; }

// strip external-sender security warnings + banners that clutter the body
function cleanBody(text) {
  let s = String(text || '');
  s = s.replace(/\*{3,}[\s\S]*?\*{3,}/g, '');
  s = s.replace(/^[^\n]*\b(this email (was sent|originated) from outside|use caution before opening)[\s\S]*/im, '');
  s = s.replace(/^\s*(caution|warning|external)[:!][^\n]*$/gim, '');
  return s.replace(/\n{3,}/g, '\n\n').trim();
}

// split the newest message from the quoted reply history below it
function splitQuoted(text) {
  const markers = [
    /\n\s*from:\s[^\n]*\n?\s*sent:/i,
    /\n\s*from:\s[^\n]*@[^\n]*\n/i,
    /\n\s*on\s[^\n]{4,80}\bwrote:/i,
    /\n-{3,}\s*original message\s*-{3,}/i,
    /\n_{6,}/
  ];
  let idx = -1;
  for (const re of markers) { const m = text.match(re); if (m && (idx === -1 || m.index < idx)) idx = m.index; }
  if (idx > 20) return { latest: text.slice(0, idx).trim(), quoted: text.slice(idx).trim() };
  return { latest: text.trim(), quoted: '' };
}

function msgBlock(m) {
  const mine = m.direction === 'outbound';
  const who = mine ? 'You' : ((m.from && m.from.name) || (m.from && m.from.email) || 'Them');
  const date = new Date(m.receivedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const { latest, quoted } = splitQuoted(cleanBody(m.bodyText || m.preview || ''));
  const quotedHtml = quoted
    ? `<details class="msg-quoted"><summary>quoted history</summary><div class="msg-quoted-body">${escHtml(quoted)}</div></details>`
    : '';
  return `<div class="msg ${mine ? 'msg-out' : 'msg-in'}">
    <div class="msg-meta"><span class="msg-who">${escHtml(who)}</span><span class="msg-date">${date}</span></div>
    <div class="msg-body">${escHtml(latest) || '<span class="msg-empty">(no text)</span>'}</div>
    ${quotedHtml}
  </div>`;
}

function threadDetail(t) {
  const c = t.contact || {};
  const dom = emailDomain(c.email);
  const logo = folderLogo(dom, t.account || c.name || c.email);
  const acct = t.account || 'New contact';
  const contactLine = c.name && c.email ? `${escHtml(c.name)} · <span class="td-email">${escHtml(c.email)}</span>` : escHtml(c.name || c.email || '');
  const dealRow = t.deal
    ? `<div class="td-deal">${dealPills(t.deal)}${t.deal.headline ? `<span class="td-note">✎ ${escHtml(t.deal.headline)}</span>` : ''}</div>`
    : '';
  const header = `<div class="td-head">
    <span class="td-logo">${logo}</span>
    <div class="td-id">
      <div class="td-acct">${escHtml(acct)}</div>
      <div class="td-contact">${contactLine}</div>
      ${dealRow}
    </div>
  </div>`;
  const msgs = t.msgs.map(msgBlock).join('');
  return `<div class="thread-detail">${header}${msgs}<div class="detail-foot">read-only · replying comes later</div></div>`;
}

export function renderList(threads, sel, openSet) {
  if (!threads.length) {
    return `<div class="empty">Nothing here in this view.</div>`;
  }
  return threads.map(t => threadRow(t, openSet.has(t.cid))).join('');
}

export function listTitle(sel, count) {
  let name = 'All territory';
  if (sel.type === 'focus') name = '🔥 Focus · reply here to advance a live deal';
  else if (sel.type === 'triage') name = '🆕 New contacts · not in your book yet';
  else if (sel.type === 'muted') name = '🔕 Muted · internal + automated';
  else if (sel.type === 'account') name = sel.name;
  else if (sel.type === 'subbucket') name = sel.name + ' · ' + sel.bucket;
  else if (sel.type === 'bucket') name = sel.bucket + ' (all accounts)';
  return `${escHtml(name)} · ${count} thread${count === 1 ? '' : 's'}`;
}
