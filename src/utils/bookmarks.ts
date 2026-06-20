import { BookmarkInfo, SyncDataInfo } from './models';
import optionsStorage from './optionsStorage';
import { generateSyncId, saveMapping, saveMappingBatch } from './syncId';
import { importBookmarksSimple } from './import';
import { SYNC_VERSION, STORAGE } from './constants';
import db from './db';

const SNAPSHOT_KEY = STORAGE.SNAPSHOT;

export interface SyncPayload {
  version: string;
  syncedAt: number;
  deviceName: string;
  bookmarks: BookmarkInfo[];
}

// ───── Read local bookmarks ─────

export async function readBookmarks(): Promise<SyncDataInfo> {
  const tree = await chrome.bookmarks.getTree();
  const root = tree[0]?.children || [];
  const data = new SyncDataInfo();
  data.bookmarks = root.map(convertNodeWithSyncId);
  return data;
}

export async function wrapSyncPayload(): Promise<SyncPayload> {
  const bookmarks = await readBookmarks();
  const settings = await optionsStorage.getAll();
  return {
    version: SYNC_VERSION,
    syncedAt: Date.now(),
    deviceName: settings.deviceName || '未知设备',
    bookmarks: bookmarks.bookmarks!,
  };
}

function convertNodeWithSyncId(node: chrome.bookmarks.BookmarkTreeNode): BookmarkInfo {
  const info = new BookmarkInfo(
    node.title || '',
    node.url,
    node.children?.map(convertNodeWithSyncId),
  );
  info.id = node.id;
  info.parentId = node.parentId;
  info.index = node.index;
  info.dateAdded = node.dateAdded;
  info.dateGroupModified = node.dateGroupModified;
  return info;
}

// ───── SyncId assignment (persisted to storage) ─────

/**
 * Assign syncIds to locally-read bookmarks.
 * First tries to inherit syncIds from remote data (via fingerprint map),
 * then checks local b2s mapping, finally generates new ones.
 * All new mappings are batch-saved to chrome.storage.local.
 *
 * @param nodes         Bookmark tree to process
 * @param remoteFpMap   fingerprint→syncId map from remote Gist data (optional)
 */
export async function assignSyncIds(
  nodes: BookmarkInfo[],
  remoteFpMap?: Map<string, string>,
): Promise<void> {
  // Batch-read both maps once
  const [b2sRaw, s2bRaw] = await Promise.all([
    chrome.storage.local.get(STORAGE.SYNC_ID_B2S),
    chrome.storage.local.get(STORAGE.SYNC_ID_S2B),
  ]);
  const b2s: Record<string, string> = b2sRaw[STORAGE.SYNC_ID_B2S] || {};
  const s2b: Record<string, string> = s2bRaw[STORAGE.SYNC_ID_S2B] || {};
  const pending: Array<{ bid: string; sid: string }> = [];

  function walk(nodes: BookmarkInfo[]) {
    for (const node of nodes) {
      if (node.id) {
        let sid = b2s[node.id];
        // Try to inherit from remote via fingerprint
        if (!sid && node.url && remoteFpMap) {
          const fp = `${node.title || ''}||${node.url || ''}`;
          sid = remoteFpMap.get(fp);
        }
        if (!sid) {
          sid = generateSyncId();
          pending.push({ bid: node.id, sid });
        }
        node.syncId = sid;
        node.updatedAt = node.dateGroupModified || node.dateAdded || Date.now();
        // Update in-memory maps too (for this walk's later lookups)
        b2s[node.id] = sid;
        s2b[sid] = node.id;
      }
      if (node.children) walk(node.children);
    }
  }
  walk(nodes);

  // Batch-save new mappings
  if (pending.length > 0) {
    await saveMappingBatch(pending, b2s, s2b);
  }
}

// ───── Snapshot management ─────

export interface Snapshot {
  timestamp: number;
  version: string;
  bookmarks: BookmarkInfo[];
}

export interface SnapshotRecord {
  timestamp: number;
  version: string;
  bookmarkCount: number;
  trigger: 'upload' | 'download' | 'sync';
  /** Full bookmarks tree at the time of snapshot (for tree view) */
  bookmarks?: BookmarkInfo[];
}

const SNAPSHOT_HISTORY_KEY = STORAGE.SNAPSHOT_HISTORY;
const SNAPSHOT_HISTORY_MIGRATED_KEY = 'snapshotHistoryMigrated';

export async function saveSnapshot(nodes: BookmarkInfo[], version?: string, oldTimestamp?: number): Promise<void> {
  await chrome.storage.local.set({
    [SNAPSHOT_KEY]: { timestamp: oldTimestamp || Date.now(), version: version || SYNC_VERSION, bookmarks: nodes } as Snapshot,
  });
}

export async function saveSnapshotRecord(trigger: 'upload' | 'download' | 'sync', nodes?: BookmarkInfo[]): Promise<void> {
  // Count bookmarks (URL-only, excludes folders) from nodes or from current snapshot
  let count = 0;
  if (nodes) {
    function countBookmarkNodes(ns: BookmarkInfo[]): number {
      let t = 0;
      for (const n of ns) { if (n.url) t++; if (n.children) t += countBookmarkNodes(n.children); }
      return t;
    }
    count = countBookmarkNodes(nodes);
  } else {
    const info = await getSnapshotInfo();
    count = info?.count || 0;
  }

  await db.add('snapshotHistory', {
    timestamp: Date.now(),
    version: SYNC_VERSION,
    bookmarkCount: count,
    trigger,
    bookmarks: nodes ? JSON.parse(JSON.stringify(nodes)) : undefined,
  });

  // ── Prune old records per user's snapshotCount setting ──
  try {
    const settings = await optionsStorage.getAll();
    const maxRecords = settings.snapshotCount || 20;
    const deleted = await db.pruneOldest('snapshotHistory', maxRecords);
    if (deleted > 0) console.log(`[BookmarkSync] Pruned ${deleted} old snapshots, kept ${maxRecords}`);
  } catch (err) {
    console.warn('[BookmarkSync] Failed to prune snapshot history:', err);
  }
  console.log(`[BookmarkSync] saveSnapshotRecord: saved to IndexedDB`);
}

export async function getSnapshotHistory(page = 1, pageSize = 15): Promise<{ records: SnapshotRecord[]; total: number }> {
  // ── One-time migration from chrome.storage.local → IndexedDB ──
  const migrated = await chrome.storage.local.get(SNAPSHOT_HISTORY_MIGRATED_KEY);
  if (!migrated[SNAPSHOT_HISTORY_MIGRATED_KEY]) {
    const raw = await chrome.storage.local.get(SNAPSHOT_HISTORY_KEY);
    const oldRecords: SnapshotRecord[] = raw[SNAPSHOT_HISTORY_KEY] || [];
    if (oldRecords.length > 0) {
      for (const rec of oldRecords) {
        await db.add('snapshotHistory', rec);
      }
      console.log(`[BookmarkSync] Migrated ${oldRecords.length} snapshot records from storage → IndexedDB`);
      await chrome.storage.local.remove(SNAPSHOT_HISTORY_KEY);
    }
    await chrome.storage.local.set({ [SNAPSHOT_HISTORY_MIGRATED_KEY]: true });
  }

  return db.paginate<SnapshotRecord>('snapshotHistory', page, pageSize);
}

export async function loadSnapshot(): Promise<BookmarkInfo[] | null> {
  const result = await chrome.storage.local.get(SNAPSHOT_KEY);
  return (result[SNAPSHOT_KEY] as Snapshot)?.bookmarks ?? null;
}

export async function getSnapshotInfo(): Promise<{ timestamp: number; version: string; count: number } | null> {
  const result = await chrome.storage.local.get(SNAPSHOT_KEY);
  const s = result[SNAPSHOT_KEY] as Snapshot | undefined;
  if (!s) return null;
  function countNodes(nodes: BookmarkInfo[]): number {
    let total = 0;
    for (const n of nodes) {
      if (n.url) total++;
      if (n.children) total += countNodes(n.children);
    }
    return total;
  }
  return { timestamp: s.timestamp, version: s.version, count: countNodes(s.bookmarks) };
}

// ───── Misc ─────

export async function countBookmarks(): Promise<number> {
  const tree = await chrome.bookmarks.getTree();
  let total = 0;
  function walk(nodes: chrome.bookmarks.BookmarkTreeNode[]) {
    for (const n of nodes) {
      if (n.url) total++;
      if (n.children) walk(n.children);
    }
  }
  walk(tree);
  return total;
}

export async function importBookmarks(payload: SyncPayload): Promise<void> {
  const tree = await chrome.bookmarks.getTree();
  const chromeRoots = tree[0]?.children || [];
  await importBookmarksSimple(payload, chromeRoots);
}
