import React, { useState } from 'react';
import StatsCard from './components/StatsCard';
import StatusPanel from './components/StatusPanel';
import AutoSyncToggle from './components/AutoSyncToggle';
import ActionButtons from './components/ActionButtons';
import i18n from '../../locales/i18n';
import { useTranslation } from 'react-i18next';
import optionsStorage from '../../utils/optionsStorage';

// Initialize i18n language + theme from storage
(async () => {
  const s = await optionsStorage.getAll();
  if (s.language) i18n.changeLanguage(s.language);
  if (s.theme === 'dark') {
    document.documentElement.classList.add('theme-dark');
  } else if (s.theme === 'auto') {
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('theme-dark', dark);
  }
})();
import { saveSyncState } from '../../utils/syncState';
import { showNotification } from '../../utils/notify';
import { countBookmarks } from '../../utils/bookmarks';

const App: React.FC = () => {
  const { t } = useTranslation();
  const [autoSync, setAutoSync] = useState(false);
  const [syncInterval, setSyncInterval] = useState(30);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [errorDetail, setErrorDetail] = useState('');

  // Load auto-sync settings on mount
  React.useEffect(() => {
    optionsStorage.getAll().then(s => {
      setAutoSync(s.autoSync ?? false);
      setSyncInterval(s.syncInterval ?? 30);
    });
  }, []);

  const handleAutoSyncChange = (checked: boolean) => {
    setAutoSync(checked);
    optionsStorage.set({ autoSync: checked });
  };

  /** Send message to background, auto-retry once if service worker is sleeping */
  const sendBg = async (type: string, extra?: any): Promise<any> => {
    try {
      return await chrome.runtime.sendMessage({ type, ...extra });
    } catch (err: any) {
      if (err.message?.includes('Receiving end does not exist')) {
        // Service worker was sleeping, wait for it to wake up and retry
        await new Promise(r => setTimeout(r, 500));
        return await chrome.runtime.sendMessage({ type, ...extra });
      }
      throw err;
    }
  };

  const handleUpload = async () => {
    if (uploading) return;
    setUploading(true);
    setErrorDetail('');
    try {
      const res = await sendBg('startUpload');
      if (!res?.success) throw new Error(res?.error || '上传失败');
      setRefreshKey(k => k + 1);
    } catch (err: any) {
      setErrorDetail(err.message || String(err));
      const s = await optionsStorage.getAll();
      await saveSyncState({ lastStatus: '失败', lastSyncTime: Date.now() });
      if (s.enableNotify) showNotification('BookmarkSync', '上传失败: ' + err.message);
      setRefreshKey(k => k + 1);
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async () => {
    if (downloading) return;
    const existing = await countBookmarks();
    if (existing > 0) {
      const ok = confirm('浏览器已有 ' + existing + ' 个书签。\n\n点击「确定」清空现有书签并从云端下载。\n点击「取消」跳过。');
      if (!ok) {
        showNotification('BookmarkSync', '已跳过下载');
        return;
      }
      // Clear all existing bookmarks
      const tree = await chrome.bookmarks.getTree();
      const roots = tree[0]?.children || [];
      for (const root of roots) {
        if (root.children) {
          for (const child of root.children) {
            try { await chrome.bookmarks.removeTree(child.id); } catch {}
          }
        }
      }
    }
    setDownloading(true);
    setErrorDetail('');
    try {
      const existing = await countBookmarks();
      if (existing > 0) {
        showNotification('BookmarkSync', '浏览器已有书签，跳过导入。请先清除书签后再试');
        setDownloading(false);
        return;
      }
      const res = await sendBg('startDownload');
      if (!res?.success) throw new Error(res?.error || '下载失败');
      setRefreshKey(k => k + 1);
    } catch (err: any) {
      setErrorDetail(err.message || String(err));
      const s = await optionsStorage.getAll();
      await saveSyncState({ lastStatus: '失败', lastSyncTime: Date.now() });
      if (s.enableNotify) showNotification('BookmarkSync', '下载失败: ' + err.message);
      setRefreshKey(k => k + 1);
    } finally {
      setDownloading(false);
    }
  };

  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    setErrorDetail('');
    try {
      const settings = await optionsStorage.getAll();
      const strategy = settings.conflictStrategy || 'smart';
      const res = await sendBg('startSync', { strategy });
      if (!res?.success) throw new Error(res?.error || '同步失败');
      setRefreshKey(k => k + 1);
    } catch (err: any) {
      setErrorDetail(err.message || String(err));
      const s = await optionsStorage.getAll();
      await saveSyncState({ lastStatus: '失败', lastSyncTime: Date.now() });
      if (s.enableNotify) showNotification('BookmarkSync', '同步失败: ' + err.message);
      setRefreshKey(k => k + 1);
    } finally {
      setSyncing(false);
    }
  };

  const openOptions = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
  };

  return (
    <div className="popup-container">
      <div className="popup-header">
        <strong>BookmarkSync</strong>
        <span className="popup-settings-link" onClick={openOptions} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && openOptions()}>{t('popup.settings')}</span>
      </div>
      <hr className="popup-divider" />
      <StatsCard refreshTrigger={refreshKey} />
      <hr className="popup-divider" />
      <StatusPanel refreshTrigger={refreshKey} />
      <hr className="popup-divider" />
      <AutoSyncToggle enabled={autoSync} syncInterval={syncInterval} onChange={handleAutoSyncChange} />
      <hr className="popup-divider" />
      <ActionButtons
        onUpload={handleUpload}
        onDownload={handleDownload}
        onSync={handleSync}
        uploadLabel={uploading ? t('dashboard.uploading') : t('dashboard.uploadBtn')}
        uploadDisabled={uploading}
        downloadLabel={downloading ? t('dashboard.downloading') : t('dashboard.downloadBtn')}
        downloadDisabled={downloading || syncing}
        syncLabel={syncing ? t('dashboard.syncing') : t('popup.syncNow')}
        syncDisabled={syncing}
      />
      {errorDetail && <div className="popup-error">{errorDetail}</div>}
    </div>
  );
};

export default App;
