'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { translateUnit } from '@/lib/utils';

/* ---------- 类型 ---------- */
interface Order {
  id: string;
  order_no: string;
  customer_id: string | null;
  product_id: string;
  quantity: number;
  status: string;
  due_date: string | null;
  start_date: string | null;
  remark: string | null;
  customer_order_id: string | null;
  created_at?: string;
  customers?: { id: string; name: string } | null;
  customer_order?: { id: string; order_no: string } | null;
  products?: { id: string; code: string; name: string; unit?: string; spec?: string } | null;
  production_order_materials?: Array<{
    id?: string;
    product_id: string;
    required_qty: number;
    prepared_qty: number;
    products?: { id: string; code: string; name: string; unit?: string } | null;
  }>;
}

interface Product {
  id: string;
  code: string;
  name: string;
  spec?: string;
  unit?: string;
  type?: string;
  category?: string;
  price?: number;
}

interface Customer { id: string; name: string; code?: string }
interface Warehouse { id: string; name: string }

/* ---------- 状态配色 ---------- */
const statusMap: Record<string, { label: string; color: string; bg: string; barColor: string }> = {
  pending:     { label: '待生产', color: 'text-amber-700', bg: 'bg-amber-50',  barColor: 'bg-amber-400' },
  confirmed:   { label: '已确认', color: 'text-indigo-700', bg: 'bg-indigo-50', barColor: 'bg-indigo-400' },
  in_progress: { label: '生产中', color: 'text-blue-700',   bg: 'bg-blue-50',   barColor: 'bg-blue-500' },
  completed:   { label: '已完成', color: 'text-green-700',  bg: 'bg-green-50',  barColor: 'bg-green-500' },
  cancelled:   { label: '已取消', color: 'text-red-600',    bg: 'bg-red-50',    barColor: 'bg-red-300' },
};

export default function ProductionPage() {
  /* ---------- state ---------- */
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterProductId, setFilterProductId] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  // 新增/编辑
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editOrder, setEditOrder] = useState<Order | null>(null);
  const [formCustomerId, setFormCustomerId] = useState('');
  const [formProductId, setFormProductId] = useState('');
  const [formQuantity, setFormQuantity] = useState('');
  const [formStartDate, setFormStartDate] = useState('');
  const [formDueDate, setFormDueDate] = useState('');
  const [formRemark, setFormRemark] = useState('');
  const [formMaterials, setFormMaterials] = useState<Array<{ product_id: string; required_qty: string }>>([]);
  const [saving, setSaving] = useState(false);

  // 删除
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // 完成入库
  const [completeOrderId, setCompleteOrderId] = useState<string | null>(null);
  const [completeWarehouseId, setCompleteWarehouseId] = useState('');
  const [completing, setCompleting] = useState(false);

  // 详情
  const [detailOrder, setDetailOrder] = useState<Order | null>(null);

  // 今天的时间戳，避免渲染中调用 Date.now()
  const [todayMs] = useState(() => Date.now());
  const todayStr = useMemo(() => new Date(todayMs).toISOString().slice(0, 10), [todayMs]);

  /* ---------- fetch ---------- */
  const fetchOrders = useCallback(async () => {
    const res = await fetch('/api/production');
    const data = await res.json();
    setOrders(Array.isArray(data) ? data : data.orders || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchOrders().catch(() => setLoading(false));
    fetch('/api/products').then(r => r.json()).then(d => setProducts(Array.isArray(d) ? d : d.products || [])).catch(() => {});
    fetch('/api/customers').then(r => r.json()).then(d => setCustomers(Array.isArray(d) ? d : d.customers || [])).catch(() => {});
    fetch('/api/warehouses').then(r => r.json()).then(d => setWarehouses(Array.isArray(d) ? d : d.warehouses || [])).catch(() => {});
  }, [fetchOrders]);

  /* ---------- helpers ---------- */
  const filteredOrders = orders.filter((o) => {
    if (filterProductId !== 'all' && o.product_id !== filterProductId) return false;
    if (filterStatus !== 'all' && o.status !== filterStatus) return false;
    return true;
  });

  // 物料下拉列表
  const productMap = new Map<string, { id: string; code: string; name: string }>();
  orders.forEach((o) => {
    if (o.product_id && o.products && !productMap.has(o.product_id)) {
      const p = o.products as unknown as { id: string; code: string; name: string };
      productMap.set(o.product_id, { id: p.id, code: p.code, name: p.name });
    }
  });
  const productList = Array.from(productMap.values());
  const finishedProducts = products.filter((p) => p.type === 'finished_product' || p.type === 'semi_finished');

  /* ---------- 日期范围 ---------- */
  // 计算甘特图日期范围
  const dateRange = useMemo(() => {
    const dates: string[] = [];
    const today = new Date(todayMs);
    // 从7天前到30天后
    for (let i = -7; i <= 30; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      dates.push(d.toISOString().slice(0, 10));
    }
    return dates;
  }, [todayMs]);

  // 按物料分组
  const groupedByProduct = useMemo(() => {
    const map = new Map<string, { product: { id: string; code: string; name: string }; orders: Order[] }>();
    filteredOrders.forEach((o) => {
      const prod = o.products;
      if (!prod) return;
      if (!map.has(o.product_id)) {
        map.set(o.product_id, {
          product: { id: prod.id, code: prod.code, name: prod.name },
          orders: [],
        });
      }
      map.get(o.product_id)!.orders.push(o);
    });
    return Array.from(map.values()).sort((a, b) => a.product.code.localeCompare(b.product.code));
  }, [filteredOrders]);

  /* ---------- handlers ---------- */
  const handleAdd = () => {
    setEditOrder(null);
    setFormCustomerId(''); setFormProductId(''); setFormQuantity('');
    setFormStartDate(''); setFormDueDate(''); setFormRemark('');
    setFormMaterials([]);
    setSheetOpen(true);
  };

  const handleSelectProduct = (pid: string) => {
    setFormProductId(pid);
    fetch(`/api/bom?parent_id=${pid}`).then(r => r.json()).then(data => {
      const bomList = Array.isArray(data) ? data : data.bom || [];
      if (bomList.length > 0) {
        setFormMaterials(bomList.map((b: { child_product_id: string; quantity: number }) => ({
          product_id: b.child_product_id,
          required_qty: String(b.quantity),
        })));
      }
    }).catch(() => {});
  };

  const addMaterialRow = () => setFormMaterials([...formMaterials, { product_id: '', required_qty: '' }]);
  const removeMaterialRow = (idx: number) => setFormMaterials(formMaterials.filter((_, i) => i !== idx));
  const updateMaterialRow = (idx: number, field: string, value: string) => {
    const updated = [...formMaterials];
    updated[idx] = { ...updated[idx], [field]: value };
    setFormMaterials(updated);
  };

  const handleSave = async () => {
    setSaving(true);
    const body = {
      customer_id: formCustomerId || null,
      product_id: formProductId,
      quantity: Number(formQuantity),
      start_date: formStartDate || null,
      due_date: formDueDate || null,
      remark: formRemark || null,
      materials: formMaterials.filter((m) => m.product_id && m.required_qty).map((m) => ({
        product_id: m.product_id,
        required_qty: Number(m.required_qty),
      })),
    };
    try {
      if (editOrder) {
        await fetch('/api/production', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editOrder.id, ...body }) });
      } else {
        await fetch('/api/production', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      }
      setSheetOpen(false);
      fetchOrders();
    } catch { /* ignore */ }
    setSaving(false);
  };

  const handleStatusChange = async (id: string, status: string) => {
    await fetch('/api/production', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) });
    fetchOrders();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await fetch(`/api/production?id=${deleteId}`, { method: 'DELETE' });
    setDeleteId(null);
    fetchOrders();
  };

  const handleCompleteInbound = async () => {
    if (!completeOrderId || !completeWarehouseId) return;
    setCompleting(true);
    try {
      const res = await fetch('/api/production/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ production_order_id: completeOrderId, warehouse_id: completeWarehouseId }),
      });
      const data = await res.json();
      if (data.error) { alert(data.error); }
      setCompleteOrderId(null);
      fetchOrders();
    } catch { /* ignore */ }
    setCompleting(false);
  };

  /* ---------- 日期格式化 ---------- */
  const fmtDate = (d: string | null | undefined) => d ? d.slice(0, 10) : '-';
  const fmtShortDate = (d: string) => { const dt = new Date(d); return `${dt.getMonth() + 1}/${dt.getDate()}`; };
  const getUrgency = (dueDate: string | null | undefined, status: string) => {
    if (!dueDate || status === 'completed' || status === 'cancelled') return 'normal';
    const now = new Date(todayMs); now.setHours(0,0,0,0);
    const due = new Date(dueDate); due.setHours(0,0,0,0);
    const diff = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    if (diff < 0) return 'overdue';
    if (diff <= 3) return 'urgent';
    return 'normal';
  };
  const getDaysDiff = (dueDate: string | null) => {
    if (!dueDate) return 0;
    return Math.ceil((new Date(dueDate).getTime() - todayMs) / 86400000);
  };
  const getRequiredDate = (dueDate: string | null) => {
    if (!dueDate) return null;
    const d = new Date(dueDate);
    d.setDate(d.getDate() - 3);
    return d.toISOString().slice(0, 10);
  };

  // 甘特图条形位置计算
  const getBarStyle = (startDate: string | null, dueDate: string | null) => {
    const firstDate = dateRange[0];
    const lastDate = dateRange[dateRange.length - 1];
    const start = startDate || dueDate || firstDate;
    const end = dueDate || startDate || lastDate;
    if (!start || !end) return { left: '0%', width: '0%' };
    const totalMs = new Date(lastDate).getTime() - new Date(firstDate).getTime();
    const startMs = Math.max(new Date(start).getTime() - new Date(firstDate).getTime(), 0);
    const endMs = Math.min(new Date(end).getTime() - new Date(firstDate).getTime(), totalMs);
    const left = totalMs > 0 ? (startMs / totalMs) * 100 : 0;
    const width = totalMs > 0 ? ((endMs - startMs) / totalMs) * 100 : 0;
    return { left: `${left}%`, width: `${Math.max(width, 1.5)}%` };
  };

  /* ---------- 渲染 ---------- */
  return (
    <>
    <div className="p-8 h-full flex flex-col">
      {/* 顶部 */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <h1 className="text-xl font-semibold text-gray-900">生产订单</h1>
        <Button onClick={handleAdd}>新建订单</Button>
      </div>

      {/* 筛选栏 */}
      <div className="flex items-center gap-4 mb-4 flex-wrap shrink-0">
        <Select value={filterProductId} onValueChange={setFilterProductId}>
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部物料</SelectItem>
            {productList.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.code} - {p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            {Object.entries(statusMap).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="text-xs text-gray-400 ml-auto">
          共 {filteredOrders.length} 条生产订单
        </div>
      </div>

      {/* 甘特图 */}
      {loading ? (
        <div className="py-12 text-center text-gray-400">加载中...</div>
      ) : filteredOrders.length === 0 ? (
        <div className="py-12 text-center text-gray-400">暂无数据</div>
      ) : (
        <div className="flex-1 min-h-0 border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-auto h-full">
            <table className="w-full text-sm" style={{ minWidth: dateRange.length * 28 + 420 }}>
              <thead>
                {/* 月份行 */}
                <tr className="bg-gray-100">
                  <th colSpan={4} className="text-left px-3 py-2 text-xs font-medium text-gray-500 border-b border-r border-gray-200 sticky left-0 bg-gray-100 z-20" style={{ minWidth: 420 }}>
                    物料信息
                  </th>
                  {dateRange.map((d) => {
                    const dt = new Date(d);
                    const isMonthStart = dt.getDate() <= 3 || d === dateRange[0];
                    return (
                      <th key={d} className={`px-0.5 py-1 text-center text-[10px] font-normal border-b border-gray-200 ${isMonthStart ? 'font-medium text-gray-600' : 'text-gray-400'}`}>
                        {isMonthStart ? `${dt.getMonth() + 1}月` : ''}
                      </th>
                    );
                  })}
                </tr>
                {/* 日期行 */}
                <tr className="bg-gray-50">
                  <th className="text-left px-3 py-1.5 text-xs font-medium text-gray-500 border-b border-r border-gray-200 sticky left-0 bg-gray-50 z-20" style={{ minWidth: 100 }}>编码</th>
                  <th className="text-left px-2 py-1.5 text-xs font-medium text-gray-500 border-b border-r border-gray-200 sticky left-[100px] bg-gray-50 z-20" style={{ minWidth: 120 }}>名称</th>
                  <th className="text-left px-2 py-1.5 text-xs font-medium text-gray-500 border-b border-r border-gray-200 sticky left-[220px] bg-gray-50 z-20" style={{ minWidth: 80 }}>客户/单号</th>
                  <th className="text-left px-2 py-1.5 text-xs font-medium text-gray-500 border-b border-r border-gray-200 sticky left-[300px] bg-gray-50 z-20" style={{ minWidth: 120 }}>操作</th>
                  {dateRange.map((d) => {
                    const dt = new Date(d);
                    const isToday = d === todayStr;
                    const isWeekend = dt.getDay() === 0 || dt.getDay() === 6;
                    return (
                      <th key={d} className={`px-0.5 py-1 text-center text-[10px] border-b border-gray-200 ${isToday ? 'bg-blue-100 text-blue-700 font-bold' : isWeekend ? 'bg-gray-100 text-gray-400' : 'text-gray-500'}`} style={{ minWidth: 28 }}>
                        {dt.getDate()}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {groupedByProduct.map((group) => {
                  const totalQty = group.orders.reduce((s, o) => s + o.quantity, 0);
                  const completedQty = group.orders.filter(o => o.status === 'completed').reduce((s, o) => s + o.quantity, 0);
                  return (
                    <ProductGroupRow
                      key={group.product.id}
                      group={group}
                      totalQty={totalQty}
                      completedQty={completedQty}
                      dateRange={dateRange}
                      todayStr={todayStr}
                      statusMap={statusMap}
                      onStatusChange={handleStatusChange}
                      onCompleteInbound={(orderId) => { setCompleteOrderId(orderId); setCompleteWarehouseId(warehouses.length > 0 ? warehouses[0].id : ''); }}
                      onDelete={(orderId) => setDeleteId(orderId)}
                      onDetail={(order) => setDetailOrder(order)}
                      getUrgency={getUrgency}
                      getDaysDiff={getDaysDiff}
                      getRequiredDate={getRequiredDate}
                      getBarStyle={getBarStyle}
                      fmtDate={fmtDate}
                      fmtShortDate={fmtShortDate}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 底部统计 */}
      {!loading && filteredOrders.length > 0 && (
        <div className="mt-3 flex items-center gap-6 text-xs text-gray-500 shrink-0">
          <span>待生产: <span className="font-mono font-medium text-amber-600">{filteredOrders.filter(o => o.status === 'pending').length}</span></span>
          <span>生产中: <span className="font-mono font-medium text-blue-600">{filteredOrders.filter(o => o.status === 'in_progress').length}</span></span>
          <span>已完成: <span className="font-mono font-medium text-green-600">{filteredOrders.filter(o => o.status === 'completed').length}</span></span>
          {filteredOrders.filter(o => getUrgency(o.due_date, o.status) === 'overdue').length > 0 && (
            <span>逾期: <span className="font-mono font-medium text-red-600">{filteredOrders.filter(o => getUrgency(o.due_date, o.status) === 'overdue').length}</span></span>
          )}
          {filteredOrders.filter(o => getUrgency(o.due_date, o.status) === 'urgent').length > 0 && (
            <span>紧急: <span className="font-mono font-medium text-orange-600">{filteredOrders.filter(o => getUrgency(o.due_date, o.status) === 'urgent').length}</span></span>
          )}
        </div>
      )}
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
                <div><span className="text-gray-500">数量：</span><span className="font-mono">{detailOrder.quantity} {translateUnit(detailOrder.products?.unit || '')}</span></div>
                <div><span className="text-gray-500">状态：</span>
                  <Badge variant="outline" className={statusMap[detailOrder.status]?.color || ''}>
                    {statusMap[detailOrder.status]?.label || detailOrder.status}
                  </Badge>
                </div>
                <div><span className="text-gray-500">计划开始：</span>{fmtDate(detailOrder.start_date)}</div>
                <div><span className="text-gray-500">计划完成：</span>{fmtDate(detailOrder.due_date)}</div>
                <div className="col-span-2"><span className="text-gray-500">备注：</span>{detailOrder.remark || '-'}</div>
              </div>

              {detailOrder.status !== 'completed' && detailOrder.status !== 'cancelled' && (
                <div className="flex gap-2 pt-2">
                  {detailOrder.status === 'pending' && (
                    <Button size="sm" onClick={() => handleStatusChange(detailOrder.id, 'in_progress')}>开始生产</Button>
                  )}
                  {detailOrder.status === 'in_progress' && (
                    <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => { setCompleteOrderId(detailOrder.id); setCompleteWarehouseId(warehouses[0]?.id || ''); }}>
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
                        <td className="px-3 py-2">{translateUnit(m.products?.unit || '-')}</td>
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
              <Input value={translateUnit(products.find((p) => p.id === formProductId)?.unit || '')} disabled />
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
                  <Input value={m.required_qty} onChange={(e) => updateMaterialRow(idx, 'required_qty', e.target.value)} placeholder="用量" type="number" step="0.01" className="w-24 h-9 text-xs" />
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
            <SelectTrigger><SelectValue placeholder="选择仓库" /></SelectTrigger>
            <SelectContent>
              {warehouses.map((w) => (
                <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setCompleteOrderId(null)}>取消</Button>
          <Button className="bg-green-600 hover:bg-green-700" onClick={handleCompleteInbound} disabled={completing || !completeWarehouseId}>
            {completing ? '处理中...' : '确认完成入库'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

/* ========== 物料分组行组件 ========== */
interface ProductGroupRowProps {
  group: { product: { id: string; code: string; name: string }; orders: Order[] };
  totalQty: number;
  completedQty: number;
  dateRange: string[];
  todayStr: string;
  statusMap: Record<string, { label: string; color: string; bg: string; barColor: string }>;
  onStatusChange: (id: string, status: string) => void;
  onCompleteInbound: (orderId: string) => void;
  onDelete: (orderId: string) => void;
  onDetail: (order: Order) => void;
  getUrgency: (dueDate: string | null | undefined, status: string) => string;
  getDaysDiff: (dueDate: string | null) => number;
  getRequiredDate: (dueDate: string | null) => string | null;
  getBarStyle: (startDate: string | null, dueDate: string | null) => { left: string; width: string };
  fmtDate: (d: string | null | undefined) => string;
  fmtShortDate: (d: string) => string;
}

function ProductGroupRow({
  group, totalQty, completedQty, dateRange, todayStr, statusMap,
  onStatusChange, onCompleteInbound, onDelete, onDetail,
  getUrgency, getDaysDiff, getRequiredDate, getBarStyle, fmtDate, fmtShortDate,
}: ProductGroupRowProps) {
  const [expanded, setExpanded] = useState(true);
  const progressPct = totalQty > 0 ? Math.round((completedQty / totalQty) * 100) : 0;

  return (
    <>
      {/* 物料组标题行 */}
      <tr className="bg-gray-50 hover:bg-gray-100 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <td colSpan={4} className="px-3 py-2.5 border-b border-r border-gray-200 sticky left-0 bg-gray-50 z-10" style={{ minWidth: 420 }}>
          <div className="flex items-center gap-3">
            <span className={`text-xs transition-transform ${expanded ? 'rotate-90' : ''}`}>▶</span>
            <span className="font-mono text-xs text-gray-500">{group.product.code}</span>
            <span className="text-sm font-medium text-gray-900 truncate">{group.product.name}</span>
            <span className="text-xs text-gray-400">
              {group.orders.length} 单 / <span className="font-mono">{totalQty}</span> 总量
            </span>
            {completedQty > 0 && (
              <div className="flex items-center gap-2">
                <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 rounded-full" style={{ width: `${progressPct}%` }} />
                </div>
                <span className="text-[10px] text-green-600 font-mono">{progressPct}%</span>
              </div>
            )}
          </div>
        </td>
        {/* 甘特条 - 合并所有订单的时间范围 */}
        <td colSpan={dateRange.length} className="px-0 py-2.5 border-b border-gray-200 relative">
          {group.orders.filter(o => o.status !== 'cancelled').map((o) => {
            const barStyle = getBarStyle(o.start_date, o.due_date);
            const st = statusMap[o.status] || statusMap.pending;
            const urgency = getUrgency(o.due_date, o.status);
            return (
              <div
                key={o.id}
                className={`absolute top-1 h-3 rounded-sm ${st.barColor} ${urgency === 'overdue' ? 'ring-1 ring-red-400' : urgency === 'urgent' ? 'ring-1 ring-orange-400' : ''}`}
                style={{ left: barStyle.left, width: barStyle.width, opacity: 0.7 }}
                title={`${o.order_no} ${fmtDate(o.start_date)}~${fmtDate(o.due_date)}`}
              />
            );
          })}
        </td>
      </tr>

      {/* 展开的订单行 */}
      {expanded && group.orders.map((order) => {
        const st = statusMap[order.status] || { label: order.status, color: '', bg: '', barColor: 'bg-gray-300' };
        const urgency = getUrgency(order.due_date, order.status);
        const days = getDaysDiff(order.due_date);
        const reqDate = getRequiredDate(order.due_date);
        const barStyle = getBarStyle(order.start_date, order.due_date);

        return (
          <tr key={order.id} className={`hover:bg-white/80 ${urgency === 'overdue' ? 'bg-red-50/50' : urgency === 'urgent' ? 'bg-orange-50/50' : ''}`}>
            {/* 订单号 */}
            <td className="px-3 py-2 border-b border-r border-gray-200 sticky left-0 z-10 bg-inherit" style={{ minWidth: 100 }}>
              <div className="flex items-center gap-1.5">
                {urgency !== 'normal' && (
                  <span className={`inline-block w-2 h-2 rounded-full ${urgency === 'overdue' ? 'bg-red-500 animate-pulse' : 'bg-orange-400'}`} />
                )}
                <span className="font-mono text-xs text-gray-600">{order.order_no}</span>
              </div>
            </td>
            {/* 数量+状态 */}
            <td className="px-2 py-2 border-b border-r border-gray-200 sticky left-[100px] z-10 bg-inherit" style={{ minWidth: 120 }}>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm">{order.quantity}</span>
                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${st.color}`}>{st.label}</Badge>
              </div>
            </td>
            {/* 客户/交期 */}
            <td className="px-2 py-2 border-b border-r border-gray-200 sticky left-[220px] z-10 bg-inherit" style={{ minWidth: 80 }}>
              <div className="text-xs text-gray-500">
                <div>{order.customers?.name || '-'}</div>
                <div className="font-mono text-[10px] text-gray-400">{order.customer_order?.order_no || ''}</div>
                {order.due_date && (
                  <div className={`text-[10px] ${urgency === 'overdue' ? 'text-red-600 font-medium' : urgency === 'urgent' ? 'text-orange-600' : 'text-gray-400'}`}>
                    交期:{fmtShortDate(order.due_date)}
                    {urgency === 'overdue' && <span> 逾期{Math.abs(days)}天</span>}
                    {urgency === 'urgent' && <span> 仅{days}天</span>}
                  </div>
                )}
                {reqDate && order.status !== 'completed' && order.status !== 'cancelled' && (
                  <div className="text-[10px] text-orange-500">要求:{fmtShortDate(reqDate)}</div>
                )}
              </div>
            </td>
            {/* 操作按钮 */}
            <td className="px-2 py-2 border-b border-r border-gray-200 sticky left-[300px] z-10 bg-inherit" style={{ minWidth: 120 }}>
              <div className="flex items-center gap-1.5 flex-wrap">
                {order.status === 'pending' && (
                  <button onClick={() => onStatusChange(order.id, 'in_progress')} className="text-[11px] px-2 py-1 rounded bg-blue-500 text-white hover:bg-blue-600 whitespace-nowrap">
                    开始生产
                  </button>
                )}
                {order.status === 'in_progress' && (
                  <button onClick={() => onCompleteInbound(order.id)} className="text-[11px] px-2 py-1 rounded bg-green-600 text-white hover:bg-green-700 whitespace-nowrap">
                    完成入库
                  </button>
                )}
                {(order.status === 'pending' || order.status === 'in_progress') && (
                  <button onClick={() => onStatusChange(order.id, 'cancelled')} className="text-[11px] px-1.5 py-1 rounded border border-red-300 text-red-500 hover:bg-red-50 whitespace-nowrap">
                    取消
                  </button>
                )}
                <button onClick={() => onDetail(order)} className="text-[11px] px-1.5 py-1 rounded border border-gray-300 text-gray-500 hover:bg-gray-100 whitespace-nowrap">
                  详情
                </button>
              </div>
            </td>
            {/* 甘特条 */}
            <td colSpan={dateRange.length} className="px-0 py-2 border-b border-gray-200 relative">
              <div className="relative h-6">
                {/* 今日线 */}
                {dateRange.includes(todayStr) && (() => {
                  const idx = dateRange.indexOf(todayStr);
                  return <div className="absolute top-0 bottom-0 w-px bg-blue-500 z-10" style={{ left: `${(idx / dateRange.length) * 100}%` }} />;
                })()}
                {/* 甘特条 */}
                <div
                  className={`absolute top-1 h-4 rounded ${st.barColor} ${urgency === 'overdue' ? 'ring-2 ring-red-400' : urgency === 'urgent' ? 'ring-1 ring-orange-300' : ''} flex items-center justify-center`}
                  style={{ left: barStyle.left, width: barStyle.width, minWidth: 4 }}
                >
                  {parseFloat(barStyle.width) > 5 && (
                    <span className="text-[9px] text-white font-medium truncate px-1">{order.quantity}</span>
                  )}
                </div>
                {/* 要求完成日期标记 */}
                {reqDate && order.status !== 'completed' && order.status !== 'cancelled' && dateRange.includes(reqDate) && (() => {
                  const idx = dateRange.indexOf(reqDate);
                  return (
                    <div
                      className="absolute top-0 w-0.5 h-6 bg-orange-400 z-10"
                      style={{ left: `${(idx / dateRange.length) * 100}%` }}
                      title={`要求完成: ${reqDate}`}
                    />
                  );
                })()}
              </div>
            </td>
          </tr>
        );
      })}
    </>
  );
}
