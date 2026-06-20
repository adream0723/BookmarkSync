/**
 * Lightweight IndexedDB wrapper for structured data storage.
 *
 * Stores records as objects with an auto-incremented primary key.
 * Each object store can have secondary indexes for sorted/filtered queries.
 *
 * Usage:
 *   import db from './db';
 *   await db.add('snapshotHistory', { timestamp: Date.now(), ... });
 *   const { records, total } = await db.paginate('snapshotHistory', 1, 15);
 */

const DB_NAME = 'bookmarksync';
const DB_VERSION = 2;

// ───── Store schema definitions ─────

interface IndexSpec { name: string; keyPath: string; unique?: boolean }
interface StoreSpec { name: string; indexes?: IndexSpec[] }

const STORES: StoreSpec[] = [
  {
    name: 'snapshotHistory',
    indexes: [{ name: 'by_timestamp', keyPath: 'timestamp' }],
  },
  {
    name: 'syncLog',
    indexes: [{ name: 'by_timestamp', keyPath: 'timestamp' }],
  },
];

// ───── Database singleton ─────

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const store of STORES) {
        if (!db.objectStoreNames.contains(store.name)) {
          const os = db.createObjectStore(store.name, { autoIncrement: true });
          for (const idx of store.indexes || []) {
            os.createIndex(idx.name, idx.keyPath, { unique: idx.unique });
          }
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

// ───── Public API ─────

const db = {
  /** Add a record, returns the auto-generated key */
  async add(storeName: string, value: unknown): Promise<number> {
    const d = await openDB();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(storeName, 'readwrite');
      const req = tx.objectStore(storeName).add(value);
      req.onsuccess = () => resolve(req.result as number);
      req.onerror = () => reject(req.error);
    });
  },

  /** Get all records as a flat array (oldest first by key order) */
  async getAll<T = unknown>(storeName: string): Promise<T[]> {
    const d = await openDB();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result as T[]);
      req.onerror = () => reject(req.error);
    });
  },

  /**
   * Paginated query, newest-first (by `timestamp` field).
   * Requires a `by_timestamp` index on the store.
   */
  async paginate<T extends { timestamp: number }>(
    storeName: string,
    page: number,
    pageSize: number,
  ): Promise<{ records: T[]; total: number }> {
    const all = await this.getAll<T>(storeName);
    all.sort((a, b) => b.timestamp - a.timestamp);
    const total = all.length;
    const start = (page - 1) * pageSize;
    return { records: all.slice(start, start + pageSize), total };
  },

  /** Delete a record by its auto-generated key */
  async delete(storeName: string, key: IDBValidKey): Promise<void> {
    const d = await openDB();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(storeName, 'readwrite');
      const req = tx.objectStore(storeName).delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },

  /** Delete all records in a store */
  async clear(storeName: string): Promise<void> {
    const d = await openDB();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(storeName, 'readwrite');
      const req = tx.objectStore(storeName).clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },

  /** Count records in a store */
  async count(storeName: string): Promise<number> {
    const d = await openDB();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  /** Delete the oldest records, keeping only `keepCount` newest (by auto-increment key order) */
  async pruneOldest(storeName: string, keepCount: number): Promise<number> {
    const d = await openDB();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const countReq = store.count();
      countReq.onsuccess = () => {
        const total = countReq.result;
        if (total <= keepCount) { resolve(0); return; }
        const deleteCount = total - keepCount;
        let deleted = 0;
        const cursorReq = store.openCursor();
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (!cursor || deleted >= deleteCount) { resolve(deleted); return; }
          cursor.delete();
          deleted++;
          cursor.continue();
        };
        cursorReq.onerror = () => reject(cursorReq.error);
      };
      countReq.onerror = () => reject(countReq.error);
    });
  },
};

export default db;
