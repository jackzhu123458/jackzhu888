'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { ChevronDown, ChevronRight, Plus, Play, CheckCircle2, XCircle, Eye, Search, ShieldAlert, Workflow } from 'lucide-react';
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
  delivered?: boolean;
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
const statusMap: Record<string, { label: string; color: string; bg: string }> = {
  pending:     { label: '待生产', color: 'text-amber-700 border-amber-300', bg: 'bg-amber-50' },
  in_progress: { label: '生产中', color: 'text-blue-700 border-blue-300',   bg: 'bg-blue-50' },
  completed:   { label: '已完成', color: 'text-green-700 border-green-300', bg: 'bg-green-50' },
  confirmed:   { label: '已确认', color: 'text-indigo-700 border-indigo-300', bg: 'bg-indigo-50' },
  cancelled:   { label: '已取消', color: 'text-red-600 border-red-300',     bg: 'bg-red-50' },
};

/* ---------- 看板列定义 ---------- */
const columns = [
  { key: 'pending',     label: '待生产', headerBg: 'bg-amber-500',  headerText: 'text-white' },
  { key: 'in_progress', label: '生产中', headerBg: 'bg-blue-500',   headerText: 'text-white' },
  { key: 'completed',   label: '已完成', headerBg: 'bg-green-600',  headerText: 'text-white' },
] as const;

export default function ProductionPage() {
  /* ---------- state ---------- */
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [qualityAlerts, setQualityAlerts] = useState<Array<{ product_id: string; severity: string; title: string }>>([]);
  const [processFlows, setProcessFlows] = useState<Record<string, Array<{ step_order: number; step_name: string; description: string | null; estimated_minutes: number | null; is_key_step: boolean }>>>({});
  const [loading, setLoading] = useState(true);
  const [filterProductId, setFilterProductId] = useState('all');
  const [hideDelivered, setHideDelivered] = useState(true);
  const [searchText, setSearchText] = useState('');

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
  const [saveError, setSaveError] = useState('');

  // 模糊搜索
  const [productSearch, setProductSearch] = useState('');
  const [productSearchFocused, setProductSearchFocused] = useState(false);
  const [materialSearches, setMaterialSearches] = useState<Record<number, string>>({});
  const [materialSearchFocused, setMaterialSearchFocused] = useState<Record<number, boolean>>({});

  // 删除
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // 完成入库
  const [completeOrderId, setCompleteOrderId] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const completeDialogRef = React.useRef<HTMLDivElement>(null);

  // 详情
  const [detailOrder, setDetailOrder] = useState<Order | null>(null);
  // 合并卡片展开状态
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // 今天的时间戳，用于计算紧急度
  // 初始为0，客户端挂载后再设置，避免 SSR/客户端 hydration 不一致
  const [todayMs, setTodayMs] = useState(0);
  useEffect(() => {
    setTodayMs(Date.now());
  }, []);

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
    fetch('/api/quality/alerts?status=active&limit=100').then(r => r.json()).then(d => setQualityAlerts(Array.isArray(d) ? d : d.alerts || [])).catch(() => {});
    // 加载所有工艺流程（按产品分组）
    fetch('/api/process-flows').then(r => r.json()).then(d => {
      if (Array.isArray(d)) {
        const map: Record<string, Array<{ step_order: number; step_name: string; description: string | null; estimated_minutes: number | null; is_key_step: boolean }>> = {};
        d.forEach((s: { product_id: string; step_order: number; step_name: string; description: string | null; estimated_minutes: number | null; is_key_step: boolean }) => {
          if (!map[s.product_id]) map[s.product_id] = [];
          map[s.product_id].push(s);
        });
        setProcessFlows(map);
      }
    }).catch(() => {});
  }, [fetchOrders]);

  /* ---------- helpers ---------- */
  const filteredOrders = orders.filter((o) => {
    if (filterProductId !== 'all' && o.product_id !== filterProductId) return false;
    if (hideDelivered && o.delivered) return false;
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      const prod = o.products as unknown as Record<string, unknown>;
      const cust = o.customers as unknown as Record<string, unknown>;
      const fields = [
        o.order_no,
        String(prod?.code ?? ''),
        String(prod?.name ?? ''),
        String(cust?.name ?? ''),
      ].map(f => f.toLowerCase());
      if (!fields.some(f => f.includes(q))) return false;
    }
    return true;
  });

  const ordersByStatus = (status: string) => filteredOrders.filter((o) => o.status === status);

  // 物料下拉列表
  const productMap = new Map<string, { id: string; code: string; name: string }>();
  orders.forEach((o) => {
    if (o.product_id && o.products && !productMap.has(o.product_id)) {
      const p = o.products as unknown as { id: string; code: string; name: string };
      productMap.set(o.product_id, { id: p.id, code: p.code, name: p.name });
    }
  });
  const productList = Array.from(productMap.values());
  // 生产订单可选所有产品（自制件/成品/半成品/原材料都可能需要生产）
  const producibleProducts = products;

  /* ---------- handlers ---------- */
  const handleAdd = () => {
    setEditOrder(null);
    setFormCustomerId(''); setFormProductId(''); setFormQuantity('');
    setFormStartDate(''); setFormDueDate(''); setFormRemark('');
    setFormMaterials([]);
    setProductSearch(''); setMaterialSearches({});
    setSaveError('');
    setSheetOpen(true);
  };

  const handleSelectProduct = (pid: string) => {
    setFormProductId(pid);
    const prod = products.find((p) => p.id === pid);
    if (prod) {
      setProductSearch(`${prod.code} - ${prod.name}`);
    }
    // 自动从 BOM 加载子料
    if (prod) {
      fetch(`/api/bom?parent_id=${pid}`).then(r => r.json()).then((data: unknown) => {
        const bomList = Array.isArray(data) ? data : (data as { bom?: unknown[] }).bom || [];
        if (bomList.length > 0) {
          const mats = bomList.map((b: { child_product_id: string; quantity: number }) => ({
            product_id: b.child_product_id,
            required_qty: String(b.quantity),
          }));
          setFormMaterials(mats);
          // 自动填充物料搜索文本
          const newSearches: Record<number, string> = {};
          mats.forEach((m: { product_id: string }, idx: number) => {
            const mp = products.find((p) => p.id === m.product_id);
            if (mp) newSearches[idx] = `${mp.code} - ${mp.name}`;
          });
          setMaterialSearches(newSearches);
        }
      }).catch(() => {});
    }
  };

  const addMaterialRow = () => setFormMaterials([...formMaterials, { product_id: '', required_qty: '' }]);
  const removeMaterialRow = (idx: number) => setFormMaterials(formMaterials.filter((_, i) => i !== idx));
  const updateMaterialRow = (idx: number, field: string, value: string) => {
    const updated = [...formMaterials];
    updated[idx] = { ...updated[idx], [field]: value };
    setFormMaterials(updated);
    if (field === 'product_id') {
      const mp = products.find((p) => p.id === value);
      setMaterialSearches(prev => ({ ...prev, [idx]: mp ? `${mp.code} - ${mp.name}` : '' }));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
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
      let res: Response;
      if (editOrder) {
        res = await fetch('/api/production', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editOrder.id, ...body }) });
      } else {
        res = await fetch('/api/production', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      }
      const data = await res.json();
      if (!res.ok || data.error) {
        setSaveError(data.error || '保存失败');
        return;
      }
      setSheetOpen(false);
      fetchOrders();
    } catch (err) {
      setSaveError('网络错误，请重试');
    } finally {
      setSaving(false);
    }
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
    if (!completeOrderId) return;
    setCompleting(true);
    try {
      const res = await fetch('/api/production/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ production_order_id: completeOrderId }),
      });
      const data = await res.json();
      if (data.error) { alert(data.error); }
      else { alert(data.message || '生产完成，已自动入库'); }
      setCompleteOrderId(null);
      fetchOrders();
    } catch { /* ignore */ }
    setCompleting(false);
  };

  /* ---------- 日期格式化 ---------- */
  const fmtDate = (d: string | null | undefined) => d ? d.slice(0, 10) : '-';
  const isOverdue = (d: string | null | undefined) => todayMs > 0 && !!d && new Date(d).getTime() < todayMs;
  const getUrgency = (dueDate: string | null | undefined, status: string) => {
    if (!dueDate || status === 'completed' || status === 'cancelled' || todayMs === 0) return 'normal';
    const now = new Date(todayMs); now.setHours(0,0,0,0);
    const due = new Date(dueDate); due.setHours(0,0,0,0);
    const diff = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    if (diff < 0) return 'overdue';      // 已逾期
    if (diff <= 3) return 'urgent';      // 3天内紧急
    return 'normal';
  };
  const urgencyConfig: Record<string, { label: string; color: string; bg: string; border: string; pulse: string }> = {
    overdue: { label: '已逾期', color: 'text-red-700', bg: 'bg-red-100', border: 'border-red-400', pulse: '' },
    urgent:  { label: '紧急', color: 'text-orange-700', bg: 'bg-orange-100', border: 'border-orange-400', pulse: 'animate-pulse' },
    normal:  { label: '', color: '', bg: '', border: '', pulse: '' },
  };
  const getRequiredCompleteDate = (dueDate: string | null | undefined) => {
    if (!dueDate) return null;
    const due = new Date(dueDate);
    due.setDate(due.getDate() - 3);
    return due.toISOString().slice(0, 10);
  };

  /* ---------- 按物料分组的渲染 ---------- */

  /** 按product_id分组，返回 { productId: Order[] } */
  const groupByProduct = (orders: Order[]): Map<string, Order[]> => {
    const map = new Map<string, Order[]>();
    for (const o of orders) {
      const pid = o.product_id || '__none__';
      if (!map.has(pid)) map.set(pid, []);
      map.get(pid)!.push(o);
    }
    return map;
  };

  /** 渲染分组卡片 */
  const renderGroupedCards = (orders: Order[]) => {
    const groups = groupByProduct(orders);
    const result: React.ReactNode[] = [];
    for (const [productId, groupOrders] of groups) {
      const prod = groupOrders[0].products;
      const totalQty = groupOrders.reduce((s, o) => s + (o.quantity || 0), 0);
      // 最紧急的交期
      const earliestOrder = groupOrders.reduce((a, b) => (!a.due_date || (b.due_date && a.due_date > b.due_date)) ? b : a);
      const urgency = getUrgency(earliestOrder.due_date, earliestOrder.status);
      const uc = urgencyConfig[urgency];
      const daysDiff = earliestOrder.due_date
        ? Math.ceil((new Date(earliestOrder.due_date).getTime() - todayMs) / 86400000)
        : 0;
      const reqDate = getRequiredCompleteDate(earliestOrder.due_date);
      const isReqOverdue = reqDate && new Date(reqDate).getTime() < todayMs;
      const groupKey = `${productId}_${earliestOrder.status}`;
      const isExpanded = expandedGroups.has(groupKey);

      result.push(
        <div key={productId} className={`bg-white rounded-lg border shadow-sm hover:shadow-md transition-shadow ${groupOrders.some(o => o.delivered) && !hideDelivered ? 'opacity-60 border-gray-300' : ''} ${urgency === 'overdue' ? 'border-red-400' : urgency === 'urgent' ? 'border-orange-300' : 'border-gray-200'}`}>
          {/* 已送货标记 */}
          {groupOrders.some(o => o.delivered) && !hideDelivered && (
            <div className="px-4 py-1 text-xs font-medium text-gray-500 bg-gray-100 rounded-t-lg flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-gray-400" />
              已送货
            </div>
          )}
          {/* 紧急提示条 */}
          {urgency !== 'normal' && (
            <div className={`px-4 py-1.5 text-xs font-medium ${uc.color} ${uc.bg} rounded-t-lg flex items-center gap-1.5 ${uc.pulse}`}>
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-current" />
              {urgency === 'overdue' ? `已逾期 ${Math.abs(daysDiff)} 天` : `距交期仅 ${daysDiff} 天`}
            </div>
          )}
          {/* 卡片头部 - 可点击展开 */}
          <button
            onClick={() => toggleGroup(groupKey)}
            className={`w-full text-left px-4 py-3 ${urgency !== 'normal' ? 'pt-2' : ''} hover:bg-gray-50/50 transition-colors`}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="text-sm font-medium text-gray-900 truncate flex items-center gap-1.5" title={prod?.name}>
                {prod?.name || '未知物料'}
                {processFlows[productId] && processFlows[productId].length > 0 && (
                  <span className="inline-flex items-center gap-0.5 shrink-0" title={`工艺: ${processFlows[productId].map(s => s.step_name).join(' → ')}`}>
                    <Workflow className="w-3 h-3 text-indigo-400" />
                    <span className="text-[10px] text-indigo-400">{processFlows[productId].length}步</span>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                <span className="text-xs text-gray-400">{groupOrders.length}单</span>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
              </div>
            </div>
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>合计: <span className="font-mono font-semibold text-gray-800">{totalQty}</span> {translateUnit(prod?.unit || '')}</span>
              <span>交期: <span className={urgency !== 'normal' ? 'text-red-600 font-medium' : ''}>{fmtDate(earliestOrder.due_date)}</span></span>
            </div>
            {reqDate && (
              <div className="text-xs text-gray-400 mt-0.5">
                要求完成: <span className={`font-medium ${isReqOverdue && earliestOrder.status !== 'completed' && earliestOrder.status !== 'cancelled' ? 'text-red-600' : 'text-orange-600'}`}>{reqDate}</span>
              </div>
            )}
          </button>

          {/* 展开的子订单列表 */}
          {isExpanded && (
            <div className="border-t border-gray-100">
              {groupOrders.map((order) => {
                const cust = order.customers;
                const st = statusMap[order.status] || { label: order.status, color: '', bg: '' };
                const oUrgency = getUrgency(order.due_date, order.status);
                const oDaysDiff = order.due_date
                  ? Math.ceil((new Date(order.due_date).getTime() - todayMs) / 86400000)
                  : 0;
                return (
                  <div key={order.id} className={`px-4 py-2.5 border-b border-gray-50 last:border-b-0 ${order.delivered && !hideDelivered ? 'bg-gray-100/50' : 'bg-gray-50/30'}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-xs text-gray-500">{order.order_no}</span>
                      <div className="flex items-center gap-1.5">
                        {order.delivered && !hideDelivered && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-gray-500 border-gray-300 bg-gray-50">已送货</Badge>
                        )}
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${st.color}`}>{st.label}</Badge>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-600">
                        数量: <span className="font-mono font-medium">{order.quantity}</span> {translateUnit(prod?.unit || '')}
                        {cust && <span className="text-gray-400 ml-2">{cust.name}</span>}
                      </span>
                      <span className="text-gray-400">
                        {oUrgency === 'overdue' ? <span className="text-red-600 font-medium">逾期{oDaysDiff}天</span> :
                         oUrgency === 'urgent' ? <span className="text-orange-600">剩{oDaysDiff}天</span> :
                         fmtDate(order.due_date)}
                      </span>
                    </div>
                    {order.customer_order && (
                      <div className="text-[10px] text-gray-400 mt-0.5">客户单号: {order.customer_order.order_no}</div>
                    )}
                    {/* 子订单操作按钮 */}
                    <div className="mt-1.5 flex items-center gap-1.5">
                      {order.status === 'pending' && (
                        <button onClick={() => handleStatusChange(order.id, 'in_progress')} className="text-[11px] px-2 py-0.5 rounded bg-blue-500 text-white hover:bg-blue-600 transition-colors">
                          开始生产
                        </button>
                      )}
                      {order.status === 'in_progress' && (
                        <button onClick={() => { setCompleteOrderId(order.id); }} className="text-[11px] px-2 py-0.5 rounded bg-green-600 text-white hover:bg-green-700 transition-colors">
                          完成入库
                        </button>
                      )}
                      {(order.status === 'pending' || order.status === 'in_progress') && (
                        <button onClick={() => handleStatusChange(order.id, 'cancelled')} className="text-[11px] px-2 py-0.5 rounded border border-red-300 text-red-500 hover:bg-red-50 transition-colors">
                          取消
                        </button>
                      )}
                      <button onClick={() => setDetailOrder(order)} className="text-[11px] px-2 py-0.5 rounded border border-gray-300 text-gray-500 hover:bg-gray-100 transition-colors ml-auto">
                        详情
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    }
    return result;
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
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="搜索订单号/物料/客户..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="pl-8 pr-3 py-1.5 border border-gray-300 rounded-md text-sm w-56 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
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
        <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={hideDelivered}
            onChange={(e) => setHideDelivered(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          隐藏已送货
        </label>
        <div className="text-xs text-gray-400 ml-auto">
          共 {filteredOrders.length} 条生产订单
          {hideDelivered && orders.filter(o => o.delivered).length > 0 && (
            <span className="text-gray-400 ml-1">
              （已隐藏 {orders.filter(o => o.delivered).length} 条已送货）
            </span>
          )}
        </div>
      </div>

      {/* 看板矩阵 */}
      {loading ? (
        <div className="py-12 text-center text-gray-400">加载中...</div>
      ) : filteredOrders.length === 0 ? (
        <div className="py-12 text-center text-gray-400">暂无数据</div>
      ) : (
        <div className="grid grid-cols-3 gap-5 flex-1 min-h-0">
          {columns.map((col) => {
            const colOrders = ordersByStatus(col.key).sort((a, b) => {
              // 紧急/逾期排前面
              const ua = getUrgency(a.due_date, a.status);
              const ub = getUrgency(b.due_date, b.status);
              const priority: Record<string, number> = { overdue: 0, urgent: 1, normal: 2 };
              const pa = priority[ua] ?? 2, pb = priority[ub] ?? 2;
              if (pa !== pb) return pa - pb;
              // 同紧急度按交期排序
              return (a.due_date || '').localeCompare(b.due_date || '');
            });
            return (
              <div key={col.key} className="flex flex-col min-h-0">
                {/* 列标题 */}
                <div className={`${col.headerBg} ${col.headerText} px-4 py-2.5 rounded-t-lg flex items-center justify-between`}>
                  <span className="font-medium text-sm">{col.label}</span>
                  <span className="text-xs opacity-80 bg-white/20 px-2 py-0.5 rounded-full">{colOrders.length}</span>
                </div>
                {/* 卡片列表 */}
                <div className="flex-1 overflow-y-auto bg-gray-50/50 rounded-b-lg border border-t-0 border-gray-200 p-3 space-y-3">
                  {colOrders.length === 0 ? (
                    <div className="py-8 text-center text-xs text-gray-300">暂无订单</div>
                  ) : (
                    renderGroupedCards(colOrders)
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 已取消订单折叠 */}
      {ordersByStatus('cancelled').length > 0 && (
        <details className="mt-4">
          <summary className="text-sm text-gray-400 cursor-pointer hover:text-gray-600">
            已取消订单 ({ordersByStatus('cancelled').length})
          </summary>
          <div className="mt-2 grid grid-cols-3 gap-3">
            {renderGroupedCards(ordersByStatus('cancelled'))}
          </div>
        </details>
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
                <div><span className="text-gray-500">产品：</span>{detailOrder.products?.name}
                  {(() => {
                    const pAlerts = qualityAlerts.filter(a => a.product_id === detailOrder.product_id);
                    if (pAlerts.length === 0) return null;
                    const isCritical = pAlerts.some(a => a.severity === 'critical' || a.severity === 'high');
                    return (
                      <span className="inline-flex items-center gap-1 ml-1" title={pAlerts.map(a => a.title).join('; ')}>
                        <ShieldAlert className={`h-3.5 w-3.5 ${isCritical ? 'text-red-600' : 'text-yellow-600'}`} />
                        <span className={`text-xs px-1 py-0.5 rounded ${isCritical ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>{pAlerts.length}条警示</span>
                      </span>
                    );
                  })()}
                </div>
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
                    <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => { setCompleteOrderId(detailOrder.id); }}>
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
                    {(detailOrder.production_order_materials || []).map((m, i) => {
                      const matAlerts = qualityAlerts.filter(a => a.product_id === m.product_id);
                      const hasCriticalAlert = matAlerts.some(a => a.severity === 'critical' || a.severity === 'high');
                      return (
                        <tr key={i} className={`border-t border-gray-100 ${hasCriticalAlert ? 'bg-red-50' : matAlerts.length > 0 ? 'bg-yellow-50' : ''}`}>
                          <td className="px-3 py-2 font-mono">
                            <div className="flex items-center gap-1">
                              {m.products?.code || '-'}
                              {matAlerts.length > 0 && (
                                <span title={matAlerts.map(a => a.title).join('; ')} className="inline-flex items-center">
                                  <ShieldAlert className={`h-3.5 w-3.5 ${hasCriticalAlert ? 'text-red-600' : 'text-yellow-600'}`} />
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1">
                              {m.products?.name || '-'}
                              {matAlerts.length > 0 && (
                                <span className={`text-xs px-1 py-0.5 rounded ${hasCriticalAlert ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                  {matAlerts.length}条警示
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right font-mono">{m.required_qty}</td>
                          <td className="px-3 py-2 text-right font-mono">{m.prepared_qty}</td>
                          <td className="px-3 py-2">{translateUnit(m.products?.unit || '-')}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* 工艺流程 */}
              {detailOrder.product_id && processFlows[detailOrder.product_id] && processFlows[detailOrder.product_id].length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
                    <Workflow className="w-4 h-4 text-indigo-500" />
                    工艺流程
                  </h3>
                  <div className="flex items-start gap-0 overflow-x-auto pb-2">
                    {processFlows[detailOrder.product_id].map((step, idx) => (
                      <React.Fragment key={idx}>
                        <div className={`flex flex-col items-center min-w-[72px] max-w-[100px] ${step.is_key_step ? '' : ''}`}>
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                            step.is_key_step
                              ? 'bg-amber-500 text-white'
                              : 'bg-indigo-100 text-indigo-700'
                          }`}>
                            {step.step_order}
                          </div>
                          <div className={`mt-1 text-xs text-center leading-tight ${
                            step.is_key_step ? 'font-semibold text-amber-700' : 'text-gray-600'
                          }`}>
                            {step.step_name}
                          </div>
                          {step.estimated_minutes && (
                            <div className="text-[10px] text-gray-400 mt-0.5">{step.estimated_minutes}分钟</div>
                          )}
                        </div>
                        {idx < processFlows[detailOrder.product_id].length - 1 && (
                          <div className="flex items-center pt-2.5 px-0.5">
                            <div className="w-4 h-0.5 bg-gray-300" />
                            <div className="text-gray-300 text-xs">›</div>
                          </div>
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>

    {/* 新增/编辑 - 居中弹窗 */}
    <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editOrder ? '编辑生产订单' : '新建生产订单'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
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
            <div className="relative">
              <Input
                placeholder="输入编码或名称搜索产品"
                value={formProductId ? productSearch : (productSearchFocused ? productSearch : '')}
                onChange={(e) => {
                  setProductSearch(e.target.value);
                  setFormProductId('');
                }}
                onFocus={() => setProductSearchFocused(true)}
                onBlur={() => setTimeout(() => setProductSearchFocused(false), 200)}
              />
              {formProductId && (
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => { setFormProductId(''); setProductSearch(''); setFormMaterials([]); setMaterialSearches({}); }}
                >✕</button>
              )}
              {productSearchFocused && !formProductId && productSearch && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
                  {producibleProducts
                    .filter((p) => {
                      const q = productSearch.toLowerCase();
                      return p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q);
                    })
                    .slice(0, 20)
                    .map((p) => (
                      <div
                        key={p.id}
                        className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm"
                        onMouseDown={() => handleSelectProduct(p.id)}
                      >
                        <span className="font-mono text-gray-500">{p.code}</span>
                        <span className="ml-2">{p.name}</span>
                      </div>
                    ))}
                  {producibleProducts.filter((p) => {
                    const q = productSearch.toLowerCase();
                    return p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q);
                  }).length === 0 && (
                    <div className="px-3 py-2 text-sm text-gray-400">无匹配产品</div>
                  )}
                </div>
              )}
            </div>
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
                  <div className="relative flex-1">
                    <Input
                      className="h-9 text-xs"
                      placeholder="搜索物料编码或名称"
                      value={m.product_id ? (materialSearches[idx] || '') : (materialSearchFocused[idx] ? (materialSearches[idx] || '') : '')}
                      onChange={(e) => {
                        setMaterialSearches(prev => ({ ...prev, [idx]: e.target.value }));
                        updateMaterialRow(idx, 'product_id', '');
                      }}
                      onFocus={() => setMaterialSearchFocused(prev => ({ ...prev, [idx]: true }))}
                      onBlur={() => setTimeout(() => setMaterialSearchFocused(prev => ({ ...prev, [idx]: false })), 200)}
                    />
                    {m.product_id && (
                      <button
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                        onClick={() => { updateMaterialRow(idx, 'product_id', ''); setMaterialSearches(prev => ({ ...prev, [idx]: '' })); }}
                      >✕</button>
                    )}
                    {materialSearchFocused[idx] && !m.product_id && materialSearches[idx] && (
                      <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-36 overflow-y-auto">
                        {products
                          .filter((p) => p.id !== formProductId)
                          .filter((p) => {
                            const q = (materialSearches[idx] || '').toLowerCase();
                            return p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q);
                          })
                          .slice(0, 15)
                          .map((p) => (
                            <div
                              key={p.id}
                              className="px-2 py-1.5 hover:bg-blue-50 cursor-pointer text-xs"
                              onMouseDown={() => updateMaterialRow(idx, 'product_id', p.id)}
                            >
                              <span className="font-mono text-gray-500">{p.code}</span>
                              <span className="ml-1">{p.name}</span>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
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
          {saveError && (
            <p className="text-sm text-red-600 mt-2">{saveError}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>

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
      <DialogContent ref={completeDialogRef}>
        <DialogHeader>
          <DialogTitle>完成生产 - 自动入库</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-gray-600">
          完成生产后将自动创建入库单，系统根据BOM库位号自动匹配入库仓库，无库位号则入待发货仓。
        </p>
        {completeOrderId && (() => {
          const order = orders.find(o => o.id === completeOrderId);
          if (!order) return null;
          return (
            <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="text-sm font-medium text-gray-800">
                产品：{order.products?.name}
              </div>
              <div className="text-sm text-gray-600 mt-1">
                数量：{Number(order.quantity).toLocaleString()} {order.products?.unit || '个'}
              </div>
            </div>
          );
        })()}
        <DialogFooter>
          <Button variant="outline" onClick={() => setCompleteOrderId(null)}>取消</Button>
          <Button className="bg-green-600 hover:bg-green-700" onClick={handleCompleteInbound} disabled={completing}>
            {completing ? '处理中...' : '确认完成入库'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
