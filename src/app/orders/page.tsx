'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { translateUnit } from '@/lib/utils';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Pencil,
  Trash2,
  Search,
  Calendar,
  Package,
  ArrowDownToLine,
  ScanLine,
} from 'lucide-react';
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

interface Customer {
  id: string;
  name: string;
  code: string;
  contact: string | null;
  phone: string | null;
  address: string | null;
}

interface Product {
  id: string;
  code: string;
  name: string;
  spec: string | null;
  unit: string;
  price: number | null;
  category: string | null;
}

interface Schedule {
  id?: string;
  order_item_id?: string;
  schedule_date: string;
  quantity: number;
}

interface OrderItem {
  id?: string;
  product_id: string;
  quantity: number;
  unit_price: number | null;
  delivered_qty: number;
  reserved_qty: number;
  remark: string | null;
  products?: Product;
  customer_order_schedules?: Schedule[];
}

interface Order {
  id: string;
  customer_id: string;
  order_no: string;
  order_date: string;
  delivery_deadline: string | null;
  status: string;
  remark: string | null;
  created_at: string;
  customers?: Customer;
  customer_order_items?: OrderItem[];
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: '待处理', color: 'bg-yellow-100 text-yellow-800' },
  confirmed: { label: '已确认', color: 'bg-blue-100 text-blue-800' },
  in_progress: { label: '进行中', color: 'bg-blue-100 text-blue-800' },
  completed: { label: '已完成', color: 'bg-green-100 text-green-800' },
  cancelled: { label: '已取消', color: 'bg-red-100 text-red-800' },
};

// 获取日期范围内的日期列表
function getDateRange(start: Date, end: Date): string[] {
  const dates: string[] = [];
  const current = new Date(start);
  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set());
  const [searchKeyword, setSearchKeyword] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterCustomer, setFilterCustomer] = useState<string>('all');

  // 编辑相关
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // 表单状态
  const [formCustomerId, setFormCustomerId] = useState('');
  const [formCustomerSearch, setFormCustomerSearch] = useState('');
  const [formCustomerDropdownOpen, setFormCustomerDropdownOpen] = useState(false);
  const [formOrderNo, setFormOrderNo] = useState('');
  const [formOrderDate, setFormOrderDate] = useState('');
  const [formRemark, setFormRemark] = useState('');
  const [formItems, setFormItems] = useState<{
    product_id: string;
    quantity: number;
    unit_price: number | null;
    delivery_date: string;
    remark: string;
    schedules: { schedule_date: string; quantity: number }[];
  }[]>([]);

  // 每个明细行的产品搜索状态
  const [itemSearches, setItemSearches] = useState<Record<number, string>>({});
  const [itemNameSearches, setItemNameSearches] = useState<Record<number, string>>({});

  // 图片识别
  const [ocrLoading, setOcrLoading] = useState(false);
  const ocrFileRef = useRef<HTMLInputElement>(null);

  // BOM数据
  const [bomData, setBomData] = useState<Array<{
    id: string;
    parent_product_id: string;
    child_product_id: string;
    quantity: number;
    parent_product: Product;
    child_product: Product;
  }>>([]);

  // 下推相关
  const [pushDownOrderId, setPushDownOrderId] = useState<string | null>(null);
  const [pushDownWarehouseId, setPushDownWarehouseId] = useState('');
  const [pushDownLoading, setPushDownLoading] = useState(false);
  const [pushDownResult, setPushDownResult] = useState<{
    produced: Array<{ product_id: string; product_name: string; quantity: number; production_order_id: string }>;
    reserved: Array<{ product_id: string; product_name: string; quantity: number }>;
    insufficient: Array<{ product_id: string; product_name: string; required: number; available: number; shortage: number }>;
  } | null>(null);
  const [warehouses, setWarehouses] = useState<Array<{ id: string; name: string }>>([]);

  const loadData = useCallback(async () => {
    const [ordersRes, customersRes, productsRes, warehousesRes, bomRes] = await Promise.all([
      fetch('/api/orders'),
      fetch('/api/customers'),
      fetch('/api/products'),
      fetch('/api/warehouses'),
      fetch('/api/bom'),
    ]);
    const ordersData = await ordersRes.json();
    const customersData = await customersRes.json();
    const productsData = await productsRes.json();
    const warehousesData = await warehousesRes.json();
    const bomDataResult = await bomRes.json();
    setOrders(ordersData);
    setCustomers(customersData);
    setProducts(productsData);
    if (Array.isArray(warehousesData)) setWarehouses(warehousesData);
    if (Array.isArray(bomDataResult)) setBomData(bomDataResult);

    // 默认展开所有客户
    const customerIds = [...new Set(ordersData.map((o: Order) => o.customer_id))] as string[];
    setExpandedCustomers(new Set<string>(customerIds));
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 按客户分组
  const groupedOrders = orders.reduce<Record<string, Order[]>>((acc, order) => {
    const key = order.customer_id;
    if (!acc[key]) acc[key] = [];
    acc[key].push(order);
    return acc;
  }, {});

  // 过滤
  const filteredGrouped = Object.entries(groupedOrders).reduce<Record<string, Order[]>>(
    (acc, [customerId, customerOrders]) => {
      const filtered = customerOrders.filter((o) => {
        if (filterStatus !== 'all' && o.status !== filterStatus) return false;
        if (filterCustomer !== 'all' && o.customer_id !== filterCustomer) return false;
        if (searchKeyword) {
          const kw = searchKeyword.toLowerCase();
          const matchOrder = o.order_no.toLowerCase().includes(kw) || (o.remark || '').toLowerCase().includes(kw);
          const matchItem = o.customer_order_items?.some((item) =>
            item.products?.code.toLowerCase().includes(kw) || item.products?.name.toLowerCase().includes(kw)
          );
          if (!matchOrder && !matchItem) return false;
        }
        return true;
      });
      if (filtered.length > 0) acc[customerId] = filtered;
      return acc;
    },
    {}
  );

  const toggleCustomer = (customerId: string) => {
    setExpandedCustomers((prev) => {
      const next = new Set(prev);
      if (next.has(customerId)) next.delete(customerId);
      else next.add(customerId);
      return next;
    });
  };

  const expandAll = () => {
    setExpandedCustomers(new Set(Object.keys(groupedOrders)));
  };

  const collapseAll = () => {
    setExpandedCustomers(new Set());
  };

  // 计算排程日期范围
  const getScheduleDateRange = (): string[] => {
    const allDates: string[] = [];
    orders.forEach((o) => {
      o.customer_order_items?.forEach((item) => {
        item.customer_order_schedules?.forEach((s) => {
          if (s.schedule_date) allDates.push(s.schedule_date);
        });
      });
    });
    if (allDates.length === 0) {
      // 默认显示当月
      const now = new Date();
      return getDateRange(new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth() + 1, 0));
    }
    allDates.sort();
    const minDate = new Date(allDates[0]);
    const maxDate = new Date(allDates[allDates.length - 1]);
    // 扩展范围前后各加3天
    minDate.setDate(minDate.getDate() - 3);
    maxDate.setDate(maxDate.getDate() + 3);
    return getDateRange(minDate, maxDate);
  };

  const dateRange = getScheduleDateRange();

  // 获取某明细在某日期的排程数量
  const getScheduleQty = (item: OrderItem, date: string): number => {
    const sched = item.customer_order_schedules?.find((s) => {
      const schedDate = s.schedule_date?.slice(0, 10); // 取 YYYY-MM-DD 部分
      return schedDate === date;
    });
    return sched?.quantity || 0;
  };

  // 计算某明细的已排程总量
  const getTotalScheduled = (item: OrderItem): number => {
    return item.customer_order_schedules?.reduce((sum, s) => sum + s.quantity, 0) || 0;
  };

  // 新增订单
  const handleNew = () => {
    setEditingOrder(null);
    setFormCustomerId('');
    setFormCustomerSearch('');
    setFormOrderNo('');
    setFormOrderDate(new Date().toISOString().split('T')[0]);
    setFormRemark('');
    setFormItems([{ product_id: '', quantity: 0, unit_price: null, delivery_date: '', remark: '', schedules: [] }]);
    setItemSearches({});
    setItemNameSearches({});
    setIsFormOpen(true);
  };

  // 图片识别订单
  const handleOcr = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setOcrLoading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);

      const res = await fetch('/api/orders/ocr', {
        method: 'POST',
        body: formData,
      });

      const result = await res.json();
      if (result.error) {
        alert(result.error);
        return;
      }

      const data = result.data;

      // 检查订单号是否已存在
      if (data.order_no) {
        const existing = orders.some(o => o.order_no === data.order_no);
        if (existing) {
          alert(`订单号 ${data.order_no} 已存在，请勿重复录入`);
          setOcrLoading(false);
          return;
        }
        setFormOrderNo(data.order_no);
      }

      // 自动填充订单基本信息
      if (data.order_date && !formOrderDate) {
        setFormOrderDate(data.order_date);
      }

      // 将识别到的物料匹配系统产品并填充明细
      if (data.items && data.items.length > 0) {
        const newItems = data.items.map((item: {
          material_code: string;
          material_name: string;
          quantity: number;
          unit: string;
          delivery_date: string;
        }) => {
          // 尝试按物料编号匹配系统产品
          const matchedProduct = products.find(
            (p) => p.code === item.material_code || p.code === item.material_code.replace(/\./g, '')
          );

          // 交货日期生成排程
          const deliveryDate = item.delivery_date || data.delivery_deadline || '';
          const schedules: { schedule_date: string; quantity: number }[] = [];
          if (deliveryDate && item.quantity > 0) {
            schedules.push({ schedule_date: deliveryDate, quantity: item.quantity });
          }

          return {
            product_id: matchedProduct?.id || '',
            quantity: item.quantity,
            unit_price: matchedProduct?.price || null,
            delivery_date: deliveryDate,
            remark: matchedProduct ? '' : `${item.material_code} ${item.material_name}`,
            schedules,
          };
        });

        setFormItems((prev) => [...prev, ...newItems]);

        // 设置产品搜索关键字（用于显示未匹配的产品编号）
        const newSearches: Record<number, string> = {};
        const newNameSearches: Record<number, string> = {};
        const startIndex = formItems.length;
        data.items.forEach((item: { material_code: string; material_name: string }, idx: number) => {
          const matchedProduct = products.find(
            (p) => p.code === item.material_code || p.code === item.material_code.replace(/\./g, '')
          );
          if (!matchedProduct) {
            newSearches[startIndex + idx] = item.material_code;
            newNameSearches[startIndex + idx] = item.material_name;
          }
        });
        setItemSearches((prev) => ({ ...prev, ...newSearches }));
        setItemNameSearches((prev) => ({ ...prev, ...newNameSearches }));
      }

      // 如果没有打开表单，打开它
      if (!isFormOpen) {
        setIsFormOpen(true);
      }
    } catch (error) {
      console.error('OCR error:', error);
      alert('图片识别失败，请重试');
    } finally {
      setOcrLoading(false);
      // 重置 file input
      if (ocrFileRef.current) {
        ocrFileRef.current.value = '';
      }
    }
  };

  // 编辑订单
  const handleEdit = (order: Order) => {
    setEditingOrder(order);
    setFormCustomerId(order.customer_id);
    const cust = customers.find((c) => c.id === order.customer_id);
    setFormCustomerSearch(cust ? cust.code : '');
    setFormOrderNo(order.order_no);
    setFormOrderDate(order.order_date);
    setFormRemark(order.remark || '');
    setFormItems(
      order.customer_order_items?.map((item) => ({
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        delivery_date: item.customer_order_schedules?.[0]?.schedule_date || order.delivery_deadline || '',
        remark: item.remark || '',
        schedules: item.customer_order_schedules?.map((s) => ({
          schedule_date: s.schedule_date,
          quantity: s.quantity,
        })) || [],
      })) || []
    );
    setIsFormOpen(true);
  };

  // 保存订单
  const handleSave = async () => {
    if (!formCustomerId || !formOrderNo) {
      alert('请填写客户和订单号');
      return;
    }

    const payload = {
      id: editingOrder?.id,
      customer_id: formCustomerId,
      order_no: formOrderNo,
      order_date: formOrderDate,
      // 从所有明细中取最早的交货日期作为订单交货期限
      delivery_deadline: formItems.reduce((earliest: string | null, item) => {
        if (item.delivery_date && (!earliest || item.delivery_date < earliest)) return item.delivery_date;
        return earliest;
      }, null as string | null),
      remark: formRemark,
      status: editingOrder?.status || 'pending',
      items: formItems.map((item) => {
        // 如果没有手动排程，但有交货日期，自动生成一条排程
        let schedules = item.schedules;
        if (schedules.length === 0 && item.delivery_date && item.quantity > 0) {
          schedules = [{ schedule_date: item.delivery_date, quantity: item.quantity }];
        }
        return {
          product_id: item.product_id,
          quantity: item.quantity,
          price: item.unit_price,
          remark: item.remark,
          schedules,
        };
      }),
    };

    const method = editingOrder ? 'PUT' : 'POST';
    const res = await fetch('/api/orders', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      setIsFormOpen(false);
      loadData();
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.error || '保存失败，请检查数据后重试');
    }
  };

  // 删除订单
  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/orders?id=${id}`, { method: 'DELETE' });
    if (res.ok) {
      setDeleteConfirm(null);
      loadData();
    }
  };

  // 更新订单状态
  const handleStatusChange = async (orderId: string, newStatus: string) => {
    await fetch('/api/orders', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: orderId, status: newStatus }),
    });
    loadData();
  };

  // 表单：添加明细行
  const addFormItem = () => {
    setFormItems([...formItems, { product_id: '', quantity: 0, unit_price: null, delivery_date: '', remark: '', schedules: [] }]);
  };

  // 表单：删除明细行
  const removeFormItem = (index: number) => {
    setFormItems(formItems.filter((_, i) => i !== index));
    // 重新索引搜索状态
    setItemSearches((prev) => {
      const next: Record<number, string> = {};
      for (const [k, v] of Object.entries(prev)) {
        const ki = Number(k);
        if (ki < index) next[ki] = v;
        else if (ki > index) next[ki - 1] = v;
      }
      return next;
    });
    setItemNameSearches((prev) => {
      const next: Record<number, string> = {};
      for (const [k, v] of Object.entries(prev)) {
        const ki = Number(k);
        if (ki < index) next[ki] = v;
        else if (ki > index) next[ki - 1] = v;
      }
      return next;
    });
  };

  // 表单：更新明细行
  const updateFormItem = (index: number, field: string, value: unknown) => {
    const updated = [...formItems];
    updated[index] = { ...updated[index], [field]: value };
    setFormItems(updated);
  };

  // 表单：添加排程
  const addSchedule = (itemIndex: number) => {
    const updated = [...formItems];
    updated[itemIndex].schedules.push({ schedule_date: '', quantity: 0 });
    setFormItems(updated);
  };

  // 表单：更新排程
  const updateSchedule = (itemIndex: number, schedIndex: number, field: string, value: unknown) => {
    const updated = [...formItems];
    updated[itemIndex].schedules[schedIndex] = {
      ...updated[itemIndex].schedules[schedIndex],
      [field]: value,
    };
    setFormItems(updated);
  };

  // 表单：删除排程
  const removeSchedule = (itemIndex: number, schedIndex: number) => {
    const updated = [...formItems];
    updated[itemIndex].schedules = updated[itemIndex].schedules.filter((_, i) => i !== schedIndex);
    setFormItems(updated);
  };

  const getCustomerName = (customerId: string) => {
    return customers.find((c) => c.id === customerId)?.name || '未知客户';
  };

  // 下推处理
  const handlePushDown = async () => {
    if (!pushDownOrderId || !pushDownWarehouseId) return;
    setPushDownLoading(true);
    try {
      const res = await fetch('/api/orders/push-down', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: pushDownOrderId, warehouse_id: pushDownWarehouseId }),
      });
      const data = await res.json();
      if (res.ok) {
        setPushDownResult(data);
      } else {
        alert(data.error || '下推失败');
      }
    } catch (e) {
      alert('下推请求失败: ' + String(e));
    }
    setPushDownLoading(false);
  };

  // 获取BOM父产品ID集合（有BOM的成品）
  const bomParentIds = new Set(bomData.map((b) => b.parent_product_id));

  // 获取某BOM父产品的所有子物料
  const getBomChildren = (parentId: string) => bomData.filter((b) => b.parent_product_id === parentId);

  // 模糊搜索产品（也搜索BOM父产品名）
  const searchProducts = (keyword: string): Array<Product & { is_bom_parent?: boolean; bom_children_count?: number }> => {
    if (!keyword) return products.map((p) => ({
      ...p,
      is_bom_parent: bomParentIds.has(p.id),
      bom_children_count: getBomChildren(p.id).length,
    }));
    const kw = keyword.toLowerCase();
    return products
      .filter((p) => {
        const matchCode = p.code.toLowerCase().includes(kw);
        const matchName = p.name.toLowerCase().includes(kw);
        const matchSpec = p.spec?.toLowerCase().includes(kw) || false;
        return matchCode || matchName || matchSpec;
      })
      .map((p) => ({
        ...p,
        is_bom_parent: bomParentIds.has(p.id),
        bom_children_count: getBomChildren(p.id).length,
      }));
  };

  // 选择物料 - 如果是BOM父产品，自动展开子物料
  const selectProduct = (itemIdx: number, product: Product & { is_bom_parent?: boolean }) => {
    if (product.is_bom_parent) {
      // BOM父产品：自动展开子物料，替换当前行
      const children = getBomChildren(product.id);
      const newItems = children.map((bomItem) => ({
        product_id: bomItem.child_product_id,
        quantity: bomItem.quantity,
        unit_price: bomItem.child_product.price ?? null,
        delivery_date: '',
        remark: '',
        schedules: [] as { schedule_date: string; quantity: number }[],
      }));
      // 替换当前行
      const updated = [...formItems];
      updated.splice(itemIdx, 1, ...newItems);
      setFormItems(updated);
      // 清理搜索状态
      const newSearches = { ...itemSearches };
      delete newSearches[itemIdx];
      // 重新索引后续搜索
      const reindexed: Record<number, string> = {};
      for (const [key, val] of Object.entries(newSearches)) {
        const k = Number(key);
        if (k > itemIdx) {
          reindexed[k + children.length - 1] = val;
        } else {
          reindexed[k] = val;
        }
      }
      setItemSearches(reindexed);
    } else {
      // 普通物料：直接选中，自动填充单价
      const updated = [...formItems];
      updated[itemIdx] = {
        ...updated[itemIdx],
        product_id: product.id,
        unit_price: product.price ?? null,
      };
      setFormItems(updated);
      setItemSearches((prev) => {
        const next = { ...prev };
        delete next[itemIdx];
        return next;
      });
      setItemNameSearches((prev) => {
        const next = { ...prev };
        delete next[itemIdx];
        return next;
      });
    }
  };

  // 关闭所有搜索下拉
  const closeAllSearches = () => {
    setItemSearches({});
    setItemNameSearches({});
  };

  return (
    <div className="p-8">
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900">客户订单管理</h1>
        <div className="flex items-center gap-3">
          <Button onClick={handleNew} className="bg-[#1E40AF] hover:bg-[#1D4ED8]">
            <Plus className="w-4 h-4 mr-1" />
            新增订单
          </Button>
          <Button
            onClick={() => ocrFileRef.current?.click()}
            disabled={ocrLoading}
            className="bg-[#1E40AF] hover:bg-[#1D4ED8]"
          >
            {ocrLoading ? (
              <>
                <span className="w-4 h-4 mr-1 inline-block animate-spin rounded-full border-2 border-white border-t-transparent" />
                识别中...
              </>
            ) : (
              <>
                <ScanLine className="w-4 h-4 mr-1" />
                图片识别
              </>
            )}
          </Button>
          <input
            ref={ocrFileRef}
            type="file"
            accept="image/*"
            onChange={handleOcr}
            className="hidden"
          />
        </div>
      </div>

      {/* 筛选栏 */}
      <div className="flex items-center gap-4 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="搜索订单号/物料..."
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="状态" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="pending">待处理</SelectItem>
            <SelectItem value="in_progress">进行中</SelectItem>
            <SelectItem value="completed">已完成</SelectItem>
            <SelectItem value="cancelled">已取消</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterCustomer} onValueChange={setFilterCustomer}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="客户" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部客户</SelectItem>
            {customers.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 ml-auto">
          <Button variant="outline" size="sm" onClick={expandAll}>全部展开</Button>
          <Button variant="outline" size="sm" onClick={collapseAll}>全部收缩</Button>
        </div>
      </div>

      {/* 统计 */}
      <div className="flex items-center gap-4 mb-4 text-sm text-gray-500">
        <span>订单总数：{orders.length}</span>
        <span>客户数：{Object.keys(groupedOrders).length}</span>
        <span>物料条目：{orders.reduce((s, o) => s + (o.customer_order_items?.length || 0), 0)}</span>
      </div>

      {/* 按客户分组展示排程表 */}
      {Object.entries(filteredGrouped).length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>暂无订单数据</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(filteredGrouped).map(([customerId, customerOrders]) => {
            const isExpanded = expandedCustomers.has(customerId);
            const customerName = getCustomerName(customerId);
            const totalOrders = customerOrders.length;
            const totalItems = customerOrders.reduce((s, o) => s + (o.customer_order_items?.length || 0), 0);

            return (
              <div key={customerId} className="border border-gray-200 rounded-lg overflow-hidden">
                {/* 客户组标题 */}
                <div
                  className="flex items-center gap-3 px-4 py-3 bg-gray-50 cursor-pointer hover:bg-gray-100"
                  onClick={() => toggleCustomer(customerId)}
                >
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-gray-500" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-500" />
                  )}
                  <span className="font-medium text-gray-900">{customerName}</span>
                  <Badge variant="secondary" className="text-xs">
                    {totalOrders} 个订单
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {totalItems} 项物料
                  </Badge>
                </div>

                {/* 展开内容 - 排程表 */}
                {isExpanded && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm" style={{ minWidth: dateRange.length * 60 + 400 }}>
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          <th className="px-3 py-2 text-left font-medium text-gray-600 w-24 sticky left-0 bg-gray-50 z-10">单据编号</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600 w-36 sticky left-24 bg-gray-50 z-10">物料编码</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600 w-48 sticky left-60 bg-gray-50 z-10">物料描述</th>
                          <th className="px-3 py-2 text-center font-medium text-gray-600 w-16 sticky left-[324px] bg-gray-50 z-10">单位</th>
                          <th className="px-3 py-2 text-center font-medium text-blue-700 bg-blue-50 w-16 sticky left-[340px] bg-blue-50 z-10">数量</th>
                          <th className="px-3 py-2 text-center font-medium text-yellow-700 bg-yellow-50 w-16 sticky left-[356px] bg-yellow-50 z-10">未交</th>
                          {dateRange.map((date) => (
                            <th key={date} className="px-1 py-2 text-center font-medium text-gray-500 w-14 text-xs whitespace-nowrap">
                              {formatDateShort(date)}
                            </th>
                          ))}
                          <th className="px-3 py-2 text-left font-medium text-gray-600 w-40 sticky right-0 bg-gray-50 z-10">备注</th>
                          <th className="px-3 py-2 text-center font-medium text-gray-600 w-24 sticky right-40 bg-gray-50 z-10">状态</th>
                          <th className="px-3 py-2 text-center font-medium text-gray-600 w-20 sticky right-16 bg-gray-50 z-10">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {customerOrders.map((order) =>
                          order.customer_order_items?.map((item, itemIdx) => {
                            const totalScheduled = getTotalScheduled(item);
                            const unscheduledQty = item.quantity - totalScheduled;
                            const isDeadlinePast = order.delivery_deadline && new Date(order.delivery_deadline) < new Date();
                            const isDeadlineSoon = order.delivery_deadline &&
                              !isDeadlinePast &&
                              new Date(order.delivery_deadline).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000;

                            return (
                              <tr
                                key={`${order.id}-${item.id || itemIdx}`}
                                className="border-b border-gray-100 hover:bg-gray-50"
                              >
                                {/* 单据编号 - 同一订单只显示一次 */}
                                <td className="px-3 py-2 font-mono text-xs sticky left-0 bg-white z-[5]">
                                  {itemIdx === 0 ? order.order_no : ''}
                                </td>
                                <td className="px-3 py-2 font-mono text-xs sticky left-24 bg-white z-[5]">
                                  {item.products?.code || '-'}
                                </td>
                                <td className="px-3 py-2 text-xs sticky left-60 bg-white z-[5] max-w-[200px] truncate" title={item.products?.name}>
                                  {item.products?.name || '-'}
                                </td>
                                <td className="px-3 py-2 text-center text-xs sticky left-[324px] bg-white z-[5]">
                                  {translateUnit(item.products?.unit || '-')}
                                </td>
                                <td className="px-3 py-2 text-center font-mono text-xs font-medium sticky left-[340px] bg-blue-50 text-blue-700 z-[5]">
                                  {item.quantity || 0}
                                </td>
                                <td className={`px-3 py-2 text-center font-mono text-xs font-medium sticky left-[356px] z-[5] ${
                                  (item.quantity - (item.delivered_qty || 0)) > 0 ? 'bg-yellow-50 text-yellow-700' : 'bg-green-50 text-green-700'
                                }`}>
                                  {item.quantity - (item.delivered_qty || 0)}
                                </td>
                                {dateRange.map((date) => {
                                  const qty = getScheduleQty(item, date);
                                  const isDeadlineDate = order.delivery_deadline === date;
                                  return (
                                    <td
                                      key={date}
                                      className={`px-1 py-2 text-center font-mono text-xs ${
                                        qty > 0 ? 'bg-blue-50 text-blue-700 font-medium' : ''
                                      } ${isDeadlineDate ? 'ring-2 ring-yellow-400 ring-inset' : ''}`}
                                    >
                                      {qty > 0 ? qty : ''}
                                    </td>
                                  );
                                })}
                                <td className="px-3 py-2 text-xs sticky right-40 bg-white z-[5] max-w-[160px] truncate" title={item.remark || order.remark || ''}>
                                  {order.delivery_deadline && (
                                    <span className={`inline-block text-xs mr-1 px-1 rounded ${
                                      isDeadlinePast ? 'bg-red-100 text-red-700' :
                                      isDeadlineSoon ? 'bg-yellow-100 text-yellow-700' :
                                      'bg-green-100 text-green-700'
                                    }`}>
                                      &larr;{formatDateShort(order.delivery_deadline)}前交货
                                    </span>
                                  )}
                                  {item.remark || ''}
                                </td>
                                <td className="px-3 py-2 text-center sticky right-16 bg-white z-[5]">
                                  {itemIdx === 0 && (
                                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${STATUS_MAP[order.status]?.color || 'bg-gray-100 text-gray-700'}`}>
                                      {STATUS_MAP[order.status]?.label || order.status}
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-center sticky right-0 bg-white z-[5]">
                                  {itemIdx === 0 && (
                                    <div className="flex items-center justify-center gap-1">
                                      <button
                                        onClick={() => handleEdit(order)}
                                        className="p-1 text-gray-400 hover:text-blue-600"
                                        title="编辑"
                                      >
                                        <Pencil className="w-3.5 h-3.5" />
                                      </button>
                                      {order.status === 'pending' && (
                                        <button
                                          onClick={() => {
                                            setPushDownOrderId(order.id);
                                            setPushDownResult(null);
                                            setPushDownWarehouseId(warehouses[0]?.id || '');
                                          }}
                                          className="p-1 text-gray-400 hover:text-green-600"
                                          title="下推"
                                        >
                                          <ArrowDownToLine className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                      <button
                                        onClick={() => handleStatusChange(
                                          order.id,
                                          order.status === 'pending' ? 'in_progress' :
                                          order.status === 'in_progress' ? 'completed' : 'pending'
                                        )}
                                        className="p-1 text-gray-400 hover:text-green-600"
                                        title="切换状态"
                                      >
                                        <Calendar className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        onClick={() => setDeleteConfirm(order.id)}
                                        className="p-1 text-gray-400 hover:text-red-600"
                                        title="删除"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 新增/编辑订单抽屉 */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-[1400px] w-[95vw] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {editingOrder ? '编辑订单' : '新增订单'}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => ocrFileRef.current?.click()}
                disabled={ocrLoading}
                className="text-[#1E40AF] border-[#1E40AF] hover:bg-blue-50"
              >
                {ocrLoading ? '识别中...' : (
                  <>
                    <ScanLine className="w-3.5 h-3.5 mr-1" />
                    图片识别
                  </>
                )}
              </Button>
            </DialogTitle>
          </DialogHeader>
          <div className="mt-2 space-y-4">
            {/* 基础信息 */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <div className="col-span-2 grid grid-cols-2 gap-x-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">客户编号 *</label>
                  <div className="relative">
                    <Input
                      value={formCustomerSearch}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFormCustomerSearch(val);
                        setFormCustomerId('');
                        setFormCustomerDropdownOpen(true);
                      }}
                      onFocus={() => setFormCustomerDropdownOpen(true)}
                      placeholder="输入客户编号"
                      className="w-full font-mono"
                    />
                    {formCustomerDropdownOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setFormCustomerDropdownOpen(false)} />
                        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-[200px] overflow-y-auto">
                        {customers
                          .filter((c) => {
                            if (!formCustomerSearch) return true;
                            const q = formCustomerSearch.toLowerCase();
                            return (
                              c.code.toLowerCase().includes(q) ||
                              c.name.toLowerCase().includes(q)
                            );
                          })
                          .slice(0, 20)
                          .map((c) => (
                            <div
                              key={c.id}
                              className="px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 border-b border-gray-100 last:border-0"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setFormCustomerId(c.id);
                                setFormCustomerSearch(c.code);
                                setFormCustomerDropdownOpen(false);
                              }}
                            >
                              <span className="font-mono text-gray-600 mr-2">{c.code}</span>
                              <span>{c.name}</span>
                            </div>
                          ))}
                        {customers.filter((c) => {
                          if (!formCustomerSearch) return true;
                          const q = formCustomerSearch.toLowerCase();
                          return c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q);
                        }).length === 0 && (
                          <div className="px-3 py-2 text-sm text-gray-400 text-center">无匹配客户</div>
                        )}
                      </div>
                      </>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">客户名称</label>
                  <Input
                    value={formCustomerId ? (customers.find(c => c.id === formCustomerId)?.name || '') : ''}
                    readOnly
                    placeholder="自动填充"
                    className="w-full bg-gray-50 text-gray-600"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">订单号 *</label>
                <Input
                  value={formOrderNo}
                  onChange={(e) => setFormOrderNo(e.target.value)}
                  placeholder="如：44568"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">订单日期</label>
                <Input
                  type="date"
                  value={formOrderDate}
                  onChange={(e) => setFormOrderDate(e.target.value)}
                />
              </div>

            </div>
            <div>
              <Input
                value={formRemark}
                onChange={(e) => setFormRemark(e.target.value)}
                placeholder="订单备注（选填）"
              />
            </div>

            {/* 物料明细 */}
            <div className="border-t pt-4">
              <div className="flex items-center mb-3">
                <h3 className="text-sm font-medium text-gray-700">物料明细</h3>
              </div>

              {/* 表头 */}
              <div className="grid grid-cols-[2fr_2.5fr_100px_120px_160px_40px] gap-3 mb-2 px-1">
                <span className="text-xs text-gray-500 font-medium">物料编码</span>
                <span className="text-xs text-gray-500 font-medium">物料名称</span>
                <span className="text-xs text-gray-500 font-medium">数量</span>
                <span className="text-xs text-gray-500 font-medium">单价</span>
                <span className="text-xs text-gray-500 font-medium">交货日期</span>
                <span></span>
              </div>

              {formItems.map((item, itemIdx) => (
                <div key={itemIdx} className="grid grid-cols-[2fr_2.5fr_100px_120px_160px_40px] gap-3 items-center mb-3">
                  {/* 物料编码搜索 */}
                  <div className="relative">
                    <Input
                      placeholder="输入编码搜索"
                      value={item.product_id
                        ? (products.find((p) => p.id === item.product_id)?.code || '')
                        : (itemSearches[itemIdx] || '')
                      }
                      onChange={(e) => {
                        setItemSearches((prev) => ({ ...prev, [itemIdx]: e.target.value }));
                        if (item.product_id) {
                          const updated = [...formItems];
                          updated[itemIdx] = { ...updated[itemIdx], product_id: '', unit_price: null };
                          setFormItems(updated);
                        }
                      }}
                      onFocus={() => {
                        if (item.product_id) {
                          const updated = [...formItems];
                          updated[itemIdx] = { ...updated[itemIdx], product_id: '', unit_price: null };
                          setFormItems(updated);
                          setItemSearches((prev) => ({ ...prev, [itemIdx]: '' }));
                        }
                      }}
                      onBlur={() => {
                        setTimeout(() => {
                          setItemSearches((prev) => {
                            const next = { ...prev };
                            delete next[itemIdx];
                            return next;
                          });
                        }, 200);
                      }}
                      className="text-sm font-mono h-10"
                    />
                    {itemSearches[itemIdx] && !item.product_id && (
                      <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded shadow-lg z-50 max-h-48 overflow-y-auto mt-0.5">
                        {searchProducts(itemSearches[itemIdx]).length === 0 ? (
                          <div className="px-3 py-2 text-xs text-gray-400">无匹配物料</div>
                        ) : (
                          searchProducts(itemSearches[itemIdx]).slice(0, 20).map((p) => (
                            <button
                              key={p.id}
                              className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 flex items-center justify-between"
                              onClick={() => selectProduct(itemIdx, p)}
                            >
                              <span>
                                <span className="font-mono">{p.code}</span>
                                <span className="ml-2 text-gray-500">{p.name}</span>
                                {p.spec && <span className="ml-1 text-gray-400">{p.spec}</span>}
                              </span>
                              {p.is_bom_parent && (
                                <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium whitespace-nowrap">
                                  BOM({p.bom_children_count}项)
                                </span>
                              )}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  {/* 物料名称 - 支持模糊搜索 */}
                  <div className="relative">
                    <Input
                      placeholder="输入名称搜索"
                      value={item.product_id
                        ? (products.find((p) => p.id === item.product_id)?.name || '')
                        : (itemNameSearches[itemIdx] || '')
                      }
                      onChange={(e) => {
                        setItemNameSearches((prev) => ({ ...prev, [itemIdx]: e.target.value }));
                        if (item.product_id) {
                          const updated = [...formItems];
                          updated[itemIdx] = { ...updated[itemIdx], product_id: '', unit_price: null };
                          setFormItems(updated);
                        }
                      }}
                      onFocus={() => {
                        if (item.product_id) {
                          const updated = [...formItems];
                          updated[itemIdx] = { ...updated[itemIdx], product_id: '', unit_price: null };
                          setFormItems(updated);
                          setItemNameSearches((prev) => ({ ...prev, [itemIdx]: '' }));
                        }
                      }}
                      onBlur={() => {
                        setTimeout(() => {
                          setItemNameSearches((prev) => {
                            const next = { ...prev };
                            delete next[itemIdx];
                            return next;
                          });
                        }, 200);
                      }}
                      className="text-sm h-10"
                    />
                    {itemNameSearches[itemIdx] && !item.product_id && (
                      <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded shadow-lg z-50 max-h-48 overflow-y-auto mt-0.5">
                        {searchProducts(itemNameSearches[itemIdx]).length === 0 ? (
                          <div className="px-3 py-2 text-xs text-gray-400">无匹配物料</div>
                        ) : (
                          searchProducts(itemNameSearches[itemIdx]).slice(0, 20).map((p) => (
                            <button
                              key={p.id}
                              className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 flex items-center justify-between"
                              onClick={() => selectProduct(itemIdx, p)}
                            >
                              <span>
                                <span className="font-mono">{p.code}</span>
                                <span className="ml-2 text-gray-500">{p.name}</span>
                                {p.spec && <span className="ml-1 text-gray-400">{p.spec}</span>}
                              </span>
                              {p.is_bom_parent && (
                                <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium whitespace-nowrap">
                                  BOM({p.bom_children_count}项)
                                </span>
                              )}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  {/* 数量 */}
                  <Input
                    type="number"
                    value={item.quantity || ''}
                    onChange={(e) => updateFormItem(itemIdx, 'quantity', Number(e.target.value))}
                    className="text-sm h-10 text-right"
                    placeholder="0"
                  />
                  {/* 单价 - 只读自动填充 */}
                  <Input
                    type="number"
                    value={item.unit_price ?? ''}
                    readOnly
                    className="text-sm h-10 bg-gray-100 text-right"
                    placeholder="自动"
                  />
                  {/* 交货日期 */}
                  <Input
                    type="date"
                    value={item.delivery_date}
                    onChange={(e) => updateFormItem(itemIdx, 'delivery_date', e.target.value)}
                    className="text-sm h-10"
                  />
                  {/* 删除 */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-10 w-10 p-0 text-red-400 hover:text-red-600"
                    onClick={() => removeFormItem(itemIdx)}
                    disabled={formItems.length <= 1}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                  {/* 插入行/新增行 */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-10 w-10 p-0 text-blue-500 hover:text-blue-700"
                    onClick={() => addFormItem()}
                    title="新增一行物料"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>

            {/* 保存/取消 */}
            <div className="flex items-center gap-3 pt-4 border-t">
              <Button onClick={handleSave} className="bg-[#1E40AF] hover:bg-[#1D4ED8]" disabled={!formCustomerId || !formOrderNo}>
                保存
              </Button>
              <Button variant="outline" onClick={() => setIsFormOpen(false)}>
                取消
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">确定要删除此订单吗？删除后不可恢复。</p>
          <div className="flex items-center gap-3 mt-4">
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
            >
              确认删除
            </Button>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              取消
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 下推对话框 */}
      <Dialog open={!!pushDownOrderId} onOpenChange={(open) => { if (!open) { setPushDownOrderId(null); setPushDownResult(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>订单下推</DialogTitle>
          </DialogHeader>
          {!pushDownResult ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                下推将自动检查订单物料的BOM和库存情况：
                <br />- 有BOM且库存充足 → 自动预扣库存
                <br />- 有BOM且库存不足 → 自动生成生产订单（含用料清单）
                <br />- 无BOM且库存充足 → 自动预扣库存
                <br />- 无BOM且库存不足 → 生成生产订单（用料清单为空）
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">选择仓库 *</label>
                <Select value={pushDownWarehouseId} onValueChange={setPushDownWarehouseId}>
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
                <Button variant="outline" onClick={() => { setPushDownOrderId(null); setPushDownResult(null); }}>取消</Button>
                <Button
                  className="bg-[#1E40AF] hover:bg-[#1D4ED8]"
                  onClick={handlePushDown}
                  disabled={pushDownLoading || !pushDownWarehouseId}
                >
                  {pushDownLoading ? '下推中...' : '确认下推'}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              {pushDownResult.produced.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-blue-500" /> 已生成生产订单
                  </h4>
                  <table className="w-full text-xs border border-gray-200 rounded">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-3 py-1.5 text-left">产品</th>
                        <th className="px-3 py-1.5 text-right">数量</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pushDownResult.produced.map((p, i) => (
                        <tr key={i} className="border-t border-gray-100">
                          <td className="px-3 py-1.5">{p.product_name}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{p.quantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {pushDownResult.reserved.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-green-500" /> 已预扣库存
                  </h4>
                  <table className="w-full text-xs border border-gray-200 rounded">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-3 py-1.5 text-left">产品</th>
                        <th className="px-3 py-1.5 text-right">预扣数量</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pushDownResult.reserved.map((r, i) => (
                        <tr key={i} className="border-t border-gray-100">
                          <td className="px-3 py-1.5">{r.product_name}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{r.quantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {pushDownResult.insufficient.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-red-500" /> 库存不足
                  </h4>
                  <table className="w-full text-xs border border-gray-200 rounded">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-3 py-1.5 text-left">产品</th>
                        <th className="px-3 py-1.5 text-right">需求</th>
                        <th className="px-3 py-1.5 text-right">可用</th>
                        <th className="px-3 py-1.5 text-right">缺口</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pushDownResult.insufficient.map((s, i) => (
                        <tr key={i} className="border-t border-gray-100">
                          <td className="px-3 py-1.5">{s.product_name}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{s.required}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{s.available}</td>
                          <td className="px-3 py-1.5 text-right font-mono text-red-600">{s.shortage}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {pushDownResult.produced.length === 0 && pushDownResult.reserved.length === 0 && pushDownResult.insufficient.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-4">订单物料已全部处理完成</p>
              )}
              <DialogFooter>
                <Button className="bg-[#1E40AF] hover:bg-[#1D4ED8]" onClick={() => { setPushDownOrderId(null); setPushDownResult(null); loadData(); }}>
                  确定
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
