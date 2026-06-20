import React, { useState, useEffect } from 'react';
import { Card } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { useBookmarkCount } from '../hooks/useBookmarkCount';
import optionsStorage from '../../../utils/optionsStorage';

const providerLabels: Record<string, string> = {
  'gitee_gist': 'Gitee Gist',
  'gist': 'GitHub Gist',
};

interface StatsCardProps {
  refreshTrigger?: number;
}

const StatsCard: React.FC<StatsCardProps> = ({ refreshTrigger = 0 }) => {
  const { t } = useTranslation();
  const { count, loading } = useBookmarkCount();
  const [displayName, setDisplayName] = useState('');

  useEffect(() => {
    optionsStorage.getAll().then(saved => {
      setDisplayName(providerLabels[saved.storageType] || saved.storageType || '-');
    });
  }, [refreshTrigger]);

  return (
    <Card className="popup-card">
      <Card.Body className="d-flex align-items-center p-2">
        <div className="popup-card-half">
          <div className="popup-card-emoji">📁</div>
          <div className="popup-card-label">{t('dashboard.bookmarkCount')}</div>
          <div className="popup-card-value">
            {loading ? '...' : count}
          </div>
        </div>
        <div className="popup-card-divider" />
        <div className="popup-card-half">
          <div className="popup-card-emoji">☁️</div>
          <div className="popup-card-label">{t('dashboard.storageType')}</div>
          <div className="popup-card-value">{displayName || t('common.notConfigured')}</div>
        </div>
      </Card.Body>
    </Card>
  );
};

export default StatsCard;
