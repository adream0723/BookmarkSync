import i18n from '../locales/i18n';
import { wrapSyncPayload, countBookmarks, importBookmarks, assignSyncIds, saveSnapshot, loadSnapshot, saveSnapshotRecord, getSnapshotInfo } from '../utils/bookmarks';
import { applyMergedTree } from '../utils/import';
import { threeWayMerge } from '../utils/merge';
import services from '../utils/services';
import { saveSyncState } from '../utils/syncState';
import optionsStorage from '../utils/optionsStorage';
import { showNotification } from '../utils/notify';
import { decompress, encodeEmoji } from '../utils/compress';
import { SYNC_VERSION, STORAGE } from '../utils/constants';
import { addSyncLog, ChangeDetail } from '../utils/syncLog';
import { encryptContent, decryptContent } from '../utils/crypto';

export default defineBackground(() => {
  console.log('BookmarkSync background loaded');

  // ── Alarm listener for auto-sync ──
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'autoSync') {
      console.log('[BookmarkSync] Auto-sync triggered');
      try {
        const settings = await optionsStorage.getAll();
        // Manual strategy cannot run in background; fall back to smart
        const strategy = settings.conflictStrategy === 'manual' ? 'smart' : settings.conflictStrategy;
        await runSync(strategy);
      } catch (err: any) {
        console.error('[BookmarkSync] Auto-sync failed:', err);
      }
    }
  });

  // ── Storage change listener ──
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && STORAGE.OPTIONS_KEY in changes) {
      const newVal = (changes[STORAGE.OPTIONS_KEY] as any)?.newValue;
      if (newVal) {
        updateAutoSyncAlarm(newVal);
      }
    }
  });

  // ── Init alarm on startup ──
  optionsStorage.getAll().then(settings => {
    updateAutoSyncAlarm(settings);
  });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'startSync') {
      runSync(msg.strategy || 'smart')
        .then(result => sendResponse(result))
        .catch(async err => {
          try { const s = await optionsStorage.getAll(); addSyncLog({ timestamp: Date.now(), deviceName: (s as any).deviceName || i18n.t('common.unknownDevice'), type: 'sync', result: 'failure', added: 0, modified: 0, deleted: 0, error: err.message }); } catch {}
          sendResponse({ success: false, error: err.message });
        });
      return true; // keep response channel open
    }
    if (msg.type === 'startUpload') {
      runUpload()
        .then(result => sendResponse(result))
        .catch(async err => {
          try { const s = await optionsStorage.getAll(); addSyncLog({ timestamp: Date.now(), deviceName: (s as any).deviceName || i18n.t('common.unknownDevice'), type: 'upload', result: 'failure', added: 0, modified: 0, deleted: 0, error: err.message }); } catch {}
          sendResponse({ success: false, error: err.message });
        });
      return true;
    }
    if (msg.type === 'startDownload') {
      runDownload()
        .then(result => sendResponse(result))
        .catch(async err => {
          try { const s = await optionsStorage.getAll(); addSyncLog({ timestamp: Date.now(), deviceName: (s as any).deviceName || i18n.t('common.unknownDevice'), type: 'download', result: 'failure', added: 0, modified: 0, deleted: 0, error: err.message }); } catch {}
          sendResponse({ success: false, error: err.message });
        });
      return true;
    }
  });
});

async function runSync(strategy: string) {
  const settings = await optionsStorage.getAll();
  const deviceName = settings.deviceName || i18n.t('common.unknownDevice');
  const fileName = settings.storageType === 'gitee_gist' ? settings.giteeGistFileName : settings.gistFileName;
  const label = settings.storageType === 'gitee_gist' ? 'Gitee Gist' : 'GitHub Gist';

  // local first
  if (strategy === 'local') {
    const payload = await wrapSyncPayload();
    await assignSyncIds(payload.bookmarks);
    const content = settings.formatJson
      ? encodeEmoji(JSON.stringify(payload, null, 2))
      : encodeEmoji(JSON.stringify(payload));
    const uploadContent = settings.encryptionPassword
      ? await encryptContent(content, settings.encryptionPassword)
      : content;
    await services.upload({ files: { [fileName]: { content: uploadContent } } });
    await saveSnapshot(payload.bookmarks, undefined, payload.syncedAt);
    await saveSnapshotRecord('upload', payload.bookmarks);
    await saveSyncState({ lastStatus: 'sync_success', lastSyncTime: Date.now(), storageType: label });
    if (settings.enableNotify) showNotification('BookmarkSync', i18n.t('notification.localSyncComplete'));
    await addSyncLog({ timestamp: Date.now(), deviceName, type: 'sync', result: 'success', added: 0, modified: 0, deleted: 0, snapshotVersion: SYNC_VERSION });
    return { success: true };
  }

  // remote first
  if (strategy === 'remote') {
    const raw = await services.download();
    if (!raw) throw new Error(i18n.t('notification.cloudNoData'));
    const rawStr = settings.encryptionPassword ? await decryptContent(raw, settings.encryptionPassword) : raw;
    let remotePayload: any;
    if (rawStr.trimStart().startsWith('{')) remotePayload = JSON.parse(rawStr);
    else {
      const d = decompress(rawStr);
      if (d && d.trimStart().startsWith('{')) remotePayload = JSON.parse(d);
      else throw new Error(i18n.t('notification.cloudFormatError'));
    }
    const tree = await chrome.bookmarks.getTree();
    const chromeRoots = tree[0]?.children || [];
    await applyMergedTree(remotePayload.bookmarks || [], chromeRoots);
    await assignSyncIds(remotePayload.bookmarks || []);
    await saveSnapshot(remotePayload.bookmarks || [], undefined, remotePayload.syncedAt);
    await saveSnapshotRecord('sync', remotePayload.bookmarks);
    await saveSyncState({ lastStatus: 'sync_remote_success', lastSyncTime: Date.now(), storageType: label });
    if (settings.enableNotify) showNotification('BookmarkSync', i18n.t('notification.remoteSyncComplete'));
    await addSyncLog({ timestamp: Date.now(), deviceName, type: 'sync', result: 'success', added: 0, modified: 0, deleted: 0, snapshotVersion: SYNC_VERSION });
    return { success: true };
  }

  // manual — 先智能合并，有冲突才弹窗
  if (strategy === 'manual') {
    const raw = await services.download();
    if (!raw) throw new Error(i18n.t('notification.cloudNoData'));
    const rawStr = settings.encryptionPassword ? await decryptContent(raw, settings.encryptionPassword) : raw;
    let remotePayload: any;
    if (rawStr.trimStart().startsWith('{')) remotePayload = JSON.parse(rawStr);
    else {
      const d = decompress(rawStr);
      if (d && d.trimStart().startsWith('{')) remotePayload = JSON.parse(d);
      else throw new Error(i18n.t('notification.cloudFormatError'));
    }

    const remoteFpMap = new Map<string, string>();
    function buildRemoteFp(nodes: any[]) {
      for (const n of nodes) {
        if (n.url) remoteFpMap.set(`${n.title || ''}||${n.url}`, n.syncId || '');
        if (n.children) buildRemoteFp(n.children);
      }
    }
    buildRemoteFp(remotePayload.bookmarks || []);

    const localPayload = await wrapSyncPayload();
    await assignSyncIds(localPayload.bookmarks, remoteFpMap);
    const baseNodes = await loadSnapshot();
    const snapInfo = await getSnapshotInfo();

    const { merged } = threeWayMerge(
      baseNodes || [],
      localPayload.bookmarks,
      remotePayload.bookmarks || [],
      { snapshotTimestamp: snapInfo?.timestamp, remoteSyncedAt: remotePayload.syncedAt },
    );

    // Preview the merged result → let user confirm
    await chrome.storage.local.set({
      [STORAGE.MANUAL_MERGE]: {
        local: localPayload.bookmarks,
        merged,
        remote: remotePayload.bookmarks || [],
        snapshot: baseNodes || [],
        snapshotTimestamp: snapInfo?.timestamp || 0,
        remoteSyncedAt: remotePayload.syncedAt || 0,
      },
    });
    chrome.tabs.create({ url: chrome.runtime.getURL('merge.html') });
    await addSyncLog({ timestamp: Date.now(), deviceName, type: 'sync', result: 'success', added: 0, modified: 0, deleted: 0, snapshotVersion: SYNC_VERSION });
    return { success: true };
  }

  // smart - three-way merge
  const raw = await services.download();
  if (!raw) throw new Error(i18n.t('notification.cloudNoData'));
  const rawStr = settings.encryptionPassword ? await decryptContent(raw, settings.encryptionPassword) : raw;

  let remotePayload: any;
  if (rawStr.trimStart().startsWith('{')) remotePayload = JSON.parse(rawStr);
  else {
    const d = decompress(rawStr);
    if (d && d.trimStart().startsWith('{')) remotePayload = JSON.parse(d);
    else throw new Error(i18n.t('notification.cloudFormatError'));
  }

  // Build fingerprint→syncId map from remote to help local syncId inheritance
  const remoteFpMap = new Map<string, string>();
  function buildRemoteFp(nodes: any[]) {
    for (const n of nodes) {
      if (n.url) remoteFpMap.set(`${n.title || ''}||${n.url}`, n.syncId || '');
      if (n.children) buildRemoteFp(n.children);
    }
  }
  buildRemoteFp(remotePayload.bookmarks || []);

  const localPayload = await wrapSyncPayload();
  // Pass remoteFpMap so local nodes can inherit remote syncIds
  await assignSyncIds(localPayload.bookmarks, remoteFpMap);
  const baseNodes = await loadSnapshot();
  const snapInfo = await getSnapshotInfo();

  const { merged, conflicts } = threeWayMerge(
    baseNodes || [],
    localPayload.bookmarks,
    remotePayload.bookmarks || [],
    { snapshotTimestamp: snapInfo?.timestamp, remoteSyncedAt: remotePayload.syncedAt },
  );

  // ── Safe guard: if safe mode is on and deletion count exceeds threshold, fall back to manual merge ──
  if (settings.safeMode !== false) {
    const chs = computeChanges(baseNodes || [], merged);
    const delCount = chs.filter(c => c.type === 'deleted').length;
    const totalBookmarks = (baseNodes || []).reduce((acc, n) => {
      function count(ns: any[]): number { let t = 0; for (const x of ns) { if (x.url) t++; if (x.children) t += count(x.children); } return t; }
      return acc + count(n.children || []);
    }, 0);
    const delRatio = totalBookmarks > 0 ? (delCount / totalBookmarks) * 100 : 0;
    const threshold = settings.safeThreshold ?? 20;
    if (delRatio >= threshold) {
      console.log(`[BookmarkSync] Safe guard triggered: ${delCount} deleted (${delRatio.toFixed(0)}% ≥ ${threshold}%), opening manual merge`);
      await chrome.storage.local.set({
        [STORAGE.MANUAL_MERGE]: {
          local: localPayload.bookmarks,
          merged,
          remote: remotePayload.bookmarks || [],
          snapshot: baseNodes || [],
          snapshotTimestamp: snapInfo?.timestamp || 0,
          remoteSyncedAt: remotePayload.syncedAt || 0,
        },
      });
      chrome.tabs.create({ url: chrome.runtime.getURL('merge.html') });
      await addSyncLog({ timestamp: Date.now(), deviceName, type: 'sync', result: 'success', added: 0, modified: 0, deleted: 0, snapshotVersion: SYNC_VERSION });
      return { success: true, fallback: 'manual' };
    }
  }

  const tree = await chrome.bookmarks.getTree();
  const chromeRoots = tree[0]?.children || [];
  await applyMergedTree(merged, chromeRoots, settings.orderSyncStrategy === 'none');
  console.log(`[BookmarkSync] Smart merge: applyMergedTree done, skipReorder=${settings.orderSyncStrategy === 'none'}, strategy=${settings.orderSyncStrategy}`);

  // Check if ONLY order changed (no content/parent changes)
  function fp(t: string, u?: string) { return `${t}||${u || ''}`; }
  function flattenForCompare(nodes: any[]): Map<string, { idx: number; parent: string }> {
    const m = new Map();
    function walk(ns: any[], parentTitle = '') {
      for (let i = 0; i < ns.length; i++) {
        const n = ns[i];
        m.set(fp(n.title, n.url), { idx: i, parent: parentTitle });
        if (n.children) walk(n.children, n.title);
      }
    }
    walk(nodes);
    return m;
  }
  const lFlat = flattenForCompare(localPayload.bookmarks);
  const mFlat = flattenForCompare(merged);
  let onlyOrder = lFlat.size === mFlat.size;
  if (onlyOrder) {
    for (const [f, lv] of lFlat) {
      const mv = mFlat.get(f);
      if (!mv || mv.parent !== lv.parent) { onlyOrder = false; break; }
    }
  }
  console.log(`[BookmarkSync] Order check: onlyOrder=${onlyOrder}, localFingerprints=${lFlat.size}, mergedFingerprints=${mFlat.size}`);

  if (onlyOrder) {
    // Order-only change
    if (settings.orderSyncStrategy === 'none') {
      console.log('[BookmarkSync] Order sync disabled, skipping');
      await saveSyncState({ lastStatus: 'sync_skip_order', lastSyncTime: Date.now(), storageType: label });
      if (settings.enableNotify) showNotification('BookmarkSync', i18n.t('notification.skipOrder'));
      return { success: true };
    }
    // Apply order change to local but don't upload
    console.log('[BookmarkSync] Only order changed, syncing locally');
    await saveSnapshot(merged, undefined, remotePayload.syncedAt);
    await saveSnapshotRecord('sync', merged);
    await saveSyncState({ lastStatus: 'sync_order_only', lastSyncTime: Date.now(), storageType: label });
    if (settings.enableNotify) showNotification('BookmarkSync', i18n.t('notification.orderOnly'));
    return { success: true };
  }

  // Upload merged result to Gist (this becomes canonical base for next sync)
  const mergedPayload = {
    version: SYNC_VERSION, syncedAt: Date.now(),
    deviceName: settings.deviceName || i18n.t('common.unknownDevice'),
    bookmarks: merged,
  };
  const content = settings.formatJson
    ? encodeEmoji(JSON.stringify(mergedPayload, null, 2))
    : encodeEmoji(JSON.stringify(mergedPayload));
  const uploadContent = settings.encryptionPassword
    ? await encryptContent(content, settings.encryptionPassword)
    : content;
  await services.upload({ files: { [fileName]: { content: uploadContent } } });

  // Save the EXACT data that was uploaded as the snapshot (canonical base)
  await saveSnapshot(merged, undefined, mergedPayload.syncedAt);
  await saveSnapshotRecord('sync', merged);

  await saveSyncState({ lastStatus: 'sync_success', lastSyncTime: Date.now(), storageType: label });
  const logMsg = conflicts > 0 ? i18n.t('notification.syncConflict', { n: conflicts }) : i18n.t('notification.syncSuccess');
  if (settings.enableNotify) showNotification('BookmarkSync', logMsg);
  const changes = computeChanges(baseNodes, merged);
  const added = changes.filter(c => c.type === 'added').length;
  const modified = changes.filter(c => c.type === 'modified').length;
  const deleted = changes.filter(c => c.type === 'deleted').length;

  await addSyncLog({ timestamp: Date.now(), deviceName, type: 'sync', result: 'success', added, modified, deleted, changes, conflicts, totalItems: merged.length, snapshotVersion: SYNC_VERSION });
  return { success: true };
}

async function runUpload() {
  const payload = await wrapSyncPayload();
  const settings = await optionsStorage.getAll();
  const deviceName = settings.deviceName || '未知设备';
  await assignSyncIds(payload.bookmarks);
  const fileName = settings.storageType === 'gitee_gist' ? settings.giteeGistFileName : settings.gistFileName;
  const content = settings.formatJson
    ? encodeEmoji(JSON.stringify(payload, null, 2))
    : encodeEmoji(JSON.stringify(payload));
  const uploadContent = settings.encryptionPassword
    ? await encryptContent(content, settings.encryptionPassword)
    : content;
  await services.upload({ files: { [fileName]: { content: uploadContent } } });
  await saveSnapshot(payload.bookmarks, undefined, payload.syncedAt);
  await saveSnapshotRecord('upload', payload.bookmarks);

  const label = settings.storageType === 'gitee_gist' ? 'Gitee Gist' : 'GitHub Gist';
  await saveSyncState({ lastStatus: 'upload_success', lastSyncTime: Date.now(), storageType: label });
  if (settings.enableNotify) showNotification('BookmarkSync', i18n.t('notification.uploadSuccess'));
  await addSyncLog({ timestamp: Date.now(), deviceName, type: 'upload', result: 'success', added: 0, modified: 0, deleted: 0, totalItems: payload.bookmarks.length, snapshotVersion: SYNC_VERSION });
  return { success: true };
}

async function runDownload() {
  const existing = await countBookmarks();
  const settings = await optionsStorage.getAll();
  const deviceName = settings.deviceName || '未知设备';
  console.log('[BookmarkSync] runDownload: existing bookmarks =', existing);
  if (existing > 0) {
    showNotification('BookmarkSync', i18n.t('notification.skipImport'));
    return { success: true, skipped: true };
  }

  const raw = await services.download();
  console.log('[BookmarkSync] runDownload: raw content length =', raw?.length);
  console.log('[BookmarkSync] runDownload: raw content preview =', raw?.slice(0, 200));
  if (!raw) throw new Error(i18n.t('notification.cloudNoData'));
  const rawStr = settings.encryptionPassword ? await decryptContent(raw, settings.encryptionPassword) : raw;

  let payload: any;
  if (rawStr.trimStart().startsWith('{')) payload = JSON.parse(rawStr);
  else {
    const d = decompress(rawStr);
    if (d && d.trimStart().startsWith('{')) payload = JSON.parse(d);
    else throw new Error(i18n.t('notification.cloudFormatError'));
  }

  console.log('[BookmarkSync] runDownload: payload roots =', payload.bookmarks?.length);
  payload.bookmarks?.forEach((r: any, i: number) => {
    console.log(`[BookmarkSync]   root[${i}] title="${r.title}" syncId="${r.syncId}" children=${r.children?.length || 0}`);
  });
  if (!payload.bookmarks || !Array.isArray(payload.bookmarks)) throw new Error(i18n.t('notification.cloudFormatInvalid'));

  const tree = await chrome.bookmarks.getTree();
  const chromeRoots = tree[0]?.children || [];
  console.log('[BookmarkSync] runDownload: chrome roots =', chromeRoots.map((r: any) => r.title));

  await importBookmarks(payload);
  console.log('[BookmarkSync] runDownload: import done');
  await saveSnapshot(payload.bookmarks, undefined, payload.syncedAt);
  await saveSnapshotRecord('download', payload.bookmarks);

  const label = settings.storageType === 'gitee_gist' ? 'Gitee Gist' : 'GitHub Gist';
  await saveSyncState({ lastStatus: 'download_success', lastSyncTime: Date.now(), storageType: label });
  if (settings.enableNotify) showNotification('BookmarkSync', i18n.t('notification.downloadSuccess'));
  await addSyncLog({ timestamp: Date.now(), deviceName, type: 'download', result: 'success', added: payload.bookmarks?.length || 0, modified: 0, deleted: 0, snapshotVersion: SYNC_VERSION });
  return { success: true };
}

/** Compute change details between base and result tree */
function computeChanges(base: any[], result: any[]): ChangeDetail[] {
  function flatten(nodes: any[]): Map<string, { title: string; url?: string }> {
    const m = new Map();
    function walk(ns: any[]) {
      for (const n of ns) {
        const f = `${n.title || ''}||${n.url || ''}`;
        m.set(f, { title: n.title, url: n.url });
        if (n.children) walk(n.children);
      }
    }
    walk(nodes);
    return m;
  }
  const baseMap = flatten(base || []);
  const resultMap = flatten(result || []);
  const allFps = new Set([...baseMap.keys(), ...resultMap.keys()]);
  const changes: ChangeDetail[] = [];
  const usedDel = new Set<string>(), usedAdd = new Set<string>();

  for (const f of allFps) {
    const b = baseMap.get(f);
    const r = resultMap.get(f);
    if (b && !r) {
      // Check if it's a "modify" — same title, different URL
      const paired = [...resultMap.entries()].find(([k, v]) =>
        !usedAdd.has(k) && v.title === b.title && v.url !== b.url
      );
      if (paired) {
        changes.push({ fingerprint: paired[0], type: 'modified', title: paired[1].title, url: paired[1].url, oldTitle: b.title, oldUrl: b.url });
        usedDel.add(f); usedAdd.add(paired[0]);
      } else {
        changes.push({ fingerprint: f, type: 'deleted', title: b.title, url: b.url });
        usedDel.add(f);
      }
    } else if (!b && r) {
      if (usedAdd.has(f)) continue;
      changes.push({ fingerprint: f, type: 'added', title: r.title, url: r.url });
      usedAdd.add(f);
    }
  }
  return changes;
}

/** Create or clear the auto-sync alarm based on settings */
function updateAutoSyncAlarm(settings: any) {
  const enabled = settings.autoSync === true;
  const interval = settings.syncInterval && settings.syncInterval > 0 ? settings.syncInterval : 30;
  if (enabled) {
    chrome.alarms.create('autoSync', { periodInMinutes: interval });
    console.log(`[BookmarkSync] Auto-sync alarm created: every ${interval} min`);
  } else {
    chrome.alarms.clear('autoSync');
    console.log('[BookmarkSync] Auto-sync alarm cleared');
  }
}
