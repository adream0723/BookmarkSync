import React from 'react';

interface BreadcrumbProps {
  items: { label: string }[];
}

const Breadcrumb: React.FC<BreadcrumbProps> = ({ items }) => {
  return (
    <nav className="options-breadcrumb">
      {items.map((item, i) => (
        <span key={i}>
          {i > 0 && <span className="breadcrumb-sep">›</span>}
          <span className={i === items.length - 1 ? 'breadcrumb-current' : 'breadcrumb-parent'}>
            {item.label}
          </span>
        </span>
      ))}
    </nav>
  );
};

export default Breadcrumb;
