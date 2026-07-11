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

function navRow({ active, emoji, label, count, indent, cls, data }) {
  const attrs = Object.entries(data || {}).map(([k, v]) => `data-${k}="${escHtml(v)}"`).join(' ');
  return `<div class="nav-row ${active ? 'active' : ''} ${cls || ''}" ${attrs} style="padding-left:${8 + (indent || 0) * 14}px">
    <span class="nav-label">${emoji ? `<span class="nav-emoji">${emoji}</span>` : ''}${escHtml(label)}</span>
    ${count != null ? `<span class="nav-count">${count}</span>` : ''}
  </div>`;
}

export function renderSidebar(model, sel) {
  const { threads, accounts } = model;
  const { rows, triage } = accountCounts(threads, accounts);
  const bCounts = bucketCounts(threads);

  let html = '';

  html += navRow({
    active: sel.type === 'all', emoji: '📚', label: 'All territory',
    count: threads.length, cls: 'nav-top', data: { sel: 'all' }
  });
  html += navRow({
    active: sel.type === 'triage', emoji: '🟡', label: 'Triage',
    count: triage, cls: 'nav-top nav-triage', data: { sel: 'triage' }
  });

  html += `<div class="nav-heading">By account</div>`;
  rows.forEach(r => {
    const isSel = (sel.type === 'account' || sel.type === 'subbucket') && sel.name === r.name;
    html += navRow({
      active: sel.type === 'account' && sel.name === r.name,
      emoji: '📁', label: r.name, count: r.count,
      data: { sel: 'account', name: r.name }
    });
    if (isSel) {
      const sub = subBucketCounts(threads, r.name);
      BUCKETS.forEach(b => {
        if (!sub[b.key]) return;
        html += navRow({
          active: sel.type === 'subbucket' && sel.bucket === b.key,
          label: b.label, count: sub[b.key], indent: 1, cls: 'nav-sub',
          data: { sel: 'subbucket', name: r.name, bucket: b.key }
        });
      });
    }
  });

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
  if (sel.type === 'triage') name = '🟡 Triage · unmatched';
  else if (sel.type === 'account') name = sel.name;
  else if (sel.type === 'subbucket') name = sel.name + ' · ' + sel.bucket;
  else if (sel.type === 'bucket') name = sel.bucket + ' (all accounts)';
  return `${escHtml(name)} · ${count} thread${count === 1 ? '' : 's'}`;
}
