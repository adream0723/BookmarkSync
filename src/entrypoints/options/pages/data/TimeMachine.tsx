import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Modal, Pagination, Card } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { getSnapshotHistory, SnapshotRecord, saveSnapshot } from '../../../../utils/bookmarks';
import type { BookmarkInfo } from '../../../../utils/models';
import { applyMergedTree } from '../../../../utils/import';
import optionsStorage from '../../../../utils/optionsStorage';

const PAGE_SIZE = 15;

function fmtTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

const TimeMachine: React.FC = () => {
  const { t } = useTranslation();
  const [snapshots, setSnapshots] = useState<SnapshotRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [treeModal, setTreeModal] = useState<{ nodes: BookmarkInfo[]; title: string } | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'danger'; text: string } | null>(null);

  const load = useCallback(async (p: number) => {
    const { records, total: t } = await getSnapshotHistory(p, PAGE_SIZE);
    setSnapshots(records);
    setTotal(t);
  }, []);

  useEffect(() => { load(page); }, [page, load]);

  const handleRestore = async (rec: SnapshotRecord) => {
    if (!rec.bookmarks || rec.bookmarks.length === 0) {
      setMessage({ type: 'danger', text: t('timemachine.noData') });
      return;
    }
    if (!confirm(t('timemachine.confirmRestore', { time: fmtTime(rec.timestamp) }))) return;

    setRestoring(String(rec.timestamp));
    setMessage(null);
    try {
      const tree = await chrome.bookmarks.getTree();
      const chromeRoots = tree[0]?.children || [];
      await applyMergedTree(rec.bookmarks, chromeRoots);
      await saveSnapshot(rec.bookmarks, undefined, Date.now());
      setMessage({ type: 'success', text: `✅ ${t('timemachine.restoreSuccess', { time: fmtTime(rec.timestamp) })}` });
    } catch (err: any) {
      setMessage({ type: 'danger', text: `❌ ${t('timemachine.restoreFailed')}: ${err.message}` });
    } finally {
      setRestoring(null);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;

  return (
    <div className="settings-page">
      <Card className="settings-card">
        <Card.Header className="settings-card-header">{t('timemachine.title')}</Card.Header>
        <Card.Body>
          {message && (
            <div className={`alert alert-${message.type === 'success' ? 'success' : 'danger'} py-2`} style={{ fontSize: 14 }}>
              {message.text}
              <button type="button" className="btn-close float-end" style={{ fontSize: 12 }} onClick={() => setMessage(null)} />
            </div>
          )}
          {snapshots.length === 0 ? (
            <div className="text-center text-muted py-4">{t('timemachine.empty')}</div>
          ) : (
            <>
              <Table striped bordered hover size="sm">
                <thead className="table-light">
                  <tr>
                    <th className="text-center" style={{ width: 160 }}>{t('timemachine.time')}</th>
                    <th className="text-center" style={{ width: 90 }}>{t('timemachine.count')}</th>
                    <th className="text-center">{t('timemachine.trigger')}</th>
                    <th className="text-center" style={{ width: 160 }}>{t('common.action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshots.map((s, i) => (
                    <tr key={i}>
                      <td className="text-nowrap text-center">{fmtTime(s.timestamp)}</td>
                      <td className="text-center">{s.bookmarkCount} {t('timemachine.count')}</td>
                      <td className="text-center">{s.trigger === 'upload' ? t('timemachine.upload') : s.trigger === 'download' ? t('timemachine.download') : t('timemachine.sync')}</td>
                      <td className="text-center">
                        {s.bookmarks ? (
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                            <Button variant="outline-info" size="sm" onClick={() => setTreeModal({ nodes: s.bookmarks!, title: fmtTime(s.timestamp) })}>
                              {t('timemachine.view')}
                            </Button>
                            <Button variant="outline-success" size="sm" disabled={restoring === String(s.timestamp)} onClick={() => handleRestore(s)}>
                              {restoring === String(s.timestamp) ? t('timemachine.restoring') : t('timemachine.restore')}
                            </Button>
                          </div>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              {totalPages > 1 && (
                <div className="d-flex justify-content-center mt-2">
                  <Pagination size="sm">
                    <Pagination.Prev disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} />
                    {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                      let p: number;
                      if (totalPages <= 7) p = i + 1;
                      else if (page <= 4) p = i + 1;
                      else if (page >= totalPages - 3) p = totalPages - 6 + i;
                      else p = page - 3 + i;
                      return <Pagination.Item key={p} active={p === page} onClick={() => setPage(p)}>{p}</Pagination.Item>;
                    })}
                    <Pagination.Next disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} />
                  </Pagination>
                </div>
              )}
            </>
          )}
        </Card.Body>
      </Card>

      <Modal show={!!treeModal} onHide={() => setTreeModal(null)} size="lg" scrollable>
        <Modal.Header closeButton>
          <Modal.Title>{t('timemachine.treeTitle')} — {treeModal?.title}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {treeModal && renderTree(treeModal.nodes, t)}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setTreeModal(null)}>{t('common.close')}</Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

function renderTree(nodes: BookmarkInfo[], _t?: any, depth = 0): React.ReactNode {
  const label = _t ? _t('timemachine.unnamed') : '(unnamed)';
  return (
    <ul style={{ listStyle: 'none', paddingLeft: depth > 0 ? 20 : 0, margin: 0 }}>
      {nodes.map((n, i) => (
        <li key={n.syncId || n.id || i} style={{ padding: '2px 0' }}>
          <span style={{ fontSize: 13 }}>
            {n.url ? '📄' : '📁'} {n.title || label}
            {n.url && (
              <span style={{ color: '#888', fontSize: 11, marginLeft: 6 }}>
                {n.url.length > 50 ? n.url.slice(0, 50) + '…' : n.url}
              </span>
            )}
          </span>
          {n.children && n.children.length > 0 && renderTree(n.children, _t, depth + 1)}
        </li>
      ))}
    </ul>
  );
}

export default TimeMachine;
