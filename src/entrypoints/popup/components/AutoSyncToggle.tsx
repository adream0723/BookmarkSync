import React from 'react';
import { Form } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';

interface AutoSyncToggleProps {
  enabled: boolean;
  syncInterval: number;
  onChange: (checked: boolean) => void;
}

function fmtInterval(min: number, t: (k: string, opt?: any) => string): string {
  return t('popup.interval', { n: min });
}

const AutoSyncToggle: React.FC<AutoSyncToggleProps> = ({ enabled, syncInterval, onChange }) => {
  const { t } = useTranslation();
  return (
    <div className="popup-section d-flex align-items-center justify-content-between">
      <div>
        <div>{t('settings.autoSync')}</div>
        {enabled && <div className="popup-sub-text">{fmtInterval(syncInterval, t)}</div>}
      </div>
      <Form.Check
        type="switch"
        id="auto-sync-switch"
        checked={enabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </div>
  );
};

export default AutoSyncToggle;
