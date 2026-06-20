import { BookmarkInfo } from './models';
import { fp } from './fingerprint';

export interface FlatItem {
  fingerprint: string;
  title: string;
  url?: string;
  parentFp: string;
  index: number;
  updatedAt: number;
  isFolder: boolean;
}

export interface MergeContext {
  /** Timestamp of the Gist content before THIS sync started (= previous sync time) */
  snapshotTimestamp?: number;
  /** Timestamp from the current Gist content (= last upload time) */
  remoteSyncedAt?: number;
}

export interface MergeResult {
  merged: BookmarkInfo[];
  conflicts: number;
  totalChanges: number;
}

function flatten(nodes: BookmarkInfo[], parentFp = ''): FlatItem[] {
  const items: FlatItem[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const f = fp(n.title, n.url);
    items.push({
      fingerprint: f, title: n.title, url: n.url,
      parentFp, index: n.index ?? i,
      updatedAt: n.updatedAt || Date.now(), isFolder: !n.url,
    });
    if (n.children) items.push(...flatten(n.children, f));
  }
  return items;
}

function rebuildTree(items: FlatItem[]): BookmarkInfo[] {
  const byParent = new Map<string, FlatItem[]>();
  const roots: FlatItem[] = [];
  for (const item of items) {
    const list = item.parentFp
      ? (byParent.get(item.parentFp) ?? (byParent.set(item.parentFp, []), byParent.get(item.parentFp)!))
      : roots;
    list.push(item);
  }
  roots.sort((a, b) => a.index - b.index);
  for (const [, children] of byParent) children.sort((a, b) => a.index - b.index);

  function build(items: FlatItem[]): BookmarkInfo[] {
    return items.map(item => {
      const node = new BookmarkInfo(item.title, item.url);
      node.updatedAt = item.updatedAt;
      if (item.isFolder) node.children = build(byParent.get(item.fingerprint) || []);
      return node;
    });
  }
  return build(roots);
}

/**
 * Pure fingerprint + timestamp three-way merge.
 *
 * Each item's identity = fingerprint = `title||url`.
 * When `remoteSyncedAt > snapshotTimestamp`, the cloud data is newer than
 * the snapshot → prefer remote's state.
 *
 * Reference: see `思路.md` for the full matrix.
 */
export function threeWayMerge(
  base: BookmarkInfo[],
  local: BookmarkInfo[],
  remote: BookmarkInfo[],
  ctx?: MergeContext,
): MergeResult {
  const baseItems = flatten(base);
  const localItems = flatten(local);
  const remoteItems = flatten(remote);

  const baseMap = new Map(baseItems.map(i => [i.fingerprint, i]));
  const localMap = new Map(localItems.map(i => [i.fingerprint, i]));
  const remoteMap = new Map(remoteItems.map(i => [i.fingerprint, i]));

  const allFps = new Set([...baseMap.keys(), ...localMap.keys(), ...remoteMap.keys()]);
  const mergedItems: FlatItem[] = [];
  const cloudNewer = (ctx?.remoteSyncedAt || 0) > (ctx?.snapshotTimestamp || 0);

  for (const f of allFps) {
    const b = baseMap.get(f);
    const l = localMap.get(f);
    const r = remoteMap.get(f);

    // ── #1: All three have it ──
    if (b && l && r) {
      // Identical content (fingerprint matches). Take latest by updatedAt.
      const winner = [b, l, r].sort((a, c) => {
        const d = c.updatedAt - a.updatedAt;
        if (d !== 0) return d;
        // Tie: prefer local
        if (a === l) return -1;
        if (c === l) return 1;
        return 0;
      })[0];
      mergedItems.push(winner);
      continue;
    }

    // ── #2,#3: base+local, NOT remote ──
    if (b && l && !r) {
      // Cloud newer: remote intentionally deleted ✓
      if (!cloudNewer) mergedItems.push(l); // #3: cloud stale → keep local
      continue;
    }

    // ── #4,#5: base+remote, NOT local ──
    if (b && !l && r) {
      if (cloudNewer) mergedItems.push(r); // #4: cloud newer → add to local
      // #5: local intentionally deleted → skip
      continue;
    }

    // ── #6: Only base (both deleted) → discard ──
    if (b && !l && !r) {
      continue;
    }

    // ── #7,#8: local+remote, NOT base ──
    if (!b && l && r) {
      // Same fingerprint → same content. Take one with later updatedAt.
      mergedItems.push(l.updatedAt >= r.updatedAt ? l : r);
      continue;
    }

    // ── #9,#10: Only local ──
    if (!b && l && !r) {
      if (!cloudNewer) mergedItems.push(l); // #10: genuine local add → keep
      // #9: cloud newer → stale local data → discard
      continue;
    }

    // ── #11,#12: Only remote ──
    if (!b && !l && r) {
      if (cloudNewer) mergedItems.push(r); // #11: cloud newer → add to local
      // #12: stale remote → skip
      continue;
    }

    // #13: None → ignore
  }

  const merged = rebuildTree(mergedItems);
  const totalChanges = mergedItems.length;
  return { merged, conflicts: 0, totalChanges };
}
