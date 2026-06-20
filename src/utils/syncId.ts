import { STORAGE } from './constants';

const STORAGE_KEY_B2S = STORAGE.SYNC_ID_B2S;
const STORAGE_KEY_S2B = STORAGE.SYNC_ID_S2B;

export function generateSyncId(): string {
  return crypto.randomUUID();
}

export async function getSyncIdByBookmarkId(bookmarkId: string): Promise<string | undefined> {
  const map = await chrome.storage.local.get(STORAGE_KEY_B2S);
  return map[STORAGE_KEY_B2S]?.[bookmarkId];
}

export async function getBookmarkIdBySyncId(syncId: string): Promise<string | undefined> {
  const map = await chrome.storage.local.get(STORAGE_KEY_S2B);
  return map[STORAGE_KEY_S2B]?.[syncId];
}

export async function saveMapping(bookmarkId: string, syncId: string): Promise<void> {
  const [b2s, s2b] = await Promise.all([
    chrome.storage.local.get(STORAGE_KEY_B2S),
    chrome.storage.local.get(STORAGE_KEY_S2B),
  ]);
  const b2sMap = b2s[STORAGE_KEY_B2S] || {};
  const s2bMap = s2b[STORAGE_KEY_S2B] || {};
  b2sMap[bookmarkId] = syncId;
  s2bMap[syncId] = bookmarkId;
  await chrome.storage.local.set({
    [STORAGE_KEY_B2S]: b2sMap,
    [STORAGE_KEY_S2B]: s2bMap,
  });
}

/**
 * Batch-save multiple mappings at once, avoiding per-item storage calls.
 * @param pending  Array of {bid, sid} pairs to save
 * @param b2s      Pre-loaded b2s map (will be mutated and saved)
 * @param s2b      Pre-loaded s2b map (will be mutated and saved)
 */
export async function saveMappingBatch(
  pending: Array<{ bid: string; sid: string }>,
  b2s: Record<string, string>,
  s2b: Record<string, string>,
): Promise<void> {
  for (const { bid, sid } of pending) {
    b2s[bid] = sid;
    s2b[sid] = bid;
  }
  await chrome.storage.local.set({
    [STORAGE_KEY_B2S]: b2s,
    [STORAGE_KEY_S2B]: s2b,
  });
}

export async function deleteMapping(bookmarkId: string): Promise<void> {
  const [b2s, s2b] = await Promise.all([
    chrome.storage.local.get(STORAGE_KEY_B2S),
    chrome.storage.local.get(STORAGE_KEY_S2B),
  ]);
  const b2sMap = b2s[STORAGE_KEY_B2S] || {};
  const syncId = b2sMap[bookmarkId];
  if (syncId) {
    delete b2sMap[bookmarkId];
    const s2bMap = s2b[STORAGE_KEY_S2B] || {};
    delete s2bMap[syncId];
    await chrome.storage.local.set({
      [STORAGE_KEY_B2S]: b2sMap,
      [STORAGE_KEY_S2B]: s2bMap,
    });
  }
}
