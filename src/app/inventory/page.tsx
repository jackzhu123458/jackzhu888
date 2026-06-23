'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { translateUnit } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowDownCircle, ArrowUpCircle, MapPin, Info, Pencil, ChevronRight, ChevronDown, Package } from 'lucide-react';

// 库位号颜色配置 - A~F 各区域独立配色
const LOCATION_COLORS: Record<string, { bg: string; text: string; border: string; light: string; desc: string }> = {
  A: { bg: 'bg-red-500', text: 'text-white', border: 'border-red-500', light: 'bg-red-50 text-red-700 border-red-200', desc: 'A区 - 靠近出货口' },
  B: { bg: 'bg-orange-500', text: 'text-white', border: 'border-orange-500', light: 'bg-orange-50 text-orange-700 border-orange-200', desc: 'B区 - 次靠近出货口' },
  C: { bg: 'bg-amber-500', text: 'text-white', border: 'border-amber-500', light: 'bg-amber-50 text-amber-700 border-amber-200', desc: 'C区 - 中间区域' },
  D: { bg: 'bg-emerald-500', text: 'text-white', border: 'border-emerald-500', light: 'bg-emerald-50 text-emerald-700 border-emerald-200', desc: 'D区 - 远离出货口' },
  E: { bg: 'bg-blue-500', text: 'text-white', border: 'border-blue-500', light: 'bg-blue-50 text-blue-700 border-blue-200', desc: 'E区 - 仓储区' },
  F: { bg: 'bg-purple-500', text: 'text-white', border: 'border-purple-500', light: 'bg-purple-50 text-purple-700 border-purple-200', desc: 'F区 - 备用区' },
};

function getLocationColor(loc: string) {
  const key = loc.toUpperCase().charAt(0);
  return LOCATION_COLORS[key] || null;
}

interface Warehouse {
  id: string;
  name: string;
  type?: string;
}

interface InventoryRecord {
  id: string;
  warehouse_id: string;
  warehouse_name: string;
  warehouse_type: string;
  quantity: number;
  reserved_qty: number;
  available: number;
  location_no: string;
}

interface InventorySummary {
  product_id: string;
  product_code: string;
  product_name: string;
  product_spec: string | null;
  product_unit: string;
  product_category: string | null;
  product_type: string | null;
  product_price: number;
  product_location_no: string;
  total_quantity: number;
  total_reserved: number;
  total_available: number;
  inventory_records: InventoryRecord[];
}

interface Transaction {
  id: string;
  date: string;
  type: 'inbound' | 'outbound';
  note_no: string;
  quantity: number;
  warehouse: string;
  remark: string | null;
  related_order: string | null;
}

// 热力图数据类型
interface HeatmapLocation {
  inventory_id: string;
  product_id: string;
  product_code: string;
  product_name: string;
  location_no: string;
  quantity: number;
  reserved_qty: number;
  turnover: number;
  turnover_in: number;
  turnover_out: number;
}

interface HeatmapWarehouse {
  warehouse_id: string;
  warehouse_name: string;
  warehouse_type: string;
  warehouse_location: string | null;
  total_items: number;
  total_quantity: number;
  max_turnover: number;
  locations: HeatmapLocation[];
}

// FIFO数据类型
interface FifoLayer {
  date: string;
  note_no: string;
  batch_qty: number;
  consumed: number;
  remaining: number;
  age_days: number;
  type: string;
}

interface FifoItem {
  inventory_id: string;
  product_id: string;
  product_code: string;
  product_name: string;
  product_unit: string;
  warehouse_id: string;
  warehouse_name: string;
  location_no: string;
  quantity: number;
  reserved_qty: number;
  avg_age_days: number;
  max_age_days: number;
  layers: FifoLayer[];
  last_in_date: string | null;
  last_out_date: string | null;
}

// 趋势数据类型
interface TrendPoint {
  date: string;
  inbound: number;
  outbound: number;
  stock: number;
}

interface TrendData {
  days: number;
  current_total: number;
  total_inbound: number;
  total_outbound: number;
  trend: TrendPoint[];
}

// BOM子物料数据
interface BOMChild {
  child_product_id: string;
  quantity: number;
  child_code: string;
  child_name: string;
  child_unit: string;
  child_type: string | null;
  child_category: string | null;
}

type TabKey = 'inventory' | 'heatmap' | 'fifo' | 'trend';

// 产品类型定义
const PRODUCT_TYPES: { value: string; label: string; color: string }[] = [
  { value: 'finished', label: '成品', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  { value: 'semi_finished', label: '半成品', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  { value: 'raw_material', label: '原材料', color: 'bg-orange-100 text-orange-700 border-orange-200' },
  { value: 'component', label: '配件/外购', color: 'bg-green-100 text-green-700 border-green-200' },
  { value: 'other', label: '其他', color: 'bg-gray-100 text-gray-700 border-gray-200' },
];

function getProductTypeLabel(type: string | null): { label: string; color: string } {
  const found = PRODUCT_TYPES.find(t => t.value === type);
  return found ? { label: found.label, color: found.color } : { label: '其他', color: 'bg-gray-100 text-gray-700 border-gray-200' };
}

export default function InventoryPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('inventory');
  const [inventory, setInventory] = useState<InventorySummary[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [warehouseType, setWarehouseType] = useState<string>('all');
  const [productType, setProductType] = useState<string>('all');

  // BOM展开状态
  const [expandedBom, setExpandedBom] = useState<Set<string>>(new Set());
  const [bomData, setBomData] = useState<Record<string, BOMChild[]>>({});
  const [bomLoading, setBomLoading] = useState<Set<string>>(new Set());

  // 进出记录弹窗状态
  const [txProductId, setTxProductId] = useState('');
  const [txProductName, setTxProductName] = useState('');
  const [txProductCode, setTxProductCode] = useState('');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [txLoading, setTxLoading] = useState(false);

  // 库位号编辑状态
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null);
  const [editingLocationValue, setEditingLocationValue] = useState('');

  // 数量编辑状态
  const [editingQtyId, setEditingQtyId] = useState<string | null>(null);
  const [editingQtyField, setEditingQtyField] = useState<'quantity' | 'reserved_qty'>('quantity');
  const [editingQtyValue, setEditingQtyValue] = useState('');

  // 库位号导入状态
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<{ success: boolean; message: string } | null>(null);

  // 热力图数据
  const [heatmapData, setHeatmapData] = useState<HeatmapWarehouse[]>([]);
  const [heatmapLoading, setHeatmapLoading] = useState(false);

  // FIFO数据
  const [fifoData, setFifoData] = useState<FifoItem[]>([]);
  const [fifoLoading, setFifoLoading] = useState(false);
  const [fifoExpandId, setFifoExpandId] = useState<string | null>(null);

  // 趋势数据
  const [trendData, setTrendData] = useState<TrendData | null>(null);
  const [trendLoading, setTrendLoading] = useState(false);
  const [trendDays, setTrendDays] = useState(30);

  const loadInventory = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/inventory');
    const data = await res.json();
    if (data.items) {
      setInventory(data.items);
      setWarehouses(data.warehouses || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadInventory(); }, [loadInventory]);

  // 切换BOM展开/折叠
  const toggleBom = useCallback(async (productId: string) => {
    if (expandedBom.has(productId)) {
      setExpandedBom(prev => { const next = new Set(prev); next.delete(productId); return next; });
      return;
    }
    // 展开：加载BOM子物料
    setExpandedBom(prev => new Set(prev).add(productId));
    if (bomData[productId]) return; // 已缓存

    setBomLoading(prev => new Set(prev).add(productId));
    try {
      const res = await fetch(`/api/bom?parent_product_id=${productId}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setBomData(prev => ({ ...prev, [productId]: data }));
      } else {
        setBomData(prev => ({ ...prev, [productId]: [] }));
      }
    } catch {
      setBomData(prev => ({ ...prev, [productId]: [] }));
    }
    setBomLoading(prev => { const next = new Set(prev); next.delete(productId); return next; });
  }, [expandedBom, bomData]);

  // 加载物料进出记录
  const loadTransactions = useCallback(async (productId: string, productCode: string, productName: string) => {
    setTxProductId(productId);
    setTxProductCode(productCode);
    setTxProductName(productName);
    setTxLoading(true);
    try {
      const res = await fetch(`/api/inventory/transactions?product_id=${productId}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setTransactions(data);
      } else {
        setTransactions([]);
      }
    } catch {
      setTransactions([]);
    }
    setTxLoading(false);
  }, []);

  // 保存库位号（更新产品表）
  const saveLocationNo = useCallback(async (productId: string, locationNo: string) => {
    try {
      await fetch('/api/products', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: productId, location_no: locationNo }),
      });
      setInventory(prev => prev.map(item =>
        item.product_id === productId ? { ...item, product_location_no: locationNo } : item
      ));
    } catch {
      // 失败时静默回退
    }
    setEditingLocationId(null);
  }, []);

  // 保存数量修改（如果有库存记录则更新，否则创建）
  const saveQty = useCallback(async (recordId: string | null, productId: string, warehouseId: string | null, field: 'quantity' | 'reserved_qty', value: string) => {
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue < 0) {
      setEditingQtyId(null);
      return;
    }
    try {
      if (recordId) {
        // 更新已有库存记录
        const res = await fetch('/api/inventory', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: recordId, [field]: numValue }),
        });
        if (res.ok) {
          setInventory(prev => prev.map(item => {
            if (item.product_id !== productId) return item;
            return {
              ...item,
              inventory_records: item.inventory_records.map(r =>
                r.id === recordId ? { ...r, [field]: numValue, available: r.quantity - r.reserved_qty } : r
              ),
              total_quantity: item.inventory_records.reduce((s, r) => s + (r.id === recordId ? (field === 'quantity' ? numValue : r.quantity) : r.quantity), 0),
              total_reserved: item.inventory_records.reduce((s, r) => s + (r.id === recordId ? (field === 'reserved_qty' ? numValue : r.reserved_qty) : r.reserved_qty), 0),
            };
          }));
        }
      } else {
        // 创建新库存记录（产品还没有库存记录时）
        // 如果没有指定仓库，默认使用第一个非虚拟仓库
        let targetWarehouseId = warehouseId;
        if (!targetWarehouseId) {
          const productItem = inventory.find(i => i.product_id === productId);
          const defaultWarehouse = warehouses.find(w => w.type !== 'virtual');
          targetWarehouseId = defaultWarehouse?.id || warehouses[0]?.id || '';
        }
        if (targetWarehouseId) {
          const res = await fetch('/api/inventory', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ product_id: productId, warehouse_id: targetWarehouseId, [field]: numValue }),
          });
          if (res.ok) {
            loadInventory();
          }
        }
      }
    } catch {
      // 失败时静默回退
    }
    setEditingQtyId(null);
  }, [loadInventory]);

  // 开始编辑库位号
  const startEditLocation = useCallback((item: InventorySummary) => {
    setEditingLocationId(item.product_id);
    setEditingLocationValue(item.product_location_no || '');
  }, []);

  // 导入库位号Excel
  const handleImportLocations = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportLoading(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/inventory/import-locations', { method: 'POST', body: formData });
      const data = await res.json();
      setImportResult({ success: !!data.success, message: data.message || data.error || '导入失败' });
      if (data.success) loadInventory();
    } catch {
      setImportResult({ success: false, message: '导入失败，请检查文件格式' });
    }
    setImportLoading(false);
    // 清空input值，允许重复选择同一文件
    e.target.value = '';
  }, [loadInventory]);

  // 加载热力图数据
  const loadHeatmap = useCallback(async () => {
    setHeatmapLoading(true);
    try {
      const res = await fetch('/api/inventory/stats?type=heatmap');
      const data = await res.json();
      if (Array.isArray(data)) setHeatmapData(data);
    } catch { /* ignore */ }
    setHeatmapLoading(false);
  }, []);

  // 加载FIFO数据
  const loadFifo = useCallback(async () => {
    setFifoLoading(true);
    try {
      const res = await fetch('/api/inventory/stats?type=fifo');
      const data = await res.json();
      if (Array.isArray(data)) setFifoData(data);
    } catch { /* ignore */ }
    setFifoLoading(false);
  }, []);

  // 加载趋势数据
  const loadTrend = useCallback(async (days: number) => {
    setTrendLoading(true);
    try {
      const res = await fetch(`/api/inventory/stats?type=trend&days=${days}`);
      const data = await res.json();
      if (data.trend) setTrendData(data);
    } catch { /* ignore */ }
    setTrendLoading(false);
  }, []);

  // 切换Tab时自动加载数据
  useEffect(() => {
    if (activeTab === 'heatmap' && heatmapData.length === 0) loadHeatmap();
    if (activeTab === 'fifo' && fifoData.length === 0) loadFifo();
    if (activeTab === 'trend' && !trendData) loadTrend(trendDays);
  }, [activeTab, heatmapData.length, fifoData.length, trendData, loadHeatmap, loadFifo, loadTrend, trendDays]);

  const filteredInventory = (() => {
    let result = inventory;
    if (warehouseType !== 'all') {
      result = result.filter(item =>
        item.inventory_records.some(r => r.warehouse_type === warehouseType)
      );
    }
    if (productType !== 'all') {
      result = result.filter(item => item.product_type === productType);
    }
    if (keyword) {
      const kw = keyword.toLowerCase();
      result = result.filter(
        (item) =>
          item.product_code?.toLowerCase().includes(kw) ||
          item.product_name?.toLowerCase().includes(kw) ||
          (item.product_location_no && item.product_location_no.toLowerCase().includes(kw))
      );
    }
    return result;
  })();

  // 转换为旧的汇总格式，保持表格渲染逻辑不变
  const summaryMap = new Map<string, {
    product: { id: string; code: string; name: string; unit: string; type: string | null; location_no?: string; [key: string]: unknown };
    product_location_no: string;
    totalQty: number;
    totalReserved: number;
    warehouses: Array<{
      inventoryId: string;
      warehouseId: string;
      name: string;
      qty: string;
      reserved: string;
      locationNo: string | null;
    }>;
  }>();
  filteredInventory.forEach((item) => {
    const key = item.product_id;
    const product = {
      id: item.product_id,
      code: item.product_code,
      name: item.product_name,
      unit: item.product_unit,
      location_no: item.product_location_no,
      type: item.product_type || '',
    };
    summaryMap.set(key, {
      product,
      product_location_no: item.product_location_no || '',
      totalQty: item.total_quantity,
      totalReserved: item.total_reserved,
      warehouses: item.inventory_records.map(r => ({
        inventoryId: r.id,
        warehouseId: r.warehouse_id,
        name: r.warehouse_name,
        qty: r.quantity.toString(),
        reserved: r.reserved_qty.toString(),
        locationNo: r.location_no,
      })),
    });
  });

  const totalIn = transactions.filter(t => t.type === 'inbound').reduce((s, t) => s + t.quantity, 0);
  const totalOut = transactions.filter(t => t.type === 'outbound').reduce((s, t) => s + t.quantity, 0);

  // 热力图颜色计算
  const getHeatColor = (turnover: number, maxTurnover: number) => {
    if (maxTurnover === 0) return 'bg-gray-100';
    const ratio = turnover / maxTurnover;
    if (ratio === 0) return 'bg-gray-100';
    if (ratio < 0.2) return 'bg-blue-100';
    if (ratio < 0.4) return 'bg-blue-200';
    if (ratio < 0.6) return 'bg-blue-300';
    if (ratio < 0.8) return 'bg-orange-300';
    return 'bg-red-400';
  };

  const getHeatTextColor = (turnover: number, maxTurnover: number) => {
    if (maxTurnover === 0) return 'text-gray-400';
    const ratio = turnover / maxTurnover;
    if (ratio >= 0.8) return 'text-white';
    return 'text-gray-800';
  };

  // FIFO库龄颜色
  const getAgeColor = (days: number) => {
    if (days <= 7) return 'text-green-600';
    if (days <= 14) return 'text-yellow-600';
    if (days <= 30) return 'text-orange-600';
    return 'text-red-600';
  };

  const getAgeBg = (days: number) => {
    if (days <= 7) return 'bg-green-50';
    if (days <= 14) return 'bg-yellow-50';
    if (days <= 30) return 'bg-orange-50';
    return 'bg-red-50';
  };

  // 趋势图参数
  const trendChartWidth = 900;
  const trendChartHeight = 300;
  const trendPadding = { top: 20, right: 20, bottom: 40, left: 60 };

  const trendChartParams = useMemo(() => {
    if (!trendData || trendData.trend.length === 0) return null;
    const data = trendData.trend;
    const maxVal = Math.max(
      ...data.map(d => Math.max(d.inbound, d.outbound, d.stock)),
      1
    );
    const chartW = trendChartWidth - trendPadding.left - trendPadding.right;
    const chartH = trendChartHeight - trendPadding.top - trendPadding.bottom;
    const xStep = data.length > 1 ? chartW / (data.length - 1) : chartW;

    const toX = (i: number) => trendPadding.left + i * xStep;
    const toY = (v: number) => trendPadding.top + chartH - (v / maxVal) * chartH;

    // 计算折线路径
    const makePath = (field: 'inbound' | 'outbound' | 'stock') => {
      return data.map((d, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(d[field]).toFixed(1)}`).join(' ');
    };

    // 填充区域路径
    const makeArea = (field: 'inbound' | 'outbound' | 'stock') => {
      const baseline = toY(0);
      const line = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(d[field]).toFixed(1)}`).join(' ');
      return `${line} L${toX(data.length - 1).toFixed(1)},${baseline} L${toX(0).toFixed(1)},${baseline} Z`;
    };

    // Y轴刻度
    const yTicks = 5;
    const yTickValues = Array.from({ length: yTicks + 1 }, (_, i) => Math.round(maxVal * i / yTicks));

    // X轴标签（每隔若干个显示）
    const xLabelInterval = Math.max(1, Math.floor(data.length / 10));

    return { toX, toY, maxVal, chartW, chartH, makePath, makeArea, yTickValues, xLabelInterval, data };
  }, [trendData]);

  // Tab配置
  const tabs: { key: TabKey; label: string }[] = [
    { key: 'inventory', label: '库存列表' },
    { key: 'heatmap', label: '库位热力图' },
    { key: 'fifo', label: 'FIFO先进先出' },
    { key: 'trend', label: '收发存趋势' },
  ];

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900">库存管理</h1>
      </div>

      {/* Tab切换 */}
      <div className="flex border-b border-gray-200 mb-4">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 库存列表Tab */}
      {activeTab === 'inventory' && (
        <>
          <div className="flex items-center gap-4 mb-2">
            <Input
              placeholder="搜索物料编码、名称或库位号..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="w-80"
            />
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 mr-1">仓库:</span>
              {(['all', 'raw_material', 'product'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setWarehouseType(type)}
                  className={`px-3 py-1.5 text-sm rounded-md border ${
                    warehouseType === type
                      ? type === 'raw_material' ? 'bg-orange-600 text-white border-orange-600' : type === 'product' ? 'bg-blue-600 text-white border-blue-600' : 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {type === 'all' ? '全部仓库' : type === 'raw_material' ? '原材料仓库' : '产品仓库'}
                </button>
              ))}
            </div>
            <div className="flex-1" />
            <label className={`inline-flex items-center gap-2 px-4 py-2 text-sm rounded-md border cursor-pointer ${
              importLoading ? 'bg-gray-100 text-gray-400 border-gray-200' : 'bg-white text-blue-600 border-blue-300 hover:bg-blue-50'
            }`}>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              {importLoading ? '导入中...' : '导入库位号'}
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={handleImportLocations}
                disabled={importLoading}
              />
            </label>
          </div>
          {/* 产品类型筛选 */}
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs text-gray-400 mr-1">产品类型:</span>
            <button
              onClick={() => setProductType('all')}
              className={`px-3 py-1.5 text-sm rounded-md border ${
                productType === 'all' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              全部类型
            </button>
            {PRODUCT_TYPES.map((pt) => (
              <button
                key={pt.value}
                onClick={() => setProductType(pt.value)}
                className={`px-3 py-1.5 text-sm rounded-md border ${
                  productType === pt.value ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {pt.label}
              </button>
            ))}
          </div>
          {importResult && (
            <div className={`mb-4 px-4 py-2.5 rounded-md text-sm flex items-center justify-between ${
              importResult.success ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              <span>{importResult.message}</span>
              <button onClick={() => setImportResult(null)} className="text-gray-400 hover:text-gray-600 ml-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          )}

          {/* 库位号图例说明 */}
          <div className="bg-white rounded-lg border border-gray-200 p-3 mb-3">
            <div className="flex items-center gap-2 mb-2">
              <Info className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-600">库位号说明</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(LOCATION_COLORS).map(([key, color]) => (
                <div key={key} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm font-bold ${color.light}`}>
                  <span className={`inline-flex items-center justify-center w-7 h-7 rounded text-lg font-black ${color.bg} ${color.text}`}>{key}</span>
                  <span className="text-xs font-normal whitespace-nowrap">{color.desc}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/50">
                  <th className="text-left px-3 py-3 font-medium text-gray-500 w-8"></th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">物料编码</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">物料名称</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">类型</th>
                  <th className="text-right px-5 py-3 font-medium text-gray-500">总库存 <span className="text-blue-400 font-normal text-xs">[可编辑]</span></th>
                  <th className="text-right px-5 py-3 font-medium text-gray-500">预留量 <span className="text-blue-400 font-normal text-xs">[可编辑]</span></th>
                  <th className="text-right px-5 py-3 font-medium text-gray-500">可用量</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">单位</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">库位号</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">仓库明细</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={10} className="px-5 py-12 text-center text-gray-400">加载中...</td></tr>
                ) : filteredInventory.length === 0 ? (
                  <tr><td colSpan={10} className="px-5 py-12 text-center text-gray-400">暂无库存数据</td></tr>
                ) : (
                  Array.from(summaryMap.entries()).map(([productId, summary]) => {
                    const locationNos = summary.warehouses.map(w => w.locationNo).filter(Boolean);
                    const isExpanded = expandedBom.has(productId);
                    const childItems = bomData[productId];
                    const isLoadingBom = bomLoading.has(productId);
                    const productType = (summary.product as Record<string, unknown>).type as string | null;
                    const typeInfo = getProductTypeLabel(productType);
                    const hasBomIndicator = productType === 'finished' || productType === 'semi_finished';

                    return (
                      <React.Fragment key={productId}>
                        <tr className="border-b border-gray-50 hover:bg-gray-50/50">
                          {/* BOM展开按钮 */}
                          <td className="px-3 py-3">
                            {hasBomIndicator ? (
                              <button
                                className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 text-gray-400 hover:text-blue-600 cursor-pointer"
                                onClick={() => toggleBom(productId)}
                                title={isExpanded ? '折叠BOM子物料' : '展开BOM子物料'}
                              >
                                {isLoadingBom ? (
                                  <span className="text-xs text-gray-300">...</span>
                                ) : isExpanded ? (
                                  <ChevronDown className="w-4 h-4" />
                                ) : (
                                  <ChevronRight className="w-4 h-4" />
                                )}
                              </button>
                            ) : null}
                          </td>
                          <td className="px-5 py-3">
                            <button
                              className="font-mono text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                              onClick={() => loadTransactions(productId, summary.product.code, summary.product.name)}
                              title="点击查看进出记录"
                            >
                              {summary.product.code}
                            </button>
                          </td>
                          <td className="px-5 py-3 text-gray-900">{summary.product.name}</td>
                          <td className="px-5 py-3">
                            <span className={`inline-flex px-2 py-0.5 rounded text-xs border ${typeInfo.color}`}>
                              {typeInfo.label}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right">
                            {editingQtyId === `qty-${productId}` && editingQtyField === 'quantity' ? (
                              <Input
                                autoFocus
                                type="number"
                                step="0.01"
                                min="0"
                                value={editingQtyValue}
                                onChange={(e) => setEditingQtyValue(e.target.value)}
                                onBlur={() => saveQty(summary.warehouses[0]?.inventoryId || null, productId, summary.warehouses[0]?.warehouseId || null, 'quantity', editingQtyValue)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') saveQty(summary.warehouses[0]?.inventoryId || null, productId, summary.warehouses[0]?.warehouseId || null, 'quantity', editingQtyValue);
                                  if (e.key === 'Escape') setEditingQtyId(null);
                                }}
                                className="h-7 w-24 text-right font-mono text-sm"
                              />
                            ) : (
                              <button
                                className="font-mono font-medium text-gray-900 hover:text-blue-600 cursor-pointer inline-flex items-center gap-1"
                                onClick={() => {
                                  setEditingQtyId(`qty-${productId}`);
                                  setEditingQtyField('quantity');
                                  setEditingQtyValue(summary.totalQty.toFixed(2));
                                }}
                                title="点击修改库存数量"
                              >
                                {summary.totalQty.toFixed(2)}
                                <Pencil className="w-3.5 h-3.5 text-gray-400 hover:text-blue-500" />
                              </button>
                            )}
                          </td>
                          <td className="px-5 py-3 text-right">
                            {editingQtyId === `res-${productId}` && editingQtyField === 'reserved_qty' ? (
                              <Input
                                autoFocus
                                type="number"
                                step="0.01"
                                min="0"
                                value={editingQtyValue}
                                onChange={(e) => setEditingQtyValue(e.target.value)}
                                onBlur={() => saveQty(summary.warehouses[0]?.inventoryId || null, productId, summary.warehouses[0]?.warehouseId || null, 'reserved_qty', editingQtyValue)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') saveQty(summary.warehouses[0]?.inventoryId || null, productId, summary.warehouses[0]?.warehouseId || null, 'reserved_qty', editingQtyValue);
                                  if (e.key === 'Escape') setEditingQtyId(null);
                                }}
                                className="h-7 w-24 text-right font-mono text-sm"
                              />
                            ) : (
                              <button
                                className="font-mono text-amber-600 hover:text-blue-600 cursor-pointer inline-flex items-center gap-1"
                                onClick={() => {
                                  setEditingQtyId(`res-${productId}`);
                                  setEditingQtyField('reserved_qty');
                                  setEditingQtyValue(summary.totalReserved.toFixed(2));
                                }}
                                title="点击修改预留数量"
                              >
                                {summary.totalReserved.toFixed(2)}
                                <Pencil className="w-3.5 h-3.5 text-gray-400 hover:text-blue-500" />
                              </button>
                            )}
                          </td>
                          <td className="px-5 py-3 text-right font-mono font-medium text-green-700">{(summary.totalQty - summary.totalReserved).toFixed(2)}</td>
                          <td className="px-5 py-3 text-gray-600">{translateUnit(summary.product.unit)}</td>
                          <td className="px-5 py-3">
                            {editingLocationId === summary.product.id ? (
                              <div className="flex flex-col gap-1">
                                <Input
                                  autoFocus
                                  value={editingLocationValue}
                                  onChange={(e) => setEditingLocationValue(e.target.value)}
                                  onBlur={() => setTimeout(() => saveLocationNo(summary.product.id, editingLocationValue), 150)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') saveLocationNo(summary.product.id, editingLocationValue);
                                    if (e.key === 'Escape') setEditingLocationId(null);
                                  }}
                                  className="h-7 w-28 text-xs font-mono"
                                  placeholder="输入库位号"
                                />
                                <div className="flex gap-1 flex-wrap">
                                  {['A','B','C','D','E','F'].map(loc => {
                                    const color = getLocationColor(loc);
                                    const selected = editingLocationValue === loc;
                                    return (
                                      <button
                                        key={loc}
                                        className={`inline-flex items-center justify-center w-9 h-9 rounded-lg text-lg font-black border-2 cursor-pointer transition-all ${
                                          selected
                                            ? `${color?.bg || 'bg-blue-600'} ${color?.text || 'text-white'} ${color?.border || 'border-blue-600'} shadow-md scale-110`
                                            : `${color?.light || 'bg-gray-50 text-gray-600 border-gray-200'} hover:scale-105`
                                        }`}
                                        onMouseDown={(e) => { e.preventDefault(); setEditingLocationValue(loc); }}
                                      >{loc}</button>
                                    );
                                  })}
                                </div>
                              </div>
                            ) : (
                              <button
                                className="flex items-center gap-1 cursor-pointer group"
                                onClick={() => { setEditingLocationId(summary.product.id); setEditingLocationValue(summary.product_location_no || ''); }}
                                title="点击编辑库位号"
                              >
                                {(() => {
                                  const loc = summary.product_location_no || '';
                                  const color = loc ? getLocationColor(loc) : null;
                                  return color ? (
                                    <span className={`inline-flex items-center justify-center w-10 h-10 rounded-lg text-xl font-black ${color.bg} ${color.text} shadow-sm group-hover:shadow-md transition-all`}>
                                      {loc}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-xs text-gray-300 group-hover:text-blue-400">
                                      <MapPin className="w-3 h-3" />
                                      未设置
                                    </span>
                                  );
                                })()}
                              </button>
                            )
                            }
                        </td>
                        <td className="px-5 py-3 text-gray-600 text-xs">
                          <div className="space-y-1">
                            {summary.warehouses.map((w) => {
                              const editKey = w.inventoryId || `${productId}-${w.warehouseId}`;
                              return (
                              <div key={w.inventoryId || w.warehouseId} className="flex items-center gap-1.5">
                                <span className="text-gray-500">{w.name}:</span>
                                {editingQtyId === editKey && editingQtyField === 'quantity' ? (
                                  <Input
                                    autoFocus
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={editingQtyValue}
                                    onChange={(e) => setEditingQtyValue(e.target.value)}
                                    onBlur={() => saveQty(w.inventoryId, productId, w.warehouseId, 'quantity', editingQtyValue)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') saveQty(w.inventoryId, productId, w.warehouseId, 'quantity', editingQtyValue);
                                      if (e.key === 'Escape') setEditingQtyId(null);
                                    }}
                                    className="h-6 w-20 text-right font-mono text-xs"
                                  />
                                ) : (
                                  <button
                                    className="font-mono text-gray-700 hover:text-blue-600 hover:underline cursor-pointer"
                                    onClick={() => {
                                      setEditingQtyId(editKey);
                                      setEditingQtyField('quantity');
                                      setEditingQtyValue(w.qty);
                                    }}
                                    title="点击修改库存数量"
                                  >
                                    {w.qty}
                                  </button>
                                )}
                                <span className="text-gray-400">(预留</span>
                                {editingQtyId === editKey && editingQtyField === 'reserved_qty' ? (
                                  <Input
                                    autoFocus
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={editingQtyValue}
                                    onChange={(e) => setEditingQtyValue(e.target.value)}
                                    onBlur={() => saveQty(w.inventoryId, productId, w.warehouseId, 'reserved_qty', editingQtyValue)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') saveQty(w.inventoryId, productId, w.warehouseId, 'reserved_qty', editingQtyValue);
                                      if (e.key === 'Escape') setEditingQtyId(null);
                                    }}
                                    className="h-6 w-20 text-right font-mono text-xs"
                                  />
                                ) : (
                                  <button
                                    className="font-mono text-amber-600 hover:text-blue-600 hover:underline cursor-pointer"
                                    onClick={() => {
                                      setEditingQtyId(editKey);
                                      setEditingQtyField('reserved_qty');
                                      setEditingQtyValue(w.reserved);
                                    }}
                                    title="点击修改预留数量"
                                  >
                                    {w.reserved}
                                  </button>
                                )}
                                <span className="text-gray-400">)</span>
                              </div>
                            );
                            })}
                          </div>
                        </td>
                      </tr>
                      {/* BOM子物料行 */}
                      {isExpanded && childItems && childItems.length > 0 && childItems.map((child) => {
                        const childInv = inventory.find(i => i.product_id === child.child_product_id);
                        const childQty = childInv ? childInv.total_quantity : 0;
                        const childReserved = childInv ? childInv.total_reserved : 0;
                        const childAvailable = childQty - childReserved;
                        const requiredQty = child.quantity;
                        const isShortage = childAvailable < requiredQty;
                        const childTypeInfo = getProductTypeLabel(child.child_type);
                        return (
                          <tr key={`bom-${productId}-${child.child_product_id}`} className="border-b border-gray-50 bg-amber-50/30">
                            <td className="px-3 py-2"></td>
                            <td className="px-5 py-2 pl-10">
                              <span className="font-mono text-gray-500 text-xs">{child.child_code}</span>
                            </td>
                            <td className="px-5 py-2 pl-10">
                              <div className="flex items-center gap-2">
                                <Package className="w-3 h-3 text-gray-400" />
                                <span className="text-gray-700 text-xs">{child.child_name}</span>
                              </div>
                            </td>
                            <td className="px-5 py-2">
                              <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] border ${childTypeInfo.color}`}>
                                {childTypeInfo.label}
                              </span>
                            </td>
                            <td className="px-5 py-2 text-right">
                              <span className={`font-mono text-xs ${isShortage ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                                {childQty.toFixed(2)}
                              </span>
                            </td>
                            <td className="px-5 py-2 text-right">
                              <span className="font-mono text-xs text-amber-600">{childReserved.toFixed(2)}</span>
                            </td>
                            <td className="px-5 py-2 text-right">
                              <span className={`font-mono text-xs font-medium ${isShortage ? 'text-red-600' : 'text-green-700'}`}>
                                {childAvailable.toFixed(2)}
                              </span>
                            </td>
                            <td className="px-5 py-2 text-gray-500 text-xs">{translateUnit(child.child_unit)}</td>
                            <td className="px-5 py-2"></td>
                            <td className="px-5 py-2">
                              <span className="text-xs text-gray-500">
                                需求: <span className={`font-mono ${isShortage ? 'text-red-600 font-medium' : 'text-gray-700'}`}>{requiredQty}</span>
                                {isShortage && <span className="ml-1 text-red-500 text-[10px]">缺料</span>}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                      {isExpanded && childItems && childItems.length === 0 && (
                        <tr key={`bom-empty-${productId}`} className="border-b border-gray-50 bg-amber-50/30">
                          <td colSpan={10} className="px-5 py-3 pl-12 text-xs text-gray-400">
                            暂无BOM子物料，请在BOM管理中添加
                          </td>
                        </tr>
                      )}
                      {isExpanded && isLoadingBom && (
                        <tr key={`bom-loading-${productId}`} className="border-b border-gray-50 bg-amber-50/30">
                          <td colSpan={10} className="px-5 py-3 pl-12 text-xs text-gray-400">加载BOM数据...</td>
                        </tr>
                      )}
                    </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* 库位热力图Tab */}
      {activeTab === 'heatmap' && (
        <div>
          {heatmapLoading ? (
            <div className="py-20 text-center text-gray-400">加载热力图数据...</div>
          ) : heatmapData.length === 0 ? (
            <div className="py-20 text-center text-gray-400">暂无热力图数据</div>
          ) : (
            <div className="space-y-6">
              {/* 图例 */}
              <div className="flex items-center gap-4 text-xs text-gray-500 bg-white rounded-lg border border-gray-200 px-4 py-3">
                <span className="font-medium text-gray-700">周转频次(近30天):</span>
                <div className="flex items-center gap-1">
                  <span className="w-4 h-4 rounded bg-gray-100 inline-block" /> 无周转
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-4 h-4 rounded bg-blue-100 inline-block" /> 低
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-4 h-4 rounded bg-blue-200 inline-block" /> 中低
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-4 h-4 rounded bg-blue-300 inline-block" /> 中
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-4 h-4 rounded bg-orange-300 inline-block" /> 中高
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-4 h-4 rounded bg-red-400 inline-block" /> <span className="text-red-600 font-medium">热区</span>
                </div>
                <span className="ml-4 text-gray-400">| 热区物料建议靠近出货口摆放</span>
              </div>

              {heatmapData.map((wh) => (
                <div key={wh.warehouse_id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                  {/* 仓库标题 */}
                  <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-gray-900">{wh.warehouse_name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${wh.warehouse_type === 'raw_material' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                        {wh.warehouse_type === 'raw_material' ? '原材料仓' : '产品仓'}
                      </span>
                      <span className="text-xs text-gray-400">{wh.warehouse_location || ''}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span>物料数: <span className="font-mono font-medium text-gray-700">{wh.total_items}</span></span>
                      <span>总库存: <span className="font-mono font-medium text-gray-700">{wh.total_quantity.toFixed(0)}</span></span>
                      <span>最高周转: <span className="font-mono font-medium text-red-600">{wh.max_turnover.toFixed(0)}</span></span>
                    </div>
                  </div>

                  {/* 热力格子 */}
                  <div className="p-4">
                    {wh.locations.length === 0 ? (
                      <div className="py-6 text-center text-gray-400 text-sm">该仓库暂无库存</div>
                    ) : (
                      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(120px, 1fr))` }}>
                        {wh.locations.map((loc) => (
                          <div
                            key={loc.inventory_id}
                            className={`rounded-md p-2 ${getHeatColor(loc.turnover, wh.max_turnover)} ${getHeatTextColor(loc.turnover, wh.max_turnover)} border border-gray-200/50 transition-all hover:shadow-md cursor-default`}
                            title={`${loc.product_code} ${loc.product_name}\n库存: ${loc.quantity} | 预留: ${loc.reserved_qty}\n入库: ${loc.turnover_in} | 出库: ${loc.turnover_out}\n库位: ${loc.location_no || '未设置'}`}
                          >
                            <div className="text-xs font-mono font-medium truncate">{loc.product_code}</div>
                            <div className="text-xs truncate opacity-80">{loc.product_name}</div>
                            <div className="flex items-center justify-between mt-1">
                              <span className="text-xs font-mono font-medium">{loc.quantity.toFixed(0)}</span>
                              <span className="text-[10px] opacity-70">周转{loc.turnover.toFixed(0)}</span>
                            </div>
                            {loc.location_no && (() => {
                              const color = getLocationColor(loc.location_no);
                              return color ? (
                                <div className="mt-1">
                                  <span className={`inline-flex items-center justify-center w-6 h-6 rounded text-xs font-black ${color.bg} ${color.text}`}>
                                    {loc.location_no}
                                  </span>
                                </div>
                              ) : (
                                <div className="text-[10px] opacity-60 mt-0.5">库位: {loc.location_no}</div>
                              );
                            })()}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* FIFO先进先出看板Tab */}
      {activeTab === 'fifo' && (
        <div>
          {fifoLoading ? (
            <div className="py-20 text-center text-gray-400">加载FIFO数据...</div>
          ) : fifoData.length === 0 ? (
            <div className="py-20 text-center text-gray-400">暂无FIFO数据</div>
          ) : (
            <>
              {/* 统计概览 */}
              <div className="grid grid-cols-4 gap-4 mb-4">
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                  <div className="text-xs text-gray-500 mb-1">有库存物料</div>
                  <div className="text-2xl font-mono font-semibold text-gray-900">{fifoData.length}</div>
                </div>
                <div className="bg-red-50 rounded-lg border border-red-100 p-4">
                  <div className="text-xs text-red-500 mb-1">超30天未动</div>
                  <div className="text-2xl font-mono font-semibold text-red-600">
                    {fifoData.filter(f => f.max_age_days > 30).length}
                  </div>
                </div>
                <div className="bg-orange-50 rounded-lg border border-orange-100 p-4">
                  <div className="text-xs text-orange-500 mb-1">15-30天未动</div>
                  <div className="text-2xl font-mono font-semibold text-orange-600">
                    {fifoData.filter(f => f.max_age_days > 14 && f.max_age_days <= 30).length}
                  </div>
                </div>
                <div className="bg-green-50 rounded-lg border border-green-100 p-4">
                  <div className="text-xs text-green-500 mb-1">7天内活跃</div>
                  <div className="text-2xl font-mono font-semibold text-green-600">
                    {fifoData.filter(f => f.max_age_days <= 7).length}
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg border border-gray-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50/50">
                      <th className="text-left px-4 py-3 font-medium text-gray-500">状态</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">物料编码</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">物料名称</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">仓库</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500">库存量</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500">平均库龄</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500">最长库龄</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">最后入库</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">最后出库</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fifoData.map((item) => (
                      <React.Fragment key={item.inventory_id}>
                        <tr
                          className={`border-b border-gray-100 cursor-pointer hover:bg-gray-50/50 ${fifoExpandId === item.inventory_id ? 'bg-blue-50/30' : ''}`}
                          onClick={() => setFifoExpandId(fifoExpandId === item.inventory_id ? null : item.inventory_id)}
                        >
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center justify-center w-3 h-3 rounded-full ${
                              item.max_age_days > 30 ? 'bg-red-500' :
                              item.max_age_days > 14 ? 'bg-orange-400' :
                              item.max_age_days > 7 ? 'bg-yellow-400' : 'bg-green-400'
                            }`} />
                          </td>
                          <td className="px-4 py-3 font-mono text-blue-600">{item.product_code}</td>
                          <td className="px-4 py-3 text-gray-900">{item.product_name}</td>
                          <td className="px-4 py-3 text-gray-600 text-xs">{item.warehouse_name}</td>
                          <td className="px-4 py-3 text-right font-mono">{item.quantity.toFixed(0)} {translateUnit(item.product_unit)}</td>
                          <td className={`px-4 py-3 text-right font-mono font-medium ${getAgeColor(item.avg_age_days)}`}>
                            {item.avg_age_days}天
                          </td>
                          <td className={`px-4 py-3 text-right font-mono font-medium ${getAgeColor(item.max_age_days)}`}>
                            {item.max_age_days}天
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">
                            {item.last_in_date ? new Date(item.last_in_date).toLocaleDateString('zh-CN') : '-'}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">
                            {item.last_out_date ? new Date(item.last_out_date).toLocaleDateString('zh-CN') : '-'}
                          </td>
                        </tr>
                        {/* 展开的FIFO层详情 */}
                        {fifoExpandId === item.inventory_id && (
                          <tr key={`${item.inventory_id}-detail`}>
                            <td colSpan={9} className="px-4 py-3 bg-gray-50/80">
                              <div className="text-xs font-medium text-gray-500 mb-2">入库批次（先进先出排列）:</div>
                              <div className="space-y-1">
                                {item.layers.map((layer, idx) => (
                                  <div
                                    key={idx}
                                    className={`flex items-center gap-4 px-3 py-2 rounded ${getAgeBg(layer.age_days)}`}
                                  >
                                    <span className="text-xs font-mono text-gray-400 w-6">#{idx + 1}</span>
                                    <span className="text-xs font-mono text-gray-600 w-24">
                                      {layer.date ? new Date(layer.date).toLocaleDateString('zh-CN') : '-'}
                                    </span>
                                    <span className="text-xs text-gray-500 w-20">{layer.note_no}</span>
                                    <span className="text-xs text-gray-600">
                                      批量 <span className="font-mono">{layer.batch_qty.toFixed(0)}</span>
                                    </span>
                                    <span className="text-xs text-gray-400">
                                      已消耗 <span className="font-mono">{layer.consumed.toFixed(0)}</span>
                                    </span>
                                    <span className="text-xs font-medium text-gray-900">
                                      剩余 <span className="font-mono">{layer.remaining.toFixed(0)}</span>
                                    </span>
                                    <span className={`text-xs font-mono font-medium ${getAgeColor(layer.age_days)}`}>
                                      库龄{layer.age_days}天
                                    </span>
                                    {/* 库龄进度条 */}
                                    <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                                      <div
                                        className={`h-full rounded-full ${
                                          layer.age_days <= 7 ? 'bg-green-400' :
                                          layer.age_days <= 14 ? 'bg-yellow-400' :
                                          layer.age_days <= 30 ? 'bg-orange-400' : 'bg-red-500'
                                        }`}
                                        style={{ width: `${Math.min(100, (layer.age_days / 60) * 100)}%` }}
                                      />
                                    </div>
                                  </div>
                                ))}
                                {item.layers.length === 0 && (
                                  <div className="text-xs text-gray-400 px-3 py-2">无入库批次数据</div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* 收发存趋势Tab */}
      {activeTab === 'trend' && (
        <div>
          {/* 时间范围选择 */}
          <div className="flex items-center gap-2 mb-4">
            <span className="text-sm text-gray-500">时间范围:</span>
            {([7, 15, 30, 60, 90] as const).map((d) => (
              <button
                key={d}
                onClick={() => { setTrendDays(d); setTrendData(null); }}
                className={`px-3 py-1.5 text-sm rounded-md border ${
                  trendDays === d ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                近{d}天
              </button>
            ))}
          </div>

          {trendLoading ? (
            <div className="py-20 text-center text-gray-400">加载趋势数据...</div>
          ) : !trendData || !trendChartParams ? (
            <div className="py-20 text-center text-gray-400">暂无趋势数据</div>
          ) : (
            <>
              {/* 统计概览 */}
              <div className="grid grid-cols-4 gap-4 mb-4">
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                  <div className="text-xs text-gray-500 mb-1">当前库存总量</div>
                  <div className="text-2xl font-mono font-semibold text-gray-900">{trendData.current_total.toFixed(0)}</div>
                </div>
                <div className="bg-green-50 rounded-lg border border-green-100 p-4">
                  <div className="text-xs text-green-500 mb-1">累计入库</div>
                  <div className="text-2xl font-mono font-semibold text-green-600">{trendData.total_inbound.toFixed(0)}</div>
                </div>
                <div className="bg-red-50 rounded-lg border border-red-100 p-4">
                  <div className="text-xs text-red-500 mb-1">累计出库</div>
                  <div className="text-2xl font-mono font-semibold text-red-600">{trendData.total_outbound.toFixed(0)}</div>
                </div>
                <div className="bg-blue-50 rounded-lg border border-blue-100 p-4">
                  <div className="text-xs text-blue-500 mb-1">净变化</div>
                  <div className={`text-2xl font-mono font-semibold ${trendData.total_inbound - trendData.total_outbound >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {(trendData.total_inbound - trendData.total_outbound >= 0 ? '+' : '')}{(trendData.total_inbound - trendData.total_outbound).toFixed(0)}
                  </div>
                </div>
              </div>

              {/* SVG折线图 */}
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-center gap-6 mb-3 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 h-0.5 bg-blue-600 inline-block" /> <span className="text-gray-600">库存结存</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 h-0.5 bg-green-500 inline-block" /> <span className="text-gray-600">入库</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 h-0.5 bg-red-500 inline-block" /> <span className="text-gray-600">出库</span>
                  </div>
                </div>

                <svg width="100%" viewBox={`0 0 ${trendChartWidth} ${trendChartHeight}`} className="overflow-visible">
                  {/* Y轴网格线 */}
                  {trendChartParams.yTickValues.map((val) => {
                    const y = trendChartParams.toY(val);
                    return (
                      <g key={val}>
                        <line x1={trendPadding.left} y1={y} x2={trendChartWidth - trendPadding.right} y2={y} stroke="#E5E7EB" strokeDasharray="4,4" />
                        <text x={trendPadding.left - 8} y={y + 4} textAnchor="end" className="text-[10px] fill-gray-400">{val}</text>
                      </g>
                    );
                  })}

                  {/* X轴标签 */}
                  {trendChartParams.data.map((d, i) => {
                    if (i % trendChartParams.xLabelInterval !== 0) return null;
                    return (
                      <text
                        key={d.date}
                        x={trendChartParams.toX(i)}
                        y={trendChartHeight - 8}
                        textAnchor="middle"
                        className="text-[10px] fill-gray-400"
                      >
                        {d.date.slice(5)}
                      </text>
                    );
                  })}

                  {/* 库存填充区域 */}
                  <path d={trendChartParams.makeArea('stock')} fill="rgba(37,99,235,0.08)" />
                  {/* 入库填充区域 */}
                  <path d={trendChartParams.makeArea('inbound')} fill="rgba(22,163,74,0.06)" />

                  {/* 库存折线 */}
                  <path d={trendChartParams.makePath('stock')} fill="none" stroke="#2563EB" strokeWidth={2} />
                  {/* 入库折线 */}
                  <path d={trendChartParams.makePath('inbound')} fill="none" stroke="#16A34A" strokeWidth={1.5} />
                  {/* 出库折线 */}
                  <path d={trendChartParams.makePath('outbound')} fill="none" stroke="#DC2626" strokeWidth={1.5} />

                  {/* 数据点 - 库存 */}
                  {trendChartParams.data.map((d, i) => {
                    if (i % Math.max(1, Math.floor(trendChartParams.data.length / 15)) !== 0) return null;
                    return (
                      <circle
                        key={`s-${i}`}
                        cx={trendChartParams.toX(i)}
                        cy={trendChartParams.toY(d.stock)}
                        r={3}
                        fill="#2563EB"
                        stroke="white"
                        strokeWidth={1.5}
                      />
                    );
                  })}
                </svg>
              </div>

              {/* 趋势明细表 */}
              <div className="bg-white rounded-lg border border-gray-200 mt-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50/50">
                      <th className="text-left px-4 py-2 font-medium text-gray-500">日期</th>
                      <th className="text-right px-4 py-2 font-medium text-gray-500">入库</th>
                      <th className="text-right px-4 py-2 font-medium text-gray-500">出库</th>
                      <th className="text-right px-4 py-2 font-medium text-gray-500">净变化</th>
                      <th className="text-right px-4 py-2 font-medium text-gray-500">结存</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trendData.trend.slice().reverse().map((d) => {
                      const net = d.inbound - d.outbound;
                      return (
                        <tr key={d.date} className="border-b border-gray-50 hover:bg-gray-50/50">
                          <td className="px-4 py-2 text-gray-700 font-mono text-xs">{d.date}</td>
                          <td className="px-4 py-2 text-right font-mono text-green-600">{d.inbound > 0 ? d.inbound.toFixed(0) : '-'}</td>
                          <td className="px-4 py-2 text-right font-mono text-red-600">{d.outbound > 0 ? d.outbound.toFixed(0) : '-'}</td>
                          <td className={`px-4 py-2 text-right font-mono font-medium ${net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {net !== 0 ? `${net >= 0 ? '+' : ''}${net.toFixed(0)}` : '-'}
                          </td>
                          <td className="px-4 py-2 text-right font-mono font-medium text-gray-900">{d.stock.toFixed(0)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* 物料进出记录弹窗 */}
      <Dialog open={!!txProductId} onOpenChange={(open) => { if (!open) setTxProductId(''); }}>
        <DialogContent className="w-auto max-w-none p-6" style={{ width: 'fit-content', maxWidth: '98vw' }}>
          <DialogHeader>
            <DialogTitle className="text-lg">
              进出记录 - {txProductCode} / {txProductName}
            </DialogTitle>
          </DialogHeader>

          {txLoading ? (
            <div className="py-12 text-center text-gray-400">加载中...</div>
          ) : transactions.length === 0 ? (
            <div className="py-12 text-center text-gray-400">暂无进出记录</div>
          ) : (
            <>
              <div className="flex gap-8 mb-5 px-1">
                <div className="flex items-center gap-2">
                  <ArrowDownCircle className="w-5 h-5 text-green-600" />
                  <span className="text-sm text-gray-600">累计入库:</span>
                  <span className="font-mono font-semibold text-green-700 text-base">{totalIn.toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <ArrowUpCircle className="w-5 h-5 text-red-500" />
                  <span className="text-sm text-gray-600">累计出库:</span>
                  <span className="font-mono font-semibold text-red-600 text-base">{totalOut.toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">净库存:</span>
                  <span className="font-mono font-semibold text-gray-900 text-base">{(totalIn - totalOut).toFixed(2)}</span>
                </div>
              </div>

              <div className="border border-gray-200 rounded-lg">
                <table className="w-full text-sm" style={{ tableLayout: 'auto' }}>
                  <thead>
                    <tr className="border-b border-gray-200" style={{ backgroundColor: '#1E40AF' }}>
                      <th className="text-left px-4 py-3 font-medium text-white whitespace-nowrap">日期</th>
                      <th className="text-center px-4 py-3 font-medium text-white whitespace-nowrap">类型</th>
                      <th className="text-left px-4 py-3 font-medium text-white whitespace-nowrap">单号</th>
                      <th className="text-right px-4 py-3 font-medium text-white whitespace-nowrap">数量</th>
                      <th className="text-left px-4 py-3 font-medium text-white whitespace-nowrap">仓库</th>
                      <th className="text-left px-4 py-3 font-medium text-white whitespace-nowrap">关联单据</th>
                      <th className="text-left px-4 py-3 font-medium text-white whitespace-nowrap">备注</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((tx, idx) => (
                      <tr key={tx.id} className="border-b border-gray-100 hover:bg-blue-50/40" style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#F9FAFB' }}>
                        <td className="px-4 py-3 text-gray-700 font-mono text-xs whitespace-nowrap">
                          {tx.date ? new Date(tx.date).toLocaleDateString('zh-CN') : '-'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {tx.type === 'inbound' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 border border-green-200 whitespace-nowrap">
                              <ArrowDownCircle className="w-3.5 h-3.5" />入库
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-600 border border-red-200 whitespace-nowrap">
                              <ArrowUpCircle className="w-3.5 h-3.5" />出库
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-blue-700 font-medium whitespace-nowrap">{tx.note_no || '-'}</td>
                        <td className="px-4 py-3 text-right font-mono text-gray-900 font-medium whitespace-nowrap">{tx.quantity.toFixed(2)}</td>
                        <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">{tx.warehouse}</td>
                        <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">{tx.related_order || '-'}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{tx.remark || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
