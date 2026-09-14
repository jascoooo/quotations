// A very small key/value store on IndexedDB, used by the on-this-PC mode.
//
// Not localStorage: the client's code list is a few megabytes once parsed, and
// localStorage would hit its quota. IndexedDB has room and stores real objects
// rather than strings.

const DB = 'quote-desk';
const STORE = 'kv';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Could not open local storage'));
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error ?? new Error('Local storage failed'));
    t.oncomplete = () => db.close();
  });
}

export const idb = {
  get: <T>(key: string) => tx<T | undefined>('readonly', (s) => s.get(key)),
  set: (key: string, value: unknown) => tx<void>('readwrite', (s) => s.put(value, key)),
  del: (key: string) => tx<void>('readwrite', (s) => s.delete(key)),
  clear: () => tx<void>('readwrite', (s) => s.clear()),
};

export const available = () => typeof indexedDB !== 'undefined';
