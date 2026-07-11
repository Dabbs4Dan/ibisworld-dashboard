// store.js — the local data layer. IndexedDB is the scalable store for mail
// (OneDrive files are just transport, not the database). Kept deliberately thin
// and fail-safe: if IDB is unavailable, everything falls back to in-memory so
// rendering can never break.

const DB_NAME = 'ibis_cockpit';
const DB_VERSION = 1;
const STORE = 'messages';

function openDb() {
  return new Promise((resolve, reject) => {
    const rq = indexedDB.open(DB_NAME, DB_VERSION);
    rq.onupgradeneeded = () => {
      const db = rq.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    rq.onsuccess = () => resolve(rq.result);
    rq.onerror = () => reject(rq.error);
  });
}

// Replace the cached message set (dev refreshes from sample each load).
export async function cacheMessages(rows) {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const st = tx.objectStore(STORE);
      st.clear();
      rows.forEach(r => st.put(r));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    return true;
  } catch (e) {
    console.warn('[cockpit] IndexedDB cache skipped:', e);
    return false;
  }
}

export async function readMessages() {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const rq = tx.objectStore(STORE).getAll();
      rq.onsuccess = () => resolve(rq.result);
      rq.onerror = () => reject(rq.error);
    });
  } catch (e) {
    console.warn('[cockpit] IndexedDB read skipped:', e);
    return null;
  }
}
