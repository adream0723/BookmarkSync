import React from 'react';
import { useTranslation } from 'react-i18next';
import { MenuItem, menuConfig } from './menuConfig';

interface SidebarProps {
  activeKey: string;
  expandedKeys: Set<string>;
  onSelect: (key: string) => void;
  onToggle: (key: string) => void;
}

const SidebarItem: React.FC<{
  item: MenuItem;
  depth: number;
  activeKey: string;
  expandedKeys: Set<string>;
  onSelect: (key: string) => void;
  onToggle: (key: string) => void;
}> = ({ item, depth, activeKey, expandedKeys, onSelect, onToggle }) => {
  const hasChildren = !!item.children?.length;
  const isExpanded = expandedKeys.has(item.key);
  const isActive = activeKey === item.key;

  const handleClick = () => {
    if (hasChildren) {
      onToggle(item.key);
    } else {
      onSelect(item.key);
    }
  };

  const { t } = useTranslation();
  return (
    <>
      <div
        className={`sidebar-item ${isActive ? 'active' : ''} ${depth > 0 ? 'sidebar-item-child' : ''}`}
        style={{ paddingLeft: 12 + depth * 16 }}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && handleClick()}
      >
        {item.icon && <span className="sidebar-item-icon">{item.icon}</span>}
        <span className="sidebar-item-label">{t(item.labelKey)}</span>
        {hasChildren && (
          <span className={`sidebar-chevron ${isExpanded ? 'expanded' : ''}`}>▶</span>
        )}
      </div>
      {hasChildren && isExpanded && item.children!.map(child => (
        <SidebarItem
          key={child.key}
          item={child}
          depth={depth + 1}
          activeKey={activeKey}
          expandedKeys={expandedKeys}
          onSelect={onSelect}
          onToggle={onToggle}
        />
      ))}
    </>
  );
};

const Sidebar: React.FC<SidebarProps> = ({ activeKey, expandedKeys, onSelect, onToggle }) => {
  return (
    <div className="options-sidebar">
      <div className="sidebar-brand">BookmarkSync</div>
      <nav className="sidebar-nav">
        {menuConfig.top.map(item => (
          <SidebarItem
            key={item.key}
            item={item}
            depth={0}
            activeKey={activeKey}
            expandedKeys={expandedKeys}
            onSelect={onSelect}
            onToggle={onToggle}
          />
        ))}
      </nav>
      <div className="sidebar-bottom">
        {menuConfig.bottom!.map(item => (
          <SidebarItem
            key={item.key}
            item={item}
            depth={0}
            activeKey={activeKey}
            expandedKeys={expandedKeys}
            onSelect={onSelect}
            onToggle={onToggle}
          />
        ))}
      </div>
    </div>
  );
};

export default Sidebar;
