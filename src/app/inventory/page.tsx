'use client';

import { useEffect, useState, useCallback } from 'react';
import { AppShell } from '@/components/app-shell';
import { Input } from '@/components/ui/input';

interface Product {
  id: string;
  code: string;
  name: string;
  spec: string | null;
  unit: string;
}

interface Warehouse {
  id: string;
  name: string;
  location: string | null;
}

interface InventoryItem {
  id: string;
  product_id: string;
  warehouse_id: string;
  quantity: string;
  products: Product;
  warehouses: Warehouse;
}

export default function InventoryPage() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');

  const loadInventory = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/inventory');
    const data = await res.json();
    if (Array.isArray(data)) setInventory(data);
    setLoading(false);
  }, []);

  useEffect(() => { loadInventory(); }, [loadInventory]);

  const filteredInventory = keyword
    ? inventory.filter(
        (item) =>
          item.products?.code?.toLowerCase().includes(keyword.toLowerCase()) ||
          item.products?.name?.toLowerCase().includes(keyword.toLowerCase())
      )
    : inventory;

  // 按产品汇总库存
  const summaryMap = new Map<string, { product: Product; totalQty: number; warehouses: Array<{ name: string; qty: string }> }>();
  filteredInventory.forEach((item) => {
    const key = item.product_id;
    if (!summaryMap.has(key)) {
      summaryMap.set(key, {
        product: item.products,
        totalQty: 0,
        warehouses: [],
      });
    }
    const entry = summaryMap.get(key)!;
    entry.totalQty += parseFloat(item.quantity) || 0;
    entry.warehouses.push({ name: item.warehouses?.name || '默认', qty: item.quantity });
  });

  return (
    <AppShell>
      <div className="p-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold text-gray-900">库存管理</h1>
        </div>

        <div className="flex items-center gap-4 mb-4">
          <Input
            placeholder="搜索物料编码或名称..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="w-64"
          />
        </div>

        <div className="bg-white rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/50">
                <th className="text-left px-5 py-3 font-medium text-gray-500">物料编码</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">物料名称</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">规格</th>
                <th className="text-right px-5 py-3 font-medium text-gray-500">总库存</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">单位</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">仓库明细</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-5 py-12 text-center text-gray-400">加载中...</td></tr>
              ) : filteredInventory.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-12 text-center text-gray-400">暂无库存数据</td></tr>
              ) : (
                Array.from(summaryMap.entries()).map(([productId, summary]) => (
                  <tr key={productId} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-5 py-3 font-mono text-gray-900">{summary.product.code}</td>
                    <td className="px-5 py-3 text-gray-900">{summary.product.name}</td>
                    <td className="px-5 py-3 text-gray-600">{summary.product.spec || '-'}</td>
                    <td className="px-5 py-3 text-right font-mono font-medium text-gray-900">{summary.totalQty.toFixed(2)}</td>
                    <td className="px-5 py-3 text-gray-600">{summary.product.unit}</td>
                    <td className="px-5 py-3 text-gray-600 text-xs">
                      {summary.warehouses.map((w) => `${w.name}: ${w.qty}`).join(' | ')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
