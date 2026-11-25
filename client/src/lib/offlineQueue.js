// Offline upload queue (IndexedDB).
// Every recording is saved here first, then uploaded. If the network is down the
// recording waits safely in the browser and is retried when the device is back online.
// The server de-duplicates by clientId, so a retry can never create a second copy.
import { api, ApiError } from './api.js';

const DB = 'corpus-studio';
const STORE = 'uploads';

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'clientId' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(out?.result ?? out);
    t.onerror = () => reject(t.error);
  });
}
const notify = () => window.dispatchEvent(new Event('cs-queue'));

export async function enqueue(item) {
  // item: { clientId, interviewId, blob, durationSec, recordedAt, label }
  await tx('readwrite', (s) => s.put({ ...item, status: 'pending', error: null, createdAt: Date.now() }));
  notify();
}
export const listQueue = () => tx('readonly', (s) => s.getAll());
export async function removeFromQueue(clientId) {
  await tx('readwrite', (s) => s.delete(clientId));
  notify();
}
async function update(clientId, patch) {
  const items = await listQueue();
  const it = items.find((i) => i.clientId === clientId);
  if (it) await tx('readwrite', (s) => s.put({ ...it, ...patch }));
  notify();
}

let syncing = false;
/** Upload everything pending. Stops at the first network failure. */
export async function syncQueue() {
  if (syncing || !navigator.onLine) return { uploaded: 0 };
  syncing = true;
  let uploaded = 0;
  try {
    for (const it of await listQueue()) {
      if (it.status === 'failed') continue; // needs a person to look at it
      const form = new FormData();
      form.append('interviewId', it.interviewId);
      form.append('clientId', it.clientId);
      form.append('recordedAt', new Date(it.recordedAt).toISOString());
      if (it.notes) form.append('notes', it.notes);
      form.append('audio', it.blob, `${it.clientId}.wav`);
      try {
        await update(it.clientId, { status: 'uploading' });
        await api('/recordings', { method: 'POST', form });
        await removeFromQueue(it.clientId);
        uploaded++;
      } catch (e) {
        if (e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 401) {
          await update(it.clientId, { status: 'failed', error: e.message }); // server refused it
        } else {
          await update(it.clientId, { status: 'pending', error: 'Waiting for connection' });
          break; // offline or server down: try later
        }
      }
    }
  } finally {
    syncing = false;
    notify();
  }
  return { uploaded };
}

export async function retryFailed(clientId) {
  await update(clientId, { status: 'pending', error: null });
  return syncQueue();
}

/** Save a recording to the device as a file (backup / manual transfer). */
export function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// Retry automatically when the connection returns, and every 60 s.
window.addEventListener('online', () => syncQueue());
setInterval(() => syncQueue(), 60000);
