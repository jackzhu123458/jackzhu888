'use client';

import { useEffect, useState } from 'react';
import {
  Package, Users, ClipboardList, Truck, ArrowDownRight, ArrowUpRight,
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
}

const prodStatusMap: Record<string, { label: string; color: string }> = {
  pending: { label: '待生产', color: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  in_progress: { label: '生产中', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  completed: { label: '已完成', color: 'bg-green-50 text-green-700 border-green-200' },
  cancelled: { label: '已取消', color: 'bg-red-50 text-red-700 border-red-200' },
};

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

      {/* 中间区域：库存分布 + 生产状态 */}
      <div className="grid grid-cols-3 gap-6">
        {/* 库存分布（按仓库） */}
        <div className="col-span-2 bg-white border border-gray-200 rounded-lg">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <h2 className="font-medium text-gray-900">库存分布（按仓库）</h2>
            <span className="text-xs text-gray-500">共 {data.inventoryByWarehouse.length} 个仓库</span>
          </div>
          {data.inventoryByWarehouse.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">暂无库存数据</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500">
                  <th className="px-4 py-2 text-left font-medium">仓库名称</th>
                  <th className="px-4 py-2 text-right font-medium">库存量(件)</th>
                  <th className="px-4 py-2 text-right font-medium">预留量(件)</th>
                  <th className="px-4 py-2 text-right font-medium">可用量(件)</th>
                  <th className="px-4 py-2 text-right font-medium">物料数</th>
                </tr>
              </thead>
              <tbody>
                {data.inventoryByWarehouse.map(wh => (
                  <tr key={wh.warehouse_id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium text-gray-900">{wh.warehouse_name}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-gray-900">{formatNumber(wh.quantity)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-orange-600">{formatNumber(wh.reserved)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-green-600">{formatNumber(wh.available)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-gray-600">{wh.item_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
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

        {/* 库存动态 */}
        <div className="bg-white border border-gray-200 rounded-lg">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <h2 className="font-medium text-gray-900">库存动态</h2>
            <Clock className="h-4 w-4 text-gray-400" />
          </div>
          {data.recentActivities.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">暂无动态</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {data.recentActivities.slice(0, 8).map(act => (
                <div key={act.id + act.type} className="px-4 py-2.5 flex items-start gap-3">
                  <div className={`mt-0.5 w-6 h-6 rounded flex items-center justify-center flex-shrink-0 ${act.type === 'inbound' ? 'bg-green-50' : 'bg-red-50'}`}>
                    {act.type === 'inbound' ? (
                      <ArrowDownRight className="h-3.5 w-3.5 text-green-600" />
                    ) : (
                      <ArrowUpRight className="h-3.5 w-3.5 text-red-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-900 truncate">{act.detail}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{formatTime(act.time, now)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 最近订单 */}
        <div className="bg-white border border-gray-200 rounded-lg">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <h2 className="font-medium text-gray-900">最近订单</h2>
            <ClipboardList className="h-4 w-4 text-gray-400" />
          </div>
          {(data.recentCustomerOrders.length === 0 && data.recentProduction.length === 0) ? (
            <div className="p-8 text-center text-sm text-gray-400">暂无订单</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {data.recentProduction.slice(0, 5).map(po => {
                const prod = getRelName(po.products);
                const cust = getRelName(po.customers);
                return (
                  <div key={po.id} className="px-4 py-2.5 flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-mono text-gray-900">{po.order_no}</div>
                      <div className="text-xs text-gray-500 truncate">{prod?.name || '-'} · {cust?.name || '-'}</div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded border ${prodStatusMap[po.status]?.color || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                      {prodStatusMap[po.status]?.label || po.status}
                    </span>
                  </div>
                );
              })}
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
