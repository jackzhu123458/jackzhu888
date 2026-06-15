'use client';

import { useEffect, useState } from 'react';
import {
  Package, Users, Truck, ArrowDownRight, ArrowUpRight,
  Factory, FileText, TrendingUp, AlertTriangle, Clock
} from 'lucide-react';

interface DashboardData {
  totalInventory: number;
  totalReserved: number;
  totalAvailable: number;
  productCount: number;
  customerCount: number;
  bomCount: number;
  customerOrderStats: Record<string, number>;
  productionStats: Record<string, number>;
  inventoryByWarehouse: Array<{
    warehouse_id: string;
    warehouse_name: string;
    quantity: number;
    reserved: number;
    available: number;
    item_count: number;
  }>;
  topProducts: Array<{
    id: string;
    code: string;
    name: string;
    total_quantity: number;
  }>;
  recentActivities: Array<{
    id: string;
    type: string;
    note_no: string;
    detail: string;
    time: string;
    status: string;
  }>;
  recentProduction: Array<{
    id: string;
    order_no: string;
    status: string;
    quantity: number;
    created_at: string;
    due_date: string | null;
    products: { name: string; code: string } | { name: string; code: string }[];
    customers: { name: string } | { name: string }[];
  }>;
  inProgressProduction: Array<{
    id: string;
    order_no: string;
    status: string;
    quantity: number;
    due_date: string | null;
    products: { name: string; code: string } | { name: string; code: string }[];
    customers: { name: string } | { name: string }[];
  }>;
  pendingProduction: Array<{
    id: string;
    order_no: string;
    status: string;
    quantity: number;
    due_date: string | null;
    products: { name: string; code: string } | { name: string; code: string }[];
    customers: { name: string } | { name: string }[];
  }>;
  recentCustomerOrders: Array<{
    id: string;
    order_no: string;
    status: string;
    created_at: string;
    customers: { name: string } | { name: string }[];
  }>;
  ganttOrders: Array<{
    id: string;
    order_no: string;
    status: string;
    quantity: number;
    due_date: string | null;
    created_at: string;
    product_code: string;
    product_name: string;
    customer_id: string;
    customer_name: string;
  }>;
}

const orderStatusMap: Record<string, { label: string; color: string }> = {
  pending: { label: '待处理', color: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  confirmed: { label: '已确认', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  completed: { label: '已完成', color: 'bg-green-50 text-green-700 border-green-200' },
  cancelled: { label: '已取消', color: 'bg-red-50 text-red-700 border-red-200' },
};

function getRelName<T>(val: T | T[] | null | undefined): T | null {
  if (!val) return null;
  if (Array.isArray(val)) return val[0] || null;
  return val;
}

function formatTime(iso: string, nowMs: number): string {
  const d = new Date(iso);
  const diff = nowMs - d.getTime();
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function formatNumber(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + '万';
  return n.toLocaleString();
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [todayStr, setTodayStr] = useState('');
  const [now, setNow] = useState<number>(0);

  useEffect(() => {
    setTodayStr(new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }));
    setNow(Date.now());
    fetch('/api/dashboard')
      .then(res => res.json())
      .then(setData)
      .catch(() => {});
  }, []);

  if (!data) {
    return <div className="p-8 text-gray-500">加载中...</div>;
  }

  const totalCustomerOrders = Object.values(data.customerOrderStats).reduce((a, b) => a + b, 0);
  const pendingOrders = data.customerOrderStats['pending'] || 0;
  const confirmedOrders = data.customerOrderStats['confirmed'] || 0;
  const totalProduction = Object.values(data.productionStats).reduce((a, b) => a + b, 0);
  const pendingProduction = data.productionStats['pending'] || 0;
  const inProgressProduction = data.productionStats['in_progress'] || 0;
  const completedProduction = data.productionStats['completed'] || 0;

  return (
    <div className="p-6 space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">工作台</h1>
        <span className="text-sm text-gray-500">{todayStr}</span>
      </div>

      {/* 顶部核心指标 */}
      <div className="grid grid-cols-6 gap-4">
        <MetricCard
          icon={<Package className="h-5 w-5" />}
          label="库存总量"
          value={data.totalInventory}
          unit="件"
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
          sub={`可用 ${formatNumber(data.totalAvailable)}`}
        />
        <MetricCard
          icon={<ArrowDownRight className="h-5 w-5" />}
          label="预留库存"
          value={data.totalReserved}
          unit="件"
          iconBg="bg-orange-50"
          iconColor="text-orange-600"
          sub="已预扣待出货"
        />
        <MetricCard
          icon={<FileText className="h-5 w-5" />}
          label="客户订单"
          value={totalCustomerOrders}
          unit="单"
          iconBg="bg-indigo-50"
          iconColor="text-indigo-600"
          sub={`待处理 ${pendingOrders} / 已确认 ${confirmedOrders}`}
        />
        <MetricCard
          icon={<Factory className="h-5 w-5" />}
          label="生产订单"
          value={totalProduction}
          unit="单"
          iconBg="bg-amber-50"
          iconColor="text-amber-600"
          sub={`待生产 ${pendingProduction} / 生产中 ${inProgressProduction}`}
        />
        <MetricCard
          icon={<Package className="h-5 w-5" />}
          label="物料种类"
          value={data.productCount}
          unit="种"
          iconBg="bg-teal-50"
          iconColor="text-teal-600"
          sub={`BOM配方 ${data.bomCount}`}
        />
        <MetricCard
          icon={<Users className="h-5 w-5" />}
          label="客户数"
          value={data.customerCount}
          unit="家"
          iconBg="bg-purple-50"
          iconColor="text-purple-600"
          sub=""
        />
      </div>

      {/* 中间区域：生产计划甘特图 + 生产状态 */}
      <div className="grid grid-cols-3 gap-6">
        {/* 生产计划甘特图 */}
        <div className="col-span-2 bg-white border border-gray-200 rounded-lg">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <h2 className="font-medium text-gray-900">生产计划甘特图</h2>
            <span className="text-xs text-gray-500">{data.ganttOrders.length} 笔活跃订单</span>
          </div>
          <GanttChart orders={data.ganttOrders} />
        </div>

        {/* 生产状态概览 */}
        <div className="bg-white border border-gray-200 rounded-lg">
          <div className="px-4 py-3 border-b border-gray-200">
            <h2 className="font-medium text-gray-900">生产状态概览</h2>
          </div>
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">生产订单总数</span>
              <span className="text-lg font-semibold text-gray-900">{totalProduction}</span>
            </div>
            {/* 状态条 */}
            {totalProduction > 0 && (
              <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden flex">
                {pendingProduction > 0 && (
                  <div className="bg-yellow-400 h-full" style={{ width: `${(pendingProduction / totalProduction) * 100}%` }} title={`待生产 ${pendingProduction}`} />
                )}
                {inProgressProduction > 0 && (
                  <div className="bg-blue-400 h-full" style={{ width: `${(inProgressProduction / totalProduction) * 100}%` }} title={`生产中 ${inProgressProduction}`} />
                )}
                {completedProduction > 0 && (
                  <div className="bg-green-400 h-full" style={{ width: `${(completedProduction / totalProduction) * 100}%` }} title={`已完成 ${completedProduction}`} />
                )}
              </div>
            )}
            <div className="space-y-2">
              <StatusLine label="待生产" count={pendingProduction} color="bg-yellow-400" />
              <StatusLine label="生产中" count={inProgressProduction} color="bg-blue-400" />
              <StatusLine label="已完成" count={completedProduction} color="bg-green-400" />
              <StatusLine label="已取消" count={data.productionStats['cancelled'] || 0} color="bg-red-400" />
            </div>

            {/* 客户订单状态 */}
            <div className="pt-3 border-t border-gray-200">
              <div className="text-xs font-medium text-gray-500 mb-2">客户订单状态</div>
              <div className="space-y-2">
                <StatusLine label="待处理" count={pendingOrders} color="bg-yellow-400" />
                <StatusLine label="已确认" count={confirmedOrders} color="bg-blue-400" />
                <StatusLine label="已完成" count={data.customerOrderStats['completed'] || 0} color="bg-green-400" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 底部区域：物料TOP10 + 最近动态 + 最近订单 */}
      <div className="grid grid-cols-3 gap-6">
        {/* 物料库存TOP10 */}
        <div className="bg-white border border-gray-200 rounded-lg">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <h2 className="font-medium text-gray-900">物料库存 TOP10</h2>
            <TrendingUp className="h-4 w-4 text-gray-400" />
          </div>
          {data.topProducts.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">暂无数据</div>
          ) : (
            <div className="p-4 space-y-2.5">
              {data.topProducts.map((p, idx) => {
                const maxQty = data.topProducts[0]?.total_quantity || 1;
                const pct = Math.round((p.total_quantity / maxQty) * 100);
                return (
                  <div key={p.id} className="flex items-center gap-3">
                    <span className={`text-xs font-mono w-5 text-right ${idx < 3 ? 'text-blue-600 font-bold' : 'text-gray-400'}`}>
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs text-gray-900 truncate" title={p.name}>{p.name}</span>
                        <span className="text-xs font-mono text-gray-600 ml-2">{formatNumber(p.total_quantity)}</span>
                      </div>
                      <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 库存分布（按仓库） */}
        <div className="bg-white border border-gray-200 rounded-lg">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <h2 className="font-medium text-gray-900">库存分布</h2>
            <span className="text-xs text-gray-500">{data.inventoryByWarehouse.length} 仓</span>
          </div>
          {data.inventoryByWarehouse.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">暂无数据</div>
          ) : (
            <div className="p-3 space-y-2">
              {data.inventoryByWarehouse.map(wh => (
                <div key={wh.warehouse_id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700 truncate">{wh.warehouse_name}</span>
                  <div className="flex items-center gap-3 ml-2">
                    <span className="font-mono text-gray-900">{formatNumber(wh.quantity)}</span>
                    <span className="font-mono text-green-600 text-xs">{formatNumber(wh.available)}可</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 生产中订单 */}
        <div className="bg-white border border-gray-200 rounded-lg">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <h2 className="font-medium text-gray-900">生产中订单</h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
              {(data.inProgressProduction?.length || 0)} 笔
            </span>
          </div>
          {(data.inProgressProduction?.length || 0) === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">暂无生产中订单</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {data.inProgressProduction.map(po => {
                const prod = getRelName(po.products);
                const cust = getRelName(po.customers);
                const isUrgent = now > 0 && po.due_date && new Date(po.due_date).getTime() - now < 3 * 86400000;
                const isOverdue = now > 0 && po.due_date && new Date(po.due_date).getTime() < now;
                return (
                  <div key={po.id} className="px-4 py-2.5 flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono text-gray-900">{po.order_no}</span>
                        {isOverdue ? (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700 animate-pulse">已逾期</span>
                        ) : isUrgent ? (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">紧急</span>
                        ) : null}
                      </div>
                      <div className="text-xs text-gray-500 truncate">
                        {String(prod?.name || '-')} · {String(cust?.name || '-')} · <span className="font-mono">{po.quantity}</span>
                      </div>
                      {po.due_date && (
                        <div className={`text-xs mt-0.5 ${isOverdue ? 'text-red-600' : isUrgent ? 'text-orange-600' : 'text-gray-400'}`}>
                          交期: {po.due_date.substring(0, 10)}
                        </div>
                      )}
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded border bg-blue-50 text-blue-700 border-blue-200">
                      生产中
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          {/* 待生产订单折叠 */}
          {(data.pendingProduction?.length || 0) > 0 && (
            <div className="px-4 py-2 border-t border-gray-100 bg-gray-50">
              <div className="text-xs text-gray-500">
                待生产: <span className="font-mono">{data.pendingProduction.length}</span> 笔
                {now > 0 && data.pendingProduction.some(po => po.due_date && new Date(po.due_date).getTime() - now < 3 * 86400000) && (
                  <span className="ml-2 text-orange-600">含紧急订单</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  icon, label, value, unit, iconBg, iconColor, sub
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  unit: string;
  iconBg: string;
  iconColor: string;
  sub: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-center gap-3 mb-2">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${iconBg} ${iconColor}`}>
          {icon}
        </div>
        <span className="text-sm text-gray-500">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-semibold text-gray-900 font-mono">{formatNumber(value)}</span>
        <span className="text-xs text-gray-400">{unit}</span>
      </div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}

function StatusLine({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className={`w-2.5 h-2.5 rounded-sm ${color}`} />
        <span className="text-xs text-gray-600">{label}</span>
      </div>
      <span className="text-xs font-mono font-medium text-gray-900">{count}</span>
    </div>
  );
}

function GanttChart({ orders }: { orders: DashboardData['ganttOrders'] }) {
  if (orders.length === 0) {
    return <div className="p-8 text-center text-sm text-gray-400">暂无活跃生产订单</div>;
  }

  // Group by customer
  const customerGroups = new Map<string, typeof orders>();
  for (const o of orders) {
    const key = o.customer_name || '未分配';
    if (!customerGroups.has(key)) customerGroups.set(key, []);
    customerGroups.get(key)!.push(o);
  }

  // Calculate date range: from earliest created_at to latest due_date, with padding
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const allDates: number[] = [today.getTime()];
  for (const o of orders) {
    if (o.created_at) allDates.push(new Date(o.created_at).getTime());
    if (o.due_date) allDates.push(new Date(o.due_date).getTime());
  }
  const minDate = new Date(Math.min(...allDates));
  const maxDate = new Date(Math.max(...allDates));
  // Add padding: 3 days before min, 3 days after max
  const rangeStart = new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate() - 3);
  const rangeEnd = new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate() + 4);
  const totalDays = Math.ceil((rangeEnd.getTime() - rangeStart.getTime()) / 86400000);
  const dayWidth = 28; // px per day
  const leftColWidth = 180; // customer + product name width

  const todayOffset = Math.floor((today.getTime() - rangeStart.getTime()) / 86400000);

  // Date header: show day markers
  const headerDays: { label: string; offset: number; isToday: boolean; isWeekend: boolean }[] = [];
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(rangeStart.getTime() + i * 86400000);
    const isToday = d.getTime() === today.getTime();
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    if (i % 3 === 0 || isToday) {
      headerDays.push({
        label: `${d.getMonth() + 1}/${d.getDate()}`,
        offset: i,
        isToday,
        isWeekend,
      });
    }
  }

  function getBarStyle(order: (typeof orders)[0]) {
    const startDate = order.created_at ? new Date(order.created_at) : today;
    const endDate = order.due_date ? new Date(order.due_date) : new Date(today.getTime() + 7 * 86400000);
    const startOffset = Math.max(0, Math.floor((startDate.getTime() - rangeStart.getTime()) / 86400000));
    const endOffset = Math.min(totalDays, Math.ceil((endDate.getTime() - rangeStart.getTime()) / 86400000));
    const barDays = Math.max(1, endOffset - startOffset);
    const isUrgent = order.due_date && new Date(order.due_date).getTime() - now.getTime() < 3 * 86400000;
    const isOverdue = order.due_date && new Date(order.due_date).getTime() < now.getTime();
    const barColor = isOverdue ? 'bg-red-400' : isUrgent ? 'bg-orange-400' : order.status === 'in_progress' ? 'bg-blue-500' : 'bg-yellow-400';
    const barBorder = isOverdue ? 'border-red-500' : isUrgent ? 'border-orange-500' : order.status === 'in_progress' ? 'border-blue-600' : 'border-yellow-500';
    return { left: startOffset * dayWidth, width: barDays * dayWidth - 2, barColor, barBorder, isOverdue, isUrgent };
  }

  const statusLabel: Record<string, string> = { pending: '待生产', in_progress: '生产中' };

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: leftColWidth + totalDays * dayWidth + 20 }}>
        {/* Date header */}
        <div className="flex border-b border-gray-200 bg-gray-50">
          <div className="flex-shrink-0 border-r border-gray-200" style={{ width: leftColWidth }} />
          <div className="relative" style={{ width: totalDays * dayWidth }}>
            {headerDays.map(hd => (
              <div
                key={hd.offset}
                className={`absolute text-xs ${hd.isToday ? 'text-blue-600 font-bold' : hd.isWeekend ? 'text-gray-400' : 'text-gray-500'}`}
                style={{ left: hd.offset * dayWidth, top: 6 }}
              >
                {hd.label}
              </div>
            ))}
            <div className="h-6" />
          </div>
        </div>

        {/* Gantt rows */}
        {Array.from(customerGroups.entries()).map(([customer, customerOrders]) => (
          <div key={customer}>
            {/* Customer group header */}
            <div className="flex bg-gray-50/80 border-b border-gray-100">
              <div className="flex-shrink-0 border-r border-gray-200 px-3 py-1.5" style={{ width: leftColWidth }}>
                <span className="text-xs font-medium text-gray-700 truncate block">{customer}</span>
              </div>
              <div className="relative" style={{ width: totalDays * dayWidth }}>
                <div className="h-6" />
              </div>
            </div>
            {/* Orders in this customer group */}
            {customerOrders.map(order => {
              const bar = getBarStyle(order);
              return (
                <div key={order.id} className="flex border-b border-gray-50 hover:bg-gray-50/50">
                  <div className="flex-shrink-0 border-r border-gray-200 px-3 py-1.5" style={{ width: leftColWidth }}>
                    <div className="text-xs text-gray-900 truncate" title={order.product_name}>
                      {order.product_name || order.order_no}
                    </div>
                    <div className="text-xs text-gray-400 font-mono">
                      {order.quantity}个 · {statusLabel[order.status] || order.status}
                    </div>
                  </div>
                  <div className="relative" style={{ width: totalDays * dayWidth }}>
                    <div className="h-9" />
                    {/* Weekend backgrounds */}
                    {Array.from({ length: totalDays }, (_, i) => {
                      const d = new Date(rangeStart.getTime() + i * 86400000);
                      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                      if (!isWeekend) return null;
                      return <div key={i} className="absolute top-0 bottom-0 bg-gray-50/60" style={{ left: i * dayWidth, width: dayWidth }} />;
                    })}
                    {/* Today line */}
                    {todayOffset >= 0 && todayOffset < totalDays && (
                      <div className="absolute top-0 bottom-0 w-0.5 bg-blue-400 z-10" style={{ left: todayOffset * dayWidth + dayWidth / 2 }}>
                        <div className="absolute -top-0.5 -left-1 w-2.5 h-2.5 rounded-full bg-blue-500" />
                      </div>
                    )}
                    {/* Bar */}
                    <div
                      className={`absolute top-1.5 h-6 rounded-sm ${bar.barColor} border ${bar.barBorder} opacity-90 hover:opacity-100 transition-opacity cursor-pointer flex items-center px-1.5 z-20`}
                      style={{ left: bar.left, width: Math.max(bar.width, 20) }}
                      title={`${order.product_name} | ${statusLabel[order.status]} | 数量: ${order.quantity}${order.due_date ? ' | 交期: ' + order.due_date.substring(0, 10) : ''}`}
                    >
                      {bar.width > 60 && (
                        <span className="text-xs text-white font-medium truncate">
                          {order.product_name}
                        </span>
                      )}
                      {bar.isOverdue && (
                        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-600 animate-pulse" />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
