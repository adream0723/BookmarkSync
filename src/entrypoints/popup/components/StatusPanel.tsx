import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getSyncState, SyncState } from '../../../utils/syncState';

function formatTime(ts: number): string {
  if (!ts) return '--';
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function fmtStatus(key: string, t: (k: string, opt?: any) => string): string {
  // If it's a plain Chinese string (old data), show as-is
  if (key.length > 0 && (key.charCodeAt(0) > 127 || key.includes('同步'))) return key;
  return t('status.' + key, { defaultValue: key });
}

interface StatusPanelProps {
  refreshTrigger?: number;
}

const StatusPanel: React.FC<StatusPanelProps> = ({ refreshTrigger = 0 }) => {
  const { t } = useTranslation();
  const [state, setState] = useState<SyncState>({ lastStatus: t('popup.never'), lastSyncTime: 0, storageType: '' });

  useEffect(() => {
    getSyncState().then(setState);
  }, [refreshTrigger]);

  return (
    <div className="popup-section">
      <div className="d-flex align-items-center mb-1">
        <span className="popup-emoji">✅</span>
        <span className="popup-label">{t('dashboard.lastStatus')}</span>
        <span className="popup-value">{fmtStatus(state.lastStatus, t)}</span>
      </div>
      <div className="d-flex align-items-center">
        <span className="popup-emoji">🕐</span>
        <span className="popup-label">{t('popup.lastSync')}</span>
        <span className="popup-value">{formatTime(state.lastSyncTime)}</span>
      </div>
    </div>
  );
};

export default StatusPanel;
