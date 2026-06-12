'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

interface Product {
  id: string;
  code: string;
  name: string;
  spec: string | null;
  unit: string;
  type: string;
}

interface Customer {
  id: string;
  name: string;
  code: string | null;
}

interface Warehouse {
  id: string;
  name: string;
}

interface Material {
  product_id: string;
  required_qty: string;
  prepared_qty: string;
  remark: string;
  products: Product;
}

interface ProductionOrder {
  id: string;
  order_no: string;
  customer_id: string | null;
  customer_order_id: string | null;
  customer_order_item_id: string | null;
  product_id: string;
  quantity: string;
  status: string;
  start_date: string | null;
  due_date: string | null;
  completed_at: string | null;
  remark: string | null;
  created_at: string;
  products: Product;
  customers: Customer | null;
  production_order_materials: Material[];
  customer_order?: { order_no: string };
  order_item?: {
    product_id: string;
    quantity: number;
    delivered_qty: number;
    code: string;
    name: string;
    spec: string | null;
    unit: string;
  };
}

const statusMap: Record<string, { label: string; color: string }> = {
  pending: { label: '待生产', color: 'bg-yellow-100 text-yellow-800' },
  in_progress: { label: '生产中', color: 'bg-blue-100 text-blue-800' },
  completed: { label: '已完成', color: 'bg-green-100 text-green-800' },
  cancelled: { label: '已取消', color: 'bg-red-100 text-red-800' },
};

export default function ProductionPage() {
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterCustomerId, setFilterCustomerId] = useState<string>('all');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editOrder, setEditOrder] = useState<ProductionOrder | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [detailOrder, setDetailOrder] = useState<ProductionOrder | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [completeOrderId, setCompleteOrderId] = useState<string | null>(null);
  const [completeWarehouseId, setCompleteWarehouseId] = useState('');
  const [completing, setCompleting] = useState(false);

  // 表单
  const [formCustomerId, setFormCustomerId] = useState('');
  const [formProductId, setFormProductId] = useState('');
  const [formQuantity, setFormQuantity] = useState('');
  const [formStartDate, setFormStartDate] = useState('');
  const [formDueDate, setFormDueDate] = useState('');
  const [formRemark, setFormRemark] = useState('');
  const [formMaterials, setFormMaterials] = useState<Array<{ product_id: string; required_qty: string; remark: string }>>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [orderRes, prodRes, custRes, whRes] = await Promise.all([
      fetch('/api/production'),
      fetch('/api/products'),
      fetch('/api/customers'),
      fetch('/api/warehouses'),
    ]);
    const orderData = await orderRes.json();
    const prodData = await prodRes.json();
    const custData = await custRes.json();
    const whData = await whRes.json();
    if (Array.isArray(orderData)) setOrders(orderData);
    if (Array.isArray(prodData)) setProducts(prodData);
    if (Array.isArray(custData)) setCustomers(custData);
    if (Array.isArray(whData)) setWarehouses(whData);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // 初始化展开所有客户组
  useEffect(() => {
    if (orders.length > 0) {
      const groupIds = new Set<string>();
      orders.forEach((o) => {
        const key = o.customer_id || '__no_customer__';
        groupIds.add(key);
      });
      setExpandedGroups(groupIds);
    }
  }, [orders.length]);

  const generateOrderNo = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const seq = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
    return `PO-${y}${m}${d}-${seq}`;
  };

  const handleAdd = () => {
    setEditOrder(null);
    setFormCustomerId('');
    setFormProductId('');
    setFormQuantity('');
    setFormStartDate('');
    setFormDueDate('');
    setFormRemark('');
    setFormMaterials([]);
    setSheetOpen(true);
  };

  const handleSelectProduct = (productId: string) => {
    setFormProductId(productId);
    // 自动从 BOM 加载子料
    fetch(`/api/bom`)
      .then((r) => r.json())
      .then((bomData) => {
        if (Array.isArray(bomData)) {
          const related = bomData.filter((b: { parent_product_id: string }) => b.parent_product_id === productId);
          if (related.length > 0) {
            setFormMaterials(
              related.map((b: { child_product_id: string; quantity: string; remark: string | null }) => ({
                product_id: b.child_product_id,
                required_qty: b.quantity,
                remark: b.remark || '',
              }))
            );
          }
        }
      });
  };

  const handleEdit = (order: ProductionOrder) => {
    setEditOrder(order);
    setFormCustomerId(order.customer_id || '');
    setFormProductId(order.product_id);
    setFormQuantity(order.quantity);
    setFormStartDate(order.start_date ? order.start_date.slice(0, 10) : '');
    setFormDueDate(order.due_date ? order.due_date.slice(0, 10) : '');
    setFormRemark(order.remark || '');
    setFormMaterials(
      (order.production_order_materials || []).map((m) => ({
        product_id: m.product_id,
        required_qty: m.required_qty,
        remark: m.remark || '',
      }))
    );
    setSheetOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const body = {
      order_no: editOrder ? editOrder.order_no : generateOrderNo(),
      customer_id: formCustomerId || null,
      product_id: formProductId,
      quantity: formQuantity,
      status: editOrder ? editOrder.status : 'pending',
      start_date: formStartDate || null,
      due_date: formDueDate || null,
      remark: formRemark || null,
      materials: formMaterials.map((m) => ({
        product_id: m.product_id,
        required_qty: m.required_qty,
        prepared_qty: '0',
        remark: m.remark || null,
      })),
      ...(editOrder ? { id: editOrder.id } : {}),
    };
    const res = await fetch('/api/production', {
      method: editOrder ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setSheetOpen(false);
      loadData();
    } else {
      const err = await res.json();
      alert(err.error || '保存失败');
    }
    setSaving(false);
  };

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    const body: Record<string, string> = { id: orderId, status: newStatus };
    if (newStatus === 'completed') {
      body.completed_at = new Date().toISOString();
    }
    await fetch('/api/production', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    loadData();
    setDetailOrder(null);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await fetch(`/api/production?id=${deleteId}`, { method: 'DELETE' });
    setDeleteId(null);
    loadData();
  };

  // 完成生产 → 自动入库
  const handleCompleteInbound = async () => {
    if (!completeOrderId || !completeWarehouseId) return;
    setCompleting(true);
    try {
      const res = await fetch('/api/production/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: completeOrderId, warehouse_id: completeWarehouseId }),
      });
      const data = await res.json();
      if (res.ok) {
        alert(`生产完成！已自动入库: ${data.product?.name || ''} × ${data.quantity}`);
        setCompleteOrderId(null);
        setDetailOrder(null);
        loadData();
      } else {
        alert(data.error || '完成入库失败');
      }
    } catch (e) {
      alert('请求失败: ' + String(e));
    }
    setCompleting(false);
  };

  const addMaterialRow = () => {
    setFormMaterials([...formMaterials, { product_id: '', required_qty: '', remark: '' }]);
  };

  const removeMaterialRow = (idx: number) => {
    setFormMaterials(formMaterials.filter((_, i) => i !== idx));
  };

  const updateMaterialRow = (idx: number, field: string, value: string) => {
    const updated = [...formMaterials];
    updated[idx] = { ...updated[idx], [field]: value };
    setFormMaterials(updated);
  };

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const expandAll = () => {
    const allKeys = new Set<string>();
    filteredOrders.forEach((o) => allKeys.add(o.customer_id || '__no_customer__'));
    setExpandedGroups(allKeys);
  };

  const collapseAll = () => setExpandedGroups(new Set());

  // 过滤
  let filteredOrders = orders;
  if (filterStatus !== 'all') filteredOrders = filteredOrders.filter((o) => o.status === filterStatus);
  if (filterCustomerId !== 'all') filteredOrders = filteredOrders.filter((o) => o.customer_id === filterCustomerId);

  // 按客户分组
  const grouped = new Map<string, { customer: Customer | null; orders: ProductionOrder[] }>();
  filteredOrders.forEach((o) => {
    const key = o.customer_id || '__no_customer__';
    if (!grouped.has(key)) {
      grouped.set(key, { customer: o.customers, orders: [] });
    }
    grouped.get(key)!.orders.push(o);
  });

  const finishedProducts = products.filter((p) => p.type === 'finished_product' || p.type === 'semi_finished');

  return (
    <>
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold text-gray-900">生产订单</h1>
          <Button onClick={handleAdd}>新建订单</Button>
        </div>

        <div className="flex items-center gap-4 mb-4 flex-wrap">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="pending">待生产</SelectItem>
              <SelectItem value="in_progress">生产中</SelectItem>
              <SelectItem value="completed">已完成</SelectItem>
              <SelectItem value="cancelled">已取消</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterCustomerId} onValueChange={setFilterCustomerId}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部客户</SelectItem>
              {customers.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" size="sm" onClick={expandAll}>全部展开</Button>
            <Button variant="outline" size="sm" onClick={collapseAll}>全部收缩</Button>
          </div>
        </div>

        {/* 按客户分组展示 */}
        {loading ? (
          <div className="py-12 text-center text-gray-400">加载中...</div>
        ) : grouped.size === 0 ? (
          <div className="py-12 text-center text-gray-400">暂无数据</div>
        ) : (
          <div className="space-y-4">
            {Array.from(grouped.entries()).map(([key, group]) => {
              const isExpanded = expandedGroups.has(key);
              const customerName = group.customer?.name || '未分配客户';
              const customerCode = group.customer?.code || '';
              const orderCount = group.orders.length;
              const statusCounts: Record<string, number> = {};
              group.orders.forEach((o) => { statusCounts[o.status] = (statusCounts[o.status] || 0) + 1; });

              return (
                <div key={key} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                  {/* 客户组标题 */}
                  <button
                    onClick={() => toggleGroup(key)}
                    className="w-full flex items-center justify-between px-5 py-3.5 bg-gray-50/80 hover:bg-gray-100/80 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <svg
                        className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                      <span className="font-medium text-gray-900">{customerName}</span>
                      {customerCode && <span className="text-xs text-gray-400 font-mono">{customerCode}</span>}
                    </div>
                    <div className="flex items-center gap-3">
                      {Object.entries(statusCounts).map(([s, c]) => (
                        <Badge key={s} variant="outline" className={statusMap[s]?.color || ''}>
                          {statusMap[s]?.label || s} {c}
                        </Badge>
                      ))}
                      <span className="text-xs text-gray-400">共 {orderCount} 单</span>
                    </div>
                  </button>

                  {/* 订单列表 */}
                  {isExpanded && (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-t border-b border-gray-200 bg-gray-50/30">
                          <th className="text-left px-5 py-2.5 font-medium text-gray-500">订单号</th>
                          <th className="text-left px-5 py-2.5 font-medium text-gray-500">客户订单号</th>
                          <th className="text-left px-5 py-2.5 font-medium text-gray-500">物料编码</th>
                          <th className="text-left px-5 py-2.5 font-medium text-gray-500">物料描述</th>
                          <th className="text-right px-5 py-2.5 font-medium text-gray-500">数量</th>
                          <th className="text-left px-5 py-2.5 font-medium text-gray-500">状态</th>
                          <th className="text-left px-5 py-2.5 font-medium text-gray-500">计划开始</th>
                          <th className="text-left px-5 py-2.5 font-medium text-gray-500">计划完成</th>
                          <th className="text-center px-5 py-2.5 font-medium text-gray-500">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.orders.map((order) => (
                          <tr key={order.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                            <td className="px-5 py-3 font-mono text-gray-900">{order.order_no}</td>
                            <td className="px-5 py-3 font-mono text-gray-600">{order.customer_order?.order_no || '-'}</td>
                            <td className="px-5 py-3 font-mono text-gray-900">{order.order_item?.code || order.products?.code || '-'}</td>
                            <td className="px-5 py-3 text-gray-900">
                              {order.order_item?.name || order.products?.name || '-'}
                              {order.order_item?.spec && <span className="text-xs text-gray-400 ml-1">{order.order_item.spec}</span>}
                              {!order.order_item?.spec && order.products?.spec && <span className="text-xs text-gray-400 ml-1">{order.products.spec}</span>}
                            </td>
                            <td className="px-5 py-3 text-right font-mono text-gray-900">{order.quantity} {order.order_item?.unit || order.products?.unit || ''}</td>
                            <td className="px-5 py-3">
                              <Badge variant="outline" className={statusMap[order.status]?.color || ''}>
                                {statusMap[order.status]?.label || order.status}
                              </Badge>
                            </td>
                            <td className="px-5 py-3 text-gray-600">{order.start_date ? order.start_date.slice(0, 10) : '-'}</td>
                            <td className="px-5 py-3 text-gray-600">{order.due_date ? order.due_date.slice(0, 10) : '-'}</td>
                            <td className="px-5 py-3 text-center">
                              <button onClick={() => setDetailOrder(order)} className="text-blue-600 hover:text-blue-800 text-xs mr-2">查看</button>
                              <button onClick={() => handleEdit(order)} className="text-blue-600 hover:text-blue-800 text-xs mr-2">编辑</button>
                              <button onClick={() => setDeleteId(order.id)} className="text-red-500 hover:text-red-700 text-xs">删除</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-3 text-xs text-gray-400">共 {filteredOrders.length} 条生产订单</div>
      </div>

      {/* 订单详情 */}
      <Sheet open={!!detailOrder} onOpenChange={() => setDetailOrder(null)}>
        <SheetContent className="w-[600px]">
          {detailOrder && (
            <>
              <SheetHeader>
                <SheetTitle>订单详情 - {detailOrder.order_no}</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="text-gray-500">客户：</span>{detailOrder.customers?.name || '未分配'}</div>
                  <div><span className="text-gray-500">产品：</span>{detailOrder.products?.name}</div>
                  <div><span className="text-gray-500">数量：</span><span className="font-mono">{detailOrder.quantity}</span></div>
                  <div><span className="text-gray-500">状态：</span>
                    <Badge variant="outline" className={statusMap[detailOrder.status]?.color || ''}>
                      {statusMap[detailOrder.status]?.label || detailOrder.status}
                    </Badge>
                  </div>
                  <div><span className="text-gray-500">备注：</span>{detailOrder.remark || '-'}</div>
                </div>

                {detailOrder.status !== 'completed' && detailOrder.status !== 'cancelled' && (
                  <div className="flex gap-2 pt-2">
                    {detailOrder.status === 'pending' && (
                      <Button size="sm" onClick={() => handleStatusChange(detailOrder.id, 'in_progress')}>开始生产</Button>
                    )}
                    {detailOrder.status === 'in_progress' && (
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700"
                        onClick={() => {
                          setCompleteOrderId(detailOrder.id);
                          setCompleteWarehouseId(warehouses[0]?.id || '');
                        }}
                      >
                        完成入库
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => handleStatusChange(detailOrder.id, 'cancelled')}>取消订单</Button>
                  </div>
                )}

                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">用料清单</h3>
                  <table className="w-full text-sm border border-gray-200 rounded">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="text-left px-3 py-2 font-medium text-gray-500">物料编码</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-500">物料名称</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-500">需求数量</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-500">已备料</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-500">单位</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detailOrder.production_order_materials || []).map((m, i) => (
                        <tr key={i} className="border-t border-gray-100">
                          <td className="px-3 py-2 font-mono">{m.products?.code || '-'}</td>
                          <td className="px-3 py-2">{m.products?.name || '-'}</td>
                          <td className="px-3 py-2 text-right font-mono">{m.required_qty}</td>
                          <td className="px-3 py-2 text-right font-mono">{m.prepared_qty}</td>
                          <td className="px-3 py-2">{m.products?.unit || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* 新增/编辑 */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-[560px]">
          <SheetHeader>
            <SheetTitle>{editOrder ? '编辑生产订单' : '新建生产订单'}</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-4 px-1">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">客户</label>
              <Select value={formCustomerId} onValueChange={setFormCustomerId}>
                <SelectTrigger><SelectValue placeholder="选择客户（可选）" /></SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}{c.code ? ` (${c.code})` : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">生产产品 *</label>
              <Select value={formProductId} onValueChange={handleSelectProduct}>
                <SelectTrigger><SelectValue placeholder="选择成品" /></SelectTrigger>
                <SelectContent>
                  {finishedProducts.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.code} - {p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">生产数量 *</label>
                <Input value={formQuantity} onChange={(e) => setFormQuantity(e.target.value)} type="number" step="0.01" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">单位</label>
                <Input value={products.find((p) => p.id === formProductId)?.unit || ''} disabled />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">计划开始日期</label>
                <Input value={formStartDate} onChange={(e) => setFormStartDate(e.target.value)} type="date" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">计划完成日期</label>
                <Input value={formDueDate} onChange={(e) => setFormDueDate(e.target.value)} type="date" />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">备注</label>
              <Input value={formRemark} onChange={(e) => setFormRemark(e.target.value)} />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">用料清单</label>
                <Button variant="outline" size="sm" onClick={addMaterialRow}>添加子料</Button>
              </div>
              <div className="space-y-2 max-h-[240px] overflow-y-auto">
                {formMaterials.map((m, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Select value={m.product_id} onValueChange={(v) => updateMaterialRow(idx, 'product_id', v)}>
                      <SelectTrigger className="flex-1 h-9 text-xs"><SelectValue placeholder="选择物料" /></SelectTrigger>
                      <SelectContent>
                        {products.filter((p) => p.id !== formProductId).map((p) => (
                          <SelectItem key={p.id} value={p.id} className="text-xs">{p.code} - {p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      value={m.required_qty}
                      onChange={(e) => updateMaterialRow(idx, 'required_qty', e.target.value)}
                      placeholder="用量"
                      type="number"
                      step="0.01"
                      className="w-24 h-9 text-xs"
                    />
                    <button onClick={() => removeMaterialRow(idx)} className="text-red-400 hover:text-red-600 text-sm">x</button>
                  </div>
                ))}
                {formMaterials.length === 0 && (
                  <div className="text-xs text-gray-400 py-2">选择成品后自动从 BOM 加载，或手动添加</div>
                )}
              </div>
            </div>

            <div className="pt-4 flex gap-3">
              <Button onClick={handleSave} disabled={saving || !formProductId || !formQuantity} className="flex-1">
                {saving ? '保存中...' : '保存'}
              </Button>
              <Button variant="outline" onClick={() => setSheetOpen(false)} className="flex-1">取消</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* 删除确认 */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>确认删除该生产订单及其用料明细吗？</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>确认删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 完成入库对话框 */}
      <Dialog open={!!completeOrderId} onOpenChange={(open) => { if (!open) setCompleteOrderId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>完成生产 - 自动入库</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            完成生产后将自动创建入库单，成品入库到指定仓库，并扣减原材料库存。
          </p>
          <div className="mt-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">入库仓库 *</label>
            <Select value={completeWarehouseId} onValueChange={setCompleteWarehouseId}>
              <SelectTrigger>
                <SelectValue placeholder="选择仓库" />
              </SelectTrigger>
              <SelectContent>
                {warehouses.map((w) => (
                  <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteOrderId(null)}>取消</Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
              onClick={handleCompleteInbound}
              disabled={completing || !completeWarehouseId}
            >
              {completing ? '处理中...' : '确认完成入库'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
