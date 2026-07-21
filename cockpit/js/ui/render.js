// render.js — pure view helpers. Take the model + app state, return HTML strings.
// No data logic here; that lives in engine/. Event wiring lives in main.js.

import { TRIAGE, accountCounts, bucketCounts, subBucketCounts } from '../engine/model.js';
import { BUCKETS } from '../engine/buckets.js';

export function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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

function navRow({ active, emoji, logo, label, count, indent, cls, data }) {
  const attrs = Object.entries(data || {}).map(([k, v]) => `data-${k}="${escHtml(v)}"`).join(' ');
  const icon = logo != null ? logo : (emoji ? `<span class="nav-emoji">${emoji}</span>` : '');
  return `<div class="nav-row ${active ? 'active' : ''} ${cls || ''}" ${attrs} style="padding-left:${8 + (indent || 0) * 14}px">
    <span class="nav-label">${icon}${escHtml(label)}</span>
    ${count != null ? `<span class="nav-count">${count}</span>` : ''}
  </div>`;
}

function accountRow(r, active) {
  return navRow({
    active, logo: folderLogo(r.domain, r.name), label: r.name, count: r.count,
    cls: 'nav-acct', data: { sel: 'account', name: r.name }
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

  const acctBlock = (r) => {
    const isSel = (sel.type === 'account' || sel.type === 'subbucket') && sel.name === r.name;
    return accountRow(r, sel.type === 'account' && sel.name === r.name) + (isSel ? subFor(r.name) : '');
  };

  let html = '';

  html += navRow({
    active: sel.type === 'all', emoji: '📚', label: 'All territory',
    count: threads.length, cls: 'nav-top', data: { sel: 'all' }
  });
  html += navRow({
    active: sel.type === 'triage', emoji: '🆕', label: 'New',
    count: triage, cls: 'nav-top nav-triage', data: { sel: 'triage' }
  });
  if (muted) {
    html += navRow({
      active: sel.type === 'muted', emoji: '🔕', label: 'Muted',
      count: muted, cls: 'nav-top', data: { sel: 'muted' }
    });
  }

  html += `<div class="nav-heading">Accounts <span class="nav-heading-note">active · with mail</span></div>`;
  if (visibleLive.length) html += visibleLive.map(acctBlock).join('');
  else html += `<div class="nav-none">${hasFilter ? 'no match' : 'no account mail yet'}</div>`;

  if (visibleArchived.length) {
    html += `<div class="nav-heading">Dropped <span class="nav-heading-note">removed from dashboard</span></div>`;
    html += visibleArchived.map(acctBlock).join('');
  }

  html += `<div class="nav-heading">By bucket</div>`;
  BUCKETS.forEach(b => {
    html += navRow({
      active: sel.type === 'bucket' && sel.bucket === b.key,
      emoji: b.emoji, label: b.label + 's', count: bCounts[b.key] || 0,
      data: { sel: 'bucket', bucket: b.key }
    });
  });

  html += `<div class="nav-new" data-newfolder="1"><span class="nav-emoji">＋</span>new folder</div>`;
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
  const detail = open ? threadDetail(t) : '';
  return `<div class="thread ${open ? 'open' : ''}" data-cid="${escHtml(t.cid)}">
    <div class="thread-head" data-cid="${escHtml(t.cid)}">
      <div class="thread-top">
        <span class="thread-name">${escHtml(c.name || c.email || '(unknown)')}</span>
        <span class="thread-age">${ago(t.daysSince)}</span>
      </div>
      <div class="thread-subj">${escHtml(t.subject || '(no subject)')}</div>
      <span class="badge ${t.state.cls}">${t.state.emoji} ${escHtml(stateLabel(t.state))}</span>
    </div>
    ${detail}
  </div>`;
}

function threadDetail(t) {
  const msgs = t.msgs.map(m => {
    const mine = m.direction === 'outbound';
    const who = mine ? 'You' : escHtml((m.from && m.from.name) || 'Them');
    const d = new Date(m.receivedAt);
    const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return `<div class="msg ${mine ? 'msg-out' : 'msg-in'}">
      <div class="msg-meta"><span class="msg-who">${who}</span><span class="msg-date">${date}</span></div>
      <div class="msg-body">${escHtml(m.bodyText || m.preview || '')}</div>
    </div>`;
  }).join('');
  return `<div class="thread-detail">${msgs}<div class="detail-foot">read-only · replying comes later</div></div>`;
}

export function renderList(threads, sel, openSet) {
  if (!threads.length) {
    return `<div class="empty">Nothing here in this view.</div>`;
  }
  return threads.map(t => threadRow(t, openSet.has(t.cid))).join('');
}

export function listTitle(sel, count) {
  let name = 'All territory';
  if (sel.type === 'triage') name = '🆕 New · not in your book yet';
  else if (sel.type === 'muted') name = '🔕 Muted · internal + automated';
  else if (sel.type === 'account') name = sel.name;
  else if (sel.type === 'subbucket') name = sel.name + ' · ' + sel.bucket;
  else if (sel.type === 'bucket') name = sel.bucket + ' (all accounts)';
  return `${escHtml(name)} · ${count} thread${count === 1 ? '' : 's'}`;
}
