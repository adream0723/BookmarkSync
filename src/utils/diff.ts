import { BookmarkInfo } from './models';

export interface DiffItem {
  syncId: string;
  type: 'added' | 'removed' | 'modified';
  title: string;
  url?: string;
  isFolder: boolean;
  /** Breadcrumb path for display */
  path: string[];
  /** Depth in tree */
  depth: number;
  local?: { title: string; url?: string };
  remote?: { title: string; url?: string };
  resolved: 'local' | 'remote' | null;
}

/** Flatten a tree into a map by syncId with parent info */
function flattenWithParent(
  nodes: BookmarkInfo[],
  parentPath: string[] = [],
  depth: number = 0,
): Map<string, { node: BookmarkInfo; path: string[]; depth: number }> {
  const map = new Map();
  for (const n of nodes) {
    const sid = n.syncId || '';
    if (!sid) continue;
    const path = [...parentPath, n.title || '(unnamed)'];
    map.set(sid, { node: n, path, depth });
    if (n.children) {
      const childMap = flattenWithParent(n.children, path, depth + 1);
      childMap.forEach((v, k) => map.set(k, v));
    }
  }
  return map;
}

/**
 * Compare local vs remote bookmark trees and produce a diff list.
 * Only includes items that differ between the two.
 */
export function diffTrees(
  local: BookmarkInfo[],
  remote: BookmarkInfo[],
): DiffItem[] {
  const localMap = flattenWithParent(local);
  const remoteMap = flattenWithParent(remote);
  const allIds = new Set([...localMap.keys(), ...remoteMap.keys()]);
  const diffs: DiffItem[] = [];

  for (const sid of allIds) {
    const l = localMap.get(sid);
    const r = remoteMap.get(sid);

    if (l && !r) {
      // Removed from remote (or added locally)
      diffs.push({
        syncId: sid,
        type: 'removed',
        title: l.node.title || '(unnamed)',
        url: l.node.url,
        isFolder: !l.node.url && !!l.node.children,
        path: l.path,
        depth: l.depth,
        local: { title: l.node.title, url: l.node.url },
        resolved: null,
      });
    } else if (!l && r) {
      // Added remotely
      diffs.push({
        syncId: sid,
        type: 'added',
        title: r.node.title || '(unnamed)',
        url: r.node.url,
        isFolder: !r.node.url && !!r.node.children,
        path: r.path,
        depth: r.depth,
        remote: { title: r.node.title, url: r.node.url },
        resolved: null,
      });
    } else if (l && r) {
      // Both exist — check if modified
      const titleChanged = l.node.title !== r.node.title;
      const urlChanged = (l.node.url || '') !== (r.node.url || '');
      if (titleChanged || urlChanged) {
        diffs.push({
          syncId: sid,
          type: 'modified',
          title: l.node.title || '(unnamed)',
          url: l.node.url,
          isFolder: !l.node.url && !!l.node.children,
          path: l.path,
          depth: l.depth,
          local: { title: l.node.title, url: l.node.url },
          remote: { title: r.node.title, url: r.node.url },
          resolved: null,
        });
      }
    }
  }

  // Sort by path depth for logical display
  diffs.sort((a, b) => {
    const aStr = a.path.join('/');
    const bStr = b.path.join('/');
    return aStr.localeCompare(bStr);
  });

  return diffs;
}
