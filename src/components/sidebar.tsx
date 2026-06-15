'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/auth-context';

interface NavItem {
  href?: string;
  label: string;
  icon: string;
  permission?: string;
  children?: { href: string; label: string; icon: string; permission?: string }[];
}

const navItems: NavItem[] = [
  { href: '/', label: '工作台', icon: '⊞', permission: 'dashboard' },
  {
    label: '基础资料',
    icon: '◫',
    children: [
      { href: '/customers', label: '客户管理', icon: '◉', permission: 'customers' },
      { href: '/bom', label: '商品资料', icon: '☰', permission: 'products' },
      { href: '/drawings', label: '图纸管理', icon: '⊞', permission: 'drawings' },
    ],
  },
  { href: '/orders', label: '客户订单', icon: '▤', permission: 'orders' },
  { href: '/production', label: '生产订单', icon: '⚙', permission: 'production' },
  { href: '/inbound', label: '入库单', icon: '↓', permission: 'inbound' },
  { href: '/inventory', label: '库存管理', icon: '▦', permission: 'inventory' },
  { href: '/delivery', label: '送货单', icon: '→', permission: 'delivery' },
  { href: '/reconciliation', label: '对账管理', icon: '▦', permission: 'reconciliation' },
  {
    label: '系统管理',
    icon: '▦',
    children: [
      { href: '/settings', label: '系统设置', icon: '◈', permission: 'settings' },
      { href: '/system/users', label: '用户管理', icon: '◈', permission: 'system:users' },
      { href: '/system/roles', label: '角色管理', icon: '◇', permission: 'system:roles' },
    ],
  },
  { href: '/backup', label: '备份恢复', icon: '⬡', permission: 'backup' },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, hasPermission, logout } = useAuth();
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (label: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const isGroupActive = (children: { href: string }[]) =>
    children.some((c) => pathname === c.href || pathname.startsWith(c.href));

  // 过滤掉没有权限的菜单项
  const filterNavItems = (items: NavItem[]) => {
    return items.filter(item => {
      if (item.children) {
        const filteredChildren = item.children.filter(child =>
          !child.permission || hasPermission(child.permission)
        );
        return filteredChildren.length > 0;
      }
      return !item.permission || hasPermission(item.permission);
    }).map(item => {
      if (item.children) {
        return { ...item, children: item.children.filter(child =>
          !child.permission || hasPermission(child.permission)
        )};
      }
      return item;
    });
  };

  const visibleItems = filterNavItems(navItems);

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-[240px] bg-[#1F2937] text-white flex flex-col z-50">
      <div className="h-16 flex items-center px-5 border-b border-white/10">
        <span className="text-lg font-semibold tracking-tight">仓库进销存</span>
      </div>
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {visibleItems.map((item) => {
          if (item.children) {
            const collapsed = collapsedGroups[item.label];
            const active = isGroupActive(item.children);
            return (
              <div key={item.label}>
                <button
                  onClick={() => toggleGroup(item.label)}
                  className={cn(
                    'w-full flex items-center justify-between px-3 py-2.5 rounded-md text-sm transition-colors',
                    active
                      ? 'text-white'
                      : 'text-gray-300 hover:bg-white/10 hover:text-white'
                  )}
                >
                  <span className="flex items-center gap-3">
                    <span className="text-base w-5 text-center opacity-70">{item.icon}</span>
                    <span className={cn(active && 'font-medium')}>{item.label}</span>
                  </span>
                  <span
                    className={cn(
                      'text-xs transition-transform duration-200',
                      !collapsed && 'rotate-90'
                    )}
                  >
                    ▸
                  </span>
                </button>
                {!collapsed && (
                  <div className="ml-5 mt-1 space-y-1 border-l border-white/10 pl-3">
                    {item.children.map((child) => {
                      const childActive =
                        pathname === child.href ||
                        (child.href !== '/' && pathname.startsWith(child.href));
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={cn(
                            'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                            childActive
                              ? 'bg-[#1E40AF] text-white'
                              : 'text-gray-400 hover:bg-white/10 hover:text-white'
                          )}
                        >
                          <span className="text-xs w-4 text-center opacity-70">{child.icon}</span>
                          <span>{child.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          const isActive =
            pathname === item.href || (item.href !== '/' && item.href && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href!}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors',
                isActive
                  ? 'bg-[#1E40AF] text-white'
                  : 'text-gray-300 hover:bg-white/10 hover:text-white'
              )}
            >
              <span className="text-base w-5 text-center opacity-70">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      {/* 用户信息区域 */}
      <div className="px-3 py-3 border-t border-white/10">
        <div className="flex items-center gap-2 px-3 py-2">
          <div className="w-8 h-8 rounded-full bg-[#1E40AF] flex items-center justify-center text-sm font-medium">
            {user?.display_name?.charAt(0) || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm text-white truncate">{user?.display_name || '未知用户'}</div>
            <div className="text-xs text-gray-500 truncate">{user?.username || ''}</div>
          </div>
          <button
            onClick={logout}
            className="text-gray-500 hover:text-white transition-colors p-1"
            title="退出登录"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
