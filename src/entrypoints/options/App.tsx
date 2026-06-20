import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import Sidebar from './components/Sidebar';
import Breadcrumb from './components/Breadcrumb';
import { menuConfig, flattenMenu } from './components/menuConfig';
import Dashboard from './pages/Dashboard';
import BasicSettings from './pages/settings/BasicSettings';
import StorageSettings from './pages/settings/StorageSettings';
import TimeMachine from './pages/data/TimeMachine';
import SyncLog from './pages/data/SyncLog';
import Tools from './pages/Tools';
import About from './pages/About';
import i18n from '../../locales/i18n';
import optionsStorage from '../../utils/optionsStorage';

// Initialize i18n language + theme from storage
(async () => {
  const s = await optionsStorage.getAll();
  if (s.language) i18n.changeLanguage(s.language);
  if (s.theme) {
    if (s.theme === 'auto') {
      const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.classList.toggle('theme-dark', dark);
      document.documentElement.classList.toggle('theme-light', !dark);
    } else if (s.theme === 'dark') {
      document.documentElement.classList.add('theme-dark');
      document.documentElement.classList.remove('theme-light');
    } else {
      document.documentElement.classList.add('theme-light');
      document.documentElement.classList.remove('theme-dark');
    }
  }
})();

const pageMap: Record<string, React.FC> = {
  dashboard: Dashboard,
  'settings-basic': BasicSettings,
  'settings-storage': StorageSettings,
  'data-timemachine': TimeMachine,
  'data-synclog': SyncLog,
  tools: Tools,
  about: About,
};

const flatMenu = flattenMenu([...menuConfig.top, ...(menuConfig.bottom ?? [])]);

function buildBreadcrumbs(activeKey: string, t: (key: string) => string): { label: string }[] {
  const crumbs: { label: string }[] = [];
  const info = flatMenu.get(activeKey);
  if (!info) return [{ label: activeKey }];
  if (info.parent) {
    const parent = flatMenu.get(info.parent);
    if (parent) crumbs.push({ label: t(parent.labelKey) });
  }
  crumbs.push({ label: t(info.labelKey) });
  return crumbs;
}

const App: React.FC = () => {
  const { t } = useTranslation();
  const [activeKey, setActiveKey] = useState('dashboard');
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set(['settings', 'data']));
  const [loaded, setLoaded] = useState(false);

  // Restore last active page on mount
  useEffect(() => {
    chrome.storage.local.get('optionsActiveKey').then(result => {
      if (result.optionsActiveKey) setActiveKey(result.optionsActiveKey);
      setLoaded(true);
    });
    // Listen for system color scheme changes
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      optionsStorage.getAll().then(s => {
        if (s.theme === 'auto') {
          document.documentElement.classList.toggle('theme-dark', mq.matches);
          document.documentElement.classList.toggle('theme-light', !mq.matches);
        }
      });
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const handleSelect = (key: string) => {
    setActiveKey(key);
    chrome.storage.local.set({ optionsActiveKey: key });
  };

  const handleToggle = (key: string) => {
    setExpandedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Auto-select first child when a parent is selected
  const resolvedKey = useMemo(() => {
    const info = flatMenu.get(activeKey);
    if (info && !info.parent && pageMap[activeKey]) return activeKey;
    // If activeKey is a parent without a page, select its first child
    for (const item of menuConfig.top) {
      if (item.key === activeKey && item.children?.length) {
        return item.children[0].key;
      }
    }
    for (const item of menuConfig.bottom ?? []) {
      if (item.key === activeKey && item.children?.length) {
        return item.children[0].key;
      }
    }
    return activeKey;
  }, [activeKey]);

  const PageComponent = pageMap[resolvedKey] || Dashboard;
  const breadcrumbs = buildBreadcrumbs(resolvedKey, t);

  return (
    <div className="options-layout">
      <Sidebar
        activeKey={resolvedKey}
        expandedKeys={expandedKeys}
        onSelect={handleSelect}
        onToggle={handleToggle}
      />
      <main className="options-content">
        <Breadcrumb items={breadcrumbs} />
        <div className="options-page">
          <PageComponent />
        </div>
      </main>
    </div>
  );
};

export default App;
