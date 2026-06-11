'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';

interface DashboardData {
  productCount: number;
  bomCount: number;
  customerCount: number;
  deliveryCount: number;
  orderStats: Record<string, number>;
  recentOrders: Array<{
    id: string;
    order_no: string;
    status: string;
    quantity: string;
    created_at: string;
    products: { name: string } | null;
    customers: { name: string } | null;
  }>;
  recentDelivery: Array<{
    id: string;
    note_no: string;
    customer_name: string;
    status: string;
    delivery_date: string | null;
    created_at: string;
  }>;
}

const statusMap: Record<string, { label: string; color: string }> = {
  pending: { label: '待生产', color: 'bg-yellow-100 text-yellow-800' },
  in_progress: { label: '生产中', color: 'bg-blue-100 text-blue-800' },
  completed: { label: '已完成', color: 'bg-green-100 text-green-800' },
  cancelled: { label: '已取消', color: 'bg-red-100 text-red-800' },
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard')
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <AppShell>
        <div className="p-8">
          <div className="animate-pulse space-y-6">
            <div className="h-8 w-48 bg-gray-200 rounded" />
            <div className="grid grid-cols-4 gap-6">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-28 bg-gray-200 rounded-lg" />
              ))}
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  if (!data) return <AppShell><div className="p-8">加载失败</div></AppShell>;

  const totalOrders = Object.values(data.orderStats).reduce((a, b) => a + b, 0);

  return (
    <AppShell>
      <div className="p-8">
        <h1 className="text-xl font-semibold text-gray-900 mb-6">工作台</h1>

        <div className="grid grid-cols-4 gap-6 mb-8">
          <StatCard label="物料总数" value={data.productCount} />
          <StatCard label="BOM 配方数" value={data.bomCount} />
          <StatCard label="客户数" value={data.customerCount} />
          <StatCard label="生产订单" value={totalOrders} />
        </div>

        {totalOrders > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-medium text-gray-500 mb-3">订单状态分布</h2>
            <div className="flex gap-4">
              {Object.entries(data.orderStats).map(([status, count]) => (
                <div key={status} className={`px-4 py-2 rounded-md text-sm font-medium ${statusMap[status]?.color || 'bg-gray-100 text-gray-700'}`}>
                  {statusMap[status]?.label || status}: {count}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-6">
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-medium text-gray-900">最近生产订单</h2>
            </div>
            <div className="divide-y divide-gray-50">
              {data.recentOrders.length === 0 ? (
                <div className="px-5 py-8 text-sm text-gray-400 text-center">暂无数据</div>
              ) : (
                data.recentOrders.map((order) => (
                  <div key={order.id} className="px-5 py-3 flex items-center justify-between">
                    <div>
                      <span className="text-sm font-mono text-gray-900">{order.order_no}</span>
                      <span className="text-sm text-gray-500 ml-3">
                        {order.customers?.name || ''}{order.customers?.name && order.products?.name ? ' - ' : ''}{order.products?.name || '-'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-gray-500 font-mono">{order.quantity}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${statusMap[order.status]?.color || 'bg-gray-100 text-gray-600'}`}>
                        {statusMap[order.status]?.label || order.status}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-medium text-gray-900">最近送货单</h2>
            </div>
            <div className="divide-y divide-gray-50">
              {data.recentDelivery.length === 0 ? (
                <div className="px-5 py-8 text-sm text-gray-400 text-center">暂无数据</div>
              ) : (
                data.recentDelivery.map((note) => (
                  <div key={note.id} className="px-5 py-3 flex items-center justify-between">
                    <div>
                      <span className="text-sm font-mono text-gray-900">{note.note_no}</span>
                      <span className="text-sm text-gray-500 ml-3">{note.customer_name}</span>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded ${note.status === 'shipped' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                      {note.status === 'shipped' ? '已发货' : '草稿'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 px-5 py-5">
      <div className="text-sm text-gray-500 mb-1">{label}</div>
      <div className="text-2xl font-semibold text-gray-900 font-mono">{value}</div>
    </div>
  );
}
