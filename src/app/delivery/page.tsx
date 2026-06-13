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
interface OrderItem {
  id: string;
  product_id: string;
  quantity: number;
  delivered_qty: number;
  price: number | null;
  remark: string | null;
  products?: Product | Product[];
}
interface CustomerOrder {
  id: string;
  order_no: string;
  customer_id: string;
  status: string;
  customer_order_items?: OrderItem[];
  customers?: Customer;
}
interface DeliveryItem {
  id?: string;
  product_id: string;
  product?: Product;
  products?: Product | Product[];
  quantity: number;
  unit_price: number;
  per_box_qty: number;
  remark: string;
  customer_order_item_id?: string | null;
  customer_order?: string;
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
  customer_order_id?: string | null;
  warehouse_id?: string | null;
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
  customer_order_id: null,
  warehouse_id: null,
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
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  // Delivery print preview
  const [printPreviewOpen, setPrintPreviewOpen] = useState(false);
  const [printData, setPrintData] = useState<DeliveryNote | null>(null);
  const [companyInfo, setCompanyInfo] = useState<{ name?: string; short_name?: string; code?: string; address?: string; contact?: string; phone?: string; fax?: string; email?: string; tax_no?: string; bank_name?: string; bank_account?: string; invoice_title?: string }>({});

  // Label printing
  const [labelOpen, setLabelOpen] = useState(false);
  const [labelItemIdx, setLabelItemIdx] = useState(0);
  const [labelBoxes, setLabelBoxes] = useState<number[][]>([]);
  const [labelPreview, setLabelPreview] = useState(false);

  // Order picker
  const [orderPickerOpen, setOrderPickerOpen] = useState(false);
  const [customerOrders, setCustomerOrders] = useState<CustomerOrder[]>([]);
  const [warehouses, setWarehouses] = useState<Array<{ id: string; name: string }>>([]);
  const [shipDialogOpen, setShipDialogOpen] = useState(false);
  const [shipWarehouseId, setShipWarehouseId] = useState('');
  const [itemSearches, setItemSearches] = useState<Record<number, string>>({});

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
    const [cRes, pRes, oRes, whRes, sRes] = await Promise.all([
      fetch('/api/customers'),
      fetch('/api/products'),
      fetch('/api/orders?status=confirmed'),
      fetch('/api/warehouses'),
      fetch('/api/settings'),
    ]);
    const cData = await cRes.json();
    const pData = await pRes.json();
    const oData = await oRes.json();
    const whData = await whRes.json();
    const sData = await sRes.json();
    setCustomers(Array.isArray(cData) ? cData : []);
    if (Array.isArray(oData)) setCustomerOrders(oData.filter((o: CustomerOrder) => o.status === 'confirmed' || o.status === 'in_progress' || o.status === 'pending'));
    if (Array.isArray(whData)) setWarehouses(whData);
    setProducts(Array.isArray(pData) ? pData : []);
    if (sData?.company_info) setCompanyInfo(sData.company_info);
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

  const loadForm = async (note: DeliveryNote) => {
    // 如果 items 是 count 汇总格式，从 API 获取完整数据
    const hasCountOnly = Array.isArray(note.delivery_note_items) &&
      note.delivery_note_items.length > 0 &&
      'count' in (note.delivery_note_items[0] as unknown as Record<string, unknown>) &&
      Object.keys(note.delivery_note_items[0] as unknown as Record<string, unknown>).length <= 2;

    let fullNote = note;
    if (hasCountOnly && note.id) {
      try {
        const res = await fetch(`/api/delivery?id=${note.id}`);
        const data = await res.json();
        if (data.id) fullNote = data;
      } catch { /* fallback to list data */ }
    }

    setForm({
      id: fullNote.id,
      note_no: fullNote.note_no,
      customer_id: fullNote.customer_id || null,
      customer_name: fullNote.customer_name,
      customer_address: fullNote.customer_address || '',
      customer_contact: fullNote.customer_contact || '',
      customer_phone: fullNote.customer_phone || '',
      customer_order: fullNote.customer_order || '',
      customer_order_id: fullNote.customer_order_id || null,
      delivery_date: formatDate(fullNote.delivery_date),
      status: fullNote.status,
      remark: fullNote.remark || '',
      delivery_note_items: Array.isArray(fullNote.delivery_note_items)
        ? fullNote.delivery_note_items
            .filter((it: DeliveryItem) => !('count' in (it as unknown as Record<string, unknown>) && Object.keys(it as unknown as Record<string, unknown>).length <= 2))
            .map((it: DeliveryItem & { products?: Product | Product[] }) => {
              // Supabase JOIN 返回 products (复数)，统一转为 product (单数)
              const rawProd = it.products;
              let product: Product | undefined;
              if (rawProd) {
                product = Array.isArray(rawProd) ? rawProd[0] : rawProd;
              }
              return {
                ...it,
                product,
                per_box_qty: it.per_box_qty || it.quantity,
                remark: it.remark || '',
                customer_order_item_id: it.customer_order_item_id || null,
              };
            })
        : [],
    });
  };

  // 首次加载后自动选择第一条记录
  useEffect(() => {
    if (notes.length > 0 && currentIdx < 0 && !editMode) {
      setCurrentIdx(0);
      void loadForm(notes[0]);
    }
  }, [notes, currentIdx, editMode, loadForm]);

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
    if (!form.customer_name) {
      alert('请填写客户名称');
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
        customer_order_item_id: it.customer_order_item_id || null,
      })),
    };
    // Only keep fields that belong to delivery_notes table + items
    const { id, delivery_note_items, customer_order, customer_orders, ...noteFields } = payload as typeof payload & { id?: string; customer_order?: unknown; customer_orders?: unknown };

    try {
      if (id) {
        const putRes = await fetch('/api/delivery', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, ...noteFields, items: payload.items }),
        });
        const putData = await putRes.json();
        if (putData.error) { alert('保存失败: ' + putData.error); return; }
        await fetchNotes();
      } else {
        const res = await fetch('/api/delivery', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(noteFields),
        });
        const created = await res.json();
        if (created.error) { alert('保存失败: ' + created.error); return; }
        setForm((prev) => ({ ...prev, id: created.id }));
        const refreshed = await fetch('/api/delivery').then(r => r.json());
        if (Array.isArray(refreshed)) {
          setNotes(refreshed);
          const idx = refreshed.findIndex((n: DeliveryNote) => n.id === created.id);
          if (idx >= 0) setCurrentIdx(idx);
        }
      }
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
    setShowCustomerDropdown(false);
    setIsFormDirty(true);
  };

  /* ─── Import from customer order ─── */
  const importFromOrder = async (order: CustomerOrder) => {
    // 获取可用库存信息，按 product_id 汇总
    let inventoryMap: Record<string, { quantity: number; reserved_qty: number }> = {};
    try {
      const invRes = await fetch('/api/inventory');
      const invData = await invRes.json();
      if (Array.isArray(invData)) {
        for (const inv of invData) {
          const existing = inventoryMap[inv.product_id];
          if (existing) {
            existing.quantity += Number(inv.quantity) || 0;
            existing.reserved_qty += Number(inv.reserved_qty) || 0;
          } else {
            inventoryMap[inv.product_id] = {
              quantity: Number(inv.quantity) || 0,
              reserved_qty: Number(inv.reserved_qty) || 0,
            };
          }
        }
      }
    } catch { /* ignore */ }

    // 过滤：只导入有足够可用库存的物料（可用库存 = quantity - reserved_qty）
    const filteredItems = (order.customer_order_items || []).filter((item) => {
      const undelivered = Number(item.quantity) - Number(item.delivered_qty);
      if (undelivered <= 0) return false;
      const inv = inventoryMap[item.product_id];
      const available = inv ? inv.quantity - inv.reserved_qty : 0;
      return available > 0;
    });

    if (filteredItems.length === 0) {
      alert('该订单中所有物料均无可用库存，无法导入。请先完成生产入库。');
      return;
    }

    const hasUnavailable = (order.customer_order_items || []).some((item) => {
      const undelivered = Number(item.quantity) - Number(item.delivered_qty);
      if (undelivered <= 0) return false;
      const inv = inventoryMap[item.product_id];
      const available = inv ? inv.quantity - inv.reserved_qty : 0;
      return available <= 0;
    });

    if (hasUnavailable) {
      const proceed = window.confirm('部分物料库存不足（未完成生产），仅导入有库存的物料。是否继续？');
      if (!proceed) return;
    }

    const items: DeliveryItem[] = filteredItems.map((item) => {
      // Supabase JOIN 返回 products 为对象或数组，统一提取为单对象
      const rawProd = item.products;
      let product: Product | undefined;
      if (rawProd) {
        if (Array.isArray(rawProd)) {
          product = rawProd[0] as Product;
        } else if (typeof rawProd === 'object') {
          product = rawProd as Product;
        }
      }

      const undelivered = Number(item.quantity) - Number(item.delivered_qty);
      // 可用库存数量，限制送货数量不超过可用量
      const inv = inventoryMap[item.product_id];
      const available = inv ? inv.quantity - inv.reserved_qty : 0;
      const deliverQty = Math.min(undelivered, available);

      return {
        product_id: item.product_id,
        product,
        quantity: deliverQty,
        unit_price: Number(item.price) || 0,
        per_box_qty: deliverQty,
        remark: available < undelivered ? `欠交 ${undelivered - available}` : (item.remark || ''),
        customer_order_item_id: item.id,
        customer_order: order.order_no,
      };
    });

    const cust = order.customers as Record<string, string> | undefined;
    setForm((prev) => ({
      ...prev,
      customer_id: order.customer_id || '',
      customer_name: cust?.name || '',
      customer_address: cust?.address || prev.customer_address || '',
      customer_contact: cust?.contact || '',
      customer_phone: cust?.phone || '',
      customer_order_id: order.id,
      customer_order: order.order_no,
      delivery_note_items: items,
    }));
    setCustomerSearch(cust?.code || cust?.name || '');
    setOrderPickerOpen(false);
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

  const addEmptyItem = () => {
    setForm((prev) => ({
      ...prev,
      delivery_note_items: [...prev.delivery_note_items, {
        product_id: '',
        quantity: 0,
        unit_price: 0,
        per_box_qty: 0,
        remark: '',
      }],
    }));
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

  /* ─── Search products for inline item picker ─── */
  const searchDeliveryProducts = (query: string) => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return products.filter(
      (p) => p.code?.toLowerCase().includes(q) || p.name?.toLowerCase().includes(q) || p.spec?.toLowerCase().includes(q)
    ).slice(0, 20);
  };

  const selectProductForItem = (idx: number, p: Product) => {
    setForm((prev) => {
      const items = [...prev.delivery_note_items];
      items[idx] = {
        ...items[idx],
        product_id: p.id,
        product: p,
        per_box_qty: items[idx].quantity || 0,
      };
      return { ...prev, delivery_note_items: items };
    });
    setItemSearches((prev) => {
      const next = { ...prev };
      delete next[idx];
      return next;
    });
    setIsFormDirty(true);
  };

  /* ─── Print delivery note ─── */
  const handlePrintDelivery = async () => {
    // 如果有保存过的ID，从API获取完整数据（含订单编号等关联信息）
    if (form.id) {
      try {
        const res = await fetch(`/api/delivery?id=${form.id}`);
        const data = await res.json();
        if (data && !data.error) {
          setPrintData(data as DeliveryNote);
          setPrintPreviewOpen(true);
          return;
        }
      } catch {
        // API获取失败，降级用当前表单数据
      }
    }
    // 直接用当前表单数据打印（无论是否已保存）
    setPrintData(form as DeliveryNote);
    setPrintPreviewOpen(true);
  };

  const doPrint = () => {
    window.print();
  };

  /* ─── Ship (confirm delivery → deduct inventory) ─── */
  const handleShip = async () => {
    if (!form.id || !shipWarehouseId) return;
    try {
      const res = await fetch('/api/delivery', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: form.id,
          status: 'shipped',
          warehouse_id: shipWarehouseId,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setShipDialogOpen(false);
        setEditMode(false);
        await fetchNotes();
      } else {
        alert(data.error || '出货失败');
      }
    } catch (e) {
      alert('出货失败: ' + String(e));
    }
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

  const saveLabelSettings = () => {
    const boxes = labelBoxes[0] || [];
    const totalBoxQty = boxes.reduce((a, b) => a + b, 0);
    if (totalBoxQty !== form.delivery_note_items[labelItemIdx]?.quantity) return;
    // Save per_box_qty back to the form item
    const items = [...form.delivery_note_items];
    if (items[labelItemIdx]) {
      // If single box, per_box_qty = total qty; otherwise use first box qty
      items[labelItemIdx] = { ...items[labelItemIdx], per_box_qty: boxes.length === 1 ? totalBoxQty : boxes[0] };
      setForm((prev) => ({ ...prev, delivery_note_items: items }));
    }
    setLabelOpen(false);
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
              <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={() => setOrderPickerOpen(true)}>
                <ArrowRight className="h-3.5 w-3.5" /> 从订单导入
              </Button>
              <div className="w-px h-5 bg-gray-300 mx-1" />
              <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={handlePrintDelivery}>
                <Printer className="h-3.5 w-3.5" /> 打印送货单
              </Button>
              <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={() => { if (form.delivery_note_items.length > 0) openLabelDialog(0); }} disabled={form.delivery_note_items.length === 0}>
                <Tag className="h-3.5 w-3.5" /> 打印标签
              </Button>
            </>
          ) : (
            <>
              {form.status === 'draft' && (
                <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={() => { setShipWarehouseId(warehouses[0]?.id || ''); setShipDialogOpen(true); }} disabled={!form.id}>
                  <ArrowRight className="h-3.5 w-3.5 text-green-600" /> 确认出货
                </Button>
              )}
              <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={handlePrintDelivery}>
                <Printer className="h-3.5 w-3.5" /> 打印送货单
              </Button>
              <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={() => { if (form.delivery_note_items.length > 0) openLabelDialog(0); }} disabled={form.delivery_note_items.length === 0}>
                <Tag className="h-3.5 w-3.5" /> 打印标签
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
            {editMode ? (
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 whitespace-nowrap">送货单号:</label>
                <span className="text-xs text-gray-400 italic">保存后自动生成</span>
              </div>
            ) : (
              form.note_no && <span className="text-xs text-gray-500">单号: {form.note_no}</span>
            )}
          </div>

          {/* Customer info area */}
          <div className="px-5 py-3 bg-[#FAFBFC] border-b border-[#E5E7EB]">
            <div className="grid grid-cols-4 gap-x-4 gap-y-2">
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 whitespace-nowrap w-16">客户编号</label>
                {editMode ? (
                  <div className="relative flex-1">
                    <Input
                      className="h-7 text-xs font-mono"
                      value={customerSearch}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCustomerSearch(val);
                        // 输入时清空客户关联，等从下拉选择后自动填充
                        setForm((prev) => ({ ...prev, customer_id: null, customer_name: '', customer_address: '', customer_contact: '', customer_phone: '' }));
                        setShowCustomerDropdown(true);
                        setIsFormDirty(true);
                        // 精确匹配时自动选中
                        const exact = customers.find(c => c.code.toLowerCase() === val.toLowerCase());
                        if (exact) {
                          pickCustomer(exact);
                          setCustomerSearch(exact.code);
                          setShowCustomerDropdown(false);
                        }
                      }}
                      onFocus={() => { setCustomerSearch(customerSearch || ''); setShowCustomerDropdown(true); }}
                      onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 200)}
                      placeholder="输入客户编号"
                    />
                    {showCustomerDropdown && customerSearch && (() => {
                      const q = customerSearch.toLowerCase();
                      const filtered = customers.filter(c => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q));
                      return filtered.length > 0 ? (
                        <div className="absolute z-50 top-7 left-0 bg-white border rounded shadow-lg max-h-32 overflow-auto w-full">
                          {filtered.slice(0, 10).map(c => (
                            <button key={c.id} className="w-full text-left px-2 py-1 hover:bg-gray-100 text-xs" onMouseDown={(e) => { e.preventDefault(); pickCustomer(c); setCustomerSearch(c.code); }}>
                              <span className="font-mono text-gray-600 mr-1">{c.code}</span> {c.name}
                            </button>
                          ))}
                        </div>
                      ) : null;
                    })()}
                  </div>
                ) : (
                  <span className="text-xs text-[#111827]">{form.customer_id ? customers.find(c => c.id === form.customer_id)?.code : '-'}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 whitespace-nowrap w-16">客户名称</label>
                {editMode ? (
                  <Input
                    className="h-7 text-xs flex-1 bg-gray-50"
                    value={form.customer_name}
                    readOnly
                    placeholder="自动填充"
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
                        <Input className="h-6 text-xs" value={item.customer_order || ''} onChange={(e) => updateItem(idx, 'customer_order', e.target.value)} placeholder="输入订单号" />
                      ) : (
                        <span className="text-gray-500 font-mono">{item.customer_order || '-'}</span>
                      )}
                    </td>
                    <td className="py-2 px-2">
                      {editMode ? (
                        <div className="relative">
                          <Input
                            className="h-6 text-xs font-mono"
                            placeholder="搜索编号/名称"
                            value={item.product_id
                              ? (item.product?.code || '')
                              : (itemSearches[idx] || '')
                            }
                            onChange={(e) => {
                              setItemSearches((prev) => ({ ...prev, [idx]: e.target.value }));
                              if (item.product_id) {
                                setForm((prev) => {
                                  const items = [...prev.delivery_note_items];
                                  items[idx] = { ...items[idx], product_id: '', product: undefined };
                                  return { ...prev, delivery_note_items: items };
                                });
                                setIsFormDirty(true);
                              }
                            }}
                            onFocus={() => {
                              if (item.product_id) {
                                setForm((prev) => {
                                  const items = [...prev.delivery_note_items];
                                  items[idx] = { ...items[idx], product_id: '', product: undefined };
                                  return { ...prev, delivery_note_items: items };
                                });
                                setItemSearches((prev) => ({ ...prev, [idx]: '' }));
                                setIsFormDirty(true);
                              }
                            }}
                            onBlur={() => {
                              setTimeout(() => {
                                setItemSearches((prev) => {
                                  const next = { ...prev };
                                  delete next[idx];
                                  return next;
                                });
                              }, 200);
                            }}
                          />
                          {itemSearches[idx] && !item.product_id && (
                            <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded shadow-lg z-50 max-h-48 overflow-y-auto">
                              {searchDeliveryProducts(itemSearches[idx]).length === 0 ? (
                                <div className="px-3 py-2 text-xs text-gray-400">无匹配物料</div>
                              ) : (
                                searchDeliveryProducts(itemSearches[idx]).map((p) => (
                                  <button
                                    key={p.id}
                                    className="w-full text-left px-2 py-1.5 text-xs hover:bg-blue-50 flex items-center justify-between"
                                    onClick={() => selectProductForItem(idx, p)}
                                  >
                                    <span>
                                      <span className="font-mono">{p.code}</span>
                                      <span className="ml-1 text-gray-500">{p.name}</span>
                                      {p.spec && <span className="ml-1 text-gray-400">{p.spec}</span>}
                                    </span>
                                  </button>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="font-mono text-[#111827]">{item.product?.code || '-'}</span>
                      )}
                    </td>
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
                {/* Auto new-row for continuous input */}
                {editMode && (
                  <tr key="new-row" className="border-b border-[#E5E7EB] h-8">
                    <td className="py-1 px-2 text-gray-300">{form.delivery_note_items.length + 1}</td>
                    <td className="py-2 px-2">
                      <Input className="h-6 text-xs" placeholder="输入订单号" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEmptyItem(); } }} />
                    </td>
                    <td className="py-2 px-2">
                      <div className="relative">
                        <Input
                          className="h-6 text-xs font-mono"
                          placeholder="搜索编号/名称"
                          value={itemSearches[-1] || ''}
                          onChange={(e) => setItemSearches((prev) => ({ ...prev, [-1]: e.target.value }))}
                          onBlur={() => {
                            setTimeout(() => {
                              setItemSearches((prev) => {
                                const next = { ...prev };
                                delete next[-1];
                                return next;
                              });
                            }, 200);
                          }}
                          onKeyDown={(e) => { if (e.key === 'Enter' && !itemSearches[-1]) { e.preventDefault(); addEmptyItem(); } }}
                        />
                        {itemSearches[-1] && (
                          <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded shadow-lg z-50 max-h-48 overflow-y-auto">
                            {searchDeliveryProducts(itemSearches[-1]).length === 0 ? (
                              <div className="px-3 py-2 text-xs text-gray-400">无匹配物料</div>
                            ) : (
                              searchDeliveryProducts(itemSearches[-1]).map((p) => (
                                <button
                                  key={p.id}
                                  className="w-full text-left px-2 py-1.5 text-xs hover:bg-blue-50 flex items-center justify-between"
                                  onClick={() => {
                                    setForm((prev) => ({
                                      ...prev,
                                      delivery_note_items: [...prev.delivery_note_items, {
                                        product_id: p.id,
                                        product: p,
                                        quantity: 0,
                                        unit_price: 0,
                                        per_box_qty: 0,
                                        remark: '',
                                      }],
                                    }));
                                    setItemSearches((prev) => {
                                      const next = { ...prev };
                                      delete next[-1];
                                      return next;
                                    });
                                    setIsFormDirty(true);
                                  }}
                                >
                                  <span>
                                    <span className="font-mono">{p.code}</span>
                                    <span className="ml-1 text-gray-500">{p.name}</span>
                                    {p.spec && <span className="ml-1 text-gray-400">{p.spec}</span>}
                                  </span>
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    <td /><td /><td /><td /><td />
                    <td />
                  </tr>
                )}
                {!editMode && form.delivery_note_items.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-gray-400">暂无明细</td>
                  </tr>
                )}
              </tbody>
            </table>

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

      {/* ─── Delivery Print Preview Dialog ─── */}
      <Dialog open={printPreviewOpen} onOpenChange={setPrintPreviewOpen}>
        <DialogContent className="w-auto max-w-none p-0 flex flex-col" style={{ width: 'fit-content', maxWidth: '98vw' }}>
          <DialogHeader className="px-6 pt-4 pb-2 no-print shrink-0">
            <DialogTitle>打印预览 - 送货单</DialogTitle>
          </DialogHeader>
          <div className="flex justify-center py-4" style={{ background: '#E5E7EB' }}>
            {/* 打印区域 — 白纸效果，实际尺寸 241mm×140mm */}
            <div id="delivery-print-area" className="bg-white" style={{ fontFamily: 'PingFang SC, Microsoft YaHei, SimSun, sans-serif', width: '241mm', minHeight: '140mm', padding: '6mm 8mm', boxSizing: 'border-box', fontSize: '11px', lineHeight: '17px', boxShadow: '0 2px 12px rgba(0,0,0,0.15)' }}>
              {/* 抬头区域 — 从系统设置读取公司信息 */}
              <div style={{ textAlign: 'center', marginBottom: '2px' }}>
                <div style={{ fontSize: '16px', fontWeight: 'bold', letterSpacing: '4px' }}>{companyInfo.name || '常州横林新顺电器配件厂'}</div>
                <div style={{ fontSize: '9px', color: '#555', marginTop: '1px' }}>
                  {companyInfo.address && <span style={{ marginRight: '24px' }}>地址：{companyInfo.address}</span>}
                  {companyInfo.phone && <span style={{ marginRight: '24px' }}>电话：{companyInfo.phone}</span>}
                  {companyInfo.fax && <span>传真：{companyInfo.fax}</span>}
                </div>
              </div>
              <div style={{ textAlign: 'center', fontSize: '14px', fontWeight: 'bold', margin: '2px 0 4px' }}>送 货 单</div>

              {/* 客户信息 + 单号信息 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '11px' }}>
                <div>
                  <div>客　户：{printData?.customer_name || ''}</div>
                  <div>交货地点：{printData?.customer_address || ''}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div>送货单号：{printData?.note_no || ''}</div>
                  <div>单据日期：{printData?.delivery_date ? formatDate(printData.delivery_date) : ''}</div>
                </div>
              </div>

              {/* 每页最多10行物料，超过自动分页 */}
              {(() => {
                const allItems = printData?.delivery_note_items || [];
                const MAX_ROWS = 10;
                const pages: typeof allItems[] = [];
                for (let i = 0; i < allItems.length; i += MAX_ROWS) {
                  pages.push(allItems.slice(i, i + MAX_ROWS));
                }
                if (pages.length === 0) pages.push([]);
                const orderNo = (printData as DeliveryNote & { customer_orders?: { order_no?: string } | null })?.customer_orders?.order_no || '';
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const getProduct = (item: any) => item.products || item.product || {};

                return pages.map((pageItems, pageIdx) => {
                  const isLastPage = pageIdx === pages.length - 1;
                  const totalRows = MAX_ROWS;
                  return (
                    <div key={pageIdx} style={{ pageBreakAfter: isLastPage ? 'auto' : 'always' }}>
                      {/* 第2页起重复抬头 */}
                      {pageIdx > 0 && (
                        <>
                          <div style={{ textAlign: 'center', marginBottom: '2px' }}>
                            <div style={{ fontSize: '16px', fontWeight: 'bold', letterSpacing: '4px' }}>{companyInfo.name || '常州横林新顺电器配件厂'}</div>
                            <div style={{ fontSize: '9px', color: '#555', marginTop: '1px' }}>
                              {companyInfo.address && <span style={{ marginRight: '24px' }}>地址：{companyInfo.address}</span>}
                              {companyInfo.phone && <span style={{ marginRight: '24px' }}>电话：{companyInfo.phone}</span>}
                              {companyInfo.fax && <span>传真：{companyInfo.fax}</span>}
                            </div>
                            <div style={{ fontSize: '14px', fontWeight: 'bold', marginTop: '2px', letterSpacing: '8px' }}>送 货 单</div>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '10px' }}>
                            <div>
                              <span style={{ marginRight: '16px' }}>客户：{printData?.customer_name || ''}</span>
                              <span>交货地点：{printData?.customer_address || ''}</span>
                            </div>
                            <div>
                              <span style={{ marginRight: '16px' }}>送货单号：{printData?.note_no || ''}</span>
                              <span>日期：{printData?.delivery_date || ''}</span>
                            </div>
                          </div>
                        </>
                      )}
                      {/* 表格 8列（含联单列） */}
                      <div style={{ position: 'relative' }}>
                        <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', border: '1px solid #000' }}>
                          <colgroup>
                            <col style={{ width: '30px' }} />
                            <col style={{ width: '82px' }} />
                            <col style={{ width: '78px' }} />
                            <col style={{ width: '145px' }} />
                            <col style={{ width: '36px' }} />
                            <col style={{ width: '52px' }} />
                            <col style={{ width: '82px' }} />
                            <col style={{ width: '22px' }} />
                          </colgroup>
                          <tbody>
                            <tr style={{ background: '#f0f0f0' }}>
                              <th style={{ border: '1px solid #000', padding: '2px 4px', fontWeight: 'bold', fontSize: '10px', textAlign: 'center' }}>项次</th>
                              <th style={{ border: '1px solid #000', padding: '2px 4px', fontWeight: 'bold', fontSize: '10px', textAlign: 'center' }}>订单编号</th>
                              <th style={{ border: '1px solid #000', padding: '2px 4px', fontWeight: 'bold', fontSize: '10px', textAlign: 'center' }}>物料编号</th>
                              <th style={{ border: '1px solid #000', padding: '2px 4px', fontWeight: 'bold', fontSize: '10px', textAlign: 'center' }}>物料名称</th>
                              <th style={{ border: '1px solid #000', padding: '2px 4px', fontWeight: 'bold', fontSize: '10px', textAlign: 'center' }}>单位</th>
                              <th style={{ border: '1px solid #000', padding: '2px 4px', fontWeight: 'bold', fontSize: '10px', textAlign: 'center' }}>数量</th>
                              <th style={{ border: '1px solid #000', padding: '2px 4px', fontWeight: 'bold', fontSize: '10px', textAlign: 'center' }}>备注</th>
                              <th rowSpan={totalRows + 1} style={{ border: '1px solid #000', padding: '6px 2px', fontSize: '9px', writingMode: 'vertical-rl', letterSpacing: '1px', lineHeight: '1.6', textAlign: 'center' }}>
                                <span style={{ color: '#333' }}>(一)存根白</span>
                                <span style={{ color: '#cc0000' }}>(二)客户红</span>
                                <span style={{ color: '#cc8800' }}>(三)回单黄</span>
                              </th>
                            </tr>
                            {pageItems.map((item, idx) => {
                              const prod = getProduct(item);
                              return (
                                <tr key={`item-${pageIdx}-${idx}`}>
                                  <td style={{ border: '1px solid #000', padding: '1px 4px', textAlign: 'center', fontSize: '10px' }}>{pageIdx * MAX_ROWS + idx + 1}</td>
                                  <td style={{ border: '1px solid #000', padding: '1px 4px', fontFamily: 'SF Mono, Menlo, Consolas, monospace', fontSize: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {orderNo}
                                  </td>
                                  <td style={{ border: '1px solid #000', padding: '1px 4px', fontFamily: 'SF Mono, Menlo, Consolas, monospace', fontSize: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {prod.code || ''}
                                  </td>
                                  <td style={{ border: '1px solid #000', padding: '1px 4px', fontSize: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {prod.name || ''}{prod.spec ? `/${prod.spec}` : ''}
                                  </td>
                                  <td style={{ border: '1px solid #000', padding: '1px 4px', textAlign: 'center', fontSize: '10px' }}>
                                    {prod.unit || ''}
                                  </td>
                                  <td style={{ border: '1px solid #000', padding: '1px 4px', textAlign: 'right', fontFamily: 'SF Mono, Menlo, Consolas, monospace', fontSize: '10px' }}>
                                    {item.quantity}
                                  </td>
                                  <td style={{ border: '1px solid #000', padding: '1px 4px', fontSize: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {item.remark || ''}
                                  </td>
                                </tr>
                              );
                            })}
                            {/* 补空行至MAX_ROWS */}
                            {Array.from({ length: Math.max(0, totalRows - pageItems.length) }).map((_, i) => (
                              <tr key={`empty-${pageIdx}-${i}`}>
                                <td style={{ border: '1px solid #000', padding: '1px 4px', textAlign: 'center', height: '16px', fontSize: '10px' }}>&nbsp;</td>
                                <td style={{ border: '1px solid #000', padding: '1px 4px', fontSize: '10px' }}>&nbsp;</td>
                                <td style={{ border: '1px solid #000', padding: '1px 4px', fontSize: '10px' }}>&nbsp;</td>
                                <td style={{ border: '1px solid #000', padding: '1px 4px', fontSize: '10px' }}>&nbsp;</td>
                                <td style={{ border: '1px solid #000', padding: '1px 4px', fontSize: '10px' }}>&nbsp;</td>
                                <td style={{ border: '1px solid #000', padding: '1px 4px', fontSize: '10px' }}>&nbsp;</td>
                                <td style={{ border: '1px solid #000', padding: '1px 4px', fontSize: '10px' }}>&nbsp;</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* 底部备注 + 签署（仅最后一页） */}
                      {isLastPage && (
                        <>
                          <div style={{ marginTop: '4px', fontSize: '11px' }}>
                            <div>备注：{printData?.remark || ''}</div>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', fontSize: '11px' }}>
                            <div>收货单位及经手人：________________</div>
                            <div>送货单位及经手人：{companyInfo.short_name || '新　顺'}________________</div>
                          </div>
                        </>
                      )}
                      {/* 非最后一页的分页标记 */}
                      {!isLastPage && <div style={{ fontSize: '9px', color: '#999', textAlign: 'center', marginTop: '4px' }}>第 {pageIdx + 1} 页 / 共 {pages.length} 页（续下页）</div>}
                    </div>
                  );
                });
              })()}
            </div>
            </div>
            {/* 操作按钮 */}
            <div className="flex justify-end gap-2 px-6 py-3 no-print shrink-0 border-t bg-white">
              <Button variant="outline" onClick={() => setPrintPreviewOpen(false)}>关闭</Button>
              <Button className="bg-[#1E40AF] hover:bg-[#1D4ED8] gap-1" onClick={doPrint}>
                <Printer className="h-4 w-4" /> 打印
              </Button>
            </div>
          </DialogContent>
      </Dialog>

      {/* ─── Label Print Dialog ─── */}
      <Dialog open={labelOpen} onOpenChange={setLabelOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editMode ? '标签设置' : '标签打印'} - {form.delivery_note_items[labelItemIdx]?.product?.name || ''}</DialogTitle>
          </DialogHeader>

          {!labelPreview ? (
            <div className="space-y-4">
              {/* Item selector */}
              {form.delivery_note_items.length > 1 && (
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500 shrink-0">选择物料:</label>
                  <select
                    className="text-xs border rounded px-2 py-1 flex-1"
                    value={labelItemIdx}
                    onChange={(e) => openLabelDialog(Number(e.target.value))}
                  >
                    {form.delivery_note_items.map((it, i) => (
                      <option key={i} value={i}>{it.product?.name || it.product?.code || `物料${i + 1}`}</option>
                    ))}
                  </select>
                </div>
              )}
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
                {editMode ? (
                  <Button className="bg-[#1E40AF] hover:bg-[#1D4ED8]" onClick={saveLabelSettings} disabled={labelDiff !== 0}>
                    保存设置
                  </Button>
                ) : (
                  <Button className="bg-[#1E40AF] hover:bg-[#1D4ED8]" onClick={generateLabels} disabled={labelDiff !== 0}>
                    生成标签预览
                  </Button>
                )}
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

      {/* ─── Ship Dialog ─── */}
      <Dialog open={shipDialogOpen} onOpenChange={setShipDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认出货</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            出货后将扣减对应仓库库存，并更新客户订单已交量。此操作不可撤销。
          </p>
          <div className="mt-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">出库仓库 *</label>
            <Select value={shipWarehouseId} onValueChange={setShipWarehouseId}>
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
            <Button variant="outline" onClick={() => setShipDialogOpen(false)}>取消</Button>
            <Button className="bg-green-600 hover:bg-green-700" onClick={handleShip} disabled={!shipWarehouseId}>
              确认出货
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Order Picker Dialog ─── */}
      <Dialog open={orderPickerOpen} onOpenChange={setOrderPickerOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>从客户订单导入</DialogTitle>
          </DialogHeader>
          <div className="text-xs text-gray-500 mb-2">仅导入有可用库存的物料，未完成生产的物料不会导入。可用库存 = 总库存 - 预留量</div>
          <div className="max-h-96 overflow-auto">
            {customerOrders.length === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">暂无可导入的客户订单，请先在客户订单中下推</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="py-2 px-2 text-left">订单号</th>
                    <th className="py-2 px-2 text-left">客户</th>
                    <th className="py-2 px-2 text-left">物料</th>
                    <th className="py-2 px-2 text-right">未交数量</th>
                    <th className="py-2 px-2 text-right">可用库存</th>
                    <th className="py-2 px-2 text-center">状态</th>
                    <th className="py-2 px-2 w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {customerOrders.map((order) => {
                    const orderItems = (order.customer_order_items || []).filter(i => Number(i.quantity) - Number(i.delivered_qty) > 0);
                    if (orderItems.length === 0) return null;
                    return orderItems.map((item, idx) => {
                      const undelivered = Number(item.quantity) - Number(item.delivered_qty);
                      // 从products列表查找库存
                      const availableStock = (() => {
                        const inv = products.find(p => p.id === item.product_id);
                        // 这里无法精确获取库存，但可以通过备注标明
                        return -1; // 未知
                      })();
                      const prodName = (() => {
                        const rawProd = item.products;
                        if (Array.isArray(rawProd)) return (rawProd[0] as Product)?.name || '-';
                        return (rawProd as Product)?.name || '-';
                      })();
                      const prodCode = (() => {
                        const rawProd = item.products;
                        if (Array.isArray(rawProd)) return (rawProd[0] as Product)?.code || '';
                        return (rawProd as Product)?.code || '';
                      })();
                      return (
                        <tr key={`${order.id}-${idx}`} className="border-b hover:bg-gray-50">
                          {idx === 0 ? (
                            <>
                              <td className="py-2 px-2 font-mono" rowSpan={orderItems.length}>{order.order_no}</td>
                              <td className="py-2 px-2" rowSpan={orderItems.length}>
                                {customers.find(c => c.id === order.customer_id)?.name || '-'}
                              </td>
                            </>
                          ) : null}
                          <td className="py-2 px-2">{prodName} <span className="text-gray-400">{prodCode}</span></td>
                          <td className="py-2 px-2 text-right font-mono">{undelivered}</td>
                          <td className="py-2 px-2 text-right font-mono text-gray-400">-</td>
                          <td className="py-2 px-2 text-center">
                            <span className="text-xs text-gray-400">导入时检查</span>
                          </td>
                          {idx === 0 ? (
                            <td className="py-2 px-2 text-center" rowSpan={orderItems.length}>
                              <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => void importFromOrder(order)}>
                                导入
                              </Button>
                            </td>
                          ) : null}
                        </tr>
                      );
                    });
                  })}
                </tbody>
              </table>
            )}
          </div>
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
          @page {
            size: 241mm 140mm;
            margin: 0;
          }
          html, body { margin: 0; padding: 0; }
          body * { visibility: hidden; }
          #delivery-print-area, #delivery-print-area * { visibility: visible; }
          #delivery-print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 241mm !important;
            min-height: 140mm !important;
            padding: 6mm 8mm !important;
            border: none;
            box-shadow: none;
            box-sizing: border-box;
          }
          .label-card, .label-card * { visibility: visible; }
          .label-card { position: relative; }
          .no-print { visibility: hidden; }
        }
      `}</style>
    </div>
  );
}
