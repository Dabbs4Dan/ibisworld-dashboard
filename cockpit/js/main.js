// main.js — boot + app state + event wiring. Ties data -> model -> UI together.

import { loadAccounts, loadRawMessages } from './data/source.js';
import { cacheMessages, readMessages } from './data/store.js';
import { buildModel, TRIAGE, threadsForAccount, threadsForBucket, passesSlice } from './engine/model.js';
import { renderSidebar, renderFilterbar, renderList, listTitle } from './ui/render.js';

const app = {
  model: null,
  sel: { type: 'all' },
  slice: 'all',
  open: new Set(),
  acctFilter: ''
};

const el = {
  nav: () => document.getElementById('nav'),
  filterbar: () => document.getElementById('filterbar'),
  listTitle: () => document.getElementById('list-title'),
  list: () => document.getElementById('list'),
  status: () => document.getElementById('status'),
  acctFilterInput: () => document.getElementById('acct-filter')
};

async function boot() {
  try {
    const [acctResult, raw] = await Promise.all([loadAccounts(), loadRawMessages()]);
    const { accounts, source } = acctResult;
    // Push through the IndexedDB layer (proves the real data path); fall back to raw.
    await cacheMessages(raw);
    const messages = (await readMessages()) || raw;
    app.model = buildModel(accounts, messages);
    const liveN = app.model.liveAccounts.length;
    const archN = app.model.archivedAccounts.length;
    if (source === 'dashboard') {
      const arch = archN ? ` · ${archN} archived` : '';
      el.status().textContent = `${liveN} accounts (your territory)${arch} · ${messages.length} emails (sample)`;
    } else {
      el.status().textContent = `${liveN} sample accounts · open on your dashboard site to load real territory`;
    }
    renderAll();
  } catch (e) {
    console.error('[cockpit] boot failed', e);
    el.list().innerHTML = `<div class="empty">Couldn't load data: ${e.message}. Run this via the dev server (http://localhost:8099/cockpit/), not file://.</div>`;
  }
}

function baseThreads() {
  const t = app.model.threads;
  switch (app.sel.type) {
    case 'all':       return t;
    case 'triage':    return t.filter(x => x.accountKey === TRIAGE);
    case 'account':   return threadsForAccount(t, app.sel.name);
    case 'subbucket': return threadsForAccount(t, app.sel.name).filter(x => x.bucket === app.sel.bucket);
    case 'bucket':    return threadsForBucket(t, app.sel.bucket);
    default:          return t;
  }
}

function visibleThreads() {
  return baseThreads().filter(t => passesSlice(t, app.slice));
}

function renderAll() {
  el.nav().innerHTML = renderSidebar(app.model, app.sel, app.acctFilter);
  el.filterbar().innerHTML = renderFilterbar(app.slice);
  const threads = visibleThreads();
  el.listTitle().textContent = listTitle(app.sel, threads.length);
  el.list().innerHTML = renderList(threads, app.sel, app.open);
}

// --- events (delegation) ---------------------------------------------------

document.addEventListener('input', (e) => {
  if (e.target.id === 'acct-filter') {
    app.acctFilter = e.target.value;
    el.nav().innerHTML = renderSidebar(app.model, app.sel, app.acctFilter);
  }
});

document.addEventListener('click', (e) => {
  const nav = e.target.closest('.nav-row');
  if (nav) {
    const s = nav.dataset.sel;
    if (s === 'all') app.sel = { type: 'all' };
    else if (s === 'triage') app.sel = { type: 'triage' };
    else if (s === 'account') app.sel = { type: 'account', name: nav.dataset.name };
    else if (s === 'subbucket') app.sel = { type: 'subbucket', name: nav.dataset.name, bucket: nav.dataset.bucket };
    else if (s === 'bucket') app.sel = { type: 'bucket', bucket: nav.dataset.bucket };
    app.open.clear();
    renderAll();
    return;
  }

  if (e.target.closest('.nav-new')) {
    alert('Coming next: save any slice (an account, a bucket, a filter combo) as its own folder. Folders are just saved filters.');
    return;
  }

  const chip = e.target.closest('.chip');
  if (chip) {
    app.slice = chip.dataset.slice;
    renderAll();
    return;
  }

  const head = e.target.closest('.thread-head');
  if (head) {
    const cid = head.dataset.cid;
    if (app.open.has(cid)) app.open.delete(cid); else app.open.add(cid);
    renderAll();
  }
});

boot();
