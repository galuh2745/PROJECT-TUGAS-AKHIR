'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MenuItem, MenuGroup } from './types';
import { ChevronDownIcon } from './icons';

// ─── Tooltip for collapsed mode ─────────────────────────────────────────────
const Tooltip: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="relative group">
    {children}
    <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3 px-3 py-1 bg-gray-900 text-white text-xs rounded-lg shadow-lg whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-200 z-50">
      {label}
      <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900" />
    </div>
  </div>
);

// ─── Grandchild (3rd level) ─────────────────────────────────────────────────
const SidebarGrandchildItem: React.FC<{ item: MenuItem }> = ({ item }) => {
  const pathname = usePathname();
  const isActive = pathname === item.href;

  return (
    <Link
      href={item.href || '#'}
      className={`
        flex items-center gap-2.5 w-full px-3 py-1.5 rounded-lg text-[13px]
        transition-all duration-200 ease-in-out
        ${isActive
          ? 'bg-blue-600 text-white font-medium shadow-md'
          : 'text-gray-500 hover:bg-blue-50 hover:text-blue-600'
        }
      `}
    >
      {item.icon && <span className={`shrink-0 ${isActive ? 'text-white' : 'text-gray-400'}`}>{item.icon}</span>}
      <span>{item.label}</span>
    </Link>
  );
};

// ─── Child (2nd level) ──────────────────────────────────────────────────────
interface SidebarChildItemProps {
  item: MenuItem;
  expandedItems: Record<string, boolean>;
  onToggle: (id: string) => void;
}

const SidebarChildItem: React.FC<SidebarChildItemProps> = ({ item, expandedItems, onToggle }) => {
  const pathname = usePathname();
  const isActive = pathname === item.href;
  const hasChildren = item.children && item.children.length > 0;
  const isExpanded = expandedItems[item.id] || false;
  const isChildActive = item.children?.some(child => pathname === child.href) || false;
  const shouldHighlight = isActive || isChildActive;

  if (hasChildren) {
    return (
      <div>
        <button
          onClick={() => onToggle(item.id)}
          className={`
            flex items-center justify-between w-full px-3 py-2 rounded-lg text-[13px]
            transition-all duration-200 ease-in-out
            ${shouldHighlight
              ? 'bg-blue-50 text-blue-600 font-medium'
              : 'text-gray-500 hover:bg-blue-50 hover:text-blue-600'
            }
          `}
        >
          <div className="flex items-center gap-2.5">
            {item.icon && <span className={`shrink-0 ${shouldHighlight ? 'text-blue-500' : 'text-gray-400'}`}>{item.icon}</span>}
            <span>{item.label}</span>
          </div>
          <ChevronDownIcon className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? '' : '-rotate-90'}`} />
        </button>
        <div className={`overflow-hidden transition-all duration-200 ease-in-out ${isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
          <div className="ml-3 mt-0.5 space-y-0.5 border-l-2 border-gray-100 pl-3">
            {item.children?.map((child) => (
              <SidebarGrandchildItem key={child.id} item={child} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <Link
      href={item.href || '#'}
      className={`
        flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-[13px]
        transition-all duration-200 ease-in-out
        ${isActive
          ? 'bg-blue-600 text-white font-medium shadow-md'
          : 'text-gray-500 hover:bg-blue-50 hover:text-blue-600'
        }
      `}
    >
      {item.icon && <span className={`shrink-0 ${isActive ? 'text-white' : 'text-gray-400'}`}>{item.icon}</span>}
      <span>{item.label}</span>
      {item.badge && (
        <span className={`ml-auto px-2 py-0.5 text-xs font-semibold rounded-full ${
          /^\d+$/.test(item.badge)
            ? 'bg-red-500 text-white min-w-5 text-center'
            : 'bg-amber-100 text-amber-700'
        }`}>
          {item.badge}
        </span>
      )}
    </Link>
  );
};

// ─── Parent (1st level) ─────────────────────────────────────────────────────
interface SidebarMenuItemProps {
  item: MenuItem;
  isExpanded: boolean;
  onToggle: () => void;
  isCollapsed?: boolean;
  expandedItems: Record<string, boolean>;
  onToggleChild: (id: string) => void;
}

const SidebarMenuItem: React.FC<SidebarMenuItemProps> = ({
  item, isExpanded, onToggle, isCollapsed = false, expandedItems, onToggleChild,
}) => {
  const pathname = usePathname();
  const hasChildren = item.children && item.children.length > 0;

  const isActive = pathname === item.href;
  const isChildActive = item.children?.some(child => pathname === child.href) || false;
  const isGrandchildActive = item.children?.some(child =>
    child.children?.some(grandchild => pathname === grandchild.href)
  ) || false;
  const shouldHighlight = isActive || isChildActive || isGrandchildActive;

  // ── Collapsed mode ──
  if (isCollapsed) {
    const content = (
      <div
        className={`
          relative flex items-center justify-center w-10 h-10 mx-auto rounded-xl
          transition-all duration-200
          ${item.isDisabled
            ? 'text-gray-300 cursor-not-allowed'
            : shouldHighlight
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-gray-500 hover:bg-blue-50 hover:text-blue-600'
          }
        `}
      >
        {item.icon && <span className="shrink-0">{item.icon}</span>}
        {item.badge && /^\d+$/.test(item.badge) && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center ring-2 ring-white">
            {item.badge}
          </span>
        )}
      </div>
    );

    if (item.isDisabled) return <div className="mb-1">{content}</div>;
    if (item.href) return <div className="mb-1"><Tooltip label={item.label}><Link href={item.href}>{content}</Link></Tooltip></div>;
    return <div className="mb-1"><Tooltip label={item.label}><button onClick={onToggle} className="w-full">{content}</button></Tooltip></div>;
  }

  // ── Disabled ──
  if (item.isDisabled) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl text-gray-300 cursor-not-allowed text-sm">
        {item.icon && <span className="shrink-0">{item.icon}</span>}
        <span>{item.label}</span>
        {item.badge && (
          <span className="ml-auto px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-400">
            {item.badge}
          </span>
        )}
      </div>
    );
  }

  // ── With children (expandable) ──
  if (hasChildren) {
    return (
      <div>
        <button
          onClick={onToggle}
          className={`
            flex items-center justify-between w-full px-4 py-3 rounded-xl text-sm
            transition-all duration-200 ease-in-out group
            ${shouldHighlight
              ? 'bg-blue-600 text-white font-semibold shadow-md'
              : 'text-gray-600 hover:bg-blue-50 hover:text-blue-600 hover:translate-x-1'
            }
          `}
        >
          <div className="flex items-center gap-3">
            {item.icon && (
              <span className={`shrink-0 transition-all duration-200 group-hover:scale-110 ${shouldHighlight ? 'text-white' : 'text-gray-500 group-hover:text-blue-600'}`}>
                {item.icon}
              </span>
            )}
            <span>{item.label}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {item.badge && (
              <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                shouldHighlight
                  ? 'bg-white/20 text-white'
                  : /^\d+$/.test(item.badge)
                    ? 'bg-red-500 text-white min-w-5 text-center'
                    : 'bg-amber-100 text-amber-700'
              }`}>
                {item.badge}
              </span>
            )}
            <ChevronDownIcon className={`w-4 h-4 transition-transform duration-200 ${shouldHighlight ? 'text-white/70' : 'text-gray-400'} ${isExpanded ? '' : '-rotate-90'}`} />
          </div>
        </button>
        <div className={`overflow-hidden transition-all duration-200 ease-in-out ${isExpanded ? 'max-h-125 opacity-100' : 'max-h-0 opacity-0'}`}>
          <div className="ml-4 mt-1 space-y-0.5 border-l-2 border-gray-100 pl-3">
            {item.children?.map((child) => (
              <SidebarChildItem key={child.id} item={child} expandedItems={expandedItems} onToggle={onToggleChild} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Single link item ──
  return (
    <Link
      href={item.href || '#'}
      className={`
        flex items-center justify-between w-full px-4 py-3 rounded-xl text-sm
        transition-all duration-200 ease-in-out group
        ${isActive
          ? 'bg-blue-600 text-white font-semibold shadow-md'
          : 'text-gray-600 hover:bg-blue-50 hover:text-blue-600 hover:translate-x-1'
        }
      `}
    >
      <div className="flex items-center gap-3">
        {item.icon && (
          <span className={`shrink-0 transition-all duration-200 group-hover:scale-110 ${isActive ? 'text-white' : 'text-gray-500 group-hover:text-blue-600'}`}>
            {item.icon}
          </span>
        )}
        <span>{item.label}</span>
      </div>
      {item.badge && (
        <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
          isActive
            ? 'bg-white/20 text-white'
            : /^\d+$/.test(item.badge)
              ? 'bg-red-500 text-white min-w-5 text-center'
              : 'bg-amber-100 text-amber-700'
        }`}>
          {item.badge}
        </span>
      )}
    </Link>
  );
};

// ─── Menu with groups support ───────────────────────────────────────────────
interface SidebarMenuProps {
  items?: MenuItem[];
  groups?: MenuGroup[];
  isCollapsed?: boolean;
}

export const SidebarMenu: React.FC<SidebarMenuProps> = ({ items, groups, isCollapsed = false }) => {
  const pathname = usePathname();

  const getInitialExpandedState = (menuItems: MenuItem[]) => {
    const expanded: Record<string, boolean> = {};
    menuItems.forEach(item => {
      if (item.children) {
        const hasActiveChild = item.children.some(child => pathname === child.href);
        const hasActiveGrandchild = item.children.some(child =>
          child.children?.some(grandchild => pathname === grandchild.href)
        );
        expanded[item.id] = hasActiveChild || hasActiveGrandchild;

        item.children.forEach(child => {
          if (child.children) {
            const hasActiveGC = child.children.some(gc => pathname === gc.href);
            expanded[child.id] = hasActiveGC;
          }
        });
      }
    });
    return expanded;
  };

  const allItems = groups ? groups.flatMap(g => g.items) : (items || []);
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>(getInitialExpandedState(allItems));

  const toggleItem = (itemId: string) => {
    setExpandedItems(prev => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  const renderItem = (item: MenuItem) => (
    <SidebarMenuItem
      key={item.id}
      item={item}
      isExpanded={expandedItems[item.id] || false}
      onToggle={() => toggleItem(item.id)}
      isCollapsed={isCollapsed}
      expandedItems={expandedItems}
      onToggleChild={toggleItem}
    />
  );

  // ── Grouped rendering ──
  if (groups) {
    return (
      <nav className="space-y-6">
        {groups.map((group, idx) => (
          <div key={idx}>
            {!isCollapsed && (
              <div className="px-4 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                  {group.title}
                </span>
              </div>
            )}
            {isCollapsed && idx > 0 && (
              <div className="mx-3 mb-2 border-t border-gray-100" />
            )}
            <div className="space-y-1">
              {group.items.map(renderItem)}
            </div>
          </div>
        ))}
      </nav>
    );
  }

  // ── Flat rendering (backward compat) ──
  return (
    <nav className="space-y-1">
      {(items || []).map(renderItem)}
    </nav>
  );
};

export default SidebarMenu;
