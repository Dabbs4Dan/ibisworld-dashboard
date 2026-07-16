// store.js — the cockpit's local database (IndexedDB). This is the durable store
// for real mail; OneDrive is only transport. Built to hold tens of thousands of
// messages locally, private to this browser, never uploaded anywhere.
//
// Stores:
//   messages — ingested emails, keyed by id (internetMessageId). Persistent, upserted.
//   kv       — small key/value: the File System Access folder handle, flags, timestamps.

const DB_NAME = 'ibis_cockpit';
const DB_VERSION = 2;
const MSG_STORE = 'messages';
const KV_STORE = 'kv';

function openDb() {
  return new Promise((resolve, reject) => {
    const rq = indexedDB.open(DB_NAME, DB_VERSION);
    rq.onupgradeneeded = (e) => {
      const db = rq.result;
      // v1 used `messages` as a disposable sample cache — safe to drop + recreate.
      if (db.objectStoreNames.contains(MSG_STORE) && e.oldVersion < 2) {
        db.deleteObjectStore(MSG_STORE);
      }
      if (!db.objectStoreNames.contains(MSG_STORE)) db.createObjectStore(MSG_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(KV_STORE)) db.createObjectStore(KV_STORE, { keyPath: 'k' });
    };
    rq.onsuccess = () => resolve(rq.result);
    rq.onerror = () => reject(rq.error);
  });
}

// --- messages -------------------------------------------------------------

export async function putMessages(rows) {
  if (!rows || !rows.length) return 0;
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(MSG_STORE, 'readwrite');
      const st = tx.objectStore(MSG_STORE);
      rows.forEach(r => { if (r && r.id) st.put(r); });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    return rows.length;
  } catch (e) {
    console.warn('[cockpit] putMessages failed:', e);
    return 0;
  }
}

export async function getAllMessages() {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const rq = db.transaction(MSG_STORE, 'readonly').objectStore(MSG_STORE).getAll();
      rq.onsuccess = () => resolve(rq.result || []);
      rq.onerror = () => reject(rq.error);
    });
  } catch (e) {
    console.warn('[cockpit] getAllMessages failed:', e);
    return [];
  }
}

export async function countMessages() {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const rq = db.transaction(MSG_STORE, 'readonly').objectStore(MSG_STORE).count();
      rq.onsuccess = () => resolve(rq.result || 0);
      rq.onerror = () => reject(rq.error);
    });
  } catch { return 0; }
}

export async function clearMessages() {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(MSG_STORE, 'readwrite');
      tx.objectStore(MSG_STORE).clear();
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) { console.warn('[cockpit] clearMessages failed:', e); }
}

// --- key/value (handle, flags) -------------------------------------------

export async function kvSet(k, v) {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(KV_STORE, 'readwrite');
      tx.objectStore(KV_STORE).put({ k, v });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) { console.warn('[cockpit] kvSet failed:', e); }
}

export async function kvGet(k) {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const rq = db.transaction(KV_STORE, 'readonly').objectStore(KV_STORE).get(k);
      rq.onsuccess = () => resolve(rq.result ? rq.result.v : undefined);
      rq.onerror = () => reject(rq.error);
    });
  } catch { return undefined; }
}
