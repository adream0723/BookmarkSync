import { STORAGE } from './constants';
import db from './db';
import { fp } from './fingerprint';

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

/** Compute change details between base and result tree */
export function computeChanges(base: any[], result: any[]): ChangeDetail[] {
  function flatten(nodes: any[]): Map<string, { title: string; url?: string }> {
    const m = new Map();
    function walk(ns: any[]) {
      for (const n of ns) {
        const f = fp(n.title, n.url);
        m.set(f, { title: n.title, url: n.url });
        if (n.children) walk(n.children);
      }
    }
    walk(nodes);
    return m;
  }
  const baseMap = flatten(base || []);
  const resultMap = flatten(result || []);
  const allFps = new Set([...baseMap.keys(), ...resultMap.keys()]);
  const changes: ChangeDetail[] = [];
  const usedDel = new Set<string>(), usedAdd = new Set<string>();

  for (const f of allFps) {
    const b = baseMap.get(f);
    const r = resultMap.get(f);
    if (b && !r) {
      const paired = [...resultMap.entries()].find(([k, v]) =>
        !usedAdd.has(k) && v.title === b.title && v.url !== b.url
      );
      if (paired) {
        changes.push({ fingerprint: paired[0], type: 'modified', title: paired[1].title, url: paired[1].url, oldTitle: b.title, oldUrl: b.url });
        usedDel.add(f); usedAdd.add(paired[0]);
      } else {
        changes.push({ fingerprint: f, type: 'deleted', title: b.title, url: b.url });
        usedDel.add(f);
      }
    } else if (!b && r) {
      if (usedAdd.has(f)) continue;
      changes.push({ fingerprint: f, type: 'added', title: r.title, url: r.url });
      usedAdd.add(f);
    }
  }
  return changes;
}
