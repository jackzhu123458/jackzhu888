'use client';

import { useEffect, useState, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowDownCircle, ArrowUpCircle, MapPin } from 'lucide-react';

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

  // 进出记录弹窗状态
  const [txProductId, setTxProductId] = useState('');
  const [txProductName, setTxProductName] = useState('');
  const [txProductCode, setTxProductCode] = useState('');
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
  const loadTransactions = useCallback(async (productId: string, productCode: string, productName: string) => {
    setTxProductId(productId);
    setTxProductCode(productCode);
    setTxProductName(productName);
    setTxLoading(true);
    try {
      const res = await fetch(`/api/inventory/transactions?product_id=${productId}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setTransactions(data);
      } else {
        setTransactions([]);
      }
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
      // 更新本地状态
      setInventory(prev => prev.map(item =>
        item.id === inventoryId ? { ...item, location_no: locationNo } : item
      ));
    } catch {
      // 失败时静默回退
    }
    setEditingLocationId(null);
  }, []);

  // 开始编辑库位号
  const startEditLocation = useCallback((item: InventoryItem) => {
    setEditingLocationId(item.id);
    setEditingLocationValue(item.location_no || '');
  }, []);

  const filteredInventory = keyword
    ? inventory.filter(
        (item) =>
          item.products?.code?.toLowerCase().includes(keyword.toLowerCase()) ||
          item.products?.name?.toLowerCase().includes(keyword.toLowerCase()) ||
          (item.location_no && item.location_no.toLowerCase().includes(keyword.toLowerCase()))
      )
    : inventory;

  // 按产品汇总库存，保留库位号信息
  const summaryMap = new Map<string, {
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
  filteredInventory.forEach((item) => {
    const key = item.product_id;
    if (!summaryMap.has(key)) {
      summaryMap.set(key, {
        product: item.products,
        totalQty: 0,
        totalReserved: 0,
        warehouses: [],
      });
    }
    const entry = summaryMap.get(key)!;
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

  // 计算进出汇总
  const totalIn = transactions.filter(t => t.type === 'inbound').reduce((s, t) => s + t.quantity, 0);
  const totalOut = transactions.filter(t => t.type === 'outbound').reduce((s, t) => s + t.quantity, 0);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900">库存管理</h1>
      </div>

      <div className="flex items-center gap-4 mb-4">
        <Input
          placeholder="搜索物料编码、名称或库位号..."
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          className="w-80"
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
              <th className="text-right px-5 py-3 font-medium text-gray-500">预留量</th>
              <th className="text-right px-5 py-3 font-medium text-gray-500">可用量</th>
              <th className="text-left px-5 py-3 font-medium text-gray-500">单位</th>
              <th className="text-left px-5 py-3 font-medium text-gray-500">库位号</th>
              <th className="text-left px-5 py-3 font-medium text-gray-500">仓库明细</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="px-5 py-12 text-center text-gray-400">加载中...</td></tr>
            ) : filteredInventory.length === 0 ? (
              <tr><td colSpan={9} className="px-5 py-12 text-center text-gray-400">暂无库存数据</td></tr>
            ) : (
              Array.from(summaryMap.entries()).map(([productId, summary]) => {
                // 汇总所有仓库的库位号
                const locationNos = summary.warehouses
                  .map(w => w.locationNo)
                  .filter(Boolean);
                const locationDisplay = locationNos.length > 0
                  ? locationNos.join(', ')
                  : '';

                return (
                  <tr key={productId} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-5 py-3">
                      <button
                        className="font-mono text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                        onClick={() => loadTransactions(productId, summary.product.code, summary.product.name)}
                        title="点击查看进出记录"
                      >
                        {summary.product.code}
                      </button>
                    </td>
                    <td className="px-5 py-3 text-gray-900">{summary.product.name}</td>
                    <td className="px-5 py-3 text-gray-600">{summary.product.spec || '-'}</td>
                    <td className="px-5 py-3 text-right font-mono font-medium text-gray-900">{summary.totalQty.toFixed(2)}</td>
                    <td className="px-5 py-3 text-right font-mono text-amber-600">{summary.totalReserved.toFixed(2)}</td>
                    <td className="px-5 py-3 text-right font-mono font-medium text-green-700">{(summary.totalQty - summary.totalReserved).toFixed(2)}</td>
                    <td className="px-5 py-3 text-gray-600">{summary.product.unit}</td>
                    <td className="px-5 py-3">
                      {summary.warehouses.length === 1 ? (
                        // 单仓库：直接编辑
                        editingLocationId === summary.warehouses[0].inventoryId ? (
                          <Input
                            autoFocus
                            value={editingLocationValue}
                            onChange={(e) => setEditingLocationValue(e.target.value)}
                            onBlur={() => saveLocationNo(summary.warehouses[0].inventoryId, editingLocationValue)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveLocationNo(summary.warehouses[0].inventoryId, editingLocationValue);
                              if (e.key === 'Escape') setEditingLocationId(null);
                            }}
                            className="h-7 w-28 text-xs font-mono"
                            placeholder="输入库位号"
                          />
                        ) : (
                          <button
                            className="flex items-center gap-1 text-xs font-mono text-gray-600 hover:text-blue-600 cursor-pointer group"
                            onClick={() => {
                              const w = summary.warehouses[0];
                              setEditingLocationId(w.inventoryId);
                              setEditingLocationValue(w.locationNo || '');
                            }}
                            title="点击编辑库位号"
                          >
                            <MapPin className="w-3 h-3 text-gray-400 group-hover:text-blue-500" />
                            {locationDisplay || <span className="text-gray-300">未设置</span>}
                          </button>
                        )
                      ) : (
                        // 多仓库：显示每个仓库的库位号
                        <div className="space-y-0.5">
                          {summary.warehouses.map((w) => (
                            editingLocationId === w.inventoryId ? (
                              <Input
                                key={w.inventoryId}
                                autoFocus
                                value={editingLocationValue}
                                onChange={(e) => setEditingLocationValue(e.target.value)}
                                onBlur={() => saveLocationNo(w.inventoryId, editingLocationValue)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') saveLocationNo(w.inventoryId, editingLocationValue);
                                  if (e.key === 'Escape') setEditingLocationId(null);
                                }}
                                className="h-7 w-28 text-xs font-mono"
                                placeholder="输入库位号"
                              />
                            ) : (
                              <button
                                key={w.inventoryId}
                                className="flex items-center gap-1 text-xs font-mono text-gray-600 hover:text-blue-600 cursor-pointer group"
                                onClick={() => {
                                  setEditingLocationId(w.inventoryId);
                                  setEditingLocationValue(w.locationNo || '');
                                }}
                                title={`${w.name} - 点击编辑库位号`}
                              >
                                <MapPin className="w-3 h-3 text-gray-400 group-hover:text-blue-500" />
                                <span className="text-gray-400">{w.name}:</span>
                                {w.locationNo || <span className="text-gray-300">未设置</span>}
                              </button>
                            )
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3 text-gray-600 text-xs">
                      {summary.warehouses.map((w) => `${w.name}: ${w.qty}(预留${w.reserved})`).join(' | ')}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 物料进出记录弹窗 */}
      <Dialog open={!!txProductId} onOpenChange={(open) => { if (!open) setTxProductId(''); }}>
        <DialogContent className="max-w-[900px]">
          <DialogHeader>
            <DialogTitle>
              进出记录 - {txProductCode} / {txProductName}
            </DialogTitle>
          </DialogHeader>

          {txLoading ? (
            <div className="py-12 text-center text-gray-400">加载中...</div>
          ) : transactions.length === 0 ? (
            <div className="py-12 text-center text-gray-400">暂无进出记录</div>
          ) : (
            <>
              {/* 汇总统计 */}
              <div className="flex gap-6 mb-4 px-1">
                <div className="flex items-center gap-2">
                  <ArrowDownCircle className="w-4 h-4 text-green-600" />
                  <span className="text-sm text-gray-600">累计入库:</span>
                  <span className="font-mono font-medium text-green-700">{totalIn.toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <ArrowUpCircle className="w-4 h-4 text-red-500" />
                  <span className="text-sm text-gray-600">累计出库:</span>
                  <span className="font-mono font-medium text-red-600">{totalOut.toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">净库存:</span>
                  <span className="font-mono font-medium text-gray-900">{(totalIn - totalOut).toFixed(2)}</span>
                </div>
              </div>

              {/* 进出记录表格 */}
              <div className="border border-gray-200 rounded-lg max-h-[500px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50/95 backdrop-blur-sm">
                    <tr className="border-b border-gray-200">
                      <th className="text-left px-4 py-2.5 font-medium text-gray-500 w-28">日期</th>
                      <th className="text-center px-4 py-2.5 font-medium text-gray-500 w-20">类型</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-500">单号</th>
                      <th className="text-right px-4 py-2.5 font-medium text-gray-500 w-24">数量</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-500">仓库</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-500">关联单据</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-500">备注</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((tx) => (
                      <tr key={tx.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                        <td className="px-4 py-2.5 text-gray-700 font-mono text-xs">
                          {tx.date ? new Date(tx.date).toLocaleDateString('zh-CN') : '-'}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {tx.type === 'inbound' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700">
                              <ArrowDownCircle className="w-3 h-3" />入库
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-600">
                              <ArrowUpCircle className="w-3 h-3" />出库
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-700">{tx.note_no || '-'}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-gray-900">{tx.quantity.toFixed(2)}</td>
                        <td className="px-4 py-2.5 text-gray-600 text-xs">{tx.warehouse}</td>
                        <td className="px-4 py-2.5 text-gray-600 text-xs">{tx.related_order || '-'}</td>
                        <td className="px-4 py-2.5 text-gray-500 text-xs max-w-[150px] truncate">{tx.remark || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
