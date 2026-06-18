'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
  ScanLine,
  History,
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
  price: number | null;
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
  const [hideDelivered, setHideDelivered] = useState(true);

  // 缓存今天日期，避免渲染中调用 Date.now()
  // 初始值为空字符串，客户端挂载后再设置，避免 SSR/客户端 hydration 不一致
  const [today, setToday] = useState('');
  useEffect(() => {
    setToday(new Date().toISOString().split('T')[0]);
  }, []);

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
  const [formDeliveryDeadline, setFormDeliveryDeadline] = useState('');
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

  // 追溯相关
  const [traceOrderId, setTraceOrderId] = useState<string | null>(null);
  const [traceData, setTraceData] = useState<{
    order: Record<string, unknown>;
    production_orders: Array<Record<string, unknown>>;
    delivery_notes: Array<Record<string, unknown>>;
  } | null>(null);
  const [traceLoading, setTraceLoading] = useState(false);

  const loadData = useCallback(async () => {
    const [ordersRes, customersRes, productsRes, bomRes] = await Promise.all([
      fetch('/api/orders'),
      fetch('/api/customers'),
      fetch('/api/products'),
      fetch('/api/bom'),
    ]);
    const ordersData = await ordersRes.json();
    const customersData = await customersRes.json();
    const productsData = await productsRes.json();
    const bomDataResult = await bomRes.json();
    setOrders(Array.isArray(ordersData) ? ordersData : []);
    setCustomers(Array.isArray(customersData) ? customersData : []);
    setProducts(Array.isArray(productsData) ? productsData : []);
    if (Array.isArray(bomDataResult)) setBomData(bomDataResult);

    // 默认展开所有客户
    const customerIds = [...new Set((Array.isArray(ordersData) ? ordersData : []).map((o: Order) => o.customer_id))] as string[];
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

  // 判断订单是否已完全送货（所有明细 delivered_qty >= quantity）
  const isItemFullyDelivered = (item: OrderItem): boolean => {
    // 已出库数量 >= 订单数量，或已开送货单数量 >= 订单数量
    const delivered = Number(item.delivered_qty || 0);
    const deliveryNoteQty = Number((item as unknown as Record<string, unknown>).delivery_note_qty || 0);
    const qty = Number(item.quantity || 0);
    return delivered >= qty || deliveryNoteQty >= qty;
  };

  const isOrderFullyDelivered = (order: Order): boolean => {
    const items = order.customer_order_items;
    if (!items || items.length === 0) return false;
    return items.every((item) => isItemFullyDelivered(item));
  };

  // 过滤：隐藏已送货时，按物料行级别过滤（已送货的物料行隐藏，未送货的仍显示）
  const filteredGrouped = Object.entries(groupedOrders).reduce<Record<string, Order[]>>(
    (acc, [customerId, customerOrders]) => {
      const filtered = customerOrders.map((o) => {
        if (!hideDelivered) return o;
        // 过滤掉已完全送货的物料行
        const filteredItems = o.customer_order_items?.filter((item) => !isItemFullyDelivered(item)) || [];
        return { ...o, customer_order_items: filteredItems };
      }).filter((o) => {
        // 如果订单的所有物料行都被过滤掉了，则隐藏整个订单
        if (o.customer_order_items && o.customer_order_items.length === 0) return false;
        if (filterStatus !== 'all' && o.status !== filterStatus) return false;
        if (filterCustomer !== 'all' && o.customer_id !== filterCustomer) return false;
        if (searchKeyword) {
          const kw = searchKeyword.toLowerCase();
          const matchOrder = o.order_no.toLowerCase().includes(kw) || (o.remark || '').toLowerCase().includes(kw);
          const matchItem = o.customer_order_items?.some((item) => {
            const prod = item.products as Record<string, unknown> | undefined;
            return (prod?.code as string || '').toLowerCase().includes(kw) || (prod?.name as string || '').toLowerCase().includes(kw);
          });
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
  const getScheduleDateRange = (todayStrParam: string): string[] => {
    const allDates: string[] = [];
    orders.forEach((o) => {
      o.customer_order_items?.forEach((item) => {
        item.customer_order_schedules?.forEach((s) => {
          if (s.schedule_date) allDates.push(s.schedule_date);
        });
      });
    });
    if (allDates.length === 0) {
      // todayStrParam 为空时返回空数组（SSR 阶段）
      if (!todayStrParam) return [];
      const now = new Date(todayStrParam);
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

  const dateRange = useMemo(() => getScheduleDateRange(today), [today, orders]);

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
    setFormDeliveryDeadline('');
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
      // 将图片转为 base64 发送
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          const base64 = result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
      });
      reader.readAsDataURL(file);
      const base64Data = await base64Promise;

      const res = await fetch('/api/orders/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64Data, mimeType: file.type }),
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

      // 自动填充交货期限
      if (data.delivery_deadline && !formDeliveryDeadline) {
        setFormDeliveryDeadline(data.delivery_deadline);
      }

      // 自动匹配并填充客户
      if (!formCustomerId && (data.customer_code || data.customer_name)) {
        const matched = customers.find((c) => {
          if (data.customer_code && c.code === data.customer_code) return true;
          if (data.customer_name && c.name === data.customer_name) return true;
          // 模糊匹配：客户编号或名称包含识别结果
          if (data.customer_code && c.code.toLowerCase().includes(data.customer_code.toLowerCase())) return true;
          if (data.customer_name && c.name.toLowerCase().includes(data.customer_name.toLowerCase())) return true;
          return false;
        });
        if (matched) {
          setFormCustomerId(matched.id);
          setFormCustomerSearch(matched.code);
        }
      }

      // 将识别到的物料匹配系统产品并填充明细（过滤掉LLM可能返回的空行）
      if (data.items && data.items.length > 0) {
        // 匹配函数：支持从描述中提取编码模糊匹配
        const matchProduct = (code: string, name: string) => {
          // 1. 精确匹配编码
          let match = products.find(
            (p) => p.code === code || p.code === code.replace(/\./g, '')
          );
          if (match) return match;
          // 2. 从物料名称/描述中提取编码格式（如 "外协-20.022.20.0047风轮组件/D260" → "20.022.20.0047"）
          const codePatterns = [
            ...(name.match(/\d{2}\.\d{2,3}\.\d{2}\.\d{4}/g) || []),
            ...(name.match(/\d{2}\.\d{2,3}\.\d{2}\.\d{2,3}/g) || []),
          ];
          for (const pattern of codePatterns) {
            match = products.find((p) => p.code === pattern);
            if (match) return match;
          }
          // 3. 从material_code本身提取编码格式
          const selfPatterns = [
            ...(code.match(/\d{2}\.\d{2,3}\.\d{2}\.\d{4}/g) || []),
            ...(code.match(/\d{2}\.\d{2,3}\.\d{2}\.\d{2,3}/g) || []),
          ];
          for (const pattern of selfPatterns) {
            match = products.find((p) => p.code === pattern);
            if (match) return match;
          }
          // 4. 模糊匹配：产品编码包含在物料名称中
          match = products.find((p) => p.code && name.includes(p.code));
          if (match) return match;
          return null;
        };

        const newItems = data.items
          .filter((item: { material_code: string; quantity: number }) => item.material_code || item.quantity > 0)
          .map((item: {
          material_code: string;
          material_name: string;
          quantity: number;
          unit: string;
          delivery_date: string;
        }) => {
          const matchedProduct = matchProduct(item.material_code, item.material_name || '');

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

        // 过滤掉 quantity 为 0 且无 product_id 的空行（新增订单时的默认空行）
        const filteredNewItems = newItems.filter((item: { product_id: string; quantity: number }) => item.product_id || item.quantity > 0);

        setFormItems((prev) => {
          // 如果之前只有空行（新增订单的默认状态），替换掉空行
          const hasExistingData = prev.some(item => item.product_id || item.quantity > 0);
          if (!hasExistingData) {
            return filteredNewItems;
          }
          // 否则追加到已有明细后面
          return [...prev, ...filteredNewItems];
        });

        // 设置产品搜索关键字（用于显示未匹配的产品编号）
        const newSearches: Record<number, string> = {};
        const newNameSearches: Record<number, string> = {};
        const startIndex = formItems.length;
        data.items.forEach((item: { material_code: string; material_name: string }, idx: number) => {
          const matchedProduct = matchProduct(item.material_code, item.material_name || '');
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
    setFormDeliveryDeadline(order.delivery_deadline || '');
    setFormRemark(order.remark || '');
    setFormItems(
      order.customer_order_items?.map((item) => ({
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.price,
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
      // 交货期限：优先使用手动填写的，否则从明细中取最早的交货日期
      delivery_deadline: formDeliveryDeadline || formItems.reduce((earliest: string | null, item) => {
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
      const data = await res.json().catch(() => ({}));
      const pushDown = (data as Record<string, unknown>)['_pushDown'] as {
        reserved?: Array<{ product_name: string; quantity: number }>;
        produced?: Array<{ product_name: string; quantity: number; production_order_id: string }>;
        shortage?: Array<{ product_name: string; required: number; available: number }>;
      } | undefined;

      if (pushDown && (pushDown.produced?.length || pushDown.reserved?.length || pushDown.shortage?.length)) {
        const lines: string[] = ['订单已保存，自动下推结果：'];
        if (pushDown.produced?.length) {
          lines.push(`\n生成生产订单 ${pushDown.produced.length} 条：`);
          pushDown.produced.forEach((p) => lines.push(`  - ${p.product_name} × ${p.quantity}`));
        }
        if (pushDown.reserved?.length) {
          lines.push(`\n预扣库存 ${pushDown.reserved.length} 项：`);
          pushDown.reserved.forEach((p) => lines.push(`  - ${p.product_name} × ${p.quantity}`));
        }
        if (pushDown.shortage?.length) {
          lines.push(`\n缺料 ${pushDown.shortage.length} 项：`);
          pushDown.shortage.forEach((p) => lines.push(`  - ${p.product_name}（需${p.required}，可用${p.available}）`));
        }
        alert(lines.join('\n'));
      }

      setIsFormOpen(false);
      loadData();
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.error || '保存失败，请检查数据后重试');
    }
  };

  // 删除订单
  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/orders?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setDeleteConfirm(null);
        loadData();
      } else {
        const data = await res.json();
        alert(data.error || '删除失败');
      }
    } catch {
      alert('删除失败，请重试');
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

  // 获取BOM父产品ID集合（有BOM的成品）
  const bomParentIds = new Set(bomData.map((b) => b.parent_product_id));

  // 追溯处理
  const handleTrace = async (orderId: string) => {
    setTraceOrderId(orderId);
    setTraceLoading(true);
    try {
      const res = await fetch(`/api/orders/trace?order_id=${orderId}`);
      const data = await res.json();
      if (data.error) {
        alert(data.error);
        setTraceOrderId(null);
      } else {
        setTraceData({
          order: data.order || {},
          production_orders: data.production_orders || [],
          delivery_notes: data.delivery_notes || [],
        });
      }
    } catch {
      alert('追溯查询失败');
      setTraceOrderId(null);
    }
    setTraceLoading(false);
  };

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
        delivery_date: formDeliveryDeadline || '',
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

  // 当交货期限改变时，自动填充到所有未填写交货日期的物料行
  const handleDeliveryDeadlineChange = (deadline: string) => {
    setFormDeliveryDeadline(deadline);
    if (deadline) {
      const updated = formItems.map((item) => ({
        ...item,
        delivery_date: item.delivery_date || deadline,
      }));
      setFormItems(updated);
    }
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
        <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none whitespace-nowrap">
          <input
            type="checkbox"
            checked={hideDelivered}
            onChange={(e) => setHideDelivered(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          隐藏已送货
        </label>

        <div className="flex items-center gap-2 ml-auto">
          <Button variant="outline" size="sm" onClick={expandAll}>全部展开</Button>
          <Button variant="outline" size="sm" onClick={collapseAll}>全部收缩</Button>
        </div>
      </div>

      {/* 统计 */}
      <div className="flex items-center gap-4 mb-4 text-sm text-gray-500">
        <span>订单总数：{Object.values(filteredGrouped).reduce((s, arr) => s + arr.length, 0)}</span>
        <span>客户数：{Object.keys(filteredGrouped).length}</span>
        <span>物料条目：{Object.values(filteredGrouped).reduce((s, arr) => s + arr.reduce((s2, o) => s2 + (o.customer_order_items?.length || 0), 0), 0)}</span>
        {hideDelivered && (() => {
          const hiddenItems = orders.reduce((count, o) => 
            count + (o.customer_order_items?.filter(i => isItemFullyDelivered(i))?.length || 0), 0);
          return hiddenItems > 0 ? (
            <span className="text-gray-400">（已隐藏 {hiddenItems} 条已送货物料）</span>
          ) : null;
        })()}
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
                            const isDeadlinePast = order.delivery_deadline && order.delivery_deadline < today;
                            const isDeadlineSoon = order.delivery_deadline &&
                              !isDeadlinePast &&
                              new Date(order.delivery_deadline).getTime() - new Date(today).getTime() < 7 * 24 * 60 * 60 * 1000;

                            return (
                              <tr
                                key={`${order.id}-${item.id || itemIdx}`}
                                className="border-b border-gray-100 hover:bg-gray-50"
                              >
                                {/* 单据编号 + 总金额 - 同一订单只显示一次 */}
                                <td className="px-3 py-2 font-mono text-xs sticky left-0 bg-white z-[5]">
                                  {itemIdx === 0 ? (
                                    <div>
                                      <div>{order.order_no}</div>
                                      {(() => {
                                        const total = order.customer_order_items?.reduce((sum: number, i: OrderItem) => sum + (i.quantity || 0) * (i.price || 0), 0) || 0;
                                        return total > 0 ? <div className="text-orange-600 font-sans font-medium text-xs mt-0.5">¥{total.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div> : null;
                                      })()}
                                    </div>
                                  ) : null}
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
                                  <div className="flex items-center justify-center gap-1">
                                    {item.quantity - (item.delivered_qty || 0)}
                                    {Number((item as unknown as Record<string, unknown>).delivery_note_qty || 0) > 0 && Number(item.delivered_qty || 0) === 0 && (
                                      <span className="text-[10px] text-blue-500 font-sans">(已开单)</span>
                                    )}
                                  </div>
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
                                      <button
                                        onClick={() => handleTrace(order.id)}
                                        className="px-2 py-0.5 text-xs bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded flex items-center gap-1"
                                        title="查看订单生产流程追溯"
                                      >
                                        <History className="w-3 h-3" />
                                        追溯
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
        <DialogContent className="max-w-none" style={{ width: 'auto', minWidth: '900px', maxWidth: '98vw' }}>
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
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">交货期限</label>
                <Input
                  type="date"
                  value={formDeliveryDeadline}
                  onChange={(e) => handleDeliveryDeadlineChange(e.target.value)}
                  placeholder="填写后自动填充到物料行"
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
              <div className="grid grid-cols-[2fr_2.5fr_100px_120px_160px_40px_40px] gap-3 mb-2 px-1">
                <span className="text-xs text-gray-500 font-medium">物料编码</span>
                <span className="text-xs text-gray-500 font-medium">物料名称</span>
                <span className="text-xs text-gray-500 font-medium">数量</span>
                <span className="text-xs text-gray-500 font-medium">单价</span>
                <span className="text-xs text-gray-500 font-medium">交货日期</span>
                <span></span>
                <span></span>
              </div>

              {formItems.map((item, itemIdx) => (
                <div key={itemIdx} className="grid grid-cols-[2fr_2.5fr_100px_120px_160px_40px_40px] gap-3 items-center mb-3">
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
                        // 聚焦时将当前产品编码填入搜索框，同时显示下拉列表方便重新选择
                        if (item.product_id) {
                          const p = products.find((p) => p.id === item.product_id);
                          if (p) {
                            setItemSearches((prev) => ({ ...prev, [itemIdx]: p.code }));
                          }
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
                    {itemSearches[itemIdx] && (
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
                        // 聚焦时将当前产品名称填入搜索框，方便重新搜索
                        if (item.product_id) {
                          const p = products.find((p) => p.id === item.product_id);
                          if (p) {
                            setItemNameSearches((prev) => ({ ...prev, [itemIdx]: p.name }));
                          }
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
                    {itemNameSearches[itemIdx] && (
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

      {/* 追溯对话框 */}
      <Dialog open={!!traceOrderId} onOpenChange={(open) => { if (!open) { setTraceOrderId(null); setTraceData(null); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5 text-indigo-600" />
              订单追溯
            </DialogTitle>
          </DialogHeader>
          {traceLoading ? (
            <div className="py-8 text-center text-gray-400">加载中...</div>
          ) : traceData ? (
            <div className="space-y-5 max-h-[70vh] overflow-y-auto">
              {/* 订单基本信息 */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-indigo-500" />
                  客户订单
                </h4>
                <div className="bg-gray-50 rounded-lg p-3 text-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <div><span className="text-gray-500">订单号：</span><span className="font-mono font-medium">{(traceData.order as Record<string, unknown>).order_no as string}</span></div>
                    <div><span className="text-gray-500">客户：</span>{((traceData.order as Record<string, unknown>).customers as Record<string, string>)?.name || '-'}</div>
                    <div><span className="text-gray-500">状态：</span>
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${STATUS_MAP[(traceData.order as Record<string, unknown>).status as string]?.color || 'bg-gray-100 text-gray-700'}`}>
                        {STATUS_MAP[(traceData.order as Record<string, unknown>).status as string]?.label || (traceData.order as Record<string, unknown>).status as string}
                      </span>
                    </div>
                    <div><span className="text-gray-500">交货期限：</span>{((traceData.order as Record<string, unknown>).delivery_deadline as string) || '-'}</div>
                  </div>
                  {/* 订单物料明细 */}
                  {Array.isArray((traceData.order as Record<string, unknown>).customer_order_items) && (
                    <table className="w-full text-xs mt-3 border border-gray-200 rounded">
                      <thead>
                        <tr className="bg-white">
                          <th className="px-2 py-1.5 text-left font-medium text-gray-500">物料编码</th>
                          <th className="px-2 py-1.5 text-left font-medium text-gray-500">物料名称</th>
                          <th className="px-2 py-1.5 text-right font-medium text-gray-500">数量</th>
                          <th className="px-2 py-1.5 text-right font-medium text-gray-500">已交</th>
                          <th className="px-2 py-1.5 text-right font-medium text-gray-500">未交</th>
                        </tr>
                      </thead>
                      <tbody>
                        {((traceData.order as Record<string, unknown>).customer_order_items as Array<Record<string, unknown>>).map((item, i) => {
                          const prod = item.products as Record<string, unknown> | null;
                          return (
                            <tr key={i} className="border-t border-gray-100">
                              <td className="px-2 py-1.5 font-mono">{(prod?.code as string) || '-'}</td>
                              <td className="px-2 py-1.5">{(prod?.name as string) || '-'}</td>
                              <td className="px-2 py-1.5 text-right font-mono">{Number(item.quantity || 0)}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-green-700">{Number(item.delivered_qty || 0)}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-yellow-700">{Number(item.quantity || 0) - Number(item.delivered_qty || 0)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* 关联生产订单 */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  生产订单
                  <span className="text-xs text-gray-400 ml-1">({traceData.production_orders?.length || 0})</span>
                </h4>
                {(traceData.production_orders?.length || 0) === 0 ? (
                  <p className="text-xs text-gray-400 py-2 pl-4">无关联生产订单</p>
                ) : (
                  <table className="w-full text-xs border border-gray-200 rounded">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-2 py-1.5 text-left font-medium text-gray-500">生产单号</th>
                        <th className="px-2 py-1.5 text-left font-medium text-gray-500">产品</th>
                        <th className="px-2 py-1.5 text-right font-medium text-gray-500">数量</th>
                        <th className="px-2 py-1.5 text-center font-medium text-gray-500">状态</th>
                        <th className="px-2 py-1.5 text-left font-medium text-gray-500">交期</th>
                      </tr>
                    </thead>
                    <tbody>
                      {traceData.production_orders?.map((po, i) => {
                        const prod = po.products as Record<string, unknown> | null;
                        const poStatusMap: Record<string, { label: string; color: string }> = {
                          pending: { label: '待生产', color: 'text-amber-700 border-amber-300' },
                          in_progress: { label: '生产中', color: 'text-blue-700 border-blue-300' },
                          completed: { label: '已完成', color: 'text-green-700 border-green-300' },
                          cancelled: { label: '已取消', color: 'text-red-600 border-red-300' },
                        };
                        const poStatus = poStatusMap[po.status as string] || { label: po.status as string, color: 'text-gray-600 border-gray-300' };
                        return (
                          <tr key={i} className="border-t border-gray-100">
                            <td className="px-2 py-1.5 font-mono">{po.order_no as string}</td>
                            <td className="px-2 py-1.5">{(prod?.name as string) || '-'}</td>
                            <td className="px-2 py-1.5 text-right font-mono">{Number(po.quantity || 0)}</td>
                            <td className="px-2 py-1.5 text-center">
                              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${poStatus.color}`}>{poStatus.label}</Badge>
                            </td>
                            <td className="px-2 py-1.5 text-gray-500">{po.due_date ? String(po.due_date).slice(0, 10) : '-'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {/* 关联送货单 */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  送货单
                  <span className="text-xs text-gray-400 ml-1">({traceData.delivery_notes?.length || 0})</span>
                </h4>
                {(traceData.delivery_notes?.length || 0) === 0 ? (
                  <p className="text-xs text-gray-400 py-2 pl-4">无关联送货单</p>
                ) : (
                  <div className="space-y-2">
                    {traceData.delivery_notes?.map((dn, i) => {
                      const dnStatus = dn.status as string;
                      const statusLabel = dnStatus === 'shipped' ? '已发货' : dnStatus === 'draft' ? '草稿' : dnStatus;
                      const statusColor = dnStatus === 'shipped' ? 'text-green-700 border-green-300 bg-green-50' : 'text-gray-600 border-gray-300 bg-gray-50';
                      return (
                        <div key={i} className="bg-gray-50 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-mono text-xs font-medium">{dn.note_no as string}</span>
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${statusColor}`}>{statusLabel}</Badge>
                          </div>
                          <div className="text-xs text-gray-500 mb-1">送货日期：{dn.delivery_date ? String(dn.delivery_date).slice(0, 10) : '-'}</div>
                          {Array.isArray(dn.delivery_note_items) && (dn.delivery_note_items as Array<Record<string, unknown>>).length > 0 && (
                            <table className="w-full text-xs border border-gray-200 rounded bg-white">
                              <thead>
                                <tr>
                                  <th className="px-2 py-1 text-left font-medium text-gray-500">物料</th>
                                  <th className="px-2 py-1 text-right font-medium text-gray-500">数量</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(dn.delivery_note_items as Array<Record<string, unknown>>).map((item, j) => {
                                  const itemProd = item.products as Record<string, unknown> | null;
                                  return (
                                    <tr key={j} className="border-t border-gray-100">
                                      <td className="px-2 py-1">{(itemProd?.name as string) || '-'}</td>
                                      <td className="px-2 py-1 text-right font-mono">{Number(item.quantity || 0)}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 流程时间线 */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-gray-500" />
                  流程时间线
                </h4>
                <div className="pl-4 space-y-3">
                  {/* 订单创建 */}
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="w-2 h-2 rounded-full bg-indigo-500" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-800">创建客户订单</div>
                      <div className="text-xs text-gray-400">{(traceData.order as Record<string, unknown>).order_no as string} · {((traceData.order as Record<string, unknown>).created_at as string)?.slice(0, 10) || '-'}</div>
                    </div>
                  </div>
                  {/* 下推 */}
                  {traceData.production_orders?.length > 0 && (
                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="w-2 h-2 rounded-full bg-blue-500" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-800">下推生成生产订单</div>
                        <div className="text-xs text-gray-400">{traceData.production_orders?.map(po => po.order_no as string).join('、')}</div>
                      </div>
                    </div>
                  )}
                  {/* 生产完成 */}
                  {traceData.production_orders?.some(po => po.status === 'completed') && (
                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="w-2 h-2 rounded-full bg-green-500" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-800">生产完成入库</div>
                        <div className="text-xs text-gray-400">
                          {traceData.production_orders?.filter(po => po.status === 'completed').map(po => `${po.order_no as string}${po.completed_at ? ' · ' + String(po.completed_at).slice(0, 10) : ''}`).join('、')}
                        </div>
                      </div>
                    </div>
                  )}
                  {/* 送货 */}
                  {traceData.delivery_notes?.length > 0 && (
                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-800">创建送货单出库</div>
                        <div className="text-xs text-gray-400">
                          {traceData.delivery_notes?.map(dn => `${dn.note_no as string}${dn.delivery_date ? ' · ' + String(dn.delivery_date).slice(0, 10) : ''}`).join('、')}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setTraceOrderId(null); setTraceData(null); }}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
