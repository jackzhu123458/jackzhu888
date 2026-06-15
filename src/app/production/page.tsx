'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Plus,
  Pencil,
  Trash2,
  Save,
  X,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CheckCircle2,
  Play,
  Clock,
  Package,
} from 'lucide-react';

/* ─── Types ─── */
interface Product {
  id: string;
  code: string;
  name: string;
  spec: string | null;
  unit: string;
  type: string;
  location_no?: string;
}
interface Customer {
  id: string;
  name: string;
  code: string;
}
interface MaterialItem {
  id?: string;
  product_id: string;
  required_qty: number;
  prepared_qty: number;
  products?: unknown;
}
interface Order {
  id: string;
  order_no: string;
  customer_id: string | null;
  customer_order_id: string | null;
  product_id: string;
  quantity: number;
  status: string;
  start_date: string | null;
  due_date: string | null;
  remark: string | null;
  created_at: string;
  products?: unknown;
  customers?: unknown;
  customer_orders?: unknown;
  production_order_materials?: MaterialItem[];
  delivered?: boolean;
}
interface BomItem {
  id: string;
  parent_product_id: string;
  child_product_id: string;
  quantity: number;
  child_product?: unknown;
}

const statusMap: Record<string, { label: string; color: string; bg: string }> = {
  pending:     { label: '待生产', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
  in_progress: { label: '生产中', color: 'text-blue-700',  bg: 'bg-blue-50 border-blue-200' },
  completed:   { label: '已完成', color: 'text-green-700', bg: 'bg-green-50 border-green-200' },
  cancelled:   { label: '已取消', color: 'text-red-700',   bg: 'bg-red-50 border-red-200' },
};

/* ─── Helper ─── */
const fmtDate = (d: string | null | undefined) => d ? d.slice(0, 10) : '-';
const getProduct = (o: Order): { code: string; name: string; unit: string } => {
  const p = o.products as Record<string, unknown> | Record<string, unknown>[] | null;
  const obj = Array.isArray(p) ? p[0] : p;
  return { code: String(obj?.code ?? ''), name: String(obj?.name ?? ''), unit: String(obj?.unit ?? '') };
};
const getCustomer = (o: Order): string => {
  const c = o.customers as Record<string, unknown> | Record<string, unknown>[] | null;
  const obj = Array.isArray(c) ? c[0] : c;
  return String(obj?.name ?? '');
};

export default function ProductionPage() {
  /* ─── Data ─── */
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  /* ─── List state ─── */
  const [searchText, setSearchText] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  /* ─── Form state ─── */
  const [formCustomerId, setFormCustomerId] = useState('');
  const [formProductId, setFormProductId] = useState('');
  const [formQuantity, setFormQuantity] = useState('');
  const [formStartDate, setFormStartDate] = useState('');
  const [formDueDate, setFormDueDate] = useState('');
  const [formRemark, setFormRemark] = useState('');
  const [formStatus, setFormStatus] = useState('pending');
  const [formMaterials, setFormMaterials] = useState<Array<{ product_id: string; required_qty: string; prepared_qty: string }>>([]);
  const [saving, setSaving] = useState(false);

  /* ─── Product search ─── */
  const [productSearch, setProductSearch] = useState('');
  const [productSearchResults, setProductSearchResults] = useState<Product[]>([]);
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const productSearchRef = useRef<HTMLDivElement>(null);

  /* ─── Material search ─── */
  const [materialSearchIdx, setMaterialSearchIdx] = useState<number | null>(null);
  const [materialSearchText, setMaterialSearchText] = useState('');
  const [materialSearchResults, setMaterialSearchResults] = useState<Product[]>([]);
  const materialSearchRef = useRef<HTMLDivElement>(null);

  /* ─── Delete ─── */
  const [deleteId, setDeleteId] = useState<string | null>(null);

  /* ─── Complete inbound ─── */
  const [completeOrderId, setCompleteOrderId] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const completeDialogRef = useRef<HTMLDivElement>(null);

  /* ─── Fetch ─── */
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
  }, [fetchOrders]);

  /* ─── Click outside to close dropdown ─── */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (productSearchRef.current && !productSearchRef.current.contains(e.target as Node)) {
        setShowProductDropdown(false);
      }
      if (materialSearchRef.current && !materialSearchRef.current.contains(e.target as Node)) {
        setMaterialSearchIdx(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  /* ─── Derived ─── */
  const filteredOrders = orders.filter(o => {
    if (filterStatus !== 'all' && o.status !== filterStatus) return false;
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      const prod = getProduct(o);
      const cust = getCustomer(o);
      const fields = [o.order_no, prod.code, prod.name, cust].map(f => f.toLowerCase());
      if (!fields.some(f => f.includes(q))) return false;
    }
    return true;
  });

  const selectedOrder = orders.find(o => o.id === selectedId) ?? null;

  /* ─── Product search ─── */
  const searchProducts = (text: string) => {
    setProductSearch(text);
    if (!text.trim()) { setProductSearchResults([]); setShowProductDropdown(false); return; }
    const q = text.toLowerCase();
    const results = products.filter(p =>
      p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) || (p.spec ?? '').toLowerCase().includes(q)
    ).slice(0, 20);
    setProductSearchResults(results);
    setShowProductDropdown(true);
  };

  const selectProduct = (p: Product) => {
    setFormProductId(p.id);
    setProductSearch(`${p.code} ${p.name}`);
    setShowProductDropdown(false);
    // Auto-load BOM materials
    fetch(`/api/bom?parent_id=${p.id}`).then(r => r.json()).then(data => {
      const bomList = Array.isArray(data) ? data : data.bom || [];
      if (bomList.length > 0) {
        setFormMaterials(bomList.map((b: BomItem) => ({
          product_id: b.child_product_id,
          required_qty: String(b.quantity),
          prepared_qty: '0',
        })));
      } else {
        setFormMaterials([]);
      }
    }).catch(() => {});
  };

  /* ─── Material search ─── */
  const searchMaterial = (idx: number, text: string) => {
    setMaterialSearchIdx(idx);
    setMaterialSearchText(text);
    if (!text.trim()) { setMaterialSearchResults([]); return; }
    const q = text.toLowerCase();
    const results = products.filter(p =>
      (p.type === 'raw_material' || p.type === 'semi_finished') &&
      (p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q))
    ).slice(0, 15);
    setMaterialSearchResults(results);
  };

  const selectMaterial = (idx: number, p: Product) => {
    const updated = [...formMaterials];
    updated[idx] = { ...updated[idx], product_id: p.id };
    setFormMaterials(updated);
    setMaterialSearchIdx(null);
  };

  /* ─── Navigation ─── */
  const currentIdx = filteredOrders.findIndex(o => o.id === selectedId);
  const goFirst = () => { if (filteredOrders.length) setSelectedId(filteredOrders[0].id); };
  const goPrev  = () => { if (currentIdx > 0) setSelectedId(filteredOrders[currentIdx - 1].id); };
  const goNext  = () => { if (currentIdx < filteredOrders.length - 1) setSelectedId(filteredOrders[currentIdx + 1].id); };
  const goLast  = () => { if (filteredOrders.length) setSelectedId(filteredOrders[filteredOrders.length - 1].id); };

  /* ─── Actions ─── */
  const handleNew = () => {
    setIsCreating(true);
    setIsEditing(true);
    setSelectedId(null);
    setFormCustomerId(''); setFormProductId(''); setFormQuantity('');
    setFormStartDate(''); setFormDueDate(''); setFormRemark('');
    setFormStatus('pending'); setFormMaterials([]);
    setProductSearch('');
  };

  const handleEdit = () => {
    if (!selectedOrder) return;
    setIsEditing(true);
    const prod = getProduct(selectedOrder);
    setFormCustomerId(selectedOrder.customer_id ?? '');
    setFormProductId(selectedOrder.product_id);
    setFormQuantity(String(selectedOrder.quantity));
    setFormStartDate(selectedOrder.start_date ? selectedOrder.start_date.slice(0, 10) : '');
    setFormDueDate(selectedOrder.due_date ? selectedOrder.due_date.slice(0, 10) : '');
    setFormRemark(selectedOrder.remark ?? '');
    setFormStatus(selectedOrder.status);
    setProductSearch(`${prod.code} ${prod.name}`);
    // Load materials
    const mats = selectedOrder.production_order_materials ?? [];
    setFormMaterials(mats.map(m => ({
      product_id: m.product_id,
      required_qty: String(m.required_qty),
      prepared_qty: String(m.prepared_qty),
    })));
  };

  const handleCancel = () => {
    setIsEditing(false);
    setIsCreating(false);
    if (selectedOrder) {
      const prod = getProduct(selectedOrder);
      setProductSearch(`${prod.code} ${prod.name}`);
    } else {
      setProductSearch('');
    }
  };

  const handleSave = async () => {
    if (!formProductId || !formQuantity) return;
    setSaving(true);
    const body = {
      customer_id: formCustomerId || null,
      product_id: formProductId,
      quantity: Number(formQuantity),
      start_date: formStartDate || null,
      due_date: formDueDate || null,
      remark: formRemark || null,
      status: formStatus,
      materials: formMaterials.filter(m => m.product_id && m.required_qty).map(m => ({
        product_id: m.product_id,
        required_qty: Number(m.required_qty),
        prepared_qty: Number(m.prepared_qty || 0),
      })),
    };
    try {
      if (isCreating) {
        const res = await fetch('/api/production', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const data = await res.json();
        if (data.id) setSelectedId(data.id);
      } else if (selectedOrder) {
        await fetch('/api/production', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: selectedOrder.id, ...body }) });
      }
      setIsEditing(false);
      setIsCreating(false);
      fetchOrders();
    } catch { /* ignore */ }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await fetch(`/api/production?id=${deleteId}`, { method: 'DELETE' });
    if (selectedId === deleteId) setSelectedId(null);
    setDeleteId(null);
    fetchOrders();
  };

  const handleStatusChange = async (id: string, status: string) => {
    await fetch('/api/production', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) });
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

  /* ─── Status badge ─── */
  const StatusBadge = ({ status }: { status: string }) => {
    const s = statusMap[status] ?? { label: status, color: 'text-gray-700', bg: 'bg-gray-50 border-gray-200' };
    return <Badge variant="outline" className={`${s.bg} ${s.color} border text-xs font-medium`}>{s.label}</Badge>;
  };

  /* ─── Stats ─── */
  const stats = {
    pending: orders.filter(o => o.status === 'pending').length,
    in_progress: orders.filter(o => o.status === 'in_progress').length,
    completed: orders.filter(o => o.status === 'completed').length,
  };

  /* ─── Render ─── */
  if (loading) {
    return <div className="flex items-center justify-center h-screen text-gray-400">加载中...</div>;
  }

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col bg-[#F8F9FA]">
      {/* ─── Top bar ─── */}
      <div className="shrink-0 flex items-center justify-between px-6 py-3 border-b border-[#E5E7EB] bg-white">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-[#111827]">生产订单</h1>
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-amber-500" />待生产 {stats.pending}</span>
            <span className="text-gray-300">|</span>
            <span className="flex items-center gap-1"><Play className="w-3 h-3 text-blue-500" />生产中 {stats.in_progress}</span>
            <span className="text-gray-300">|</span>
            <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-green-500" />已完成 {stats.completed}</span>
          </div>
        </div>
        <Button onClick={handleNew} className="bg-[#1E40AF] hover:bg-[#1D4ED8] gap-1">
          <Plus className="w-4 h-4" /> 新增生产订单
        </Button>
      </div>

      {/* ─── Filter bar ─── */}
      <div className="shrink-0 flex items-center gap-3 px-6 py-2 border-b border-[#E5E7EB] bg-white">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="搜索订单号、产品、客户..."
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
        <div className="flex items-center gap-1">
          {['all', 'pending', 'in_progress', 'completed'].map(s => (
            <Button
              key={s}
              variant={filterStatus === s ? 'default' : 'outline'}
              size="sm"
              className={`h-7 text-xs ${filterStatus === s ? 'bg-[#1E40AF]' : ''}`}
              onClick={() => setFilterStatus(s)}
            >
              {s === 'all' ? '全部' : statusMap[s]?.label ?? s}
            </Button>
          ))}
        </div>
      </div>

      {/* ─── Main content ─── */}
      <div className="flex-1 flex min-h-0">
        {/* ─── Left: Order list ─── */}
        <div className="w-[280px] shrink-0 border-r border-[#E5E7EB] bg-white flex flex-col">
          <div className="px-3 py-2 text-xs text-gray-500 border-b border-[#E5E7EB]">
            共 {filteredOrders.length} 条
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredOrders.map(o => {
              const prod = getProduct(o);
              const cust = getCustomer(o);
              const isActive = o.id === selectedId;
              return (
                <div
                  key={o.id}
                  onClick={() => { setSelectedId(o.id); setIsEditing(false); setIsCreating(false); }}
                  className={`px-3 py-2.5 border-b border-[#F3F4F6] cursor-pointer transition-colors ${
                    isActive ? 'bg-blue-50 border-l-2 border-l-[#1E40AF]' : 'hover:bg-gray-50 border-l-2 border-l-transparent'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-mono text-gray-500">{o.order_no}</span>
                    <StatusBadge status={o.status} />
                  </div>
                  <div className="text-sm font-medium text-[#111827] truncate">{prod.name}</div>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
                    <span>{prod.code}</span>
                    <span className="text-gray-300">|</span>
                    <span>{o.quantity} {prod.unit}</span>
                    {cust && <><span className="text-gray-300">|</span><span className="truncate">{cust}</span></>}
                  </div>
                  {o.due_date && (
                    <div className="text-xs text-gray-400 mt-0.5">交期: {fmtDate(o.due_date)}</div>
                  )}
                </div>
              );
            })}
            {filteredOrders.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-gray-400">暂无生产订单</div>
            )}
          </div>
          {/* Navigation */}
          <div className="shrink-0 flex items-center justify-between px-3 py-2 border-t border-[#E5E7EB] text-xs text-gray-500">
            <span>{currentIdx + 1} / {filteredOrders.length}</span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={goFirst} disabled={currentIdx <= 0}><ChevronsLeft className="w-3.5 h-3.5" /></Button>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={goPrev} disabled={currentIdx <= 0}><ChevronLeft className="w-3.5 h-3.5" /></Button>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={goNext} disabled={currentIdx >= filteredOrders.length - 1}><ChevronRight className="w-3.5 h-3.5" /></Button>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={goLast} disabled={currentIdx >= filteredOrders.length - 1}><ChevronsRight className="w-3.5 h-3.5" /></Button>
            </div>
          </div>
        </div>

        {/* ─── Right: Detail ─── */}
        <div className="flex-1 overflow-y-auto bg-[#F8F9FA]">
          {(selectedOrder || isCreating) ? (
            <div className="p-6">
              {/* ─── Document header ─── */}
              <div className="bg-white rounded-lg border border-[#E5E7EB] shadow-sm">
                {/* Title bar */}
                <div className="flex items-center justify-between px-6 py-3 border-b border-[#E5E7EB] bg-[#FAFBFC]">
                  <div className="flex items-center gap-3">
                    <Package className="w-5 h-5 text-[#1E40AF]" />
                    <span className="text-lg font-semibold text-[#111827]">
                      {isCreating ? '新增生产订单' : `生产订单 ${selectedOrder?.order_no ?? ''}`}
                    </span>
                    {!isCreating && selectedOrder && <StatusBadge status={selectedOrder.status} />}
                  </div>
                  {!isEditing && !isCreating && selectedOrder && (
                    <div className="flex items-center gap-2">
                      {selectedOrder.status === 'pending' && (
                        <Button size="sm" className="bg-blue-600 hover:bg-blue-700 gap-1" onClick={() => handleStatusChange(selectedOrder.id, 'in_progress')}>
                          <Play className="w-3.5 h-3.5" /> 开始生产
                        </Button>
                      )}
                      {selectedOrder.status === 'in_progress' && (
                        <Button size="sm" className="bg-green-600 hover:bg-green-700 gap-1" onClick={() => setCompleteOrderId(selectedOrder.id)}>
                          <CheckCircle2 className="w-3.5 h-3.5" /> 完成入库
                        </Button>
                      )}
                      <Button size="sm" variant="outline" className="gap-1" onClick={handleEdit}><Pencil className="w-3.5 h-3.5" /> 编辑</Button>
                      <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700 gap-1" onClick={() => setDeleteId(selectedOrder.id)}>
                        <Trash2 className="w-3.5 h-3.5" /> 删除
                      </Button>
                    </div>
                  )}
                  {(isEditing || isCreating) && (
                    <div className="flex items-center gap-2">
                      <Button size="sm" className="bg-[#1E40AF] hover:bg-[#1D4ED8] gap-1" onClick={handleSave} disabled={saving || !formProductId || !formQuantity}>
                        <Save className="w-3.5 h-3.5" /> {saving ? '保存中...' : '保存'}
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1" onClick={handleCancel}><X className="w-3.5 h-3.5" /> 取消</Button>
                    </div>
                  )}
                </div>

                {/* Form */}
                <div className="px-6 py-4 space-y-4">
                  {/* Row 1: Order info */}
                  <div className="grid grid-cols-4 gap-4">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">客户</label>
                      {isEditing ? (
                        <select className="w-full h-8 text-sm border border-[#E5E7EB] rounded px-2 bg-white" value={formCustomerId} onChange={e => setFormCustomerId(e.target.value)}>
                          <option value="">选择客户</option>
                          {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      ) : (
                        <div className="h-8 flex items-center text-sm text-[#111827]">{getCustomer(selectedOrder!) || '-'}</div>
                      )}
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">状态</label>
                      {isEditing ? (
                        <select className="w-full h-8 text-sm border border-[#E5E7EB] rounded px-2 bg-white" value={formStatus} onChange={e => setFormStatus(e.target.value)}>
                          {Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
                      ) : (
                        <div className="h-8 flex items-center text-sm">{selectedOrder && <StatusBadge status={selectedOrder.status} />}</div>
                      )}
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">开始日期</label>
                      {isEditing ? (
                        <Input type="date" className="h-8 text-sm" value={formStartDate} onChange={e => setFormStartDate(e.target.value)} />
                      ) : (
                        <div className="h-8 flex items-center text-sm text-[#111827]">{selectedOrder ? fmtDate(selectedOrder.start_date) : '-'}</div>
                      )}
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">交期</label>
                      {isEditing ? (
                        <Input type="date" className="h-8 text-sm" value={formDueDate} onChange={e => setFormDueDate(e.target.value)} />
                      ) : (
                        <div className="h-8 flex items-center text-sm font-medium text-[#111827]">{selectedOrder ? fmtDate(selectedOrder.due_date) : '-'}</div>
                      )}
                    </div>
                  </div>

                  {/* Row 2: Product + Quantity */}
                  <div className="grid grid-cols-4 gap-4">
                    <div className="col-span-2 relative" ref={productSearchRef}>
                      <label className="text-xs text-gray-500 mb-1 block">产品 <span className="text-red-500">*</span></label>
                      {isEditing ? (
                        <>
                          <Input
                            className="h-8 text-sm"
                            placeholder="输入产品编码或名称搜索..."
                            value={productSearch}
                            onChange={e => searchProducts(e.target.value)}
                            onFocus={() => { if (productSearchResults.length > 0) setShowProductDropdown(true); }}
                          />
                          {formProductId && (
                            <Badge variant="outline" className="ml-2 text-xs bg-blue-50 text-blue-700 border-blue-200">
                              {products.find(p => p.id === formProductId)?.code}
                            </Badge>
                          )}
                          {showProductDropdown && productSearchResults.length > 0 && (
                            <div className="absolute z-[9999] top-full left-0 right-0 mt-1 bg-white border border-[#E5E7EB] rounded-lg shadow-lg max-h-60 overflow-y-auto">
                              {productSearchResults.map(p => (
                                <div key={p.id} className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm" onClick={() => selectProduct(p)}>
                                  <div className="font-medium">{p.code} <span className="text-gray-500">{p.name}</span></div>
                                  <div className="text-xs text-gray-400">{p.spec} · {p.unit}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="h-8 flex items-center text-sm font-medium text-[#111827]">
                          {selectedOrder ? `${getProduct(selectedOrder).code} ${getProduct(selectedOrder).name}` : '-'}
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">数量 <span className="text-red-500">*</span></label>
                      {isEditing ? (
                        <Input type="number" className="h-8 text-sm" placeholder="0" value={formQuantity} onChange={e => setFormQuantity(e.target.value)} />
                      ) : (
                        <div className="h-8 flex items-center text-sm font-medium text-[#111827]">
                          {selectedOrder ? `${selectedOrder.quantity} ${getProduct(selectedOrder).unit}` : '-'}
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">备注</label>
                      {isEditing ? (
                        <Input className="h-8 text-sm" placeholder="可选" value={formRemark} onChange={e => setFormRemark(e.target.value)} />
                      ) : (
                        <div className="h-8 flex items-center text-sm text-gray-500">{selectedOrder?.remark || '-'}</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* ─── Materials section ─── */}
              <div className="mt-4 bg-white rounded-lg border border-[#E5E7EB] shadow-sm">
                <div className="flex items-center justify-between px-6 py-3 border-b border-[#E5E7EB] bg-[#FAFBFC]">
                  <span className="text-sm font-medium text-[#111827]">用料清单</span>
                  {isEditing && (
                    <Button size="sm" variant="outline" className="gap-1 h-7 text-xs" onClick={() => setFormMaterials([...formMaterials, { product_id: '', required_qty: '', prepared_qty: '0' }])}>
                      <Plus className="w-3 h-3" /> 添加行
                    </Button>
                  )}
                </div>

                {/* Table header */}
                <div className="grid grid-cols-[40px_1fr_100px_100px_100px_40px] text-xs text-gray-500 px-6 py-2 border-b border-[#F3F4F6] bg-[#FAFBFC]">
                  <span>序号</span>
                  <span>物料编码/名称</span>
                  <span className="text-right">需求数量</span>
                  <span className="text-right">已备料</span>
                  <span className="text-right">单位</span>
                  <span></span>
                </div>

                {/* Table body */}
                <div className="divide-y divide-[#F3F4F6]">
                  {isEditing ? (
                    formMaterials.length > 0 ? formMaterials.map((m, idx) => {
                      const matProd = products.find(p => p.id === m.product_id);
                      return (
                        <div key={idx} className="grid grid-cols-[40px_1fr_100px_100px_100px_40px] items-center px-6 py-2 text-sm">
                          <span className="text-gray-400">{idx + 1}</span>
                          <div className="relative" ref={materialSearchIdx === idx ? materialSearchRef : null}>
                            <Input
                              className="h-7 text-sm"
                              placeholder="输入编码/名称搜索..."
                              value={materialSearchIdx === idx ? materialSearchText : (matProd ? `${matProd.code} ${matProd.name}` : '')}
                              onChange={e => searchMaterial(idx, e.target.value)}
                              onFocus={() => {
                                setMaterialSearchIdx(idx);
                                setMaterialSearchText(matProd ? `${matProd.code} ${matProd.name}` : '');
                              }}
                            />
                            {materialSearchIdx === idx && materialSearchResults.length > 0 && (
                              <div className="absolute z-[9999] top-full left-0 right-0 mt-1 bg-white border border-[#E5E7EB] rounded-lg shadow-lg max-h-48 overflow-y-auto">
                                {materialSearchResults.map(p => (
                                  <div key={p.id} className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm" onClick={() => selectMaterial(idx, p)}>
                                    {p.code} <span className="text-gray-500">{p.name}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <Input type="number" className="h-7 text-sm text-right" value={m.required_qty} onChange={e => {
                            const updated = [...formMaterials]; updated[idx] = { ...updated[idx], required_qty: e.target.value }; setFormMaterials(updated);
                          }} />
                          <Input type="number" className="h-7 text-sm text-right" value={m.prepared_qty} onChange={e => {
                            const updated = [...formMaterials]; updated[idx] = { ...updated[idx], prepared_qty: e.target.value }; setFormMaterials(updated);
                          }} />
                          <span className="text-right text-xs text-gray-500">{matProd?.unit ?? '-'}</span>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-gray-400 hover:text-red-500" onClick={() => setFormMaterials(formMaterials.filter((_, i) => i !== idx))}>
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      );
                    }) : (
                      <div className="px-6 py-6 text-center text-sm text-gray-400">暂无用料，选择产品后自动从BOM加载，或手动添加</div>
                    )
                  ) : (
                    selectedOrder?.production_order_materials && selectedOrder.production_order_materials.length > 0 ?
                      selectedOrder.production_order_materials.map((m, idx) => {
                        const mp = m.products as Record<string, unknown> | Record<string, unknown>[] | null;
                        const mObj = Array.isArray(mp) ? mp[0] : mp;
                        return (
                          <div key={m.id ?? idx} className="grid grid-cols-[40px_1fr_100px_100px_100px_40px] items-center px-6 py-2.5 text-sm">
                            <span className="text-gray-400">{idx + 1}</span>
                            <span className="text-[#111827]">{String(mObj?.code ?? '')} <span className="text-gray-500">{String(mObj?.name ?? '')}</span></span>
                            <span className="text-right font-mono">{m.required_qty}</span>
                            <span className="text-right font-mono text-blue-600">{m.prepared_qty}</span>
                            <span className="text-right text-xs text-gray-500">{String(mObj?.unit ?? '')}</span>
                            <span></span>
                          </div>
                        );
                      })
                    : (
                      <div className="px-6 py-6 text-center text-sm text-gray-400">暂无用料信息</div>
                    )
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              <div className="text-center">
                <Package className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>选择左侧生产订单查看详情</p>
                <p className="text-xs mt-1">或点击右上角"新增生产订单"创建新订单</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── Delete confirmation ─── */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>确定要删除此生产订单吗？此操作不可撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={handleDelete}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Complete inbound dialog ─── */}
      <Dialog open={!!completeOrderId} onOpenChange={() => setCompleteOrderId(null)}>
        <DialogContent ref={completeDialogRef}>
          <DialogHeader>
            <DialogTitle>完成生产 - 自动入库</DialogTitle>
            <DialogDescription>
              完成生产后将自动创建入库单，成品入库到对应库位仓库（BOM库位号匹配），并扣减原材料库存。无库位号的产品将入待发货仓。
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="rounded-lg bg-green-50 border border-green-200 p-4 text-sm text-green-800">
              <div className="font-medium mb-1">入库说明</div>
              <ul className="list-disc pl-4 space-y-1 text-xs">
                <li>系统根据BOM库位号自动匹配入库仓库</li>
                <li>无库位号的产品默认入待发货仓</li>
                <li>将同时扣减原材料库存</li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteOrderId(null)}>取消</Button>
            <Button className="bg-green-600 hover:bg-green-700 gap-1" onClick={handleCompleteInbound} disabled={completing}>
              <CheckCircle2 className="w-4 h-4" /> {completing ? '处理中...' : '确认完成入库'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
