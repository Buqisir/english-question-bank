import type {
  PersonalLayerDraftRecord,
  PersonalLayerLocalStore,
} from '../../../../../shared/personal-paper-layer/index.mjs'

const DB_NAME = 'eqb-personal-paper-layer'
const DB_VERSION = 1
const STORE = 'drafts'

let dbPromise: Promise<IDBDatabase> | null = null

function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE)
    }
    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => {
        db.close()
        dbPromise = null
      }
      resolve(db)
    }
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'))
    request.onblocked = () => reject(new Error('IndexedDB open blocked'))
  })
  // A failed open (private mode, quota, blocked) must be retried next time, not cached forever.
  dbPromise.catch(() => {
    dbPromise = null
  })
  return dbPromise
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T> | null): Promise<T | undefined> {
  const db = await openDatabase()
  return new Promise<T | undefined>((resolve, reject) => {
    const transaction = db.transaction(STORE, mode)
    const request = work(transaction.objectStore(STORE))
    let value: T | undefined
    if (request) request.onsuccess = () => { value = request.result }
    // Resolve on commit, not on request success, so "protected" means durable.
    transaction.oncomplete = () => resolve(value)
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB write failed'))
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB write aborted'))
  })
}

// Keys already carry account, paper and source revision (personalLayerDraftKey).
export const personalLayerIndexedDbStore: PersonalLayerLocalStore = {
  async load(key) {
    const record = await run<PersonalLayerDraftRecord | undefined>('readonly', (store) => store.get(key))
    return record ?? null
  },
  async save(key, record) {
    await run('readwrite', (store) => store.put(record, key))
  },
  async clear(key) {
    await run('readwrite', (store) => store.delete(key))
  },
}
