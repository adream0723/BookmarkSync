export interface MenuItem {
  key: string;
  labelKey: string;
  icon?: string;
  children?: MenuItem[];
}

export interface MenuConfig {
  top: MenuItem[];
  bottom?: MenuItem[];
}

export const menuConfig: MenuConfig = {
  top: [
    { key: 'dashboard', labelKey: 'dashboard.title', icon: '📊' },
    {
      key: 'settings', labelKey: 'nav.settings', icon: '⚙️',
      children: [
        { key: 'settings-basic', labelKey: 'nav.basic' },
        { key: 'settings-storage', labelKey: 'nav.storage' },
      ],
    },
    {
      key: 'data', labelKey: 'nav.data', icon: '📦',
      children: [
        { key: 'data-timemachine', labelKey: 'nav.timemachine' },
        { key: 'data-synclog', labelKey: 'nav.synclog' },
      ],
    },
    { key: 'tools', labelKey: 'nav.tools', icon: '🔧' },
  ],
  bottom: [
    { key: 'about', labelKey: 'nav.about', icon: 'ℹ️' },
  ],
};

/** Flatten menu tree for breadcrumb lookup */
export function flattenMenu(items: MenuItem[]): Map<string, { labelKey: string; parent?: string }> {
  const map = new Map<string, { labelKey: string; parent?: string }>();
  function walk(list: MenuItem[], parentKey?: string) {
    for (const item of list) {
      map.set(item.key, { labelKey: item.labelKey, parent: parentKey });
      if (item.children) walk(item.children, item.key);
    }
  }
  walk(items);
  return map;
}
