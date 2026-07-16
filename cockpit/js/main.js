// main.js — boot + app state + event wiring. Ties data -> model -> UI together.

import { loadAccounts, loadRawMessages } from './data/source.js';
import { getAllMessages } from './data/store.js';
import { fsaSupported, connectInbox, getInboxHandle, isConnected, ingest } from './data/mailbox.js';
import { buildModel, TRIAGE, threadsForAccount, threadsForBucket, passesSlice } from './engine/model.js';
import { renderSidebar, renderFilterbar, renderList, listTitle } from './ui/render.js';

const app = {
  model: null,
  sel: { type: 'all' },
  slice: 'all',
  open: new Set(),
  acctFilter: '',
  accounts: [],
  acctSource: 'sample',
  live: false,    // connected to real mailbox folder
  handle: null    // File System Access dir handle (null if lapsed/never connected)
};

const el = {
  nav: () => document.getElementById('nav'),
  filterbar: () => document.getElementById('filterbar'),
  listTitle: () => document.getElementById('list-title'),
  list: () => document.getElementById('list'),
  status: () => document.getElementById('status'),
  connectBtn: () => document.getElementById('connect-mail-btn')
};

async function boot() {
  try {
    const acctResult = await loadAccounts();
    app.accounts = acctResult.accounts;
    app.acctSource = acctResult.source;

    // Attach to live mail if previously connected. Ingest silently if permission survives.
    app.live = await isConnected();
    if (app.live) {
      app.handle = await getInboxHandle();          // null if the grant lapsed
      if (app.handle) await ingest(app.handle);
    }

    await rebuild();
    updateStatus();
    updateConnectBtn();
    if (app.handle) startPoll();
  } catch (e) {
    console.error('[cockpit] boot failed', e);
    el.list().innerHTML = `<div class="empty">Couldn't load data: ${e.message}. Run this via the dev server (http://localhost:8099/cockpit/), not file://.</div>`;
  }
}

async function rebuild() {
  const messages = app.live ? await getAllMessages() : await loadRawMessages();
  app.model = buildModel(app.accounts, messages);
  renderAll();
}

function updateStatus() {
  const liveN = app.model.liveAccounts.length;
  const archN = app.model.archivedAccounts.length;
  const arch = archN ? ` · ${archN} archived` : '';
  const terr = app.acctSource === 'dashboard' ? `${liveN} accounts (your territory)${arch}` : `${liveN} sample accounts`;
  const emails = app.model.threads.reduce((n, t) => n + t.msgs.length, 0);
  const mail = app.live ? `🟢 live mail · ${emails} emails` : `${emails} emails (sample)`;
  el.status().textContent = `${terr} · ${mail}`;
}

function updateConnectBtn() {
  const btn = el.connectBtn();
  if (!btn) return;
  if (!app.live) { btn.textContent = '🔌 Connect live mail'; btn.title = 'Read real mail from your OneDrive IBIS-Mail folder'; }
  else if (!app.handle) { btn.textContent = '🔑 Reconnect mail'; btn.title = 'Folder permission lapsed — click to re-grant'; }
  else { btn.textContent = '🔄 Refresh mail'; btn.title = 'Check the folder for new mail now'; }
}

let pollTimer = null;
function startPoll() {
  if (pollTimer) return;
  pollTimer = setInterval(async () => {
    if (!app.handle) return;
    try {
      const r = await ingest(app.handle);
      if (r.ingested) { await rebuild(); updateStatus(); }
    } catch (e) { console.warn('[cockpit] poll ingest failed', e); }
  }, 45000);
}

async function onConnectClick() {
  if (!fsaSupported()) {
    alert('Live mail needs the File System Access API — use Chrome or Edge.');
    return;
  }
  const btn = el.connectBtn();
  try {
    if (!app.live || !app.handle) {
      app.handle = await connectInbox();   // one-time folder pick (or re-grant)
      app.live = true;
    }
    if (btn) btn.textContent = '… reading';
    await ingest(app.handle);
    await rebuild();
    updateStatus();
    updateConnectBtn();
    startPoll();
  } catch (e) {
    if (e && e.name === 'AbortError') { updateConnectBtn(); return; } // user cancelled picker
    console.error('[cockpit] connect/ingest failed', e);
    updateConnectBtn();
    alert('Couldn\'t read the mail folder: ' + (e.message || e));
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
  if (e.target.closest('#connect-mail-btn')) { onConnectClick(); return; }

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
