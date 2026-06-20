import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import zh from './zh.json';
import zhTW from './zh-TW.json';
import zhHK from './zh-HK.json';
import zhMO from './zh-MO.json';
import ja from './ja.json';
import ko from './ko.json';
import en from './en.json';

i18n.use(initReactI18next).init({
  resources: {
    zh: { translation: zh },
    'zh-TW': { translation: zhTW },
    'zh-HK': { translation: zhHK },
    'zh-MO': { translation: zhMO },
    ja: { translation: ja },
    ko: { translation: ko },
    en: { translation: en },
  },
  lng: 'zh',
  fallbackLng: 'zh',
  interpolation: { escapeValue: false },
});

export default i18n;
