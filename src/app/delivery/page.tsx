'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
  Copy,
  Pencil,
  Trash2,
  Save,
  X,
  Search,
  Printer,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Tag,
  Minus,
  ArrowRight,
} from 'lucide-react';
import JsBarcode from 'jsbarcode';

/* ─── Types ─── */
interface Product {
  id: string;
  code: string;
  name: string;
  spec: string | null;
  unit: string;
}
interface Customer {
  id: string;
  code: string;
  name: string;
  contact: string | null;
  phone: string | null;
  address: string | null;
}
interface DeliveryItem {
  id?: string;
  product_id: string;
  product?: Product;
  quantity: number;
  unit_price: number;
  per_box_qty: number;
  remark: string;
}
interface DeliveryNote {
  id: string;
  note_no: string;
  customer_id?: string | null;
  customer_name: string;
  customer_address?: string | null;
  customer_contact?: string | null;
  customer_phone?: string | null;
  customer_order?: string | null;
  delivery_date: string;
  status: string;
  remark: string | null;
  created_at: string;
  delivery_note_items: DeliveryItem[];
}

/* ─── Helpers ─── */
const formatDate = (d: string) => {
  try {
    return new Date(d).toISOString().split('T')[0];
  } catch {
    return d;
  }
};
const statusLabel = (s: string) => {
  const m: Record<string, { label: string; cls: string }> = {
    draft: { label: '草稿', cls: 'bg-yellow-100 text-yellow-800' },
    shipped: { label: '已出货', cls: 'bg-blue-100 text-blue-800' },
    printed: { label: '已列印', cls: 'bg-green-100 text-green-800' },
  };
  return m[s] || { label: s, cls: 'bg-gray-100 text-gray-800' };
};

const emptyNote = (): Omit<DeliveryNote, 'id' | 'created_at'> => ({
  note_no: '',
  customer_id: null,
  customer_name: '',
  customer_address: '',
  customer_contact: '',
  customer_phone: '',
  customer_order: '',
  delivery_date: new Date().toISOString().split('T')[0],
  status: 'draft',
  remark: '',
  delivery_note_items: [],
});

/* ─── Component ─── */
export default function DeliveryPage() {
  const [notes, setNotes] = useState<DeliveryNote[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [currentIdx, setCurrentIdx] = useState(-1);
  const [editMode, setEditMode] = useState(false);
  const [isFormDirty, setIsFormDirty] = useState(false);

  // Form state (the note being edited / viewed)
  const [form, setForm] = useState<Omit<DeliveryNote, 'id' | 'created_at'> & { id?: string }>(emptyNote());

  // Dialogs
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [addingRowIdx, setAddingRowIdx] = useState(-1);
  const [searchQuery, setSearchQuery] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');

  // Label printing
  const [labelOpen, setLabelOpen] = useState(false);
  const [labelItemIdx, setLabelItemIdx] = useState(0);
  const [labelBoxes, setLabelBoxes] = useState<number[][]>([]);
  const [labelPreview, setLabelPreview] = useState(false);

  const printRef = useRef<HTMLDivElement>(null);
  const labelPrintRef = useRef<HTMLDivElement>(null);

  const current = currentIdx >= 0 ? notes[currentIdx] : null;

  /* ─── Data fetching ─── */
  const fetchNotes = useCallback(async () => {
    const res = await fetch('/api/delivery');
    const data = await res.json();
    setNotes(Array.isArray(data) ? data : []);
  }, []);

  const fetchMeta = useCallback(async () => {
    const [cRes, pRes] = await Promise.all([
      fetch('/api/customers'),
      fetch('/api/bom?all=true'),
    ]);
    const cData = await cRes.json();
    const pData = await pRes.json();
    setCustomers(Array.isArray(cData) ? cData : []);
    // Products come from BOM items — flatten all unique products
    const prods: Product[] = [];
    const seen = new Set<string>();
    const bomList = Array.isArray(pData) ? pData : [];
    for (const bom of bomList) {
      for (const child of bom.children || []) {
        if (child.product_id && !seen.has(child.product_id)) {
          seen.add(child.product_id);
          prods.push({
            id: child.product_id,
            code: child.product_code || '',
            name: child.product_name || '',
            spec: child.product_spec || null,
            unit: child.product_unit || '个',
          });
        }
      }
      if (bom.parent_product_id && !seen.has(bom.parent_product_id)) {
        seen.add(bom.parent_product_id);
        prods.push({
          id: bom.parent_product_id,
          code: bom.parent_product_code || '',
          name: bom.parent_product_name || '',
          spec: null,
          unit: '个',
        });
      }
    }
    setProducts(prods);
  }, []);

  useEffect(() => { fetchNotes(); fetchMeta(); }, [fetchNotes, fetchMeta]);

  /* ─── Navigation ─── */
  const goTo = (idx: number) => {
    if (editMode && isFormDirty) {
      if (!window.confirm('当前修改尚未保存，是否放弃？')) return;
    }
    const clamped = Math.max(0, Math.min(idx, notes.length - 1));
    setCurrentIdx(clamped);
    setEditMode(false);
    setIsFormDirty(false);
    loadForm(notes[clamped]);
  };

  const loadForm = (note: DeliveryNote) => {
    setForm({
      id: note.id,
      note_no: note.note_no,
      customer_id: note.customer_id || null,
      customer_name: note.customer_name,
      customer_address: note.customer_address || '',
      customer_contact: note.customer_contact || '',
      customer_phone: note.customer_phone || '',
      customer_order: note.customer_order || '',
      delivery_date: formatDate(note.delivery_date),
      status: note.status,
      remark: note.remark || '',
      delivery_note_items: (note.delivery_note_items || []).map((it: DeliveryItem) => ({
        ...it,
        per_box_qty: it.per_box_qty || it.quantity,
        remark: it.remark || '',
      })),
    });
  };

  /* ─── CRUD ─── */
  const handleNew = (copy = false) => {
    const base = copy && form.id ? { ...form } : emptyNote();
    setForm({
      ...base,
      id: undefined,
      note_no: '',
      status: 'draft',
      delivery_date: new Date().toISOString().split('T')[0],
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
    if (!form.note_no || !form.customer_name) {
      alert('请填写送货单号和客户名称');
      return;
    }
    const payload = {
      ...form,
      delivery_date: form.delivery_date,
      items: form.delivery_note_items.map((it) => ({
        product_id: it.product_id,
        quantity: it.quantity,
        unit_price: it.unit_price,
        per_box_qty: it.per_box_qty,
        remark: it.remark,
      })),
    };
    // Remove extra fields
    const { id, delivery_note_items, ...noteFields } = payload as typeof payload & { id?: string };

    try {
      if (id) {
        await fetch('/api/delivery', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, ...noteFields, items: payload.items }),
        });
      } else {
        const res = await fetch('/api/delivery', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(noteFields),
        });
        const created = await res.json();
        setForm((prev) => ({ ...prev, id: created.id }));
      }
      await fetchNotes();
      setEditMode(false);
      setIsFormDirty(false);
    } catch (e) {
      alert('保存失败: ' + String(e));
    }
  };

  const handleCancel = () => {
    if (current) loadForm(current);
    else setForm(emptyNote());
    setEditMode(false);
    setIsFormDirty(false);
  };

  const handleDelete = async () => {
    if (!form.id) return;
    await fetch(`/api/delivery?id=${form.id}`, { method: 'DELETE' });
    setDeleteOpen(false);
    setEditMode(false);
    setForm(emptyNote());
    setCurrentIdx(-1);
    await fetchNotes();
  };

  /* ─── Customer auto-fill ─── */
  const pickCustomer = (cust: Customer) => {
    setForm((prev) => ({
      ...prev,
      customer_id: cust.id,
      customer_name: cust.name,
      customer_address: cust.address || '',
      customer_contact: cust.contact || '',
      customer_phone: cust.phone || '',
    }));
    setCustomerSearch(cust.code || cust.name);
    setIsFormDirty(true);
  };

  /* ─── Items manipulation ─── */
  const addItem = (product: Product) => {
    setForm((prev) => ({
      ...prev,
      delivery_note_items: [
        ...prev.delivery_note_items,
        {
          product_id: product.id,
          product: product,
          quantity: 0,
          unit_price: 0,
          per_box_qty: 0,
          remark: '',
        },
      ],
    }));
    setProductPickerOpen(false);
    setIsFormDirty(true);
  };

  const removeItem = (idx: number) => {
    setForm((prev) => ({
      ...prev,
      delivery_note_items: prev.delivery_note_items.filter((_, i) => i !== idx),
    }));
    setIsFormDirty(true);
  };

  const updateItem = (idx: number, field: keyof DeliveryItem, value: string | number) => {
    setForm((prev) => {
      const items = [...prev.delivery_note_items];
      items[idx] = { ...items[idx], [field]: value };
      // Auto-fill per_box_qty = quantity when quantity changes
      if (field === 'quantity') {
        items[idx].per_box_qty = Number(value);
      }
      return { ...prev, delivery_note_items: items };
    });
    setIsFormDirty(true);
  };

  /* ─── Print delivery note ─── */
  const handlePrintDelivery = () => {
    window.print();
  };

  /* ─── Label printing ─── */
  const openLabelDialog = (itemIdx: number) => {
    setLabelItemIdx(itemIdx);
    const item = form.delivery_note_items[itemIdx];
    if (!item) return;
    const qty = item.quantity;
    const perBox = item.per_box_qty || qty;
    const boxCount = perBox > 0 ? Math.ceil(qty / perBox) : 1;

    const boxes: number[] = [];
    let remaining = qty;
    for (let i = 0; i < boxCount; i++) {
      const bQty = Math.min(perBox, remaining);
      boxes.push(bQty);
      remaining -= bQty;
    }
    setLabelBoxes([boxes]);
    setLabelOpen(true);
    setLabelPreview(false);
  };

  const updateBoxQty = (boxIdx: number, value: number) => {
    setLabelBoxes((prev) => {
      const newBoxes = prev.map((arr) => [...arr]);
      newBoxes[0][boxIdx] = value;
      return newBoxes;
    });
  };

  const addBox = () => {
    setLabelBoxes((prev) => {
      const newBoxes = prev.map((arr) => [...arr]);
      newBoxes[0].push(0);
      return newBoxes;
    });
  };

  const removeBox = (boxIdx: number) => {
    setLabelBoxes((prev) => {
      const newBoxes = prev.map((arr) => [...arr]);
      newBoxes[0].splice(boxIdx, 1);
      return newBoxes;
    });
  };

  const labelTotal = labelBoxes[0]?.reduce((a, b) => a + b, 0) || 0;
  const labelDiff = labelTotal - (form.delivery_note_items[labelItemIdx]?.quantity || 0);

  const generateLabels = () => {
    setLabelPreview(true);
    setTimeout(() => {
      const item = form.delivery_note_items[labelItemIdx];
      if (!item) return;
      const boxes = labelBoxes[0] || [];
      const container = labelPrintRef.current;
      if (!container) return;

      container.innerHTML = '';
      boxes.forEach((boxQty, i) => {
        if (boxQty <= 0) return;
        const label = document.createElement('div');
        label.className = 'label-card';
        label.innerHTML = `
          <div class="label-customer">${form.customer_name || ''}</div>
          <div class="label-divider"></div>
          <div class="label-product">${item.product?.name || ''}</div>
          <div class="label-spec">${item.product?.spec || '-'}</div>
          <div class="label-row">
            <span>编码: ${item.product?.code || ''}</span>
          </div>
          <div class="label-row">
            <span>第 ${i + 1}/${boxes.filter(q => q > 0).length} 箱</span>
            <span>${boxQty} ${item.product?.unit || '个'}</span>
          </div>
          <svg class="label-barcode" id="barcode-${i}"></svg>
          <div class="label-note">${form.note_no || ''}</div>
        `;
        container.appendChild(label);

        try {
          JsBarcode(`#barcode-${i}`, `${item.product?.code || 'N/A'}-${i + 1}`, {
            format: 'CODE128',
            width: 1.5,
            height: 35,
            displayValue: false,
            margin: 2,
          });
        } catch { /* ignore barcode errors */ }
      });
    }, 100);
  };

  const handlePrintLabels = () => {
    window.print();
  };

  /* ─── Search ─── */
  const filteredNotes = searchQuery
    ? notes.filter((n) =>
        n.note_no.includes(searchQuery) ||
        n.customer_name.includes(searchQuery)
      )
    : notes;

  /* ─── Render ─── */
  const st = statusLabel(form.status);

  return (
    <div className="h-full flex flex-col bg-[#F8F9FA]">
      {/* ─── Toolbar ─── */}
      <div className="bg-white border-b border-[#E5E7EB] px-4 py-2 no-print">
        <div className="flex items-center gap-1 flex-wrap">
          <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={() => handleNew(false)} disabled={editMode}>
            <Plus className="h-3.5 w-3.5 text-blue-600" /> 新增
          </Button>
          <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={() => handleNew(true)} disabled={!form.id || editMode}>
            <Copy className="h-3.5 w-3.5 text-orange-500" /> 复制新增
          </Button>
          <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={handleEdit} disabled={!current || editMode}>
            <Pencil className="h-3.5 w-3.5 text-yellow-600" /> 修改
          </Button>
          <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={() => setDeleteOpen(true)} disabled={!form.id || editMode}>
            <Trash2 className="h-3.5 w-3.5 text-red-500" /> 删除
          </Button>
          <div className="w-px h-5 bg-gray-300 mx-1" />
          {editMode ? (
            <>
              <Button size="sm" className="h-8 gap-1 text-xs bg-[#1E40AF] hover:bg-[#1D4ED8]" onClick={handleSave}>
                <Save className="h-3.5 w-3.5" /> 保存
              </Button>
              <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={handleCancel}>
                <X className="h-3.5 w-3.5" /> 取消
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={handlePrintDelivery} disabled={!current}>
                <Printer className="h-3.5 w-3.5" /> 打印送货单
              </Button>
            </>
          )}
          <div className="w-px h-5 bg-gray-300 mx-1" />
          {/* Navigation */}
          <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={() => goTo(0)} disabled={notes.length === 0}>
            <ChevronsLeft className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={() => goTo(currentIdx - 1)} disabled={currentIdx <= 0}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs text-gray-500 min-w-[60px] text-center">
            {notes.length > 0 ? `${currentIdx + 1} / ${notes.length}` : '0 / 0'}
          </span>
          <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={() => goTo(currentIdx + 1)} disabled={currentIdx >= notes.length - 1}>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={() => goTo(notes.length - 1)} disabled={notes.length === 0}>
            <ChevronsRight className="h-3.5 w-3.5" />
          </Button>

          {/* Search */}
          <div className="w-px h-5 bg-gray-300 mx-1" />
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <Input
              className="h-8 w-40 pl-7 text-xs"
              placeholder="搜索单号/客户"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (e.target.value && filteredNotes.length > 0) {
                  const idx = notes.indexOf(filteredNotes[0]);
                  if (idx >= 0) goTo(idx);
                }
              }}
            />
          </div>

          {/* Status */}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs font-semibold text-red-600">单据状态: {st.label}</span>
          </div>
        </div>
      </div>

      {/* ─── Main Content ─── */}
      <div className="flex-1 overflow-auto p-4">
        {/* ─── Delivery Note Print View ─── */}
        <div ref={printRef} className="bg-white rounded shadow-sm border border-[#E5E7EB]">
          {/* Header */}
          <div className="bg-[#F0F2F5] px-5 py-3 border-b border-[#E5E7EB] flex items-center justify-between">
            <h2 className="text-base font-semibold text-[#111827]">销售出货单</h2>
            {form.note_no && <span className="text-xs text-gray-500">单号: {form.note_no}</span>}
          </div>

          {/* Customer info area */}
          <div className="px-5 py-3 bg-[#FAFBFC] border-b border-[#E5E7EB]">
            <div className="grid grid-cols-4 gap-x-4 gap-y-2">
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 whitespace-nowrap w-16">客户编号</label>
                {editMode ? (
                  <div className="relative flex-1">
                    <Input
                      className="h-7 text-xs"
                      value={customerSearch}
                      onChange={(e) => {
                        setCustomerSearch(e.target.value);
                        setIsFormDirty(true);
                      }}
                      onFocus={() => setCustomerSearch(customerSearch || form.customer_id || '')}
                      placeholder="输入编号或名称搜索"
                    />
                    {customerSearch && customers.filter(c => c.code.includes(customerSearch) || c.name.includes(customerSearch)).length > 0 && (
                      <div className="absolute z-50 top-7 left-0 bg-white border rounded shadow-lg max-h-32 overflow-auto w-full">
                        {customers.filter(c => c.code.includes(customerSearch) || c.name.includes(customerSearch)).slice(0, 5).map(c => (
                          <button key={c.id} className="w-full text-left px-2 py-1 hover:bg-gray-100 text-xs" onClick={() => { pickCustomer(c); setCustomerSearch(c.code); }}>
                            {c.code} - {c.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-[#111827]">{form.customer_id ? customers.find(c => c.id === form.customer_id)?.code : '-'}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 whitespace-nowrap w-16">客户名称</label>
                {editMode ? (
                  <Input
                    className="h-7 text-xs flex-1"
                    value={form.customer_name}
                    onChange={(e) => { setForm((prev) => ({ ...prev, customer_name: e.target.value })); setIsFormDirty(true); }}
                  />
                ) : (
                  <span className="text-xs text-[#111827]">{form.customer_name || '-'}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 whitespace-nowrap w-16">客户地址</label>
                {editMode ? (
                  <Input
                    className="h-7 text-xs flex-1"
                    value={form.customer_address || ''}
                    onChange={(e) => { setForm((prev) => ({ ...prev, customer_address: e.target.value })); setIsFormDirty(true); }}
                  />
                ) : (
                  <span className="text-xs text-[#111827]">{form.customer_address || '-'}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 whitespace-nowrap w-16">结账方式</label>
                {editMode ? (
                  <Select value="" onValueChange={() => {}}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="选择" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">月结</SelectItem>
                      <SelectItem value="cod">货到付款</SelectItem>
                      <SelectItem value="prepaid">预付</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="text-xs text-[#111827]">-</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 whitespace-nowrap w-16">联络人</label>
                {editMode ? (
                  <Input className="h-7 text-xs flex-1" value={form.customer_contact || ''} onChange={(e) => { setForm((prev) => ({ ...prev, customer_contact: e.target.value })); setIsFormDirty(true); }} />
                ) : (
                  <span className="text-xs text-[#111827]">{form.customer_contact || '-'}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 whitespace-nowrap w-16">联络电话</label>
                {editMode ? (
                  <Input className="h-7 text-xs flex-1" value={form.customer_phone || ''} onChange={(e) => { setForm((prev) => ({ ...prev, customer_phone: e.target.value })); setIsFormDirty(true); }} />
                ) : (
                  <span className="text-xs text-[#111827]">{form.customer_phone || '-'}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 whitespace-nowrap w-16">客户订单</label>
                {editMode ? (
                  <Input className="h-7 text-xs flex-1" value={form.customer_order || ''} onChange={(e) => { setForm((prev) => ({ ...prev, customer_order: e.target.value })); setIsFormDirty(true); }} />
                ) : (
                  <span className="text-xs text-[#111827]">{form.customer_order || '-'}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 whitespace-nowrap w-16">出货日期</label>
                {editMode ? (
                  <Input type="date" className="h-7 text-xs flex-1" value={formatDate(form.delivery_date)} onChange={(e) => { setForm((prev) => ({ ...prev, delivery_date: e.target.value })); setIsFormDirty(true); }} />
                ) : (
                  <span className="text-xs text-[#111827]">{formatDate(form.delivery_date)}</span>
                )}
              </div>
            </div>
          </div>

          {/* Tabs area */}
          <div className="px-5">
            <div className="flex gap-0 border-b border-[#E5E7EB]">
              <button className="px-4 py-1.5 text-xs font-medium bg-[#1E40AF] text-white rounded-t">单据明细</button>
              <button className="px-4 py-1.5 text-xs text-gray-600 hover:bg-gray-50 rounded-t">相关文档</button>
            </div>
          </div>

          {/* Items table */}
          <div className="px-5 py-2">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#E5E7EB] bg-[#F9FAFB]">
                  <th className="py-2 px-2 text-left font-medium text-gray-600 w-10">序</th>
                  <th className="py-2 px-2 text-left font-medium text-gray-600">订单号码</th>
                  <th className="py-2 px-2 text-left font-medium text-gray-600">商品编号</th>
                  <th className="py-2 px-2 text-left font-medium text-gray-600">商品名称</th>
                  <th className="py-2 px-2 text-left font-medium text-gray-600 w-12">单位</th>
                  <th className="py-2 px-2 text-right font-medium text-gray-600 w-20">数量</th>
                  <th className="py-2 px-2 text-right font-medium text-gray-600 w-20">每箱数量</th>
                  <th className="py-2 px-2 text-left font-medium text-gray-600">明细备注</th>
                  {editMode && <th className="py-2 px-2 w-20 text-center font-medium text-gray-600">操作</th>}
                </tr>
              </thead>
              <tbody>
                {form.delivery_note_items.map((item, idx) => (
                  <tr key={idx} className="border-b border-[#E5E7EB] hover:bg-[#F9FAFB]">
                    <td className="py-2 px-2 text-gray-500">{idx + 1}</td>
                    <td className="py-2 px-2">
                      {editMode ? (
                        <Input className="h-6 text-xs" value={form.customer_order || ''} readOnly />
                      ) : (
                        <span className="text-gray-500">{form.customer_order || '-'}</span>
                      )}
                    </td>
                    <td className="py-2 px-2 font-mono text-[#111827]">{item.product?.code || '-'}</td>
                    <td className="py-2 px-2 text-[#111827]">{item.product?.name || '-'}</td>
                    <td className="py-2 px-2 text-gray-500">{item.product?.unit || '-'}</td>
                    <td className="py-2 px-2 text-right font-mono">
                      {editMode ? (
                        <Input type="number" className="h-6 text-xs text-right w-20 ml-auto" value={item.quantity} onChange={(e) => updateItem(idx, 'quantity', Number(e.target.value))} />
                      ) : (
                        item.quantity.toFixed(2)
                      )}
                    </td>
                    <td className="py-2 px-2 text-right font-mono">
                      {editMode ? (
                        <Input type="number" className="h-6 text-xs text-right w-20 ml-auto" value={item.per_box_qty} onChange={(e) => updateItem(idx, 'per_box_qty', Number(e.target.value))} />
                      ) : (
                        item.per_box_qty
                      )}
                    </td>
                    <td className="py-2 px-2">
                      {editMode ? (
                        <Input className="h-6 text-xs" value={item.remark || ''} onChange={(e) => updateItem(idx, 'remark', e.target.value)} placeholder="备注" />
                      ) : (
                        <span className="text-gray-500">{item.remark || '-'}</span>
                      )}
                    </td>
                    {editMode && (
                      <td className="py-2 px-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => openLabelDialog(idx)} title="标签打印">
                            <Tag className="h-3 w-3 text-gray-500" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => removeItem(idx)}>
                            <Trash2 className="h-3 w-3 text-red-400" />
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
                {/* Empty rows for filling */}
                {editMode && Array.from({ length: Math.max(3, 8 - form.delivery_note_items.length) }).map((_, i) => (
                  <tr key={`empty-${i}`} className="border-b border-[#E5E7EB] h-8">
                    <td className="py-1 px-2 text-gray-300">{form.delivery_note_items.length + i + 1}</td>
                    <td />
                    <td />
                    <td />
                    <td />
                    <td />
                    <td />
                    <td />
                    <td />
                  </tr>
                ))}
                {!editMode && form.delivery_note_items.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-gray-400">暂无明细</td>
                  </tr>
                )}
              </tbody>
            </table>
            {editMode && (
              <div className="mt-2">
                <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => setProductPickerOpen(true)}>
                  <Plus className="h-3 w-3" /> 添加商品
                </Button>
              </div>
            )}
          </div>

          {/* Footer / Remark */}
          <div className="px-5 py-3 border-t border-[#E5E7EB] flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">备注</label>
              {editMode ? (
                <Input className="h-7 text-xs flex-1 min-w-[300px]" value={form.remark || ''} onChange={(e) => { setForm((prev) => ({ ...prev, remark: e.target.value })); setIsFormDirty(true); }} />
              ) : (
                <span className="text-xs text-[#111827]">{form.remark || '-'}</span>
              )}
            </div>
            <div className="ml-auto text-xs text-gray-400">
              建档日期: {form.id ? (current?.created_at ? formatDate(current.created_at) : '-') : '-'}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Delete Confirm ─── */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除送货单 {form.note_no} 吗？此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Product Picker ─── */}
      <Dialog open={productPickerOpen} onOpenChange={setProductPickerOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>选择商品</DialogTitle>
          </DialogHeader>
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  <th className="py-1 px-2 text-left">编号</th>
                  <th className="py-1 px-2 text-left">名称</th>
                  <th className="py-1 px-2 text-left">规格</th>
                  <th className="py-1 px-2 text-left">单位</th>
                  <th className="py-1 px-2 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} className="border-b hover:bg-gray-50">
                    <td className="py-1 px-2 font-mono">{p.code}</td>
                    <td className="py-1 px-2">{p.name}</td>
                    <td className="py-1 px-2">{p.spec || '-'}</td>
                    <td className="py-1 px-2">{p.unit}</td>
                    <td className="py-1 px-2 text-center">
                      <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => addItem(p)}>
                        <Plus className="h-3 w-3" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Label Print Dialog ─── */}
      <Dialog open={labelOpen} onOpenChange={setLabelOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>标签打印 - {form.delivery_note_items[labelItemIdx]?.product?.name || ''}</DialogTitle>
          </DialogHeader>

          {!labelPreview ? (
            <div className="space-y-4">
              <div className="text-xs text-gray-500">
                总数量: <span className="font-mono font-semibold text-[#111827]">{form.delivery_note_items[labelItemIdx]?.quantity || 0}</span>
                {' '}{form.delivery_note_items[labelItemIdx]?.product?.unit || '个'}
              </div>

              <div className="border rounded">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="py-2 px-3 text-left">箱号</th>
                      <th className="py-2 px-3 text-left">每箱数量</th>
                      <th className="py-2 px-3 w-16">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {labelBoxes[0]?.map((qty, i) => (
                      <tr key={i} className="border-b">
                        <td className="py-2 px-3 font-mono">第 {i + 1} 箱</td>
                        <td className="py-2 px-3">
                          <Input
                            type="number"
                            className="h-7 w-24 text-xs"
                            value={qty}
                            min={0}
                            onChange={(e) => updateBoxQty(i, Number(e.target.value))}
                          />
                        </td>
                        <td className="py-2 px-3 text-center">
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => removeBox(i)} disabled={labelBoxes[0].length <= 1}>
                            <Minus className="h-3 w-3" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between">
                <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={addBox}>
                  <Plus className="h-3 w-3" /> 增加一箱
                </Button>
                <div className="text-xs">
                  {labelDiff === 0 ? (
                    <span className="text-green-600">分配总量匹配</span>
                  ) : labelDiff > 0 ? (
                    <span className="text-red-600">多出 {labelDiff} 个</span>
                  ) : (
                    <span className="text-red-600">不足 {Math.abs(labelDiff)} 个</span>
                  )}
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setLabelOpen(false)}>取消</Button>
                <Button className="bg-[#1E40AF] hover:bg-[#1D4ED8]" onClick={generateLabels} disabled={labelDiff !== 0}>
                  生成标签预览
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-3">
              <div ref={labelPrintRef} className="grid grid-cols-2 gap-3 max-h-[400px] overflow-auto" />
              <DialogFooter>
                <Button variant="outline" onClick={() => setLabelPreview(false)}>返回修改</Button>
                <Button className="bg-[#1E40AF] hover:bg-[#1D4ED8] gap-1" onClick={handlePrintLabels}>
                  <Printer className="h-4 w-4" /> 打印标签
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Label Print Styles ─── */}
      <style jsx global>{`
        .label-card {
          border: 1px solid #333;
          padding: 8px 10px;
          font-size: 11px;
          font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
          page-break-inside: avoid;
        }
        .label-customer {
          font-weight: 600;
          font-size: 12px;
          margin-bottom: 4px;
        }
        .label-divider {
          border-top: 1px dashed #999;
          margin: 4px 0;
        }
        .label-product {
          font-weight: 600;
          font-size: 13px;
          margin-bottom: 2px;
        }
        .label-spec {
          color: #666;
          margin-bottom: 4px;
        }
        .label-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 2px;
        }
        .label-barcode {
          width: 100%;
          margin: 4px 0 2px;
        }
        .label-note {
          text-align: center;
          font-size: 9px;
          color: #999;
        }
        @media print {
          body * { visibility: hidden; }
          .label-card, .label-card * { visibility: visible; }
          .label-card { position: relative; }
          .no-print { visibility: hidden; }
        }
      `}</style>
    </div>
  );
}
