export interface SyncState {
  lastStatus: string;
  lastSyncTime: number;
  storageType: string;
}

import { STORAGE } from './constants';

const STORAGE_KEY = STORAGE.SYNC_STATE;

export async function getSyncState(): Promise<SyncState> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || { lastStatus: 'never', lastSyncTime: 0, storageType: '' };
}

export async function saveSyncState(state: Partial<SyncState>): Promise<void> {
  const current = await getSyncState();
  await chrome.storage.local.set({
    [STORAGE_KEY]: { ...current, ...state }
  });
}
