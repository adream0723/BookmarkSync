import { STORAGE } from './constants';
import db from './db';

export interface ChangeDetail {
  fingerprint: string;
  type: 'added' | 'deleted' | 'modified';
  title: string;
  url?: string;
  oldTitle?: string;
  oldUrl?: string;
}

export interface SyncLogEntry {
  id: string;
  timestamp: number;
  deviceName: string;
  type: 'upload' | 'download' | 'sync';
  result: 'success' | 'failure';
  /** Counts of what changed */
  added: number;
  modified: number;
  deleted: number;
  conflicts?: number;
  /** Error detail on failure */
  error?: string;
  /** Total items synced */
  totalItems?: number;
  /** Snapshot version recorded after this operation */
  snapshotVersion?: string;
  /** Detailed list of what changed */
  changes?: ChangeDetail[];
}

const MIGRATED_KEY = 'syncLogMigrated';
const MAX_ENTRIES = 200;

export async function getSyncLogs(page = 1, pageSize = 20): Promise<{ entries: SyncLogEntry[]; total: number }> {
  // ── One-time migration from chrome.storage.local → IndexedDB ──
  const migrated = await chrome.storage.local.get(MIGRATED_KEY);
  if (!migrated[MIGRATED_KEY]) {
    const raw = await chrome.storage.local.get(STORAGE.SYNC_LOG);
    const oldEntries: SyncLogEntry[] = raw[STORAGE.SYNC_LOG] || [];
    if (oldEntries.length > 0) {
      for (const entry of oldEntries) {
        await db.add('syncLog', entry);
      }
      console.log(`[BookmarkSync] Migrated ${oldEntries.length} sync logs from storage → IndexedDB`);
      await chrome.storage.local.remove(STORAGE.SYNC_LOG);
    }
    await chrome.storage.local.set({ [MIGRATED_KEY]: true });
  }

  const all = await db.getAll<SyncLogEntry>('syncLog');
  all.sort((a, b) => b.timestamp - a.timestamp);
  const total = all.length;
  const start = (page - 1) * pageSize;
  return { entries: all.slice(start, start + pageSize), total };
}

export async function addSyncLog(entry: Omit<SyncLogEntry, 'id'>): Promise<void> {
  await db.add('syncLog', { id: crypto.randomUUID(), ...entry });
  await db.pruneOldest('syncLog', MAX_ENTRIES);
}

export async function clearSyncLogs(): Promise<void> {
  await db.clear('syncLog');
}
