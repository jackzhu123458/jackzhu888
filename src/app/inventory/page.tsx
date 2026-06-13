'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowDownCircle, ArrowUpCircle, MapPin, Search, Package, TrendingUp, TrendingDown } from 'lucide-react';
import { translateUnit } from '@/lib/utils';

interface Product {
  id: string;
  code: string;
  name: string;
  spec: string | null;
  unit: string;
  category: string | null;
  type: string | null;
  price: string | null;
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
  reserved_qty: string;
  location_no: string | null;
  products: Product;
  warehouses: Warehouse;
}

interface Transaction {
  id: string;
  date: string;
  type: 'inbound' | 'outbound';
  note_no: string;
  quantity: number;
  warehouse: string;
  remark: string | null;
  related_order: string | null;
}

export default function InventoryPage() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  // 进出记录状态
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [txLoading, setTxLoading] = useState(false);

  // 库位号编辑状态
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null);
  const [editingLocationValue, setEditingLocationValue] = useState('');

  const loadInventory = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/inventory');
    const data = await res.json();
    if (Array.isArray(data)) setInventory(data);
    setLoading(false);
  }, []);

  useEffect(() => { loadInventory(); }, [loadInventory]);

  // 加载物料进出记录
  const loadTransactions = useCallback(async (productId: string) => {
    setSelectedProductId(productId);
    setTxLoading(true);
    try {
      const res = await fetch(`/api/inventory/transactions?product_id=${productId}`);
      const data = await res.json();
      setTransactions(Array.isArray(data) ? data : []);
    } catch {
      setTransactions([]);
    }
    setTxLoading(false);
  }, []);

  // 保存库位号
  const saveLocationNo = useCallback(async (inventoryId: string, locationNo: string) => {
    try {
      await fetch('/api/inventory', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: inventoryId, location_no: locationNo }),
      });
      setInventory(prev => prev.map(item =>
        item.id === inventoryId ? { ...item, location_no: locationNo } : item
      ));
    } catch { /* silent */ }
    setEditingLocationId(null);
  }, []);

  // 按产品汇总库存
  const summaryMap = useMemo(() => {
    const map = new Map<string, {
      product: Product;
      totalQty: number;
      totalReserved: number;
      warehouses: Array<{
        inventoryId: string;
        name: string;
        qty: string;
        reserved: string;
        locationNo: string | null;
      }>;
    }>();
    inventory.forEach((item) => {
      const key = item.product_id;
      if (!map.has(key)) {
        map.set(key, {
          product: item.products,
          totalQty: 0,
          totalReserved: 0,
          warehouses: [],
        });
      }
      const entry = map.get(key)!;
      entry.totalQty += parseFloat(item.quantity) || 0;
      entry.totalReserved += parseFloat(item.reserved_qty) || 0;
      entry.warehouses.push({
        inventoryId: item.id,
        name: item.warehouses?.name || '默认',
        qty: item.quantity,
        reserved: item.reserved_qty || '0',
        locationNo: item.location_no || null,
      });
    });
    return map;
  }, [inventory]);

  // 模糊搜索
  const filteredSummaries = useMemo(() => {
    const all = Array.from(summaryMap.entries());
    if (!keyword) return all;
    const kw = keyword.toLowerCase();
    return all.filter(([, s]) =>
      s.product.code?.toLowerCase().includes(kw) ||
      s.product.name?.toLowerCase().includes(kw) ||
      s.product.spec?.toLowerCase().includes(kw)
    );
  }, [summaryMap, keyword]);

  // 选中物料的详情
  const selectedSummary = selectedProductId ? summaryMap.get(selectedProductId) : null;
  const selectedProduct = selectedSummary?.product;
  const totalIn = transactions.filter(t => t.type === 'inbound').reduce((s, t) => s + t.quantity, 0);
  const totalOut = transactions.filter(t => t.type === 'outbound').reduce((s, t) => s + t.quantity, 0);

  return (
    <div className="flex h-[calc(100vh-64px)]">
      {/* 左侧栏：物料列表 */}
      <div className="w-[360px] min-w-[360px] border-r border-gray-200 flex flex-col bg-white">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900 mb-3">库存物料</h2>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              placeholder="搜索物料编码、名称、规格..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center text-gray-400">加载中...</div>
          ) : filteredSummaries.length === 0 ? (
            <div className="p-8 text-center text-gray-400">暂无库存数据</div>
          ) : (
            filteredSummaries.map(([productId, summary]) => {
              const available = summary.totalQty - summary.totalReserved;
              const isSelected = selectedProductId === productId;
              return (
                <div
                  key={productId}
                  onClick={() => loadTransactions(productId)}
                  className={`px-4 py-3 border-b border-gray-100 cursor-pointer transition-colors ${
                    isSelected ? 'bg-blue-50 border-l-2 border-l-blue-600' : 'hover:bg-gray-50 border-l-2 border-l-transparent'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-gray-500">{(summary.product as unknown as Record<string, unknown>).code as string}</span>
                        <span className="text-xs text-gray-400">{translateUnit((summary.product as unknown as Record<string, unknown>).unit as string)}</span>
                      </div>
                      <div className="text-sm font-medium text-gray-900 truncate mt-0.5">{(summary.product as unknown as Record<string, unknown>).name as string}</div>
                      {(summary.product as unknown as Record<string, unknown>).spec && (
                        <div className="text-xs text-gray-400 truncate">{(summary.product as unknown as Record<string, unknown>).spec as string}</div>
                      )}
                    </div>
                    <div className="text-right ml-3">
                      <div className="font-mono text-sm font-semibold text-gray-900">{summary.totalQty.toFixed(0)}</div>
                      <div className={`text-xs font-mono ${available > 0 ? 'text-green-600' : 'text-red-500'}`}>
                        可用 {available.toFixed(0)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="p-3 border-t border-gray-200 bg-gray-50 text-xs text-gray-500 text-center">
          共 {filteredSummaries.length} 种物料
        </div>
      </div>

      {/* 右侧栏：物料详情 */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        {!selectedSummary ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <Package className="w-16 h-16 mb-4 text-gray-300" />
            <p className="text-base">选择左侧物料查看库存详情</p>
            <p className="text-sm mt-1">支持按编码、名称、规格搜索</p>
          </div>
        ) : (
          <div className="p-6">
            {/* 物料基本信息 */}
            <div className="bg-white rounded-lg border border-gray-200 p-5 mb-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <span className="font-mono text-sm text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                      {(selectedProduct as unknown as Record<string, unknown>).code as string}
                    </span>
                    <span className="text-xs text-gray-400">{translateUnit((selectedProduct as unknown as Record<string, unknown>).unit as string)}</span>
                  </div>
                  <h2 className="text-lg font-semibold text-gray-900">{(selectedProduct as unknown as Record<string, unknown>).name as string}</h2>
                  {(selectedProduct as unknown as Record<string, unknown>).spec && (
                    <p className="text-sm text-gray-500 mt-0.5">规格: {(selectedProduct as unknown as Record<string, unknown>).spec as string}</p>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-2xl font-mono font-bold text-gray-900">{selectedSummary.totalQty.toFixed(0)}</div>
                  <div className="text-xs text-gray-500">总库存</div>
                </div>
              </div>

              {/* 汇总统计条 */}
              <div className="flex gap-6 mt-4 pt-4 border-t border-gray-100">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-gray-500" />
                  <span className="text-sm text-gray-600">总库存</span>
                  <span className="font-mono font-semibold text-gray-900">{selectedSummary.totalQty.toFixed(0)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-amber-500" />
                  <span className="text-sm text-gray-600">预留量</span>
                  <span className="font-mono font-semibold text-amber-600">{selectedSummary.totalReserved.toFixed(0)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 text-green-500" />
                  <span className="text-sm text-gray-600">可用量</span>
                  <span className="font-mono font-semibold text-green-700">{(selectedSummary.totalQty - selectedSummary.totalReserved).toFixed(0)}</span>
                </div>
              </div>
            </div>

            {/* 各仓库库存 */}
            <div className="bg-white rounded-lg border border-gray-200 mb-4">
              <div className="px-5 py-3 border-b border-gray-200 bg-gray-50/50">
                <h3 className="text-sm font-semibold text-gray-700">各仓库库存</h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-5 py-2.5 font-medium text-gray-500 text-xs">仓库</th>
                    <th className="text-right px-5 py-2.5 font-medium text-gray-500 text-xs">库存数量</th>
                    <th className="text-right px-5 py-2.5 font-medium text-gray-500 text-xs">预留量</th>
                    <th className="text-right px-5 py-2.5 font-medium text-gray-500 text-xs">可用量</th>
                    <th className="text-left px-5 py-2.5 font-medium text-gray-500 text-xs">库位号</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedSummary.warehouses.map((w) => (
                    <tr key={w.inventoryId} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-5 py-3 text-gray-900 font-medium">{w.name}</td>
                      <td className="px-5 py-3 text-right font-mono text-gray-900">{parseFloat(w.qty).toFixed(0)}</td>
                      <td className="px-5 py-3 text-right font-mono text-amber-600">{parseFloat(w.reserved).toFixed(0)}</td>
                      <td className="px-5 py-3 text-right font-mono text-green-700">{(parseFloat(w.qty) - parseFloat(w.reserved)).toFixed(0)}</td>
                      <td className="px-5 py-3">
                        {editingLocationId === w.inventoryId ? (
                          <Input
                            autoFocus
                            value={editingLocationValue}
                            onChange={(e) => setEditingLocationValue(e.target.value)}
                            onBlur={() => saveLocationNo(w.inventoryId, editingLocationValue)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveLocationNo(w.inventoryId, editingLocationValue);
                              if (e.key === 'Escape') setEditingLocationId(null);
                            }}
                            className="h-7 w-32 text-xs font-mono"
                            placeholder="输入库位号"
                          />
                        ) : (
                          <button
                            className="flex items-center gap-1 text-xs font-mono text-gray-600 hover:text-blue-600 cursor-pointer group"
                            onClick={() => {
                              setEditingLocationId(w.inventoryId);
                              setEditingLocationValue(w.locationNo || '');
                            }}
                            title="点击编辑库位号"
                          >
                            <MapPin className="w-3 h-3 text-gray-400 group-hover:text-blue-500" />
                            {w.locationNo || <span className="text-gray-300">未设置</span>}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 进出记录 */}
            <div className="bg-white rounded-lg border border-gray-200">
              <div className="px-5 py-3 border-b border-gray-200 bg-gray-50/50 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700">数量变动记录</h3>
                <div className="flex gap-4">
                  <div className="flex items-center gap-1.5">
                    <ArrowDownCircle className="w-4 h-4 text-green-600" />
                    <span className="text-xs text-gray-500">累计入库</span>
                    <span className="font-mono text-xs font-semibold text-green-700">{totalIn.toFixed(0)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <ArrowUpCircle className="w-4 h-4 text-red-500" />
                    <span className="text-xs text-gray-500">累计出库</span>
                    <span className="font-mono text-xs font-semibold text-red-600">{totalOut.toFixed(0)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-500">净变动</span>
                    <span className={`font-mono text-xs font-semibold ${(totalIn - totalOut) >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                      {(totalIn - totalOut) >= 0 ? '+' : ''}{(totalIn - totalOut).toFixed(0)}
                    </span>
                  </div>
                </div>
              </div>

              {txLoading ? (
                <div className="p-8 text-center text-gray-400">加载中...</div>
              ) : transactions.length === 0 ? (
                <div className="p-8 text-center text-gray-400">暂无变动记录</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left px-5 py-2.5 font-medium text-gray-500 text-xs">日期</th>
                      <th className="text-center px-5 py-2.5 font-medium text-gray-500 text-xs">类型</th>
                      <th className="text-left px-5 py-2.5 font-medium text-gray-500 text-xs">单号</th>
                      <th className="text-right px-5 py-2.5 font-medium text-gray-500 text-xs">数量</th>
                      <th className="text-left px-5 py-2.5 font-medium text-gray-500 text-xs">仓库</th>
                      <th className="text-left px-5 py-2.5 font-medium text-gray-500 text-xs">关联单据</th>
                      <th className="text-left px-5 py-2.5 font-medium text-gray-500 text-xs">备注</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((tx, idx) => (
                      <tr key={tx.id} className={`border-b border-gray-50 hover:bg-blue-50/30 ${idx % 2 === 1 ? 'bg-gray-50/30' : ''}`}>
                        <td className="px-5 py-2.5 text-gray-700 font-mono text-xs">
                          {tx.date ? new Date(tx.date).toLocaleDateString('zh-CN') : '-'}
                        </td>
                        <td className="px-5 py-2.5 text-center">
                          {tx.type === 'inbound' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 border border-green-200">
                              <ArrowDownCircle className="w-3 h-3" />入库
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-600 border border-red-200">
                              <ArrowUpCircle className="w-3 h-3" />出库
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-2.5 font-mono text-xs text-blue-700 font-medium">{tx.note_no || '-'}</td>
                        <td className={`px-5 py-2.5 text-right font-mono text-xs font-medium ${tx.type === 'inbound' ? 'text-green-700' : 'text-red-600'}`}>
                          {tx.type === 'inbound' ? '+' : '-'}{tx.quantity.toFixed(0)}
                        </td>
                        <td className="px-5 py-2.5 text-gray-600 text-xs">{tx.warehouse}</td>
                        <td className="px-5 py-2.5 text-gray-600 text-xs">{tx.related_order || '-'}</td>
                        <td className="px-5 py-2.5 text-gray-500 text-xs">{tx.remark || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
