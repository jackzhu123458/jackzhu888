'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { translateUnit } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  Tag,
  Minus,
  ArrowRight,
  ClipboardCheck,
} from 'lucide-react';

// Extracted components
import DeliveryPrintArea from './delivery-print';
import LabelPrintDialog from './label-print-dialog';
import InspectionReportPrintDialog from './inspection-report-print-dialog';
import CategoryGroupDialog from './category-group-dialog';
import OrderPickerDialog from './order-picker-dialog';
import ShipDialog from './ship-dialog';

// Shared types & utils
import type {
  Product,
  Customer,
  CustomerOrder,
  DeliveryItem,
  DeliveryNote,
  CategoryGroup,
  CompanyInfo,
} from './types';
import {
  resolveProduct,
  parseCategories,
  formatDate,
  statusLabel,
  emptyNote,
  filterItemsByCategory,
} from './types';

/* ─── Component ─── */
export default function DeliveryPage() {
  const [notes, setNotes] = useState<DeliveryNote[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [currentIdx, setCurrentIdx] = useState(-1);
  const [editMode, setEditMode] = useState(false);
  const [isFormDirty, setIsFormDirty] = useState(false);

  // Form state
  const [form, setForm] = useState<Omit<DeliveryNote, 'id' | 'created_at'> & { id?: string }>(emptyNote());

  // Dialogs
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [showOrderDropdown, setShowOrderDropdown] = useState(false);

  // Print preview
  const [printPreviewOpen, setPrintPreviewOpen] = useState(false);
  const [printData, setPrintData] = useState<DeliveryNote | null>(null);
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>({});

  // Label printing
  const [labelOpen, setLabelOpen] = useState(false);
  const [inspectionPrintOpen, setInspectionPrintOpen] = useState(false);

  // Order picker
  const [orderPickerOpen, setOrderPickerOpen] = useState(false);
  const [customerOrders, setCustomerOrders] = useState<CustomerOrder[]>([]);
  const [shipDialogOpen, setShipDialogOpen] = useState(false);
  const [itemSearches, setItemSearches] = useState<Record<number, string>>({});
  const [itemOrderSearches, setItemOrderSearches] = useState<Record<number, string>>({});
  // 行级订单号 input refs，用于自动新增行后聚焦
  const itemOrderInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const [pendingFocusRowIdx, setPendingFocusRowIdx] = useState<number | null>(null);
  useEffect(() => {
    if (pendingFocusRowIdx == null) return;
    const el = itemOrderInputRefs.current[pendingFocusRowIdx];
    if (el) {
      el.focus();
      // 把光标置于文末
      const len = el.value.length;
      try { el.setSelectionRange(len, len); } catch { /* noop */ }
      setPendingFocusRowIdx(null);
    }
  }, [pendingFocusRowIdx, form.delivery_note_items.length]);
  const [showItemOrderDropdown, setShowItemOrderDropdown] = useState<Record<number, boolean>>({});
  // 每行选中订单后展开的订单（二级下拉，展示订单下未交付物料）
  const [expandedOrderForItem, setExpandedOrderForItem] = useState<Record<number, CustomerOrder | null>>({});
  const [orderInventoryMap, setOrderInventoryMap] = useState<Record<string, { quantity: number; reserved_qty: number }>>({});
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);

  // Category groups
  const [categoryGroups, setCategoryGroups] = useState<CategoryGroup[]>([]);
  const [groupManageOpen, setGroupManageOpen] = useState(false);

  const current = currentIdx >= 0 ? notes[currentIdx] : null;

  /* ─── Data fetching ─── */
  const fetchNotes = useCallback(async () => {
    const res = await fetch('/api/delivery');
    const data = await res.json();
    setNotes(Array.isArray(data) ? data : []);
  }, []);

  const fetchMeta = useCallback(async () => {
    const [cRes, pRes, oRes, sRes] = await Promise.all([
      fetch('/api/customers'),
      fetch('/api/products'),
      fetch('/api/orders'),
      fetch('/api/settings'),
    ]);
    const [cData, pData, oData, sData] = await Promise.all([
      cRes.json(), pRes.json(), oRes.json(), sRes.json(),
    ]);

    setCustomers(Array.isArray(cData) ? cData : []);
    // 只排除已取消订单，其余状态都可被送货单引用（兼容历史数据中 status 可能为空或自定义状态）
    // 同时按 id 去重，避免 PostgREST 多重 join 时返回重复行
    if (Array.isArray(oData)) {
      const dedupMap = new Map<string, CustomerOrder>();
      for (const o of oData as CustomerOrder[]) {
        if (o.status === 'cancelled') continue;
        if (!dedupMap.has(o.id)) dedupMap.set(o.id, o);
      }
      setCustomerOrders(Array.from(dedupMap.values()));
    }
    setProducts(Array.isArray(pData) ? pData : []);

    // 提取产品类目列表
    const cats = new Set<string>();
    (Array.isArray(pData) ? pData : []).forEach((p: Product) => {
      if (p.category && p.category !== '0' && !p.code.startsWith('BOM-')) {
        cats.add(p.category);
      }
    });
    setAvailableCategories(Array.from(cats).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })));
    if (sData?.company_info) setCompanyInfo(sData.company_info);

    // 获取类目分组
    const gRes = await fetch('/api/delivery/category-groups');
    const gData = await gRes.json();
    if (Array.isArray(gData)) setCategoryGroups(gData);
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
      delivery_category: fullNote.delivery_category || '',
      delivery_note_items: Array.isArray(fullNote.delivery_note_items)
        ? fullNote.delivery_note_items
            .filter((it: DeliveryItem) => !('count' in (it as unknown as Record<string, unknown>) && Object.keys(it as unknown as Record<string, unknown>).length <= 2))
            .map((it: DeliveryItem & { products?: Product | Product[] }) => {
              const product = resolveProduct(it.products);
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

  // 首次加载后自动选择第一条
  useEffect(() => {
    if (notes.length > 0 && currentIdx < 0 && !editMode) {
      setCurrentIdx(0);
      void loadForm(notes[0]);
    }
  }, [notes, currentIdx, editMode, loadForm]);

  /* ─── CRUD ─── */
  const handleNew = (copy = false) => {
    const base = copy && form.id ? { ...form } : emptyNote();
    // 新建时默认选中所有分组类目
    const defaultCategory = !copy && categoryGroups.length > 0
      ? [...new Set(categoryGroups.flatMap(g => parseCategories(g.categories)))].join(',')
      : base.delivery_category;
    setForm({
      ...base,
      id: undefined,
      note_no: '',
      status: 'draft',
      delivery_date: new Date().toISOString().split('T')[0],
      delivery_category: defaultCategory,
    });
    setCurrentIdx(-1);
    setEditMode(true);
    setIsFormDirty(false);
  };

  const handleSave = async () => {
    if (!form.customer_name) {
      alert('请填写客户名称');
      return;
    }
    const payload = {
      ...form,
      items: form.delivery_note_items.map(it => ({
        product_id: it.product_id,
        quantity: it.quantity,
        unit_price: it.unit_price,
        per_box_qty: it.per_box_qty,
        remark: it.remark,
        customer_order_item_id: it.customer_order_item_id || null,
      })),
    };
    // 排除非数据库字段
    const { id, delivery_note_items, customer_order, customer_orders, items, ...noteFields } = payload as typeof payload & { id?: string; customer_order?: unknown; customer_orders?: unknown };

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
          body: JSON.stringify({ ...noteFields, items: payload.items }),
        });
        const created = await res.json();
        if (created.error) { alert('保存失败: ' + created.error); return; }
        setForm(prev => ({ ...prev, id: created.id }));
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
    setForm(prev => ({
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
    // 获取库存
    let inventoryMap: Record<string, { quantity: number; reserved_qty: number }> = {};
    try {
      const invRes = await fetch('/api/inventory');
      const invData = await invRes.json();
      const invItems = Array.isArray(invData) ? invData : (invData.items || []);
      for (const item of invItems) {
        const pid = item.product_id;
        const qty = Number(item.total_quantity) || 0;
        const reserved = Number(item.total_reserved) || 0;
        const existing = inventoryMap[pid];
        if (existing) {
          existing.quantity += qty;
          existing.reserved_qty += reserved;
        } else {
          inventoryMap[pid] = { quantity: qty, reserved_qty: reserved };
        }
      }
    } catch { /* ignore */ }
    setOrderInventoryMap(inventoryMap);

    const selectedCategories = parseCategories(form.delivery_category);
    const orderItems = (order.customer_order_items || []).filter(i => Number(i.quantity) - Number(i.delivered_qty) > 0);

    // 按类目筛选 + 检查可用库存（总库存 - 预扣量 = 可用于发货的库存）
    const filteredItems = filterItemsByCategory(orderItems, selectedCategories).filter(item => {
      const inv = inventoryMap[item.product_id];
      return inv && (inv.quantity - inv.reserved_qty) > 0;
    });

    if (filteredItems.length === 0) {
      alert('该订单中所有物料均无可用库存，无法导入。请先完成生产入库或释放预扣。');
      return;
    }

    const hasUnavailable = orderItems.some(item => {
      const undelivered = Number(item.quantity) - Number(item.delivered_qty);
      if (undelivered <= 0) return false;
      const inv = inventoryMap[item.product_id];
      return !inv || (inv.quantity - inv.reserved_qty) <= 0;
    });
    if (hasUnavailable && !window.confirm('部分物料可用库存不足（已被其他订单预扣或未完成生产），仅导入有可用库存的物料。是否继续？')) return;

    const items: DeliveryItem[] = filteredItems.map(item => {
      const prod = resolveProduct(item.products);
      const undelivered = Number(item.quantity) - Number(item.delivered_qty);
      const inv = inventoryMap[item.product_id];
      const availableQty = inv ? inv.quantity - inv.reserved_qty : 0;
      const deliverQty = Math.min(undelivered, Math.max(0, availableQty));

      return {
        product_id: item.product_id,
        product: prod,
        quantity: deliverQty,
        unit_price: Number(item.price) || 0,
        per_box_qty: deliverQty,
        remark: availableQty < undelivered ? `欠交 ${undelivered - availableQty}（可用${availableQty}，预扣${inv?.reserved_qty || 0}）` : (item.remark || ''),
        customer_order_item_id: item.id,
        customer_order: order.order_no,
      };
    });

    const cust = order.customers;
    setForm(prev => ({
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

  /* ─── 在明细行选中订单后展开二级下拉（订单下未交付物料 + 库存状态） ─── */
  const expandOrderForItem = async (idx: number, order: CustomerOrder) => {
    // 加载库存
    let inventoryMap: Record<string, { quantity: number; reserved_qty: number }> = orderInventoryMap;
    if (Object.keys(inventoryMap).length === 0) {
      try {
        const invRes = await fetch('/api/inventory');
        const invData = await invRes.json();
        const invItems = Array.isArray(invData) ? invData : (invData.items || []);
        const m: Record<string, { quantity: number; reserved_qty: number }> = {};
        for (const item of invItems) {
          const pid = item.product_id;
          const qty = Number(item.total_quantity) || 0;
          const reserved = Number(item.total_reserved) || 0;
          const existing = m[pid];
          if (existing) {
            existing.quantity += qty;
            existing.reserved_qty += reserved;
          } else {
            m[pid] = { quantity: qty, reserved_qty: reserved };
          }
        }
        inventoryMap = m;
        setOrderInventoryMap(m);
      } catch { /* ignore */ }
    }

    // 也更新当前行的订单号字段
    updateItem(idx, 'customer_order', order.order_no);
    setExpandedOrderForItem(prev => ({ ...prev, [idx]: order }));
  };

  /* ─── 从二级下拉中选某个物料填入行 ─── */
  const selectOrderItemForRow = (idx: number, order: CustomerOrder, orderItem: NonNullable<CustomerOrder['customer_order_items']>[number]) => {
    const prod = resolveProduct(orderItem.products);
    if (!prod) {
      alert('找不到该物料信息，请刷新页面后重试');
      return;
    }
    const undelivered = Number(orderItem.quantity) - Number(orderItem.delivered_qty);
    const inv = orderInventoryMap[orderItem.product_id];
    const availableQty = inv ? inv.quantity - inv.reserved_qty : 0;
    const deliverQty = Math.min(undelivered, Math.max(0, availableQty));
    const lacksStock = availableQty < undelivered;

    setForm(prev => ({
      ...prev,
      delivery_note_items: prev.delivery_note_items.map((it, i) =>
        i === idx
          ? {
              ...it,
              product_id: orderItem.product_id,
              product: prod,
              quantity: deliverQty,
              unit_price: Number(orderItem.price) || it.unit_price || 0,
              per_box_qty: deliverQty,
              remark: lacksStock
                ? `库存不足！欠交 ${undelivered - Math.max(0, availableQty)}（可用 ${Math.max(0, availableQty)}，预扣 ${inv?.reserved_qty || 0}）`
                : (it.remark || ''),
              customer_order_item_id: orderItem.id,
              customer_order: order.order_no,
            }
          : it
      ),
    }));
    setExpandedOrderForItem(prev => ({ ...prev, [idx]: null }));
    setShowItemOrderDropdown(prev => ({ ...prev, [idx]: false }));
    setIsFormDirty(true);

    if (lacksStock) {
      const msg = availableQty <= 0
        ? `提示：物料 ${prod.name} 当前可用库存为 0（总库存 ${inv?.quantity || 0}，预扣 ${inv?.reserved_qty || 0}）。`
        : `提示：物料 ${prod.name} 可用库存仅 ${availableQty}，欠交 ${undelivered - availableQty}。`;
      window.setTimeout(() => alert(msg), 0);
    }
  };

  /* ─── Items manipulation ─── */
  const removeItem = (idx: number) => {
    setForm(prev => ({
      ...prev,
      delivery_note_items: prev.delivery_note_items.filter((_, i) => i !== idx),
    }));
    setIsFormDirty(true);
  };

  const updateItem = (idx: number, field: keyof DeliveryItem, value: string | number) => {
    setForm(prev => {
      const items = [...prev.delivery_note_items];
      items[idx] = { ...items[idx], [field]: value };
      if (field === 'quantity') items[idx].per_box_qty = Number(value);
      return { ...prev, delivery_note_items: items };
    });
    setIsFormDirty(true);
  };

  /* ─── Search products for inline item picker ─── */
  const searchDeliveryProducts = (query: string) => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return products.filter(p =>
      p.code?.toLowerCase().includes(q) || p.name?.toLowerCase().includes(q) || p.spec?.toLowerCase().includes(q)
    ).slice(0, 20);
  };

  const selectProductForItem = (idx: number, p: Product) => {
    setForm(prev => {
      const items = [...prev.delivery_note_items];
      items[idx] = { ...items[idx], product_id: p.id, product: p, per_box_qty: items[idx].quantity || 0 };
      return { ...prev, delivery_note_items: items };
    });
    setItemSearches(prev => { const next = { ...prev }; next[idx] = `${p.code} - ${p.name}`; return next; });
    setIsFormDirty(true);
  };

  /* ─── Print delivery note ─── */
  const handlePrintDelivery = async () => {
    if (form.id) {
      try {
        const res = await fetch(`/api/delivery?id=${form.id}`);
        const data = await res.json();
        if (data && !data.error) {
          setPrintData(data as DeliveryNote);
          setPrintPreviewOpen(true);
          return;
        }
      } catch { /* fallback to form data */ }
    }
    setPrintData(form as DeliveryNote);
    setPrintPreviewOpen(true);
  };

  /* ─── Ship ─── */
  const handleShip = async (warehouseAllocations: Record<string, string>) => {
    if (!form.id) return;
    try {
      const res = await fetch('/api/delivery', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: form.id,
          status: 'shipped',
          warehouse_allocations: warehouseAllocations,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setShipDialogOpen(false);
        setEditMode(false);
        await fetchNotes();
        if (form.id) {
          const freshRes = await fetch(`/api/delivery?id=${form.id}`);
          const freshData = await freshRes.json();
          if (freshData.id) loadForm(freshData);
        }
      } else {
        alert(data.error || '出货失败');
      }
    } catch (e) {
      alert('出货失败: ' + String(e));
    }
  };

  /* ─── Search ─── */
  const filteredNotes = searchQuery
    ? notes.filter(n => n.note_no.includes(searchQuery) || n.customer_name.includes(searchQuery))
    : notes;

  /* ─── Derived state ─── */
  const st = statusLabel(form.status);
  const selectedCategories = parseCategories(form.delivery_category);

  /* ─── Inline product search result list (reusable) ─── */
  const ProductSearchDropdown = ({ query, onSelect }: { query: string; onSelect: (p: Product) => void }) => {
    const results = searchDeliveryProducts(query);
    return (
      <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded shadow-lg z-50 max-h-48 overflow-y-auto">
        {results.length === 0 ? (
          <div className="px-3 py-2 text-xs text-gray-400">无匹配物料</div>
        ) : (
          results.map(p => (
            <button key={p.id} className="w-full text-left px-2 py-1.5 text-xs hover:bg-blue-50" onClick={() => onSelect(p)}>
              <span className="font-mono">{p.code}</span>
              <span className="ml-1 text-gray-500">{p.name}</span>
              {p.spec && <span className="ml-1 text-gray-400">{p.spec}</span>}
            </button>
          ))
        )}
      </div>
    );
  };

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
          <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={() => setEditMode(true)} disabled={!current || editMode}>
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
              <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={() => form.delivery_note_items.length > 0 && setLabelOpen(true)} disabled={form.delivery_note_items.length === 0}>
                <Tag className="h-3.5 w-3.5" /> 打印标签
              </Button>
              <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={() => form.delivery_note_items.length > 0 && setInspectionPrintOpen(true)} disabled={form.delivery_note_items.length === 0}>
                <ClipboardCheck className="h-3.5 w-3.5" /> 打印检验报告
              </Button>
            </>
          ) : (
            <>
              {form.status === 'draft' && (
                <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={() => setShipDialogOpen(true)} disabled={!form.id}>
                  <ArrowRight className="h-3.5 w-3.5 text-green-600" /> 确认出货
                </Button>
              )}
              <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={handlePrintDelivery}>
                <Printer className="h-3.5 w-3.5" /> 打印送货单
              </Button>
              <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={() => form.delivery_note_items.length > 0 && setLabelOpen(true)} disabled={form.delivery_note_items.length === 0}>
                <Tag className="h-3.5 w-3.5" /> 打印标签
              </Button>
              <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={() => form.delivery_note_items.length > 0 && setInspectionPrintOpen(true)} disabled={form.delivery_note_items.length === 0}>
                <ClipboardCheck className="h-3.5 w-3.5" /> 打印检验报告
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
        <div className="bg-white rounded shadow-sm border border-[#E5E7EB]">
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

          {/* Customer info */}
          <div className="px-5 py-3 bg-[#FAFBFC] border-b border-[#E5E7EB]">
            <div className="grid grid-cols-4 gap-x-4 gap-y-2">
              {/* 客户编号 */}
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
                        setForm(prev => ({ ...prev, customer_id: null, customer_name: '', customer_address: '', customer_contact: '', customer_phone: '' }));
                        setShowCustomerDropdown(true);
                        setIsFormDirty(true);
                        const exact = customers.find(c => c.code.toLowerCase() === val.toLowerCase());
                        if (exact) { pickCustomer(exact); setCustomerSearch(exact.code); setShowCustomerDropdown(false); }
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

              {/* 客户名称 */}
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 whitespace-nowrap w-16">客户名称</label>
                {editMode ? (
                  <Input className="h-7 text-xs flex-1 bg-gray-50" value={form.customer_name} readOnly placeholder="自动填充" />
                ) : (
                  <span className="text-xs text-[#111827]">{form.customer_name || '-'}</span>
                )}
              </div>

              {/* 客户地址 */}
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 whitespace-nowrap w-16">客户地址</label>
                {editMode ? (
                  <Input className="h-7 text-xs flex-1" value={form.customer_address || ''} onChange={(e) => { setForm(prev => ({ ...prev, customer_address: e.target.value })); setIsFormDirty(true); }} />
                ) : (
                  <span className="text-xs text-[#111827]">{form.customer_address || '-'}</span>
                )}
              </div>

              {/* 结账方式 */}
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

              {/* 联络人 */}
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 whitespace-nowrap w-16">联络人</label>
                {editMode ? (
                  <Input className="h-7 text-xs flex-1" value={form.customer_contact || ''} onChange={(e) => { setForm(prev => ({ ...prev, customer_contact: e.target.value })); setIsFormDirty(true); }} />
                ) : (
                  <span className="text-xs text-[#111827]">{form.customer_contact || '-'}</span>
                )}
              </div>

              {/* 联络电话 */}
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 whitespace-nowrap w-16">联络电话</label>
                {editMode ? (
                  <Input className="h-7 text-xs flex-1" value={form.customer_phone || ''} onChange={(e) => { setForm(prev => ({ ...prev, customer_phone: e.target.value })); setIsFormDirty(true); }} />
                ) : (
                  <span className="text-xs text-[#111827]">{form.customer_phone || '-'}</span>
                )}
              </div>

              {/* 客户订单 */}
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 whitespace-nowrap w-16">客户订单</label>
                {editMode ? (
                  <div className="relative flex-1">
                    <Input
                      className="h-7 text-xs font-mono"
                      value={form.customer_order || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setForm(prev => ({ ...prev, customer_order: val, customer_order_id: null }));
                        setShowOrderDropdown(true);
                        setIsFormDirty(true);
                      }}
                      onFocus={() => setShowOrderDropdown(true)}
                      onBlur={() => setTimeout(() => setShowOrderDropdown(false), 200)}
                      placeholder="输入订单号搜索"
                    />
                    {showOrderDropdown && (() => {
                      const q = (form.customer_order || '').toLowerCase();
                      const filtered = customerOrders.filter(o => {
                        if (!q) return true;
                        return o.order_no.toLowerCase().includes(q) ||
                          (o.customers?.name || '').toLowerCase().includes(q);
                      });
                      return filtered.length > 0 ? (
                        <div className="absolute z-50 top-7 left-0 bg-white border rounded shadow-lg max-h-48 overflow-auto w-72">
                          {filtered.slice(0, 15).map(o => {
                            const undeliveredCount = (o.customer_order_items || []).filter(i => Number(i.quantity) - Number(i.delivered_qty) > 0).length;
                            return (
                              <button key={o.id} className="w-full text-left px-2 py-1.5 hover:bg-gray-100 text-xs border-b border-gray-50 last:border-0"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  importFromOrder(o);
                                  setShowOrderDropdown(false);
                                }}>
                                <div className="flex items-center justify-between">
                                  <span className="font-mono text-[#1E40AF]">{o.order_no}</span>
                                  <span className="text-gray-400">{undeliveredCount}项待交</span>
                                </div>
                                {o.customers && <div className="text-gray-500 mt-0.5">{o.customers.name}</div>}
                              </button>
                            );
                          })}
                        </div>
                      ) : q ? <div className="absolute z-50 top-7 left-0 bg-white border rounded shadow-lg p-2 text-xs text-gray-400 w-48">无匹配订单</div> : null;
                    })()}
                  </div>
                ) : (
                  <span className="text-xs text-[#111827]">{form.customer_order || '-'}</span>
                )}
              </div>

              {/* 出货日期 */}
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 whitespace-nowrap w-16">出货日期</label>
                {editMode ? (
                  <Input type="date" className="h-7 text-xs flex-1" value={formatDate(form.delivery_date)} onChange={(e) => { setForm(prev => ({ ...prev, delivery_date: e.target.value })); setIsFormDirty(true); }} />
                ) : (
                  <span className="text-xs text-[#111827]">{formatDate(form.delivery_date)}</span>
                )}
              </div>

              {/* 送货类目 - 始终可点击切换，不受编辑模式限制 */}
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 whitespace-nowrap w-16">送货类目</label>
                <div className="flex gap-1.5 flex-wrap items-center">
                  {categoryGroups.map(group => {
                    const isSelected = selectedCategories.some(c => parseCategories(group.categories).includes(c));
                    return (
                      <button
                        key={group.group_no}
                        type="button"
                        onClick={() => {
                          const groupCats = parseCategories(group.categories);
                          const next = isSelected
                            ? selectedCategories.filter(c => !groupCats.includes(c))
                            : [...new Set([...selectedCategories, ...groupCats])];
                          setForm(prev => ({ ...prev, delivery_category: next.join(',') }));
                          setIsFormDirty(true);
                        }}
                        className={`h-7 px-2.5 rounded text-xs font-medium border transition-colors ${
                          isSelected ? 'bg-[#1E40AF] text-white border-[#1E40AF]' : 'bg-white text-gray-600 border-gray-300 hover:border-[#1E40AF] hover:text-[#1E40AF]'
                        }`}
                        title={`包含类目：${group.categories}`}
                      >
                        {group.group_no}. {group.group_name}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setGroupManageOpen(true)}
                    className="h-7 px-2 rounded text-xs text-gray-500 border border-dashed border-gray-300 hover:border-[#1E40AF] hover:text-[#1E40AF] transition-colors"
                  >
                    设置分组
                  </button>
                  {categoryGroups.length === 0 && <span className="text-xs text-gray-400">暂无分组，点击"设置分组"添加</span>}
                </div>
              </div>
            </div>
          </div>

          {/* Tabs */}
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
                        <div className="relative">
                          <div className="flex items-center gap-1">
                            <Input
                              ref={(el) => { itemOrderInputRefs.current[idx] = el; }}
                              className="h-6 text-xs font-mono flex-1"
                              value={item.customer_order || ''}
                              onChange={(e) => {
                                updateItem(idx, 'customer_order', e.target.value);
                                setItemOrderSearches(prev => ({ ...prev, [idx]: e.target.value }));
                                setShowItemOrderDropdown(prev => ({ ...prev, [idx]: true }));
                                // 输入变化时清掉已展开的订单（重新搜索）
                                setExpandedOrderForItem(prev => { const next = { ...prev }; delete next[idx]; return next; });
                              }}
                              onFocus={() => {
                                setItemOrderSearches(prev => ({ ...prev, [idx]: item.customer_order || '' }));
                                setShowItemOrderDropdown(prev => ({ ...prev, [idx]: true }));
                              }}
                              onBlur={() => setTimeout(() => {
                                // 仅关闭下拉，不清 search/expanded 状态，避免与异步 expandOrderForItem 竞速
                                setShowItemOrderDropdown(prev => ({ ...prev, [idx]: false }));
                              }, 250)}
                              placeholder="输入订单号"
                            />
                            <button
                              type="button"
                              className="text-gray-400 hover:text-[#1E40AF] shrink-0"
                              title="展开订单列表"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setShowItemOrderDropdown(prev => ({ ...prev, [idx]: !prev[idx] }));
                                setItemOrderSearches(prev => ({ ...prev, [idx]: item.customer_order || '' }));
                              }}
                            >
                              <ChevronDown className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          {showItemOrderDropdown[idx] && (() => {
                            // 二级菜单：用户已选订单 → 显示该订单下未交付物料
                            const expanded = expandedOrderForItem[idx];
                            if (expanded) {
                              const undelivered = (expanded.customer_order_items || []).filter((i) => Number(i.quantity) - Number(i.delivered_qty) > 0);
                              return (
                                <div className="absolute z-50 top-6 left-0 bg-white border rounded shadow-lg max-h-60 overflow-auto w-80">
                                  <div className="px-2 py-1 bg-[#F9FAFB] border-b text-[11px] text-gray-500 flex items-center justify-between">
                                    <span>订单 <span className="font-mono text-[#1E40AF]">{expanded.order_no}</span> 未交物料</span>
                                    <button
                                      type="button"
                                      className="text-gray-400 hover:text-gray-700"
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        setExpandedOrderForItem(prev => { const next = { ...prev }; delete next[idx]; return next; });
                                      }}
                                    >返回</button>
                                  </div>
                                  {undelivered.length === 0 ? (
                                    <div className="px-2 py-2 text-[11px] text-gray-400">该订单没有待交付物料</div>
                                  ) : undelivered.map((oi, oiIdx) => {
                                    const product = resolveProduct(oi.products);
                                    if (!product) return null;
                                    const remaining = Math.max(0, Number(oi.quantity) - Number(oi.delivered_qty));
                                    const inv = orderInventoryMap[product.id];
                                    const totalQty = Number(inv?.quantity || 0);
                                    const reservedQty = Number(inv?.reserved_qty || 0);
                                    const available = totalQty - reservedQty;
                                    const usable = Math.max(0, available + reservedQty); // 客户订单可用 = 库存 (含为本订单预扣的部分)
                                    const noStock = usable <= 0;
                                    return (
                                      <button
                                        key={`${oi.id}-${oiIdx}`}
                                        type="button"
                                        className={`w-full text-left px-2 py-1 hover:bg-gray-100 text-xs border-b border-gray-50 last:border-0 ${noStock ? 'opacity-80' : ''}`}
                                        onMouseDown={(e) => {
                                          e.preventDefault();
                                          selectOrderItemForRow(idx, expanded, oi);
                                        }}
                                      >
                                        <div className="flex items-center justify-between gap-2">
                                          <span className="flex-1 truncate">
                                            <span className="font-mono text-[#1E40AF]">{product.code}</span>
                                            <span className="ml-1 text-gray-700">{product.name}</span>
                                          </span>
                                          <span className="text-[11px] text-gray-500 whitespace-nowrap">待交 {remaining}</span>
                                        </div>
                                        <div className="mt-0.5 text-[11px] flex items-center justify-between">
                                          <span className={noStock ? 'text-red-600 font-medium' : 'text-gray-500'}>
                                            {noStock ? '⚠ 无可用库存' : `可用 ${usable}`}
                                          </span>
                                          <span className="text-gray-400">单价 {Number(oi.price || 0).toFixed(2)}</span>
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>
                              );
                            }
                            // 一级菜单：模糊搜索订单（不再前置过滤 hasUndelivered，避免 customer_order_items 数据缺失时下拉为空）
                            const q = (itemOrderSearches[idx] || item.customer_order || '').toLowerCase();
                            const filtered = customerOrders.filter(o => {
                              if (!q) return true;
                              return o.order_no.toLowerCase().includes(q) ||
                                (o.customers?.name || '').toLowerCase().includes(q);
                            });
                            return (
                              <div className="absolute z-50 top-6 left-0 bg-white border rounded shadow-lg max-h-40 overflow-auto w-72">
                                {filtered.length === 0 ? (
                                  <div className="px-2 py-2 text-[11px] text-gray-400">
                                    {customerOrders.length === 0 ? '暂无订单数据，请先创建客户订单' : '无匹配订单'}
                                  </div>
                                ) : filtered.slice(0, 10).map(o => {
                                  const undeliveredCount = (o.customer_order_items || []).filter(i => Number(i.quantity) - Number(i.delivered_qty) > 0).length;
                                  return (
                                    <button key={o.id} type="button" className="w-full text-left px-2 py-1 hover:bg-gray-100 text-xs border-b border-gray-50 last:border-0"
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        expandOrderForItem(idx, o);
                                      }}>
                                      <div className="flex items-center justify-between gap-2">
                                        <span>
                                          <span className="font-mono text-[#1E40AF]">{o.order_no}</span>
                                          {o.customers && <span className="text-gray-400 ml-2">{o.customers.name}</span>}
                                        </span>
                                        <span className="text-[11px] text-gray-400 whitespace-nowrap">{undeliveredCount} 项</span>
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </div>
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
                            value={itemSearches[idx] !== undefined ? itemSearches[idx] : (item.product_id ? `${item.product?.code || ''} - ${item.product?.name || ''}` : '')}
                            onChange={(e) => {
                              setItemSearches(prev => ({ ...prev, [idx]: e.target.value }));
                              if (item.product_id) {
                                setForm(prev => {
                                  const items = [...prev.delivery_note_items];
                                  items[idx] = { ...items[idx], product_id: '', product: undefined };
                                  return { ...prev, delivery_note_items: items };
                                });
                                setIsFormDirty(true);
                              }
                            }}
                            onFocus={() => {
                              if (item.product_id) {
                                setItemSearches(prev => ({ ...prev, [idx]: '' }));
                              }
                            }}
                            onBlur={() => setTimeout(() => { setItemSearches(prev => { const next = { ...prev }; delete next[idx]; return next; }); }, 200)}
                          />
                          {itemSearches[idx] !== undefined && !item.product_id && <ProductSearchDropdown query={itemSearches[idx]} onSelect={(p) => selectProductForItem(idx, p)} />}
                        </div>
                      ) : (
                        <span className="font-mono text-[#111827]">{item.product?.code || '-'}</span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-[#111827]">{item.product?.name || '-'}</td>
                    <td className="py-2 px-2 text-gray-500">{translateUnit(item.product?.unit || '-')}</td>
                    <td className="py-2 px-2 text-right font-mono">
                      {editMode ? (
                        <Input type="number" className="h-6 text-xs text-right w-20 ml-auto" value={item.quantity} onChange={(e) => updateItem(idx, 'quantity', Number(e.target.value))} />
                      ) : item.quantity.toFixed(2)}
                    </td>
                    <td className="py-2 px-2 text-right font-mono">
                      {editMode ? (
                        <Input type="number" className="h-6 text-xs text-right w-20 ml-auto" value={item.per_box_qty} onChange={(e) => updateItem(idx, 'per_box_qty', Number(e.target.value))} />
                      ) : item.per_box_qty}
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
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setLabelOpen(true)} title="标签打印">
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
                {/* Auto new-row */}
                {editMode && (
                  <tr className="border-b border-[#E5E7EB] h-8">
                    <td className="py-1 px-2 text-gray-300">{form.delivery_note_items.length + 1}</td>
                    <td className="py-2 px-2">
                      <Input
                        className="h-6 text-xs"
                        placeholder="输入订单号（自动新增行）"
                        value=""
                        onChange={(e) => {
                          const val = e.target.value;
                          if (!val) return;
                          const newIdx = form.delivery_note_items.length;
                          setForm(prev => ({
                            ...prev,
                            delivery_note_items: [
                              ...prev.delivery_note_items,
                              { product_id: '', quantity: 0, unit_price: 0, per_box_qty: 0, remark: '', customer_order: val },
                            ],
                          }));
                          setItemOrderSearches(prev => ({ ...prev, [newIdx]: val }));
                          setShowItemOrderDropdown(prev => ({ ...prev, [newIdx]: true }));
                          setIsFormDirty(true);
                          // 新增行后自动 focus 到新行的订单号输入框
                          setPendingFocusRowIdx(newIdx);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            setForm(prev => ({ ...prev, delivery_note_items: [...prev.delivery_note_items, { product_id: '', quantity: 0, unit_price: 0, per_box_qty: 0, remark: '' }] }));
                          }
                        }}
                      />
                    </td>
                    <td className="py-2 px-2">
                      <div className="relative">
                        <Input
                          className="h-6 text-xs font-mono"
                          placeholder="搜索编号/名称"
                          value={itemSearches[-1] || ''}
                          onChange={(e) => setItemSearches(prev => ({ ...prev, [-1]: e.target.value }))}
                          onBlur={() => setTimeout(() => { setItemSearches(prev => { const next = { ...prev }; delete next[-1]; return next; }); }, 200)}
                          onKeyDown={(e) => { if (e.key === 'Enter' && !itemSearches[-1]) { e.preventDefault(); setForm(prev => ({ ...prev, delivery_note_items: [...prev.delivery_note_items, { product_id: '', quantity: 0, unit_price: 0, per_box_qty: 0, remark: '' }] })); } }}
                        />
                        {itemSearches[-1] && (
                          <ProductSearchDropdown query={itemSearches[-1]} onSelect={(p) => {
                            setForm(prev => ({ ...prev, delivery_note_items: [...prev.delivery_note_items, { product_id: p.id, product: p, quantity: 0, unit_price: 0, per_box_qty: 0, remark: '' }] }));
                            setItemSearches(prev => { const next = { ...prev }; delete next[-1]; return next; });
                            setIsFormDirty(true);
                          }} />
                        )}
                      </div>
                    </td>
                    <td /><td /><td /><td /><td />
                    <td />
                  </tr>
                )}
                {!editMode && form.delivery_note_items.length === 0 && (
                  <tr><td colSpan={8} className="py-8 text-center text-gray-400">暂无明细</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Footer / Remark */}
          <div className="px-5 py-3 border-t border-[#E5E7EB] flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">备注</label>
              {editMode ? (
                <Input className="h-7 text-xs flex-1 min-w-[300px]" value={form.remark || ''} onChange={(e) => { setForm(prev => ({ ...prev, remark: e.target.value })); setIsFormDirty(true); }} />
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
            <AlertDialogDescription>确定要删除送货单 {form.note_no} 吗？此操作不可撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Print Preview Dialog ─── */}
      <Dialog open={printPreviewOpen} onOpenChange={setPrintPreviewOpen}>
        <DialogContent className="!max-w-none !p-0 !gap-0 flex flex-col" style={{ width: 'calc(241mm + 40px)', maxHeight: '92vh' }}>
          <DialogHeader className="px-5 pt-4 pb-2 no-print shrink-0 flex flex-row items-center justify-between">
            <DialogTitle>打印预览 - 送货单</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 min-h-0 flex justify-center" style={{ background: '#E5E7EB' }}>
            {printData && <DeliveryPrintArea printData={printData} companyInfo={companyInfo} categoryGroups={categoryGroups} />}
          </div>
          <div className="flex justify-end gap-2 px-6 py-3 no-print shrink-0 border-t bg-white">
            <Button variant="outline" onClick={() => setPrintPreviewOpen(false)}>关闭</Button>
            <Button className="bg-[#1E40AF] hover:bg-[#1D4ED8] gap-1" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> 打印
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Label Print Dialog ─── */}
      <LabelPrintDialog
        open={labelOpen}
        onOpenChange={setLabelOpen}
        items={form.delivery_note_items}
        editMode={editMode}
        noteNo={form.note_no}
        customerName={form.customer_name}
        onSave={(updatedItems) => { setForm(prev => ({ ...prev, delivery_note_items: updatedItems })); }}
      />

      {/* ─── Inspection Report Print Dialog ─── */}
      <InspectionReportPrintDialog
        open={inspectionPrintOpen}
        onOpenChange={setInspectionPrintOpen}
        items={form.delivery_note_items}
        noteNo={form.note_no}
        customerName={form.customer_name}
        deliveryDate={form.delivery_date}
      />

      {/* ─── Ship Dialog ─── */}
      <ShipDialog
        open={shipDialogOpen}
        onOpenChange={setShipDialogOpen}
        noteId={form.id}
        onShip={handleShip}
      />

      {/* ─── Category Group Dialog ─── */}
      <CategoryGroupDialog
        open={groupManageOpen}
        onOpenChange={setGroupManageOpen}
        groups={categoryGroups}
        availableCategories={availableCategories}
        products={products}
        onSave={(groups) => setCategoryGroups(groups)}
      />

      {/* ─── Order Picker Dialog ─── */}
      <OrderPickerDialog
        open={orderPickerOpen}
        onOpenChange={setOrderPickerOpen}
        orders={customerOrders}
        customers={customers}
        categoryGroups={categoryGroups}
        selectedCategories={selectedCategories}
        orderInventoryMap={orderInventoryMap}
        onImport={importFromOrder}
      />

      {/* ─── Print & Label Styles ─── */}
      <style jsx global>{`
        .label-card { border: 1px solid #333; padding: 8px 10px; font-size: 11px; font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif; page-break-inside: avoid; }
        .label-customer { font-weight: 600; font-size: 12px; margin-bottom: 4px; }
        .label-divider { border-top: 1px dashed #999; margin: 4px 0; }
        .label-product { font-weight: 600; font-size: 13px; margin-bottom: 2px; }
        .label-spec { color: #666; margin-bottom: 4px; }
        .label-row { display: flex; justify-content: space-between; margin-bottom: 2px; }
        .label-barcode { width: 100%; margin: 4px 0 2px; }
        .label-note { text-align: center; font-size: 9px; color: #999; }
        @media print {
          @page { size: 241mm 139.5mm portrait; margin: 0; }
          html, body { margin: 0; padding: 0; background: white; }
          body * { visibility: hidden; }
          #delivery-print-area, #delivery-print-area * { visibility: visible; }
          #delivery-print-area {
            position: fixed; left: 0; top: 0; width: 241mm !important;
            min-height: 0 !important; max-height: none !important; height: auto !important;
            padding: 4mm 6mm !important; border: none; box-shadow: none; box-sizing: border-box;
            font-size: 19px !important; line-height: 22px !important; overflow: visible;
          }
          .label-card, .label-card * { visibility: visible; }
          .label-card { position: relative; }
          .no-print { visibility: hidden; }
        }
      `}</style>
    </div>
  );
}
