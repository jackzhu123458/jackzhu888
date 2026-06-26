'use client';

import { useEffect, useState, useCallback } from 'react';
import { translateUnit } from '@/lib/utils';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Plus,
  Pencil,
  Trash2,
  Save,
  X,
  Search,
  Minus,
  TrendingUp,
  AlertTriangle,
  Package,
  DollarSign,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Scatter,
  ComposedChart,
  Legend,
} from 'recharts';

/* ─── Types ─── */
interface Product {
  id: string;
  code: string;
  name: string;
  spec: string | null;
  unit: string;
  location_no?: string;
  category?: string;
  price?: number | string | null;
}
interface Warehouse {
  id: string;
  name: string;
  location: string | null;
  type?: string;
}
interface InboundItem {
  id?: string;
  product_id: string;
  product?: Product;
  products?: Product | Product[];
  quantity: number;
  unit_price: number;
  amount: number;
  category: string;
  location_no: string;
  diff_qty: number;
  item_status: string;
  remark: string;
}
interface InboundNote {
  id: string;
  note_no: string;
  type: string;
  production_order_id: string | null;
  warehouse_id: string;
  operator: string | null;
  status: string;
  supplier: string | null;
  planned_date: string | null;
  actual_date: string | null;
  remark: string | null;
  created_at: string;
  warehouses?: Warehouse | Warehouse[] | null;
  inbound_note_items: InboundItem[];
}

interface DailyStat {
  date: string;
  qty: number;
  amount: number;
  abnormal: boolean;
  notes: string[];
}
interface InboundStats {
  daily: DailyStat[];
  summary: {
    totalQty: number;
    totalAmount: number;
    abnormalCount: number;
    totalNotes: number;
    days: number;
  };
}

/* ─── Helpers ─── */
const formatDate = (d: string | null) => {
  if (!d) return '-';
  try { return new Date(d).toISOString().split('T')[0]; } catch { return d; }
};

const formatDateTime = (d: string | null) => {
  if (!d) return '-';
  try {
    return new Date(d).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch { return d; }
};

const statusLabel = (s: string) => {
  const m: Record<string, { label: string; cls: string }> = {
    draft: { label: '草稿', cls: 'bg-gray-100 text-gray-800' },
    pending: { label: '待审核', cls: 'bg-yellow-100 text-yellow-800' },
    confirmed: { label: '已入库', cls: 'bg-green-100 text-green-800' },
    abnormal: { label: '异常', cls: 'bg-red-100 text-red-800' },
  };
  return m[s] || { label: s, cls: 'bg-gray-100 text-gray-800' };
};

const typeLabel = (s: string) => {
  const m: Record<string, string> = { production: '生产入库', purchase: '采购入库', other: '其他入库' };
  return m[s] || s;
};

const emptyNote = (): Omit<InboundNote, 'id' | 'created_at'> => ({
  note_no: '',
  type: 'other',
  production_order_id: null,
  warehouse_id: '',
  operator: null,
  status: 'pending',
  remark: '',
  supplier: null,
  planned_date: null,
  actual_date: null,
  inbound_note_items: [],
});

const emptyItem = (): InboundItem => ({
  product_id: '',
  quantity: 0,
  unit_price: 0,
  amount: 0,
  category: '',
  location_no: '',
  diff_qty: 0,
  item_status: 'normal',
  remark: '',
});

const getProdObj = (raw: Product | Product[] | undefined): Product | undefined => {
  if (!raw) return undefined;
  if (Array.isArray(raw)) return raw[0];
  return raw;
};

const getWhObj = (raw: Warehouse | Warehouse[] | null | undefined): Warehouse | undefined => {
  if (!raw) return undefined;
  if (Array.isArray(raw)) return raw[0];
  return raw;
};

/* ─── Component ─── */
export default function InboundPage() {
  const [notes, setNotes] = useState<InboundNote[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [stats, setStats] = useState<InboundStats | null>(null);
  const [currentIdx, setCurrentIdx] = useState(-1);
  const [editMode, setEditMode] = useState(false);
  const [isFormDirty, setIsFormDirty] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [itemSearches, setItemSearches] = useState<Record<number, string>>({});
  const [showItemDropdown, setShowItemDropdown] = useState<number | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [chartDays, setChartDays] = useState(30);

  const [form, setForm] = useState<Omit<InboundNote, 'id' | 'created_at'> & { id?: string }>(emptyNote());

  const current = currentIdx >= 0 ? notes[currentIdx] : null;

  /* ─── Data fetching ─── */
  const fetchNotes = useCallback(async () => {
    const res = await fetch('/api/inbound');
    const data = await res.json();
    setNotes(Array.isArray(data) ? data : []);
  }, []);

  const fetchMeta = useCallback(async () => {
    const [wRes, pRes] = await Promise.all([fetch('/api/warehouses'), fetch('/api/products')]);
    const wData = await wRes.json();
    const pData = await pRes.json();
    if (Array.isArray(wData)) setWarehouses(wData);
    if (Array.isArray(pData)) setProducts(pData);
  }, []);

  const fetchStats = useCallback(async () => {
    const res = await fetch(`/api/inbound/stats?days=${chartDays}`);
    const data = await res.json();
    if (data.daily) setStats(data);
  }, [chartDays]);

  useEffect(() => { fetchNotes(); fetchMeta(); }, [fetchNotes, fetchMeta]);
  useEffect(() => { fetchStats(); }, [fetchStats]);

  /* ─── Navigation ─── */
  const goTo = (idx: number) => {
    if (editMode && isFormDirty) {
      if (!window.confirm('当前修改尚未保存，是否放弃？')) return;
    }
    const clamped = Math.max(0, Math.min(idx, notes.length - 1));
    setCurrentIdx(clamped);
    setEditMode(false);
    setIsFormDirty(false);
    if (notes[clamped]) loadForm(notes[clamped]);
  };

  const loadForm = (note: InboundNote) => {
    setForm({
      id: note.id,
      note_no: note.note_no,
      type: note.type,
      production_order_id: note.production_order_id,
      warehouse_id: note.warehouse_id,
      operator: note.operator,
      status: note.status,
      remark: note.remark || '',
      supplier: note.supplier || null,
      planned_date: note.planned_date ? formatDate(note.planned_date) : null,
      actual_date: note.actual_date ? formatDate(note.actual_date) : null,
      inbound_note_items: Array.isArray(note.inbound_note_items)
        ? note.inbound_note_items.map((it) => {
            const product = getProdObj(it.products as Product | Product[] | undefined);
            return {
              ...it,
              product,
              unit_price: Number(it.unit_price || product?.price || 0),
              amount: Number(it.amount || 0),
              category: it.category || product?.category || '',
              location_no: it.location_no || product?.location_no || '',
              diff_qty: Number(it.diff_qty || 0),
              item_status: it.item_status || 'normal',
              remark: it.remark || '',
            };
          })
        : [],
    });
  };

  useEffect(() => {
    if (notes.length > 0 && currentIdx < 0 && !editMode) {
      setCurrentIdx(0);
      void loadForm(notes[0]);
    }
  }, [notes, currentIdx, editMode]);

  /* ─── CRUD ─── */
  const handleNew = () => {
    setForm({
      ...emptyNote(),
      warehouse_id: warehouses.find(w => w.type === 'product')?.id || '',
      inbound_note_items: [],
    });
    setCurrentIdx(-1);
    setEditMode(true);
    setIsFormDirty(false);
  };

  const handleEdit = () => {
    if (!current) return;
    setEditMode(true);
  };

  const handleSave = async () => {
    if (!form.warehouse_id) {
      alert('请选择入库仓库');
      return;
    }
    const validItems = form.inbound_note_items.filter(it => it.product_id && Number(it.quantity) > 0);
    if (validItems.length === 0) {
      alert('请至少添加一条入库明细');
      return;
    }

    const payload = {
      ...form,
      items: validItems.map(it => ({
        product_id: it.product_id,
        quantity: Number(it.quantity),
        unit_price: Number(it.unit_price || 0),
        amount: Number(it.amount || Number(it.quantity) * Number(it.unit_price || 0)),
        category: it.category || null,
        location_no: it.location_no || null,
        diff_qty: Number(it.diff_qty || 0),
        item_status: Number(it.diff_qty || 0) !== 0 ? 'abnormal' : 'normal',
        remark: it.remark,
      })),
    };

    try {
      if (form.id) {
        const { id, inbound_note_items, warehouses, ...noteFields } = payload as typeof payload & { id?: string; inbound_note_items?: unknown; warehouses?: unknown };
        const res = await fetch('/api/inbound', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, ...noteFields, items: payload.items }),
        });
        const data = await res.json();
        if (data.error) { alert('保存失败: ' + data.error); return; }
        await fetchNotes();
      } else {
        const { id, inbound_note_items, warehouses, ...noteFields } = payload as typeof payload & { id?: string; inbound_note_items?: unknown; warehouses?: unknown };
        const res = await fetch('/api/inbound', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(noteFields),
        });
        const created = await res.json();
        if (created.error) { alert('保存失败: ' + created.error); return; }
        setForm(prev => ({ ...prev, id: created.id }));
        const refreshed = await fetch('/api/inbound').then(r => r.json());
        if (Array.isArray(refreshed)) {
          setNotes(refreshed);
          const idx = refreshed.findIndex((n: InboundNote) => n.id === created.id);
          if (idx >= 0) setCurrentIdx(idx);
        }
      }
      setEditMode(false);
      setIsFormDirty(false);
      await fetchStats();
    } catch (e) {
      alert('保存失败: ' + String(e));
    }
  };

  const handleCancel = () => {
    if (current) loadForm(current);
    else setForm(emptyNote());
    setEditMode(false);
    setIsFormDirty(false);
    setItemSearches({});
    setShowItemDropdown(null);
  };

  const handleDelete = async () => {
    if (!form.id) return;
    const res = await fetch(`/api/inbound?id=${form.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || '删除失败');
      setDeleteOpen(false);
      return;
    }
    setDeleteOpen(false);
    setEditMode(false);
    setForm(emptyNote());
    setCurrentIdx(-1);
    await fetchNotes();
    await fetchStats();
  };

  /* ─── Items manipulation ─── */
  const addEmptyItem = () => {
    setForm(prev => ({
      ...prev,
      inbound_note_items: [...prev.inbound_note_items, emptyItem()],
    }));
    setIsFormDirty(true);
  };

  const removeItem = (idx: number) => {
    setForm(prev => ({
      ...prev,
      inbound_note_items: prev.inbound_note_items.filter((_, i) => i !== idx),
    }));
    setIsFormDirty(true);
  };

  const updateItem = (idx: number, field: keyof InboundItem, value: string | number) => {
    setForm(prev => {
      const items = [...prev.inbound_note_items];
      items[idx] = { ...items[idx], [field]: value };
      // 自动计算金额
      if (field === 'quantity' || field === 'unit_price') {
        const qty = Number(items[idx].quantity || 0);
        const price = Number(items[idx].unit_price || 0);
        items[idx] = { ...items[idx], amount: qty * price };
      }
      return { ...prev, inbound_note_items: items };
    });
    setIsFormDirty(true);
  };

  const searchInboundProducts = (query: string) => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return products.filter(
      p => p.code?.toLowerCase().includes(q) || p.name?.toLowerCase().includes(q) || p.spec?.toLowerCase().includes(q)
    ).slice(0, 20);
  };

  const selectProductForItem = (idx: number, p: Product) => {
    setForm(prev => {
      const items = [...prev.inbound_note_items];
      const qty = Number(items[idx].quantity || 0);
      const price = Number(p.price || items[idx].unit_price || 0);
      items[idx] = {
        ...items[idx],
        product_id: p.id,
        product: p,
        unit_price: price,
        amount: qty * price,
        category: p.category || items[idx].category || '',
        location_no: p.location_no || items[idx].location_no || '',
      };
      return { ...prev, inbound_note_items: items };
    });
    setItemSearches(prev => {
      const next = { ...prev };
      next[idx] = `${p.code} ${p.name}`;
      return next;
    });
    setShowItemDropdown(null);
    setIsFormDirty(true);
  };

  // Filtered notes for list
  const filteredNotes = searchText.trim()
    ? notes.filter(note => {
        const s = searchText.trim().toLowerCase();
        const wh = getWhObj(note.warehouses);
        if (note.note_no?.toLowerCase().includes(s)) return true;
        if (note.supplier?.toLowerCase().includes(s)) return true;
        if (wh?.name?.toLowerCase().includes(s)) return true;
        return (note.inbound_note_items || []).some(item => {
          const prod = getProdObj(item.products as Product | Product[] | undefined);
          return prod?.code?.toLowerCase().includes(s) || prod?.name?.toLowerCase().includes(s);
        });
      })
    : notes;

  // 总计
  const totalQty = form.inbound_note_items.reduce((s, it) => s + Number(it.quantity || 0), 0);
  const totalAmount = form.inbound_note_items.reduce((s, it) => s + Number(it.amount || 0), 0);

  /* ─── Chart data ─── */
  const chartData = (stats?.daily || []).map(d => ({
    date: d.date.slice(5), // MM-DD
    入库数量: d.qty,
    入库金额: Math.round(d.amount * 100) / 100,
    abnormal: d.abnormal ? d.qty : undefined,
  }));

  const abnormalPoints = (stats?.daily || [])
    .filter(d => d.abnormal)
    .map(d => ({
      date: d.date.slice(5),
      入库数量: d.qty,
      abnormalFlag: d.qty,
      noteNos: d.notes.join(', '),
    }));

  // 格式化金额刻度
  const formatAmountTick = (v: number) => v >= 10000 ? Math.round(v / 10000) + '万' : String(v);

  /* ─── Render ─── */
  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden">
      {/* ─── Left: 入库单列表 ─── */}
      <div className="w-[260px] border-r border-gray-200 bg-gray-50/50 flex flex-col shrink-0">
        <div className="p-3 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <Input
                placeholder="搜索单号/物料/仓库..."
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
            </div>
            <Button size="sm" className="h-8 bg-[#1E40AF] hover:bg-[#1D4ED8] px-2" onClick={handleNew}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredNotes.length === 0 ? (
            <div className="p-4 text-center text-xs text-gray-400">暂无入库单</div>
          ) : (
            filteredNotes.map((note) => {
              const wh = getWhObj(note.warehouses);
              const noteIdx = notes.indexOf(note);
              const isActive = noteIdx === currentIdx;
              const st = statusLabel(note.status);
              return (
                <div
                  key={note.id}
                  onClick={() => goTo(noteIdx)}
                  className={`px-3 py-2.5 border-b border-gray-100 cursor-pointer transition-colors ${
                    isActive ? 'bg-blue-50 border-l-2 border-l-[#1E40AF]' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-xs text-gray-900 font-medium">{note.note_no}</span>
                    <Badge className={`${st.cls} text-[10px] px-1.5 py-0`}>{st.label}</Badge>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-gray-500">
                    <span>{wh?.name || '-'}</span>
                    <span>·</span>
                    <span>{typeLabel(note.type)}</span>
                  </div>
                  <div className="text-[11px] text-gray-400 mt-0.5">
                    {note.created_at ? new Date(note.created_at).toLocaleDateString('zh-CN') : ''}
                    <span className="ml-2">{note.inbound_note_items?.length || 0}项</span>
                    {note.supplier && <span className="ml-2">· {note.supplier}</span>}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ─── Right: 主内容区 ─── */}
      <div className="flex-1 overflow-y-auto">
        {/* ─── 顶部趋势图 ─── */}
        <div className="border-b border-gray-200 bg-white">
          <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100">
            <h2 className="text-sm font-medium text-gray-900 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-[#1E40AF]" />
              入库趋势
            </h2>
            <div className="flex items-center gap-2">
              <Select value={String(chartDays)} onValueChange={v => setChartDays(Number(v))}>
                <SelectTrigger className="h-7 w-24 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">近7天</SelectItem>
                  <SelectItem value="30">近30天</SelectItem>
                  <SelectItem value="90">近90天</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 统计卡片 */}
          {stats && (
            <div className="grid grid-cols-4 gap-4 px-6 py-3 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center">
                  <Package className="h-4 w-4 text-[#1E40AF]" />
                </div>
                <div>
                  <div className="text-xs text-gray-500">入库总量</div>
                  <div className="text-lg font-semibold text-gray-900 font-mono">{stats.summary.totalQty.toLocaleString()}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-green-50 flex items-center justify-center">
                  <DollarSign className="h-4 w-4 text-green-600" />
                </div>
                <div>
                  <div className="text-xs text-gray-500">入库金额</div>
                  <div className="text-lg font-semibold text-gray-900 font-mono">{stats.summary.totalAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-yellow-50 flex items-center justify-center">
                  <Package className="h-4 w-4 text-yellow-600" />
                </div>
                <div>
                  <div className="text-xs text-gray-500">入库单数</div>
                  <div className="text-lg font-semibold text-gray-900 font-mono">{stats.summary.totalNotes}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-red-50 flex items-center justify-center">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                </div>
                <div>
                  <div className="text-xs text-gray-500">异常天数</div>
                  <div className="text-lg font-semibold text-gray-900 font-mono">{stats.summary.abnormalCount}</div>
                </div>
              </div>
            </div>
          )}

          {/* 图表 */}
          <div className="px-6 py-4" style={{ height: 260 }}>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6B7280' }} />
                  <YAxis yAxisId="qty" tick={{ fontSize: 11, fill: '#6B7280' }} />
                  <YAxis yAxisId="amount" orientation="right" tick={{ fontSize: 11, fill: '#6B7280' }} tickFormatter={formatAmountTick} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid #E5E7EB' }}
                    formatter={(value: number, name: string) => [
                      name === '入库金额' ? value.toLocaleString() : value,
                      name,
                    ]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar yAxisId="qty" dataKey="入库数量" fill="#1E40AF" radius={[2, 2, 0, 0]} barSize={chartDays > 30 ? 8 : 16} />
                  <Bar yAxisId="amount" dataKey="入库金额" fill="#16A34A" radius={[2, 2, 0, 0]} barSize={chartDays > 30 ? 8 : 16} opacity={0.4} />
                  {abnormalPoints.length > 0 && (
                    <Scatter yAxisId="qty" data={abnormalPoints} dataKey="abnormalFlag" fill="#DC2626" shape="diamond" />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400 text-sm">暂无数据</div>
            )}
          </div>
        </div>

        {/* ─── 入库单详情/编辑 ─── */}
        {!editMode && !form.id ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <p className="text-sm">点击左侧入库单查看详情</p>
            <p className="text-xs mt-1">或点击 + 新增入库单</p>
          </div>
        ) : (
          <div className="p-6 max-w-5xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-xl font-semibold text-gray-900">
                  {editMode ? (form.id ? '编辑入库单' : '新增入库单') : '入库单详情'}
                </h1>
                {form.note_no && (
                  <p className="text-sm text-gray-500 font-mono mt-0.5">{form.note_no}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {editMode ? (
                  <>
                    <Button variant="outline" size="sm" onClick={handleCancel}>
                      <X className="h-4 w-4 mr-1" />取消
                    </Button>
                    <Button size="sm" className="bg-[#1E40AF] hover:bg-[#1D4ED8]" onClick={handleSave}>
                      <Save className="h-4 w-4 mr-1" />保存
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="outline" size="sm" onClick={handleEdit}>
                      <Pencil className="h-4 w-4 mr-1" />编辑
                    </Button>
                    <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700" onClick={() => setDeleteOpen(true)}>
                      <Trash2 className="h-4 w-4 mr-1" />删除
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* 表单区域 */}
            <div className="bg-white border border-gray-200 rounded-lg">
              {/* 顶部信息栏 */}
              <div className="grid grid-cols-4 gap-4 p-4 border-b border-gray-100">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">入库仓库</label>
                  {editMode ? (
                    <Select value={form.warehouse_id} onValueChange={v => { setForm(prev => ({ ...prev, warehouse_id: v })); setIsFormDirty(true); }}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="选择仓库" />
                      </SelectTrigger>
                      <SelectContent>
                        {warehouses.map(w => (
                          <SelectItem key={w.id} value={w.id}>
                            {w.name}{w.type === 'virtual' ? ' (虚拟)' : w.type === 'product' ? ' (产品)' : w.type === 'raw_material' ? ' (原材料)' : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-sm text-gray-900">
                      {getWhObj(notes.find(n => n.id === form.id)?.warehouses as Warehouse | Warehouse[] | null)?.name || '-'}
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">入库类型</label>
                  <p className="text-sm text-gray-900">{typeLabel(form.type)}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">供应商</label>
                  {editMode ? (
                    <Input value={form.supplier || ''} onChange={e => { setForm(prev => ({ ...prev, supplier: e.target.value })); setIsFormDirty(true); }} placeholder="可选" className="h-9 text-sm" />
                  ) : (
                    <p className="text-sm text-gray-900">{form.supplier || '-'}</p>
                  )}
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">状态</label>
                  <Badge className={statusLabel(form.status).cls}>{statusLabel(form.status).label}</Badge>
                </div>
              </div>

              {/* 第二行：日期信息 */}
              <div className="grid grid-cols-4 gap-4 p-4 border-b border-gray-100">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">入库时间</label>
                  <p className="text-sm text-gray-900">
                    {form.id ? (notes.find(n => n.id === form.id)?.created_at
                      ? formatDateTime(notes.find(n => n.id === form.id)!.created_at)
                      : '-') : formatDateTime(new Date().toISOString())}
                  </p>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">计划到货日</label>
                  {editMode ? (
                    <Input type="date" value={form.planned_date || ''} onChange={e => { setForm(prev => ({ ...prev, planned_date: e.target.value || null })); setIsFormDirty(true); }} className="h-9 text-sm" />
                  ) : (
                    <p className="text-sm text-gray-900">{formatDate(form.planned_date)}</p>
                  )}
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">实际到货日</label>
                  {editMode ? (
                    <Input type="date" value={form.actual_date || ''} onChange={e => { setForm(prev => ({ ...prev, actual_date: e.target.value || null })); setIsFormDirty(true); }} className="h-9 text-sm" />
                  ) : (
                    <p className="text-sm text-gray-900">{formatDate(form.actual_date)}</p>
                  )}
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">操作人</label>
                  {editMode ? (
                    <Input value={form.operator || ''} onChange={e => { setForm(prev => ({ ...prev, operator: e.target.value })); setIsFormDirty(true); }} placeholder="可选" className="h-9 text-sm" />
                  ) : (
                    <p className="text-sm text-gray-900">{form.operator || '-'}</p>
                  )}
                </div>
              </div>

              {/* 备注 */}
              <div className="px-4 py-3 border-b border-gray-100">
                <label className="text-xs text-gray-500 mb-1 block">备注</label>
                {editMode ? (
                  <Input value={form.remark || ''} onChange={e => { setForm(prev => ({ ...prev, remark: e.target.value })); setIsFormDirty(true); }} placeholder="可选" className="h-8 text-sm" />
                ) : (
                  <p className="text-sm text-gray-700">{form.remark || '-'}</p>
                )}
              </div>

              {/* ─── 入库明细表 ─── */}
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-gray-900">
                    入库明细
                    <span className="text-gray-400 font-normal ml-2">
                      {form.inbound_note_items.length}项 · 合计 {totalQty.toLocaleString()} · 金额 ¥{totalAmount.toLocaleString()}
                    </span>
                  </h3>
                  {editMode && (
                    <Button variant="outline" size="sm" onClick={addEmptyItem}>
                      <Plus className="h-3.5 w-3.5 mr-1" />添加行
                    </Button>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50/50">
                        <th className="text-left px-2 py-2 font-medium text-gray-500 w-8">#</th>
                        <th className="text-left px-2 py-2 font-medium text-gray-500 w-28">物料编码</th>
                        <th className="text-left px-2 py-2 font-medium text-gray-500">物料名称</th>
                        <th className="text-left px-2 py-2 font-medium text-gray-500 w-16">分类</th>
                        <th className="text-center px-2 py-2 font-medium text-gray-500 w-10">单位</th>
                        <th className="text-right px-2 py-2 font-medium text-gray-500 w-16">库位</th>
                        <th className="text-right px-2 py-2 font-medium text-gray-500 w-16">数量</th>
                        <th className="text-right px-2 py-2 font-medium text-gray-500 w-20">单价</th>
                        <th className="text-right px-2 py-2 font-medium text-gray-500 w-20">金额</th>
                        <th className="text-right px-2 py-2 font-medium text-gray-500 w-16">差异</th>
                        <th className="text-left px-2 py-2 font-medium text-gray-500 w-24">备注</th>
                        {editMode && <th className="w-8"></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {form.inbound_note_items.length === 0 ? (
                        <tr>
                          <td colSpan={editMode ? 12 : 11} className="px-2 py-8 text-center text-gray-400 text-xs">
                            {editMode ? '点击"添加行"按钮添加入库物料' : '暂无明细'}
                          </td>
                        </tr>
                      ) : (
                        form.inbound_note_items.map((item, idx) => {
                          const prod = item.product || getProdObj(item.products as Product | Product[] | undefined);
                          const isAbnormal = item.item_status === 'abnormal' || Number(item.diff_qty || 0) !== 0;
                          return (
                            <tr key={idx} className={`border-b border-gray-50 hover:bg-gray-50/30 ${isAbnormal ? 'bg-red-50/40' : ''}`}>
                              <td className="px-2 py-2 text-gray-400 text-xs">{idx + 1}</td>
                              <td className="px-2 py-2 font-mono text-xs text-gray-900">
                                {editMode ? (
                                  <div className="relative">
                                    <Input
                                      value={itemSearches[idx] !== undefined ? itemSearches[idx] : (prod?.code || '')}
                                      onChange={e => {
                                        setItemSearches(prev => ({ ...prev, [idx]: e.target.value }));
                                        setShowItemDropdown(idx);
                                      }}
                                      onFocus={() => {
                                        if (!item.product_id) {
                                          setItemSearches(prev => ({ ...prev, [idx]: '' }));
                                          setShowItemDropdown(idx);
                                        }
                                      }}
                                      placeholder="搜索编码/名称"
                                      className="h-7 text-xs font-mono"
                                    />
                                    {showItemDropdown === idx && itemSearches[idx] !== undefined && itemSearches[idx].trim() && (
                                      <>
                                        <div className="fixed inset-0 z-40" onClick={() => setShowItemDropdown(null)} />
                                        <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-md shadow-lg z-50 max-h-48 overflow-y-auto mt-0.5">
                                          {searchInboundProducts(itemSearches[idx]).length === 0 ? (
                                            <div className="px-3 py-2 text-xs text-gray-400">无匹配结果</div>
                                          ) : (
                                            searchInboundProducts(itemSearches[idx]).map((p, pi) => (
                                              <div
                                                key={`inp-${p.id}-${pi}`}
                                                className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-xs"
                                                onClick={() => selectProductForItem(idx, p)}
                                              >
                                                <span className="font-mono">{p.code}</span>
                                                <span className="text-gray-500 ml-2">{p.name}</span>
                                                {p.location_no && <span className="text-blue-600 ml-1">[{p.location_no}]</span>}
                                              </div>
                                            ))
                                          )}
                                        </div>
                                      </>
                                    )}
                                  </div>
                                ) : (
                                  prod?.code || '-'
                                )}
                              </td>
                              <td className="px-2 py-2 text-gray-700 text-xs">{prod?.name || '-'}</td>
                              <td className="px-2 py-2 text-xs">
                                {editMode ? (
                                  <Input value={item.category} onChange={e => updateItem(idx, 'category', e.target.value)} className="h-7 text-xs" placeholder="分类" />
                                ) : (
                                  item.category || '-'
                                )}
                              </td>
                              <td className="px-2 py-2 text-center text-gray-500 text-xs">{prod ? translateUnit(prod.unit) : '-'}</td>
                              <td className="px-2 py-2 text-center text-xs">
                                {editMode ? (
                                  <Input value={item.location_no} onChange={e => updateItem(idx, 'location_no', e.target.value)} className="h-7 text-xs text-center" placeholder="库位" />
                                ) : (
                                  item.location_no || (prod?.location_no ? (
                                    <Badge className="bg-blue-50 text-blue-700 text-[10px] px-1.5 py-0">{prod.location_no}</Badge>
                                  ) : '-')
                                )}
                              </td>
                              <td className="px-2 py-2 text-right font-mono text-gray-900 text-xs">
                                {editMode ? (
                                  <Input type="number" value={item.quantity || ''} onChange={e => updateItem(idx, 'quantity', e.target.value)} className="h-7 w-16 text-right text-xs font-mono ml-auto" min={0} />
                                ) : (
                                  Number(item.quantity).toLocaleString()
                                )}
                              </td>
                              <td className="px-2 py-2 text-right font-mono text-xs">
                                {editMode ? (
                                  <Input type="number" value={item.unit_price || ''} onChange={e => updateItem(idx, 'unit_price', e.target.value)} className="h-7 w-20 text-right text-xs font-mono ml-auto" min={0} step="0.01" />
                                ) : (
                                  item.unit_price ? `¥${Number(item.unit_price).toFixed(2)}` : '-'
                                )}
                              </td>
                              <td className="px-2 py-2 text-right font-mono text-xs">
                                {editMode ? (
                                  <Input type="number" value={item.amount || ''} onChange={e => updateItem(idx, 'amount', e.target.value)} className="h-7 w-20 text-right text-xs font-mono ml-auto" min={0} step="0.01" />
                                ) : (
                                  item.amount ? `¥${Number(item.amount).toFixed(2)}` : '-'
                                )}
                              </td>
                              <td className="px-2 py-2 text-right font-mono text-xs">
                                {editMode ? (
                                  <Input type="number" value={item.diff_qty || ''} onChange={e => updateItem(idx, 'diff_qty', e.target.value)} className="h-7 w-16 text-right text-xs font-mono ml-auto" step="1" />
                                ) : (
                                  Number(item.diff_qty || 0) !== 0 ? (
                                    <span className="text-red-600">{Number(item.diff_qty).toLocaleString()}</span>
                                  ) : '-'
                                )}
                              </td>
                              <td className="px-2 py-2 text-xs text-gray-500">
                                {editMode ? (
                                  <Input value={item.remark || ''} onChange={e => updateItem(idx, 'remark', e.target.value)} placeholder="可选" className="h-7 text-xs" />
                                ) : (
                                  item.remark || '-'
                                )}
                              </td>
                              {editMode && (
                                <td className="px-1 py-2">
                                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500 hover:text-red-600" onClick={() => removeItem(idx)}>
                                    <Minus className="h-3 w-3" />
                                  </Button>
                                </td>
                              )}
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                    {form.inbound_note_items.length > 0 && (
                      <tfoot>
                        <tr className="border-t border-gray-200 bg-gray-50/50 font-medium">
                          <td colSpan={6} className="px-2 py-2 text-xs text-gray-500 text-right">合计</td>
                          <td className="px-2 py-2 text-right font-mono text-xs text-gray-900">{totalQty.toLocaleString()}</td>
                          <td className="px-2 py-2"></td>
                          <td className="px-2 py-2 text-right font-mono text-xs text-gray-900">¥{totalAmount.toLocaleString()}</td>
                          <td colSpan={editMode ? 3 : 2}></td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 删除确认 */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>确定要删除该入库单吗？此操作不可撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
