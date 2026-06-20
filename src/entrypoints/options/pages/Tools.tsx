import React from 'react';
import { useTranslation } from 'react-i18next';

const Tools: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="page-placeholder">
      <p>{t('tools.title')} — 即将上线</p>
    </div>
  );
};
export default Tools;
