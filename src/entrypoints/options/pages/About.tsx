import React from 'react';
import { useTranslation } from 'react-i18next';

const About: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="page-placeholder">
      <p>{t('appName')} v0.1.0</p>
      <p>{t('appDesc')}</p>
    </div>
  );
};
export default About;
