'use client';

import { useEffect, useState } from 'react';
import { Package, FileText, ClipboardList, Truck, Users } from 'lucide-react';

interface DashboardData {
  productCount: number;
  bomCount: number;
  customerCount: number;
  orderStats: Record<string, number>;
  deliveryCount: number;
  recentOrders: Array<{
    id: string;
    order_no: string;
    status: string;
    due_date: string;
    products: { name: string; code: string };
  }>;
  recentDelivery: Array<{
    id: string;
    note_no: string;
    customer_name: string;
    status: string;
    delivery_date: string;
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

  useEffect(() => {
    fetch('/api/dashboard')
      .then(res => res.json())
      .then(setData)
      .catch(() => {});
  }, []);

  if (!data) {
    return <div className="p-8 text-gray-500">加载中...</div>;
  }

  const totalOrders = Object.values(data.orderStats).reduce((a, b) => a + b, 0);

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">工作台</h1>

      <div className="grid grid-cols-5 gap-4 mb-8">
        <StatCard icon={<Package className="h-5 w-5" />} label="物料总数" value={data.productCount} color="text-blue-600" />
        <StatCard icon={<FileText className="h-5 w-5" />} label="BOM 配方" value={data.bomCount} color="text-purple-600" />
        <StatCard icon={<Users className="h-5 w-5" />} label="客户数" value={data.customerCount} color="text-teal-600" />
        <StatCard icon={<ClipboardList className="h-5 w-5" />} label="生产订单" value={totalOrders} color="text-amber-600" />
        <StatCard icon={<Truck className="h-5 w-5" />} label="送货单" value={data.deliveryCount} color="text-green-600" />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white border border-gray-200 rounded-lg">
          <div className="px-4 py-3 border-b border-gray-200">
            <h2 className="font-medium text-gray-900">最近生产订单</h2>
          </div>
          {data.recentOrders.length === 0 ? (
            <div className="p-4 text-sm text-gray-500">暂无数据</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {data.recentOrders.map(order => (
                <div key={order.id} className="px-4 py-3 flex items-center justify-between">
                  <div>
                    <span className="text-sm font-mono text-gray-900">{order.order_no}</span>
                    <span className="text-sm text-gray-600 ml-2">{order.products?.name || '-'}</span>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded ${statusMap[order.status]?.color || 'bg-gray-100 text-gray-800'}`}>
                    {statusMap[order.status]?.label || order.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-lg">
          <div className="px-4 py-3 border-b border-gray-200">
            <h2 className="font-medium text-gray-900">最近送货单</h2>
          </div>
          {data.recentDelivery.length === 0 ? (
            <div className="p-4 text-sm text-gray-500">暂无数据</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {data.recentDelivery.map(dn => (
                <div key={dn.id} className="px-4 py-3 flex items-center justify-between">
                  <div>
                    <span className="text-sm font-mono text-gray-900">{dn.note_no}</span>
                    <span className="text-sm text-gray-600 ml-2">{dn.customer_name}</span>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded ${dn.status === 'shipped' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                    {dn.status === 'shipped' ? '已出货' : '草稿'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 flex items-center gap-3">
      <div className={color}>{icon}</div>
      <div>
        <div className="text-2xl font-semibold text-gray-900">{value}</div>
        <div className="text-xs text-gray-500">{label}</div>
      </div>
    </div>
  );
}
