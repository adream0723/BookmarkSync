import React, { useState, useEffect, useRef } from 'react';
import { Card, Row, Col, Spinner, Button } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import optionsStorage from '../../../utils/optionsStorage';
import { countBookmarks } from '../../../utils/bookmarks';
import { getSyncLogs } from '../../../utils/syncLog';

// ───── Types ─────

interface Stats {
  bookmarkCount: number;
  storageLabel: string;
  syncMode: 'auto' | 'manual';
  lastStatus: 'success' | 'failure' | 'none';
  lastTime: string;
}

// ───── Helpers ─────

function fmtStorage(st: string): string {
  if (st === 'gitee_gist') return 'Gitee Gist';
  if (st === 'github_gist') return 'GitHub Gist';
  return st;
}

function fmtTime(ts: number): string {
  return `${new Date(ts).getFullYear()}-${String(new Date(ts).getMonth() + 1).padStart(2, '0')}-${String(new Date(ts).getDate()).padStart(2, '0')}`;
}

// ───── Component ─────

const Dashboard: React.FC = () => {
  const { t } = useTranslation();
  const [stats, setStats] = useState<Stats | null>(null);
  const [heatmap, setHeatmap] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'danger'; text: string } | null>(null);

  const sendBg = async (type: string, extra?: any): Promise<any> => {
    try {
      return await chrome.runtime.sendMessage({ type, ...extra });
    } catch (err: any) {
      if (err.message?.includes('Receiving end does not exist')) {
        await new Promise(r => setTimeout(r, 500));
        return await chrome.runtime.sendMessage({ type, ...extra });
      }
      throw err;
    }
  };

  const handleSmartSync = async () => {
    if (syncing) return;
    setSyncing(true);
    setFeedback(null);
    try {
      const res = await sendBg('startSync', { strategy: 'smart' });
      if (res?.success) {
        setFeedback({ type: 'success', text: `✅ ${t('dashboard.syncComplete')}` });
        refreshData();
      } else {
        setFeedback({ type: 'danger', text: `❌ ${t('dashboard.syncFailed')}: ${res?.error || t('dashboard.unknownError')}` });
      }
    } catch (err: any) {
      setFeedback({ type: 'danger', text: `❌ ${t('dashboard.syncFailed')}: ${err.message}` });
    } finally {
      setSyncing(false);
    }
  };

  const handleUpload = async () => {
    if (loadingAction) return;
    if (!confirm(t('dashboard.confirmUpload'))) return;
    setLoadingAction('upload');
    setFeedback(null);
    try {
      const res = await sendBg('startUpload');
      if (res?.success) {
        setFeedback({ type: 'success', text: `✅ ${t('dashboard.uploadComplete')}` });
        refreshData();
      } else {
        setFeedback({ type: 'danger', text: `❌ ${t('dashboard.uploadFailed')}: ${res?.error || t('dashboard.unknownError')}` });
      }
    } catch (err: any) {
      setFeedback({ type: 'danger', text: `❌ ${t('dashboard.uploadFailed')}: ${err.message}` });
    } finally {
      setLoadingAction(null);
    }
  };

  const handleDownload = async () => {
    if (loadingAction) return;
    if (!confirm(t('dashboard.confirmDownload'))) return;
    setLoadingAction('download');
    setFeedback(null);
    try {
      const res = await sendBg('startDownload');
      if (res?.success) {
        setFeedback({ type: 'success', text: `✅ ${t('dashboard.downloadComplete')}` });
        refreshData();
      } else {
        setFeedback({ type: 'danger', text: `❌ ${t('dashboard.downloadFailed')}: ${res?.error || t('dashboard.unknownError')}` });
      }
    } catch (err: any) {
      setFeedback({ type: 'danger', text: `❌ ${t('dashboard.downloadFailed')}: ${err.message}` });
    } finally {
      setLoadingAction(null);
    }
  };

  const refreshData = async () => {
    try {
      const [settings, count, { entries }] = await Promise.all([
        optionsStorage.getAll(),
        countBookmarks(),
        getSyncLogs(1, 500),
      ]);
      const last = entries[0];
      setStats({
        bookmarkCount: count,
        storageLabel: fmtStorage(settings.storageType || 'gitee_gist'),
        syncMode: settings.autoSync ? 'auto' : 'manual',
        lastStatus: last ? (last.result === 'success' ? 'success' : 'failure') : 'none',
        lastTime: last ? fmtTime(last.timestamp) : '',
      });
      const twelveMonthsAgo = Date.now() - 365 * 24 * 60 * 60 * 1000;
      const map = new Map<string, number>();
      for (const e of entries) {
        if (e.timestamp < twelveMonthsAgo) continue;
        map.set(fmtTime(e.timestamp), (map.get(fmtTime(e.timestamp)) || 0) + 1);
      }
      setHeatmap(map);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    (async () => {
      try {
        const [settings, count, { entries }] = await Promise.all([
          optionsStorage.getAll(),
          countBookmarks(),
          getSyncLogs(1, 500),
        ]);
        const last = entries[0];
        setStats({
          bookmarkCount: count,
          storageLabel: fmtStorage(settings.storageType || 'gitee_gist'),
          syncMode: settings.autoSync ? 'auto' : 'manual',
          lastStatus: last ? (last.result === 'success' ? 'success' : 'failure') : 'none',
          lastTime: last ? fmtTime(last.timestamp) : '',
        });
        const twelveMonthsAgo = Date.now() - 365 * 24 * 60 * 60 * 1000;
        const map = new Map<string, number>();
        for (const e of entries) {
          if (e.timestamp < twelveMonthsAgo) continue;
          const key = fmtTime(e.timestamp);
          map.set(key, (map.get(key) || 0) + 1);
        }
        setHeatmap(map);
      } catch { /* ignore */ } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="settings-page text-center py-5">
        <Spinner animation="border" variant="primary" />
        <p className="text-muted mt-2">{t('common.loading')}</p>
      </div>
    );
  }

  return (
    <div className="settings-page">
      {feedback && (
        <div className={`alert alert-${feedback.type === 'success' ? 'success' : 'danger'} py-2 mb-3`} style={{ fontSize: 14 }}>
          {feedback.text}
          <button type="button" className="btn-close float-end" style={{ fontSize: 12 }} onClick={() => setFeedback(null)} />
        </div>
      )}
      <Row className="g-3 mb-4">
        <Col sm={6} md={3}>
          <Card className="dashboard-card">
            <Card.Body className="text-center">
              <div className="dashboard-card-icon">📑</div>
              <div className="dashboard-card-value" style={{ fontSize: 14 }}>{stats?.bookmarkCount ?? '—'}</div>
              <div className="dashboard-card-label">{t('dashboard.bookmarkCount')}</div>
            </Card.Body>
          </Card>
        </Col>
        <Col sm={6} md={3}>
          <Card className="dashboard-card">
            <Card.Body className="text-center">
              <div className="dashboard-card-icon">💾</div>
              <div className="dashboard-card-value" style={{ fontSize: 14 }}>{stats?.storageLabel ?? '—'}</div>
              <div className="dashboard-card-label">{t('dashboard.storageType')}</div>
            </Card.Body>
          </Card>
        </Col>
        <Col sm={6} md={3}>
          <Card className="dashboard-card">
            <Card.Body className="text-center">
              <div className="dashboard-card-icon">🔄</div>
              <div className="dashboard-card-value" style={{ fontSize: 14, color: stats?.syncMode === 'auto' ? '#2e7d32' : '#666' }}>
                {stats?.syncMode === 'auto' ? t('dashboard.auto') : t('dashboard.manual')}
              </div>
              <div className="dashboard-card-label">{t('dashboard.syncMode')}</div>
            </Card.Body>
          </Card>
        </Col>
        <Col sm={6} md={3}>
          <Card className="dashboard-card">
            <Card.Body className="text-center">
              <div className="dashboard-card-icon">
                {stats?.lastStatus === 'success' ? '✅' : stats?.lastStatus === 'failure' ? '❌' : '⏸'}
              </div>
              <div className="dashboard-card-value" style={{ fontSize: 14, color: stats?.lastStatus === 'success' ? '#2e7d32' : stats?.lastStatus === 'failure' ? '#c62828' : '#999' }}>
                {stats?.lastStatus === 'success' ? t('dashboard.success') : stats?.lastStatus === 'failure' ? t('dashboard.failure') : t('dashboard.noRecord')}
              </div>
              <div className="dashboard-card-label">
                {stats?.lastTime || '—'}
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Card className="settings-card">
        <Card.Header className="settings-card-header">{t('dashboard.syncActivity')}</Card.Header>
        <Card.Body>
          <CalendarHeatmap data={heatmap} />
        </Card.Body>
      </Card>

      <Row className="g-3 mt-1">
        <Col md={6}>
          <Card className="settings-card" style={{ height: '100%' }}>
            <Card.Body className="d-flex flex-column">
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>{t('dashboard.smartMerge')}</div>
              <p style={{ fontSize: 13, color: '#666', flex: 1, marginBottom: 12 }}>
                {t('dashboard.smartMergeDesc')}
              </p>
              <Button variant="primary" size="sm" disabled={syncing} onClick={handleSmartSync} style={{ width: '100%' }}>
                {syncing ? t('dashboard.syncing') : t('dashboard.smartMergeBtn')}
              </Button>
            </Card.Body>
          </Card>
        </Col>
        <Col md={6}>
          <Card className="settings-card" style={{ height: '100%' }}>
            <Card.Body className="d-flex flex-column">
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>{t('dashboard.forceOverwrite')}</div>
              <p style={{ fontSize: 13, color: '#666', flex: 1, marginBottom: 12 }}>
                {t('dashboard.forceOverwriteDesc')}
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="outline-primary" size="sm" disabled={!!loadingAction} onClick={handleUpload} style={{ flex: 1 }}>
                  {loadingAction === 'upload' ? t('dashboard.uploading') : t('dashboard.uploadBtn')}
                </Button>
                <Button variant="outline-success" size="sm" disabled={!!loadingAction} onClick={handleDownload} style={{ flex: 1 }}>
                  {loadingAction === 'download' ? t('dashboard.downloading') : t('dashboard.downloadBtn')}
                </Button>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

// ───── Calendar Heatmap Component ─────

const DAY_LABEL_W = 30;
const MONTH_LABEL_H = 20;
const CELL_GAP = 3;

function CalendarHeatmap({ data }: { data: Map<string, number> }) {
  const { t } = useTranslation();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [cellSize, setCellSize] = React.useState(14);

  React.useEffect(() => {
    function calcSize() {
      if (!containerRef.current) return;
      const parent = containerRef.current.parentElement;
      if (!parent) return;
      const availW = parent.clientWidth - DAY_LABEL_W - 20;
      const weeks = 53;
      const size = Math.max(8, Math.floor((availW - weeks * CELL_GAP) / weeks));
      setCellSize(Math.min(size, 16));
    }
    calcSize();
    const ro = new ResizeObserver(calcSize);
    if (containerRef.current?.parentElement) {
      ro.observe(containerRef.current.parentElement);
    }
    return () => ro.disconnect();
  }, []);

  const today = new Date();
  const start = new Date(today);
  start.setFullYear(start.getFullYear() - 1);
  start.setDate(start.getDate() + 1);

  const days: Array<{ date: Date; count: number; y: number; w: number }> = [];
  const cur = new Date(start);
  const startDay = start.getDay();
  cur.setDate(cur.getDate() - (startDay === 0 ? 6 : startDay - 1));

  const maxCount = Math.max(1, ...data.values());
  const monthLabels: Array<{ label: string; col: number }> = [];
  const labeledMonths = new Set<number>();
  let col = 0;

  while (cur <= today) {
    const key = fmtTime(cur.getTime());
    const count = data.get(key) || 0;
    const m = cur.getMonth();
    if (!labeledMonths.has(m)) {
      labeledMonths.add(m);
      monthLabels.push({ label: `${m + 1}${t('dashboard.heatmapMonth')}`, col });
    }
    days.push({ date: new Date(cur), count, y: cur.getDay(), w: col });
    if (cur.getDay() === 6) col++;
    cur.setDate(cur.getDate() + 1);
  }

  const totalWeeks = Math.max(1, col);
  const svgW = DAY_LABEL_W + totalWeeks * (cellSize + CELL_GAP) + 4;
  const svgH = MONTH_LABEL_H + 7 * (cellSize + CELL_GAP) + 4;

  function getColor(count: number): string {
    if (count === 0) return '#ebedf0';
    const ratio = count / maxCount;
    if (ratio <= 0.25) return '#9be9a8';
    if (ratio <= 0.5) return '#40c463';
    if (ratio <= 0.75) return '#30a14e';
    return '#216e39';
  }

  function getTitle(d: { date: Date; count: number }): string {
    return `${d.date.getFullYear()}-${String(d.date.getMonth() + 1).padStart(2, '0')}-${String(d.date.getDate()).padStart(2, '0')}: ${d.count} ${t('dashboard.heatmapSyncCount')}`;
  }

  return (
    <div className="heatmap-wrapper" style={{ padding: '8px 0' }} ref={containerRef}>
      <svg width={svgW} height={svgH} style={{ display: 'block', margin: '0 auto' }}>
        {monthLabels.map((m, i) => (
          <text key={i} x={DAY_LABEL_W + m.col * (cellSize + CELL_GAP)} y={14} fontSize={11} fill="#666" fontWeight={500}>
            {m.label}
          </text>
        ))}
        {['', '一', '', '三', '', '五', ''].map((label, i) => (
          <text key={i} x={DAY_LABEL_W - 4} y={MONTH_LABEL_H + i * (cellSize + CELL_GAP) + 11} fontSize={10} fill="#666" textAnchor="end">
            {label}
          </text>
        ))}
        {days.map((d, i) => (
          <rect key={i} x={DAY_LABEL_W + d.w * (cellSize + CELL_GAP)} y={MONTH_LABEL_H + d.y * (cellSize + CELL_GAP)} width={cellSize} height={cellSize} rx={3} ry={3} fill={getColor(d.count)}>
            <title>{getTitle(d)}</title>
          </rect>
        ))}
      </svg>
      <div style={{ textAlign: 'center', marginTop: 10, fontSize: 12, color: '#888' }}>
        <span className="me-1">{t('dashboard.heatmapLess')}</span>
        {['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'].map((c, i) => (
          <span key={i} style={{ display: 'inline-block', width: 13, height: 13, margin: '0 2px', background: c, borderRadius: 3, verticalAlign: 'middle' }} />
        ))}
        <span className="ms-1">{t('dashboard.heatmapMore')}</span>
      </div>
    </div>
  );
}

export default Dashboard;
