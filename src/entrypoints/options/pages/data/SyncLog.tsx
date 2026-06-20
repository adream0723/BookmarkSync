import React, { useState, useEffect, useCallback } from 'react';
import { Table, Badge, Button, Modal, Pagination, Card } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { getSyncLogs, clearSyncLogs, SyncLogEntry } from '../../../../utils/syncLog';

const PAGE_SIZE = 15;

const typeVariants: Record<string, string> = { upload: 'info', download: 'primary', sync: 'success' };

function fmtTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

const SyncLog: React.FC = () => {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<SyncLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<SyncLogEntry | null>(null);

  const load = useCallback(async (p: number) => {
    const { entries: es, total: t } = await getSyncLogs(p, PAGE_SIZE);
    setEntries(es);
    setTotal(t);
  }, []);

  useEffect(() => { load(page); }, [page, load]);

  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;

  const handleClear = async () => {
    if (!confirm(t('synclog.clearConfirm'))) return;
    await clearSyncLogs();
    setPage(1);
    load(1);
  };

  const typeLabels: Record<string, string> = { upload: t('synclog.upload'), download: t('synclog.download'), sync: t('synclog.sync') };

  return (
    <div className="settings-page">
      <Card className="settings-card">
        <Card.Header className="settings-card-header d-flex justify-content-between align-items-center">
          <span>{t('synclog.title')}</span>
          {total > 0 && (
            <Button variant="outline-danger" size="sm" onClick={handleClear}>{t('synclog.clear')}</Button>
          )}
        </Card.Header>
        <Card.Body>
          {total === 0 ? (
            <div className="text-center text-muted py-5">{t('synclog.empty')}</div>
          ) : (
            <>
              <Table striped bordered hover size="sm" className="sync-log-table">
                <thead className="table-light">
                  <tr>
                    <th className="text-center" style={{ width: 160 }}>{t('synclog.time')}</th>
                    <th className="text-center" style={{ width: 120 }}>{t('synclog.type')}</th>
                    <th className="text-center" style={{ width: 100 }}>{t('synclog.result')}</th>
                    <th className="text-center" style={{ width: 180 }}>{t('synclog.stats')}</th>
                    <th className="text-center" style={{ width: 80 }}>{t('synclog.detail')}</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map(e => (
                    <tr key={e.id}>
                      <td className="text-nowrap text-center">{fmtTime(e.timestamp)}</td>
                      <td className="text-center">
                        <Badge bg={typeVariants[e.type] || 'secondary'}>{typeLabels[e.type] || e.type}</Badge>
                      </td>
                      <td className="text-center">
                        {e.result === 'success'
                          ? <Badge bg="success">✅ {t('common.success')}</Badge>
                          : <Badge bg="danger">❌ {t('common.fail')}</Badge>}
                      </td>
                      <td className="text-center">
                        {e.result === 'success' ? (
                          <span className="text-nowrap">
                            {e.added > 0 && <span className="text-success me-2">+{e.added}</span>}
                            {e.modified > 0 && <span className="text-warning me-2">~{e.modified}</span>}
                            {e.deleted > 0 && <span className="text-danger me-2">-{e.deleted}</span>}
                            {e.conflicts !== undefined && e.conflicts > 0 && <span className="text-info">⚡{e.conflicts}</span>}
                            {!e.added && !e.modified && !e.deleted && !e.conflicts && <span className="text-muted">{t('synclog.noChanges')}</span>}
                          </span>
                        ) : (
                          <span className="text-danger small">{e.error?.slice(0, 40)}...</span>
                        )}
                      </td>
                      <td className="text-center">
                        <Button variant="outline-secondary" size="sm" onClick={() => setDetail(e)}>{t('synclog.detail')}</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              {totalPages > 1 && (
                <div className="d-flex justify-content-center mt-3">
                  <Pagination size="sm">
                    <Pagination.Prev disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} />
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                      <Pagination.Item key={p} active={p === page} onClick={() => setPage(p)}>{p}</Pagination.Item>
                    ))}
                    <Pagination.Next disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))} />
                  </Pagination>
                </div>
              )}
            </>
          )}
        </Card.Body>
      </Card>

      <Modal show={!!detail} onHide={() => setDetail(null)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>{t('synclog.detailTitle')}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {detail && (
            <div>
              <div style={{ background: '#f8f9fa', borderRadius: 8, padding: '14px 18px', marginBottom: 16, fontSize: 14, lineHeight: 2 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 16px' }}>
                  <span style={{ color: '#666' }}>{t('synclog.time')}</span><span>{fmtTime(detail.timestamp)}</span>
                  <span style={{ color: '#666' }}>{t('synclog.device')}</span><span>{detail.deviceName}</span>
                  <span style={{ color: '#666' }}>{t('synclog.type')}</span>
                  <span><Badge bg={typeVariants[detail.type] || 'secondary'}>{typeLabels[detail.type] || detail.type}</Badge></span>
                  <span style={{ color: '#666' }}>{t('synclog.result')}</span>
                  <span>{detail.result === 'success' ? <Badge bg="success" style={{ fontSize: 13, padding: '4px 12px' }}>✅ {t('common.success')}</Badge> : <Badge bg="danger" style={{ fontSize: 13, padding: '4px 12px' }}>❌ {t('common.fail')}</Badge>}</span>
                  {detail.snapshotVersion && <><span style={{ color: '#666' }}>{t('synclog.snapshotVersion')}</span><span><Badge bg="secondary">{detail.snapshotVersion}</Badge></span></>}
                </div>
                {detail.error && <div style={{ marginTop: 8, color: '#c62828', background: '#ffebee', padding: '8px 12px', borderRadius: 6 }}>❌ {detail.error}</div>}
              </div>
              {detail.result === 'success' && (detail.added > 0 || detail.modified > 0 || detail.deleted > 0 || (detail.conflicts ?? 0) > 0) && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>{t('synclog.changeStats')}</div>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {detail.added > 0 && <span style={{ background: '#e8f5e9', color: '#2e7d32', padding: '4px 14px', borderRadius: 16, fontSize: 13, fontWeight: 600 }}>+{t('synclog.added')} {detail.added}</span>}
                    {detail.modified > 0 && <span style={{ background: '#fff3e0', color: '#e65100', padding: '4px 14px', borderRadius: 16, fontSize: 13, fontWeight: 600 }}>~{t('synclog.modified')} {detail.modified}</span>}
                    {detail.deleted > 0 && <span style={{ background: '#ffebee', color: '#c62828', padding: '4px 14px', borderRadius: 16, fontSize: 13, fontWeight: 600 }}>-{t('synclog.deleted')} {detail.deleted}</span>}
                    {detail.conflicts !== undefined && detail.conflicts > 0 && <span style={{ background: '#e3f2fd', color: '#1565c0', padding: '4px 14px', borderRadius: 16, fontSize: 13, fontWeight: 600 }}>⚡{t('synclog.conflict')} {detail.conflicts}</span>}
                  </div>
                </div>
              )}
              {detail.changes && detail.changes.length > 0 && (
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>{t('synclog.changeDetail')}</div>
                  <div style={{ border: '1px solid #e0e0e0', borderRadius: 8, overflow: 'hidden' }}>
                    {detail.changes.map((c, i) => (
                      <div key={i} style={{
                        padding: '8px 12px',
                        borderBottom: i < detail.changes!.length - 1 ? '1px solid #f0f0f0' : 'none',
                        display: 'flex', alignItems: 'center', gap: 10, fontSize: 13,
                        background: c.type === 'added' ? '#fafff5' : c.type === 'deleted' ? '#fff5f5' : '#fffbf0',
                      }}>
                        <span style={{
                          display: 'inline-block', width: 56, textAlign: 'center', fontWeight: 600, fontSize: 11,
                          padding: '2px 6px', borderRadius: 4,
                          color: c.type === 'added' ? '#2e7d32' : c.type === 'deleted' ? '#c62828' : '#e65100',
                          background: c.type === 'added' ? '#e8f5e9' : c.type === 'deleted' ? '#ffebee' : '#fff3e0',
                        }}>
                          {c.type === 'added' ? `+${t('synclog.added')}` : c.type === 'deleted' ? `-${t('synclog.deleted')}` : `~${t('synclog.modified')}`}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {c.type === 'modified' ? `${c.oldTitle} → ${c.title}` : c.title}
                          </div>
                          {c.url && <div style={{ color: '#888', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.url}</div>}
                          {c.oldUrl && <div style={{ color: '#aaa', fontSize: 11 }}>{t('synclog.oldUrl')}: {c.oldUrl}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setDetail(null)}>{t('common.close')}</Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default SyncLog;
