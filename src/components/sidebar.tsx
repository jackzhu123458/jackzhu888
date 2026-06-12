'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/', label: '工作台', icon: '⊞' },
  { href: '/customers', label: '客户管理', icon: '◉' },
  { href: '/orders', label: '客户订单', icon: '▤' },
  { href: '/bom', label: '商品资料', icon: '☰' },
  { href: '/production', label: '生产订单', icon: '⚙' },
  { href: '/inbound', label: '入库单', icon: '↓' },
  { href: '/delivery', label: '送货单', icon: '→' },
  { href: '/reconciliation', label: '对账管理', icon: '⇌' },
  { href: '/inventory', label: '库存管理', icon: '▦' },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-[240px] bg-[#1F2937] text-white flex flex-col z-50">
      <div className="h-16 flex items-center px-5 border-b border-white/10">
        <span className="text-lg font-semibold tracking-tight">仓库进销存</span>
      </div>
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
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
      <div className="px-5 py-3 border-t border-white/10 text-xs text-gray-500">
        v1.0.0
      </div>
    </aside>
  );
}
