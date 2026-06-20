/** Current sync data format version */
export const SYNC_VERSION = '1.1.0';

/** Default file name stored in Gist */
export const DEFAULT_GIST_FILE = 'BookmarkSync.json';

/** Storage keys for chrome.storage.local */
export const STORAGE = {
  SYNC_STATE: 'bookmarkSyncState',
  SYNC_ID_B2S: 'syncId_bookmarkToSyncId',
  SYNC_ID_S2B: 'syncId_syncIdToBookmark',
  SNAPSHOT: 'syncSnapshot',
  MANUAL_MERGE: 'manualMergeData',
  OPTIONS_KEY: 'bookmarkSyncOptions',
  SYNC_LOG: 'syncLogEntries',
  SNAPSHOT_HISTORY: 'snapshotHistory',
} as const;

/** Storage keys for chrome.storage.local (UI state) */
export const UI_STORAGE = {
  OPTIONS_ACTIVE_KEY: 'optionsActiveKey',
} as const;

/** Root folder titles in Chrome bookmarks tree */
export const ROOT_TITLES = {
  TOOLBAR: 'Bookmarks Bar',
  OTHER: 'Other Bookmarks',
  MOBILE: 'Mobile Bookmarks',
} as const;

/** Mapping from storage type to display label */
export const STORAGE_LABELS: Record<string, string> = {
  gitee_gist: 'Gitee Gist',
  gist: 'GitHub Gist',
};
