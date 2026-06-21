import i18n from '../../locales/i18n';
import { fp } from '../../utils/fingerprint';
import { saveSnapshot, saveSnapshotRecord } from '../../utils/bookmarks';
import services from '../../utils/services';
import optionsStorage from '../../utils/optionsStorage';
import { encodeEmoji } from '../../utils/compress';
import { SYNC_VERSION, STORAGE } from '../../utils/constants';
import { applyMergedTree } from '../../utils/import';
import { addSyncLog, ChangeDetail, computeChanges } from '../../utils/syncLog';
import { encryptContent } from '../../utils/crypto';

const STORAGE_KEY = STORAGE.MANUAL_MERGE;

interface MergeData { local: any[]; merged: any[]; remote: any[]; snapshot: any[]; snapshotTimestamp?: number; remoteSyncedAt?: number; mode?: 'smart' | 'first-sync'; }

interface FlatInfo { f: string; n: any; depth: number; path: string[]; }

interface MergeItem { f: string; title: string; url?: string; parentFp: string; index: number; n: any; }

/** One fingerprint with its state in all three trees + user choice */
interface DiffItem {
  fingerprint: string;
  path: string[];
  depth: number;
  isFolder: boolean;
  inSnapshot: boolean; inLocal: boolean; inRemote: boolean;
  snapInfo: { title: string; url?: string } | null;
  localInfo: { title: string; url?: string } | null;
  remoteInfo: { title: string; url?: string } | null;
  smartAction: 'keep' | 'delete' | 'add';
  userAction: 'keep' | 'delete';
}

function loadMergeData(): Promise<MergeData | null> { return chrome.storage.local.get(STORAGE_KEY).then(r => r[STORAGE_KEY] || null); }
function clearMergeData(): Promise<void> { return chrome.storage.local.remove(STORAGE_KEY); }

function fmtTime(ts: number): string {
  if (!ts) return '--';
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function flattenTree(nodes: any[], d = 0, pp: string[] = []): FlatInfo[] {
  const r: FlatInfo[] = [];
  for (const n of nodes) {
    const f = fp(n.title, n.url), path = [...pp, n.title || '(unnamed)'];
    r.push({ f, n, depth: d, path });
    if (n.children) r.push(...flattenTree(n.children, d + 1, path));
  }
  return r;
}

/** Build diff for first-sync mode: no snapshot, just local vs remote */
function buildDiffItemsFirstSync(local: any[], remote: any[]): DiffItem[] {
  const lFlat = flattenTree(local);
  const rFlat = flattenTree(remote);
  const lMap = new Map(lFlat.map(x => [x.f, x]));
  const rMap = new Map(rFlat.map(x => [x.f, x]));
  const allFps = new Set([...lMap.keys(), ...rMap.keys()]);
  const items: DiffItem[] = [];

  for (const f of allFps) {
    const l = lMap.get(f), r = rMap.get(f);
    const inLocal = !!l, inRemote = !!r;
    // Skip if both sides have it (no difference)
    if (inLocal && inRemote) continue;
    const info = l || r!;
    items.push({
      fingerprint: f,
      path: info.path,
      depth: info.depth,
      isFolder: !info.n.url,
      inSnapshot: false, inLocal, inRemote,
      snapInfo: null,
      localInfo: inLocal ? { title: l!.n.title, url: l!.n.url } : null,
      remoteInfo: inRemote ? { title: r!.n.title, url: r!.n.url } : null,
      smartAction: 'add',
      userAction: 'keep',
    });
  }

  items.sort((a, b) => a.path.join('/').localeCompare(b.path.join('/')));
  console.log(`[BookmarkSync] buildDiffItemsFirstSync: ${lFlat.length} local, ${rFlat.length} remote, ${allFps.size} total fps, ${items.length} diffs`);
  return items;
}

/** Build all items (including matching) for first-sync mode */
function buildAllItemsFirstSync(local: any[], remote: any[]): DiffItem[] {
  const lFlat = flattenTree(local);
  const rFlat = flattenTree(remote);
  const lMap = new Map(lFlat.map(x => [x.f, x]));
  const rMap = new Map(rFlat.map(x => [x.f, x]));
  const allFps = new Set([...lMap.keys(), ...rMap.keys()]);
  const items: DiffItem[] = [];

  for (const f of allFps) {
    const l = lMap.get(f), r = rMap.get(f);
    const inLocal = !!l, inRemote = !!r;
    const info = l || r!;
    items.push({
      fingerprint: f,
      path: info.path,
      depth: info.depth,
      isFolder: !info.n.url,
      inSnapshot: false, inLocal, inRemote,
      snapInfo: null,
      localInfo: inLocal ? { title: l!.n.title, url: l!.n.url } : null,
      remoteInfo: inRemote ? { title: r!.n.title, url: r!.n.url } : null,
      smartAction: inLocal && inRemote ? 'keep' : 'add',
      userAction: 'keep',
    });
  }

  items.sort((a, b) => a.path.join('/').localeCompare(b.path.join('/')));
  return items;
}

/** Build final tree for first-sync mode: local base + remote additions */
function buildFinalTreeFirstSync(local: any[], remote: any[], items: DiffItem[]): any[] {
  // Collect fingerprints user chose to keep
  const keepFps = new Set<string>();
  // Start with all local bookmarks
  for (const item of items) {
    if (item.userAction === 'keep') keepFps.add(item.fingerprint);
  }

  const lFlat = flattenTree(local);
  const rFlat = flattenTree(remote);
  const lMap = new Map(lFlat.map(x => [x.f, x]));
  const rMap = new Map(rFlat.map(x => [x.f, x]));

  // Start with all local flat items that are kept
  const mergedFlat = new Map<string, FlatInfo>();
  for (const [f, info] of lMap) {
    if (keepFps.has(f)) mergedFlat.set(f, info);
  }

  // Add kept remote-only items
  for (const [f, info] of rMap) {
    if (!lMap.has(f) && keepFps.has(f)) mergedFlat.set(f, info);
  }

  // Collect all fingerprints currently in mergedFlat (for parent existence checks)
  let mergedFps = new Set(mergedFlat.keys());

  // Also include items in both (not in diff items list, so they're implicitly kept)
  // Prefer the side whose parent folder exists in mergedFlat
  for (const [f] of lMap) {
    if (mergedFlat.has(f)) continue;
    if (!rMap.has(f)) continue;
    const lInfo = lMap.get(f)!;
    const rInfo = rMap.get(f)!;
    const lParentFp = lInfo.path.length > 1 ? fp(lInfo.path[lInfo.path.length - 2]) : '';
    const rParentFp = rInfo.path.length > 1 ? fp(rInfo.path[rInfo.path.length - 2]) : '';
    if (lParentFp && !mergedFps.has(lParentFp) && rParentFp && mergedFps.has(rParentFp)) {
      mergedFlat.set(f, rInfo);
    } else {
      mergedFlat.set(f, lInfo); // default to local
    }
  }

  // Rebuild tree
  mergedFps = new Set(mergedFlat.keys());
  const byParent = new Map<string, { f: string; n: any; path: string[]; depth: number }[]>();
  const roots: { f: string; n: any; path: string[]; depth: number }[] = [];

  for (const [f, info] of mergedFlat) {
    const parentFp = info.path.length > 1 ? fp(info.path[info.path.length - 2]) : '';
    // If parent fingerprint doesn't exist in mergedFlat (deleted by user), promote to root
    const effectiveParent = parentFp && mergedFps.has(parentFp) ? parentFp : '';
    const list = effectiveParent ? (byParent.get(effectiveParent) ?? (byParent.set(effectiveParent, []), byParent.get(effectiveParent)!)) : roots;
    list.push(info);
  }

  roots.sort((a, b) => a.n.index - b.n.index);
  for (const [, children] of byParent) children.sort((a, b) => a.n.index - b.n.index);

  function build(items: { f: string; n: any; path: string[]; depth: number }[]): any[] {
    return items.map(item => {
      const node: any = { title: item.n.title };
      if (item.n.url) node.url = item.n.url;
      const children = byParent.get(item.f);
      if (children) node.children = build(children);
      return node;
    });
  }

  return build(roots);
}

/** Build the unified diff: every fingerprint where not (inAllThree || inNone) */
function buildDiffItems(snapshot: any[], local: any[], remote: any[], cloudNewer: boolean): DiffItem[] {
  const sFlat = flattenTree(snapshot);
  const lFlat = flattenTree(local);
  const rFlat = flattenTree(remote);
  const sMap = new Map(sFlat.map(x => [x.f, x]));
  const lMap = new Map(lFlat.map(x => [x.f, x]));
  const rMap = new Map(rFlat.map(x => [x.f, x]));

  const allFps = new Set([...sMap.keys(), ...lMap.keys(), ...rMap.keys()]);
  const items: DiffItem[] = [];

  for (const f of allFps) {
    const s = sMap.get(f), l = lMap.get(f), r = rMap.get(f);
    const b = !!s, lh = !!l, rh = !!r;

    // Skip if all three present (unchanged) or all three absent (can't happen)
    if ((b && lh && rh) || (!b && !lh && !rh)) continue;

    // Determine smart action based on cloudNewer
    // When !cloudNewer (local newer than cloud): keep if local has it
    // When cloudNewer (cloud newer than local): keep if remote has it
    // Determine smart action
    // Items that were in snapshot: when local and remote disagree → delete (user picks)
    // New items (not in snapshot): local-only always keep, remote-only needs cloudNewer
    let smartAction: 'keep' | 'delete';
    if (b) {
      // Was in snapshot
      if (lh && rh) smartAction = 'keep';
      else if (!lh && !rh) smartAction = 'delete';
      else smartAction = 'delete'; // disagree → default delete
    } else {
      // New item (not in snapshot)
      if (lh && rh) smartAction = 'keep';
      else if (lh && !rh) smartAction = 'keep'; // local only
      else if (!lh && rh) smartAction = cloudNewer ? 'keep' : 'delete'; // remote only
      else smartAction = 'delete';
    }

    const info = s || l || r!;
    items.push({
      fingerprint: f,
      path: info.path,
      depth: info.depth,
      isFolder: !info.n.url,
      inSnapshot: b, inLocal: lh, inRemote: rh,
      snapInfo: b ? { title: s!.n.title, url: s!.n.url } : null,
      localInfo: lh ? { title: l!.n.title, url: l!.n.url } : null,
      remoteInfo: rh ? { title: r!.n.title, url: r!.n.url } : null,
      smartAction,
      userAction: smartAction, // default = smart
    });
  }

  items.sort((a, b) => a.path.join('/').localeCompare(b.path.join('/')));
  return items;
}

/** Build final tree from user's keep/delete choices */
function buildFinalTree(snapshot: any[], local: any[], remote: any[], items: DiffItem[], cloudNewer: boolean): any[] {
  // Collect fingerprints user wants to keep
  const keepFps = new Set<string>();
  for (const item of items) {
    if (item.userAction === 'keep') keepFps.add(item.fingerprint);
  }

  // Also include items that are in all three (unchanged, not shown in UI)
  const sFlat = flattenTree(snapshot);
  const lFlat = flattenTree(local);
  const rFlat = flattenTree(remote);
  for (const item of sFlat) {
    const l = lFlat.find(x => x.f === item.f);
    const r = rFlat.find(x => x.f === item.f);
    if (l && r) keepFps.add(item.f); // in all three
  }

  // Build flat items from sources (priority: authoritative side first)
  const lMap = new Map(lFlat.map(x => [x.f, x]));
  const rMap = new Map(rFlat.map(x => [x.f, x]));

  // Source priority: the authoritative side provides position/parent info
  const authoritative = cloudNewer ? rMap : lMap;
  const fallback = cloudNewer ? lMap : rMap;

  const resultItems: MergeItem[] = [];
  const addedSet = new Set<string>();

  for (const item of sFlat) {
    if (!keepFps.has(item.f)) continue;
    // Use authoritative source first, then fallback, then snapshot
    const src = authoritative.get(item.f) || fallback.get(item.f) || item;
    const parentFp = src.path.length > 1 ? fp(src.path[src.path.length - 2]) : '';
    resultItems.push({ f: src.f, title: src.n.title, url: src.n.url, parentFp, index: src.n.index ?? 0, n: src.n });
    addedSet.add(src.f);
  }

  // Add items from authoritative then fallback that aren't in snapshot
  for (const flat of [...authoritative.values(), ...fallback.values()]) {
    if (!keepFps.has(flat.f) || addedSet.has(flat.f)) continue;
    const parentFp = flat.path.length > 1 ? fp(flat.path[flat.path.length - 2]) : '';
    resultItems.push({ f: flat.f, title: flat.n.title, url: flat.n.url, parentFp, index: flat.n.index ?? 0, n: flat.n });
    addedSet.add(flat.f);
  }

  // Rebuild tree
  const byParent = new Map<string, MergeItem[]>();
  const roots: MergeItem[] = [];
  for (const item of resultItems) {
    const list = item.parentFp
      ? (byParent.get(item.parentFp) ?? (byParent.set(item.parentFp, []), byParent.get(item.parentFp)!))
      : roots;
    list.push(item);
  }

  roots.sort((a, b) => a.index - b.index);
  for (const [, children] of byParent) children.sort((a, b) => a.index - b.index);

  function build(items: MergeItem[]): any[] {
    return items.map(item => {
      const node: any = { title: item.title };
      if (item.url) node.url = item.url;
      const children = byParent.get(item.f);
      if (children) node.children = build(children);
      return node;
    });
  }

  return build(roots);
}

async function applyMerge(mergedTree: any[]) {
  const s = await optionsStorage.getAll();
  const tree = await chrome.bookmarks.getTree();
  const chromeRoots = tree[0]?.children || [];
  await applyMergedTree(mergedTree, chromeRoots, s.orderSyncStrategy === 'none');
  console.log(`[BookmarkSync] Manual merge: applyMergedTree done, skipReorder=${s.orderSyncStrategy === 'none'}, strategy=${s.orderSyncStrategy}`);

  const fn = s.storageType === 'gitee_gist' ? s.giteeGistFileName : s.gistFileName;
  const syncedAt = Date.now();
  const ctRaw = s.formatJson
    ? JSON.stringify({ version: SYNC_VERSION, syncedAt, deviceName: s.deviceName || i18n.t('common.unknownDevice'), bookmarks: mergedTree }, null, 2)
    : JSON.stringify({ version: SYNC_VERSION, syncedAt, deviceName: s.deviceName || i18n.t('common.unknownDevice'), bookmarks: mergedTree });
  const ct = s.encryptionPassword
    ? await encryptContent(ctRaw, s.encryptionPassword)
    : encodeEmoji(ctRaw);
  await services.upload({ files: { [fn]: { content: ct } } });
  await saveSnapshot(mergedTree, undefined, syncedAt);
  await saveSnapshotRecord('sync', mergedTree);
  await clearMergeData();
}

function render() {
  const statsEl = document.getElementById('stats')!;
  const contentEl = document.getElementById('content')!;
  const actionsEl = document.getElementById('actions')!;
  const saveBtn = document.getElementById('saveBtn') as HTMLButtonElement;
  const cancelBtn = document.getElementById('cancelBtn') as HTMLButtonElement;

  loadMergeData().then(data => {
    if (!data) { contentEl.innerHTML = '<div class="empty">' + i18n.t('merge.noData') + '</div>'; return; }

    const isFirstSync = data.mode === 'first-sync';
    const cloudNewer = !isFirstSync && (data.remoteSyncedAt || 0) > (data.snapshotTimestamp || 0);
    let showOnlyDiffs = true;

    function buildItems() {
      if (isFirstSync) {
        return showOnlyDiffs
          ? buildDiffItemsFirstSync(data.local, data.remote || [])
          : buildAllItemsFirstSync(data.local, data.remote || []);
      }
      return buildDiffItems(data.snapshot || [], data.local, data.remote || [], cloudNewer);
    }

    function renderContent() {
      const items = buildItems();
      contentEl.innerHTML = '';
      const statsHTML: string[] = [];

      // ── Stats ──
      if (isFirstSync) {
        const localOnly = items.filter(i => i.inLocal && !i.inRemote).length;
        const remoteOnly = items.filter(i => !i.inLocal && i.inRemote).length;
        statsHTML.push(i18n.t('merge.count', { n: items.length }) + '（' + i18n.t('merge.local') + ' ' + localOnly + ' / ' + i18n.t('merge.cloud') + ' ' + remoteOnly + '）');
      } else {
        const keepCount = items.filter(i => i.smartAction === 'keep').length;
        const delCount = items.filter(i => i.smartAction === 'delete').length;
        statsHTML.push(i18n.t('merge.count', { n: items.length }) + '（' + i18n.t('merge.keep') + ' ' + keepCount + ' / ' + i18n.t('merge.delete') + ' ' + delCount + '）');
        if (data.snapshotTimestamp) statsHTML.push(' | ' + i18n.t('merge.snapshot') + ': ' + fmtTime(data.snapshotTimestamp));
        if (data.remoteSyncedAt) statsHTML.push(' | ' + i18n.t('merge.cloud') + ': ' + fmtTime(data.remoteSyncedAt));
      }
      statsEl.innerHTML = statsHTML.join('');

      // Checkbox: show only diffs
      const cbWrap = document.createElement('label');
      cbWrap.style.cssText = 'font-size:12px;cursor:pointer;margin-left:12px;user-select:none;';
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.checked = showOnlyDiffs;
      cb.addEventListener('change', () => { showOnlyDiffs = cb.checked; renderContent(); });
      cbWrap.appendChild(cb);
      cbWrap.appendChild(document.createTextNode(' ' + i18n.t('merge.showOnlyDiffs')));
      statsEl.appendChild(cbWrap);

      if (items.length === 0) {
        // If order sync is enabled, apply the merged order silently first
        (async () => {
          try {
            const s = await optionsStorage.getAll();
            if (s.orderSyncStrategy !== 'none') {
              console.log(`[BookmarkSync] Manual merge: no content changes, syncing order silently (strategy=${s.orderSyncStrategy})`);
              const tree = await chrome.bookmarks.getTree();
              const orderSource = s.orderSyncStrategy === 'cloud' ? data.remote : data.local;
              console.log(`[BookmarkSync] Order source: ${s.orderSyncStrategy}, remote items: ${data.remote?.length}, local items: ${data.local?.length}`);
              await applyMergedTree(orderSource, tree[0]?.children || [], false);
            }
          } catch (err: any) {
            console.error('[BookmarkSync] Manual merge order sync failed:', err);
          }
        })();

        contentEl.innerHTML = '<div class="empty">' + i18n.t('merge.noChanges') + '</div>';
        actionsEl.style.display = 'block'; saveBtn.disabled = false; cancelBtn.style.display = 'none';
        cancelBtn.onclick = () => window.close();
        saveBtn.textContent = i18n.t('common.close');
        saveBtn.onclick = () => window.close();
        return;
      }

      // ── Header ──
    const headerRow = document.createElement('div'); headerRow.className = 'diff-header-row';
    const headers = isFirstSync
      ? ['💻 ' + i18n.t('merge.local'), '☁️ ' + i18n.t('merge.cloud'), i18n.t('merge.smartAction'), i18n.t('merge.action')]
      : ['📁 ' + i18n.t('merge.snapshot'), '💻 ' + i18n.t('merge.local'), '☁️ ' + i18n.t('merge.cloud'), i18n.t('merge.smartAction'), i18n.t('merge.action')];
    headers.forEach((t, i) => {
      const h = document.createElement('div'); h.className = 'diff-header'; h.textContent = t;
      if (i === headers.length - 2) h.style.flex = '0 0 80px';
      else if (i === headers.length - 1) h.style.flex = '0 0 130px';
      else if (i === 0) h.style.color = isFirstSync ? '#1976d2' : '#757575';
      else if (i === 1) h.style.color = '#2e7d32';
      headerRow.appendChild(h);
    });
    contentEl.appendChild(headerRow);

    // ── Rows (grouped by parent folder) ──
    // Build folder grouping: parentFpKey → { folderName, items }
    const folders = new Map<string, { name: string; items: DiffItem[] }>();
    for (const item of items) {
      const parentPath = item.path.slice(0, -1);
      const parentKey = parentPath.join('/');
      if (!folders.has(parentKey)) {
        folders.set(parentKey, { name: parentPath.length > 0 ? parentPath[parentPath.length - 1] : '/', items: [] });
      }
      folders.get(parentKey)!.items.push(item);
    }

    for (const [parentKey, folder] of folders) {
      // Folder header row
      const folderEl = document.createElement('div'); folderEl.className = 'diff-row diff-folder-row';
      folderEl.style.cssText = 'background:#f5f5f5;font-weight:600;border-bottom:1px solid #e0e0e0;';
      const folderCell = document.createElement('div'); folderCell.className = 'diff-cell';
      folderCell.style.cssText = 'flex:1;gap:4px;';
      // Indent based on depth
      const pathParts = parentKey ? parentKey.split('/') : [];
      folderCell.appendChild(indent(pathParts.length));
      const fi = document.createElement('span'); fi.textContent = '📁'; folderCell.appendChild(fi);
      const fn = document.createElement('span'); fn.textContent = folder.name; fn.style.fontSize = '13px'; folderCell.appendChild(fn);
      // Counts
      const cnt = document.createElement('span');
      cnt.style.cssText = 'font-size:11px;color:#888;margin-left:8px;font-weight:400;';
      const localCnt = folder.items.filter(i => i.inLocal).length;
      const remoteCnt = folder.items.filter(i => i.inRemote).length;
      cnt.textContent = `(${localCnt}${isFirstSync ? '' : 'L'} / ${remoteCnt}${isFirstSync ? '' : 'R'})`;
      folderCell.appendChild(cnt);
      folderEl.appendChild(folderCell);
      // Placeholder cells for remaining columns to keep alignment
      const colCount = isFirstSync ? 4 : 5;
      for (let c = 1; c < colCount; c++) { const d = document.createElement('div'); d.className = 'diff-cell'; d.style.flex = c === colCount - 2 ? '0 0 80px' : c === colCount - 1 ? '0 0 130px' : '1'; folderEl.appendChild(d); }
      contentEl.appendChild(folderEl);

      // Child items
      for (const item of folder.items) {
        const el = document.createElement('div'); el.className = 'diff-row';

        if (!isFirstSync) el.appendChild(mkCell(item.snapInfo, item.depth, item.isFolder));
        el.appendChild(mkCell(item.localInfo, item.depth, item.isFolder));
        el.appendChild(mkCell(item.remoteInfo, item.depth, item.isFolder));

      // Column: smart decision badge (last-2 or last-1 for first-sync)
      const smartCell = document.createElement('div'); smartCell.className = 'diff-cell';
      smartCell.style.flex = '0 0 80px'; smartCell.style.justifyContent = 'center';
      const badge = document.createElement('span');
      const isKeep = item.smartAction === 'keep';
      const isAdd = item.smartAction === 'add';
      if (isFirstSync) {
        badge.textContent = item.inLocal && item.inRemote ? i18n.t('merge.keep') : i18n.t('merge.add');
        badge.style.cssText = `font-size:11px;padding:2px 8px;border-radius:10px;color:#fff;background:${isAdd?'#1565c0':'#2e7d32'};`;
      } else {
        badge.textContent = isKeep ? i18n.t('merge.keep') : i18n.t('merge.delete');
        badge.style.cssText = `font-size:11px;padding:2px 8px;border-radius:10px;color:#fff;background:${isKeep?'#2e7d32':'#c62828'};`;
      }
      smartCell.appendChild(badge);
      el.appendChild(smartCell);

      // Last column: radio buttons (keep / delete), or "一致" for matching items when showing all
      const actCell = document.createElement('div'); actCell.className = 'diff-cell';
      actCell.style.flex = '0 0 130px'; actCell.style.gap = '2px'; actCell.style.justifyContent = 'center';

      if (!showOnlyDiffs && item.inLocal && item.inRemote) {
        // Both sides match, no action needed
        const matchLabel = document.createElement('span');
        matchLabel.textContent = i18n.t('merge.consistent');
        matchLabel.style.cssText = 'font-size:11px;color:#999;';
        actCell.appendChild(matchLabel);
      } else {
        const mkRadio = (label: string, value: 'keep' | 'delete') => {
          const lbl = document.createElement('label');
          lbl.style.cssText = 'font-size:12px;cursor:pointer;display:flex;align-items:center;gap:2px;';
          const rb = document.createElement('input');
          rb.type = 'radio'; rb.name = item.fingerprint;
          rb.checked = item.userAction === value;
          rb.addEventListener('change', () => { if (rb.checked) { item.userAction = value; updateSaveBtn(); } });
          lbl.appendChild(rb);
          lbl.appendChild(document.createTextNode(label));
          return lbl;
        };

        actCell.appendChild(mkRadio(i18n.t('merge.keep'), 'keep'));
        actCell.appendChild(mkRadio(i18n.t('merge.delete'), 'delete'));
      }
      el.appendChild(actCell);

      contentEl.appendChild(el);
    }
  }

    // ── Actions ──
    actionsEl.style.display = 'block'; saveBtn.disabled = false; cancelBtn.style.display = 'inline-block';
    cancelBtn.onclick = () => window.close();

    function updateSaveBtn() {
      if (isFirstSync) {
        const keepNum = items.filter(i => i.userAction === 'keep').length;
        saveBtn.textContent = i18n.t('merge.confirmAdd', { n: keepNum });
      } else {
        const keepNum = items.filter(i => i.userAction === 'keep').length;
        saveBtn.textContent = i18n.t('merge.confirmKeep', { n: keepNum });
      }
    }
    updateSaveBtn();

    saveBtn.onclick = async () => {
      saveBtn.disabled = true; saveBtn.textContent = i18n.t('merge.saving');
      try {
        const mergedTree = isFirstSync
          ? buildFinalTreeFirstSync(data.local, data.remote || [], items)
          : buildFinalTree(data.snapshot || [], data.local, data.remote || [], items, cloudNewer);
        console.log('[BookmarkSync] Merge: mergedTree roots=', mergedTree.map((r: any) => r.title + '(' + (r.children?.length||0) + ' children)'));
        mergedTree.forEach((root: any) => {
          function logTree(nodes: any[], depth: number) {
            for (const n of nodes) {
              console.log(`[BookmarkSync]   ${'  '.repeat(depth)}${n.title}${n.url ? ' → ' + n.url : ''}`);
              if (n.children) logTree(n.children, depth + 1);
            }
          }
          if (root.children) logTree(root.children, 1);
        });
        await applyMerge(mergedTree);

        // Log change details
        const changes = isFirstSync ? [] : computeChanges(data.snapshot || [], mergedTree);
        const added = isFirstSync ? items.filter(i => i.userAction === 'keep').length : changes.filter(c => c.type === 'added').length;
        const modified = isFirstSync ? 0 : changes.filter(c => c.type === 'modified').length;
        const deleted = isFirstSync ? items.filter(i => i.userAction === 'delete').length : changes.filter(c => c.type === 'deleted').length;
        const s = await optionsStorage.getAll();
        addSyncLog({ timestamp: Date.now(), deviceName: s.deviceName || i18n.t('common.unknownDevice'), type: 'sync', result: 'success', added, modified, deleted, changes, snapshotVersion: SYNC_VERSION });

        saveBtn.textContent = i18n.t('merge.mergeComplete');
        window.close();
      } catch (e: any) {
        saveBtn.textContent = i18n.t('merge.mergeFailed') + ': ' + e.message;
        saveBtn.disabled = false;
      }
    };
  }
  renderContent();
});
}

function mkCell(v: { title: string; url?: string } | null, depth: number, isFolder: boolean): HTMLDivElement {
  const cell = document.createElement('div'); cell.className = 'diff-cell';
  cell.appendChild(indent(depth)); cell.appendChild(icon(isFolder));
  if (v) {
    const ts = document.createElement('span'); ts.className = 'diff-title'; ts.textContent = v.title; cell.appendChild(ts);
    if (v.url) { const us = document.createElement('span'); us.className = 'diff-url'; us.textContent = v.url; cell.appendChild(us); }
  } else {
    const ic = icon(isFolder); ic.style.visibility = 'hidden'; cell.appendChild(ic);
    const empty = document.createElement('span'); empty.className = 'diff-empty'; empty.textContent = i18n.t('common.none');
    cell.appendChild(empty);
  }
  return cell;
}

function indent(d: number): HTMLSpanElement { const s = document.createElement('span'); s.className = 'diff-indent'; s.style.width = `${d * 20}px`; return s; }
function icon(f: boolean): HTMLSpanElement { const s = document.createElement('span'); s.className = 'diff-icon'; s.textContent = f ? '📁' : '📄'; return s; }

/** Compute change details between base and result tree */

// ── Load saved language preference before rendering ──
(async () => {
  try {
    const s = await optionsStorage.getAll();
    if (s.language) i18n.changeLanguage(s.language);
    if (s.theme === 'dark') {
      document.documentElement.classList.add('theme-dark');
    } else if (s.theme === 'auto') {
      const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (dark) document.documentElement.classList.add('theme-dark');
    }
    document.getElementById('mergeTitle')!.textContent = '📋 ' + i18n.t('merge.title');
  } catch { /* ignore */ }
})().then(() => render());
