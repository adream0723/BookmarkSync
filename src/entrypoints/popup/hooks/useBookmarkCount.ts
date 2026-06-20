import React, { useState, useEffect } from 'react';

export function useBookmarkCount() {
  const [count, setCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    chrome.bookmarks.getTree().then((tree) => {
      const total = countBookmarks(tree);
      setCount(total);
      setLoading(false);
    });
  }, []);

  return { count, loading };
}

function countBookmarks(nodes: chrome.bookmarks.BookmarkTreeNode[]): number {
  let total = 0;
  for (const node of nodes) {
    if (node.url) total++;
    if (node.children) total += countBookmarks(node.children);
  }
  return total;
}
