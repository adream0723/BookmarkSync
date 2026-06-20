import { BookmarkInfo } from './models';
import { fp } from './fingerprint';

/**
 * Apply a merged bookmark tree to Chrome's bookmarks.
 * Uses fingerprint (title+url) to match merged items to existing Chrome bookmarks.
 * Strategy: walk the merged tree top-down, match by fingerprint, create/update as needed.
 * Then delete Chrome bookmarks that don't exist in the merged tree.
 */
export async function applyMergedTree(
  merged: BookmarkInfo[],
  chromeRoots: chrome.bookmarks.BookmarkTreeNode[],
  skipReorder = false,
): Promise<void> {
  // Build fingerprint index of merged tree
  function buildFpIndex(nodes: BookmarkInfo[], depth = 0, parentFp = ''): Map<string, { node: BookmarkInfo; parentFp: string; depth: number }> {
    const map = new Map<string, { node: BookmarkInfo; parentFp: string; depth: number }>();
    for (const n of nodes) {
      const f = fp(n.title, n.url);
      map.set(f, { node: n, parentFp, depth });
      if (n.children) {
        const childMap = buildFpIndex(n.children, depth + 1, f);
        childMap.forEach((v, k) => map.set(k, v));
      }
    }
    return map;
  }
  const mergedFpIndex = buildFpIndex(merged);

  // Build fingerprint index of current browser tree
  const browserFpIndex = new Map<string, chrome.bookmarks.BookmarkTreeNode>();
  function buildBrowserIndex(nodes: chrome.bookmarks.BookmarkTreeNode[]) {
    for (const n of nodes) {
      const f = fp(n.title, n.url);
      if (!browserFpIndex.has(f)) browserFpIndex.set(f, n);
      if (n.children) buildBrowserIndex(n.children);
    }
  }
  buildBrowserIndex(chromeRoots);

  // Delete Chrome bookmarks not present in merged tree
  async function deleteRemoved(nodes: chrome.bookmarks.BookmarkTreeNode[]) {
    for (const n of nodes) {
      const f = fp(n.title, n.url);
      if (!mergedFpIndex.has(f)) {
        try { await chrome.bookmarks.removeTree(n.id); } catch { /* already gone */ }
      } else if (n.children) {
        await deleteRemoved(n.children);
      }
    }
  }
  for (const root of chromeRoots) {
    const f = fp(root.title, root.url);
    if (!mergedFpIndex.has(f)) {
      // Root folder is gone (shouldn't normally happen, but handle it)
    } else if (root.children) {
      await deleteRemoved(root.children);
    }
  }

  // Sync merged tree into Chrome: match root folders by title, then recurse
  for (const rootNode of merged) {
    const chromeRoot = chromeRoots.find(r => r.title === rootNode.title);
    if (chromeRoot && rootNode.children) {
      await syncNodesByFp(rootNode.children, chromeRoot.id);
    }
  }
}

/**
 * Recursively sync merged child nodes into a Chrome folder.
 * Uses fingerprint to match: creates new, updates existing, reorders.
 */
async function syncNodesByFp(
  nodes: BookmarkInfo[],
  parentChromeId: string,
  skipReorder = false,
): Promise<void> {
  // Get current children of this Chrome folder
  let children: chrome.bookmarks.BookmarkTreeNode[];
  try {
    children = await chrome.bookmarks.getChildren(parentChromeId);
  } catch {
    children = [];
  }
  const childFpMap = new Map<string, chrome.bookmarks.BookmarkTreeNode>();
  for (const c of children) {
    const f = fp(c.title, c.url);
    // Only store first match to avoid conflicts
    if (!childFpMap.has(f)) childFpMap.set(f, c);
  }

  for (let idx = 0; idx < nodes.length; idx++) {
    const node = nodes[idx];
    const f = fp(node.title, node.url);
    const existing = childFpMap.get(f);

    if (existing) {
      // Update title/url if changed
      if (node.title !== existing.title || (node.url || '') !== (existing.url || '')) {
        await chrome.bookmarks.update(existing.id, { title: node.title, url: node.url });
      }
      // Move if position changed (skip when skipReorder)
      if (!skipReorder && (existing.parentId !== parentChromeId || existing.index !== idx)) {
        console.log(`[BookmarkSync] Reorder: moving "${node.title}" from index ${existing.index} to ${idx}`);
        await chrome.bookmarks.move(existing.id, { parentId: parentChromeId, index: idx });
      }
      // Recurse into children for folders
      if (node.children) {
        await syncNodesByFp(node.children, existing.id, skipReorder);
      }
      // Remove from map so we know it's been handled
      childFpMap.delete(f);
    } else {
      // Create new
      const created = node.url
        ? await chrome.bookmarks.create({ parentId: parentChromeId, title: node.title, url: node.url, index: idx })
        : await chrome.bookmarks.create({ parentId: parentChromeId, title: node.title, index: idx });
      if (node.children) {
        const childrenList = await chrome.bookmarks.getChildren(created.id);
        await syncNodesByFp(node.children, created.id);
      }
    }
  }

  // Delete any remaining children that weren't in the merged list (only at this level)
  for (const [, leftover] of childFpMap) {
    try { await chrome.bookmarks.removeTree(leftover.id); } catch {}
  }
}

/**
 * Simple import into an empty browser (no merge).
 * Creates bookmarks under matching Chrome root folders by position.
 */
export async function importBookmarksSimple(
  payload: { bookmarks: BookmarkInfo[] },
  chromeRoots: chrome.bookmarks.BookmarkTreeNode[],
): Promise<void> {
  for (let i = 0; i < payload.bookmarks.length; i++) {
    const rootNode = payload.bookmarks[i];
    if (!rootNode.children) continue;
    const chromeRoot = chromeRoots[i];
    if (chromeRoot) {
      await createNodesSimple(rootNode.children, chromeRoot.id);
    }
  }
}

async function createNodesSimple(nodes: BookmarkInfo[], parentId: string): Promise<void> {
  for (const node of nodes) {
    if (node.url) {
      await chrome.bookmarks.create({ parentId, title: node.title, url: node.url, index: node.index ?? undefined });
    } else if (node.children) {
      const folder = await chrome.bookmarks.create({ parentId, title: node.title, index: node.index ?? undefined });
      await createNodesSimple(node.children, folder.id);
    }
  }
}
