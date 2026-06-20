import { STORAGE } from './constants';

const STORAGE_KEY = STORAGE.OPTIONS_KEY;

export interface StoredOptions {
  storageType: string;
  githubToken: string;
  gistID: string;
  gistFileName: string;
  giteeToken: string;
  giteeGistID: string;
  giteeGistFileName: string;
  enableNotify: boolean;
  formatJson: boolean;
  conflictStrategy: string;
  orderSyncStrategy: string;
  deviceName: string;
  autoSync: boolean;
  syncInterval: number;
  language: string;
  theme: string;
  safeMode: boolean;
  safeThreshold: number;
  snapshotCount: number;
  enableEncryption: boolean;
  encryptionPassword: string;
  [key: string]: any;
}

const defaults: StoredOptions = {
  storageType: 'gitee_gist',
  githubToken: '',
  gistID: '',
  gistFileName: 'BookmarkSync.json',
  giteeToken: '',
  giteeGistID: '',
  giteeGistFileName: 'BookmarkSync.json',
  enableNotify: true,
  formatJson: false,
  conflictStrategy: 'smart',
  orderSyncStrategy: 'none',
  deviceName: '',
  autoSync: false,
  syncInterval: 30,
  language: 'zh',
  theme: 'auto',
  safeMode: true,
  safeThreshold: 20,
  snapshotCount: 100,
  enableEncryption: false,
  encryptionPassword: '',
};

export async function getAll(): Promise<StoredOptions> {
  const result = await chrome.storage.sync.get(STORAGE_KEY);
  return { ...defaults, ...(result[STORAGE_KEY] || {}) };
}

export async function setOptions(partial: Partial<StoredOptions>): Promise<void> {
  const current = await getAll();
  const merged = { ...current, ...partial };
  await chrome.storage.sync.set({ [STORAGE_KEY]: merged });
}

export default { getAll, set: setOptions };
