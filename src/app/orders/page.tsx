'use client';

import { useState, useEffect, useCallback } from 'react';
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
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
  const [formOrderNo, setFormOrderNo] = useState('');
  const [formOrderDate, setFormOrderDate] = useState('');
  const [formDeadline, setFormDeadline] = useState('');
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
    const sched = item.customer_order_schedules?.find((s) => s.schedule_date === date);
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
    setFormOrderNo('');
    setFormOrderDate(new Date().toISOString().split('T')[0]);
    setFormDeadline('');
    setFormRemark('');
    setFormItems([]);
    setItemSearches({});
    setIsFormOpen(true);
  };

  // 编辑订单
  const handleEdit = (order: Order) => {
    setEditingOrder(order);
    setFormCustomerId(order.customer_id);
    setFormOrderNo(order.order_no);
    setFormOrderDate(order.order_date);
    setFormDeadline(order.delivery_deadline || '');
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
    if (!formCustomerId || !formOrderNo) return;

    const payload = {
      id: editingOrder?.id,
      customer_id: formCustomerId,
      order_no: formOrderNo,
      order_date: formOrderDate,
      delivery_deadline: formDeadline || null,
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
          unit_price: item.unit_price,
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
    setFormItems([...formItems, { product_id: '', quantity: 0, unit_price: null, delivery_date: formDeadline || '', remark: '', schedules: [] }]);
  };

  // 表单：删除明细行
  const removeFormItem = (index: number) => {
    setFormItems(formItems.filter((_, i) => i !== index));
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
        unit_price: null as number | null,
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
      // 普通物料：直接选中
      updateFormItem(itemIdx, 'product_id', product.id);
      setItemSearches((prev) => {
        const next = { ...prev };
        delete next[itemIdx];
        return next;
      });
    }
  };

  // 关闭所有搜索下拉
  const closeAllSearches = () => {
    setItemSearches({});
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
                          <th className="px-3 py-2 text-center font-medium text-yellow-700 bg-yellow-50 w-20 sticky left-[388px] bg-yellow-50 z-10">未清数量</th>
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
                                  {item.products?.unit || '-'}
                                </td>
                                <td className={`px-3 py-2 text-center font-mono text-xs font-medium sticky left-[388px] z-[5] ${
                                  unscheduledQty > 0 ? 'bg-yellow-50 text-yellow-700' : 'bg-green-50 text-green-700'
                                }`}>
                                  {unscheduledQty > 0 ? unscheduledQty : 0}
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
      <Sheet open={isFormOpen} onOpenChange={setIsFormOpen}>
        <SheetContent className="w-[640px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editingOrder ? '编辑订单' : '新增订单'}</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            {/* 基础信息 */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">客户 *</label>
                <Select value={formCustomerId} onValueChange={setFormCustomerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择客户" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">交货期限</label>
                <Input
                  type="date"
                  value={formDeadline}
                  onChange={(e) => setFormDeadline(e.target.value)}
                />
                <p className="text-xs text-gray-400 mt-0.5">默认截止日期，各物料可单独设置交货日期</p>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
              <Input
                value={formRemark}
                onChange={(e) => setFormRemark(e.target.value)}
                placeholder="订单备注"
              />
            </div>

            {/* 物料明细 */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-700">物料明细</h3>
                <Button size="sm" variant="outline" onClick={addFormItem}>
                  <Plus className="w-3 h-3 mr-1" />添加物料
                </Button>
              </div>

              {formItems.map((item, itemIdx) => (
                <div key={itemIdx} className="border border-gray-200 rounded-lg p-3 mb-3">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 space-y-2">
                      <div className="grid grid-cols-5 gap-2">
                        <div className="col-span-2">
                          <label className="block text-xs text-gray-500 mb-1">物料</label>
                          <div className="relative">
                            <Input
                              placeholder="搜索物料编码/名称"
                              value={item.product_id
                                ? `${products.find((p) => p.id === item.product_id)?.code || ''} - ${products.find((p) => p.id === item.product_id)?.name || ''}`
                                : (itemSearches[itemIdx] || '')
                              }
                              onChange={(e) => {
                                setItemSearches((prev) => ({ ...prev, [itemIdx]: e.target.value }));
                                if (item.product_id) {
                                  updateFormItem(itemIdx, 'product_id', '');
                                }
                              }}
                              onFocus={() => {
                                if (item.product_id) {
                                  // 已选物料时，清空让其重新搜索
                                  updateFormItem(itemIdx, 'product_id', '');
                                  setItemSearches((prev) => ({ ...prev, [itemIdx]: '' }));
                                }
                              }}
                              onBlur={() => {
                                // 延迟关闭，让点击事件先触发
                                setTimeout(() => {
                                  setItemSearches((prev) => {
                                    const next = { ...prev };
                                    delete next[itemIdx];
                                    return next;
                                  });
                                }, 200);
                              }}
                              className="text-xs"
                            />
                            {itemSearches[itemIdx] && !item.product_id && (
                              <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded shadow-lg z-50 max-h-48 overflow-y-auto">
                                {searchProducts(itemSearches[itemIdx]).length === 0 ? (
                                  <div className="px-3 py-2 text-xs text-gray-400">无匹配物料</div>
                                ) : (
                                  searchProducts(itemSearches[itemIdx]).slice(0, 20).map((p) => (
                                    <button
                                      key={p.id}
                                      className="w-full text-left px-2 py-1.5 text-xs hover:bg-blue-50 flex items-center justify-between"
                                      onClick={() => selectProduct(itemIdx, p)}
                                    >
                                      <span>
                                        <span className="font-mono">{p.code}</span>
                                        <span className="ml-1 text-gray-500">{p.name}</span>
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
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">数量</label>
                          <Input
                            type="number"
                            value={item.quantity || ''}
                            onChange={(e) => updateFormItem(itemIdx, 'quantity', Number(e.target.value))}
                            className="text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">单价</label>
                          <Input
                            type="number"
                            value={item.unit_price ?? ''}
                            onChange={(e) => updateFormItem(itemIdx, 'unit_price', e.target.value ? Number(e.target.value) : null)}
                            className="text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">交货日期</label>
                          <Input
                            type="date"
                            value={item.delivery_date}
                            onChange={(e) => updateFormItem(itemIdx, 'delivery_date', e.target.value)}
                            className="text-xs"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">备注</label>
                        <Input
                          value={item.remark}
                          onChange={(e) => updateFormItem(itemIdx, 'remark', e.target.value)}
                          placeholder="明细备注"
                          className="text-xs"
                        />
                      </div>

                      {/* 交货排程 */}
                      <div className="mt-2">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-500">交货排程</span>
                          <Button size="sm" variant="ghost" className="h-5 text-xs" onClick={() => addSchedule(itemIdx)}>
                            <Plus className="w-3 h-3 mr-0.5" />添加
                          </Button>
                        </div>
                        {item.schedules.map((sched, schedIdx) => (
                          <div key={schedIdx} className="flex items-center gap-2 mb-1">
                            <Input
                              type="date"
                              value={sched.schedule_date}
                              onChange={(e) => updateSchedule(itemIdx, schedIdx, 'schedule_date', e.target.value)}
                              className="text-xs w-36"
                            />
                            <Input
                              type="number"
                              value={sched.quantity || ''}
                              onChange={(e) => updateSchedule(itemIdx, schedIdx, 'quantity', Number(e.target.value))}
                              placeholder="数量"
                              className="text-xs w-20"
                            />
                            <button
                              onClick={() => removeSchedule(itemIdx, schedIdx)}
                              className="text-gray-400 hover:text-red-500"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={() => removeFormItem(itemIdx)}
                      className="text-gray-400 hover:text-red-500 mt-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
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
        </SheetContent>
      </Sheet>

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
                <br />- 有BOM的成品 → 自动生成生产订单
                <br />- 无BOM且库存充足 → 自动预扣库存
                <br />- 无BOM且库存不足 → 提示缺料
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
