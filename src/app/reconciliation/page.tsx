'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import {
  Download, Search, ChevronDown, ChevronRight, FileSpreadsheet,
  FileText, ChevronLeft, ChevronRight as ChevronRightIcon,
} from 'lucide-react';

/* ─── Shared Types ─── */
interface Customer {
  id: string;
  name: string;
  code: string;
}

/* ─── Flow Types ─── */
interface FlowRow {
  note_id: string;
  note_no: string;
  delivery_date: string;
  customer_id: string | null;
  customer_name: string;
  order_no: string;
  status: string;
  item_id: string;
  product_id: string;
  product_code: string;
  product_name: string;
  spec: string | null;
  unit: string;
  category: string;
  category_name: string;
  quantity: number;
  unit_price: number;
  amount: number;
  per_box_qty: number;
  item_remark: string;
}

interface FlowData {
  filters: { customers: Customer[] };
  rows: FlowRow[];
  pagination: { page: number; page_size: number; total: number; total_pages: number };
  summary: { total_notes: number; total_quantity: number; total_amount: number };
}

/* ─── Reconciliation Types ─── */
interface AggItem {
  customer_id: string | null;
  customer_name: string;
  category: string;
  product_id: string;
  product_code: string;
  product_name: string;
  spec: string | null;
  unit: string;
  unit_price: number;
  total_quantity: number;
  total_amount: number;
  delivery_count: number;
  details: { note_no: string; delivery_date: string; quantity: number; unit_price: number }[];
}

interface CategoryGroup {
  category: string;
  category_name: string;
  items: AggItem[];
  category_total_quantity: number;
  category_total_amount: number;
}

interface CustomerGroup {
  customer_id: string | null;
  customer_name: string;
  categories: CategoryGroup[];
  customer_total_quantity: number;
  customer_total_amount: number;
}

interface ReconciliationData {
  filters: { customers: Customer[]; categories: Array<{ code: string; name: string }> };
  data: CustomerGroup[];
  summary: { total_customers: number; total_quantity: number; total_amount: number };
}

/* ─── Helpers ─── */
const formatAmount = (n: number) => n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatDate = (d: string) => d ? new Date(d).toLocaleDateString('zh-CN') : '';
const statusLabel = (s: string) => {
  const m: Record<string, { label: string; cls: string }> = {
    draft: { label: '草稿', cls: 'bg-yellow-100 text-yellow-800' },
    shipped: { label: '已出货', cls: 'bg-blue-100 text-blue-800' },
    printed: { label: '已列印', cls: 'bg-green-100 text-green-800' },
  };
  return m[s] || { label: s, cls: 'bg-gray-100 text-gray-800' };
};

/* ─── Component ─── */
export default function ReconciliationPage() {
  const [tab, setTab] = useState<'flow' | 'summary'>('flow');

  // ── Flow state ──
  const [flowData, setFlowData] = useState<FlowData | null>(null);
  const [flowLoading, setFlowLoading] = useState(false);
  const [flowCustomerId, setFlowCustomerId] = useState('');
  const [flowStartDate, setFlowStartDate] = useState('');
  const [flowEndDate, setFlowEndDate] = useState('');
  const [flowStatus, setFlowStatus] = useState('');
  const [flowKeyword, setFlowKeyword] = useState('');
  const [flowPage, setFlowPage] = useState(1);

  // ── Summary state ──
  const [sumData, setSumData] = useState<ReconciliationData | null>(null);
  const [sumLoading, setSumLoading] = useState(false);
  const [sumCustomerId, setSumCustomerId] = useState('');
  const [sumCategory, setSumCategory] = useState('');
  const [sumStartDate, setSumStartDate] = useState('');
  const [sumEndDate, setSumEndDate] = useState('');
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  /* ─── Flow fetch ─── */
  const fetchFlow = useCallback(async () => {
    setFlowLoading(true);
    try {
      const params = new URLSearchParams();
      if (flowCustomerId && flowCustomerId !== 'all') params.set('customer_id', flowCustomerId);
      if (flowStartDate) params.set('start_date', flowStartDate);
      if (flowEndDate) params.set('end_date', flowEndDate);
      if (flowStatus && flowStatus !== 'all') params.set('status', flowStatus);
      if (flowKeyword) params.set('keyword', flowKeyword);
      params.set('page', String(flowPage));

      const res = await fetch(`/api/reconciliation/flow?${params}`);
      const json = await res.json();
      setFlowData(json);
    } catch (err) {
      console.error('Failed to fetch flow data:', err);
    } finally {
      setFlowLoading(false);
    }
  }, [flowCustomerId, flowStartDate, flowEndDate, flowStatus, flowKeyword, flowPage]);

  useEffect(() => { fetchFlow(); }, [fetchFlow]);

  /* ─── Summary fetch ─── */
  const fetchSummary = useCallback(async () => {
    setSumLoading(true);
    try {
      const params = new URLSearchParams();
      if (sumCustomerId && sumCustomerId !== 'all') params.set('customer_id', sumCustomerId);
      if (sumCategory && sumCategory !== 'all') params.set('category', sumCategory);
      if (sumStartDate) params.set('start_date', sumStartDate);
      if (sumEndDate) params.set('end_date', sumEndDate);

      const res = await fetch(`/api/reconciliation?${params}`);
      const json = await res.json();
      setSumData(json);
    } catch (err) {
      console.error('Failed to fetch summary data:', err);
    } finally {
      setSumLoading(false);
    }
  }, [sumCustomerId, sumCategory, sumStartDate, sumEndDate]);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  /* ─── Export ─── */
  const handleExport = async () => {
    const params = new URLSearchParams();
    const cid = tab === 'flow' ? flowCustomerId : sumCustomerId;
    const cat = tab === 'summary' ? sumCategory : '';
    const sd = tab === 'flow' ? flowStartDate : sumStartDate;
    const ed = tab === 'flow' ? flowEndDate : sumEndDate;

    if (cid) params.set('customer_id', cid);
    if (cat) params.set('category', cat);
    if (sd) params.set('start_date', sd);
    if (ed) params.set('end_date', ed);

    try {
      const res = await fetch(`/api/reconciliation/export?${params}`);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const disposition = res.headers.get('content-disposition');
      let filename = '对账单.xlsx';
      if (disposition) {
        const match = disposition.match(/filename\*=UTF-8''(.+)/);
        if (match) filename = decodeURIComponent(match[1]);
      }
      a.download = filename;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export:', err);
    }
  };

  /* ─── Toggle helpers ─── */
  const toggleCustomer = (key: string) => {
    setExpandedCustomers(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleCategory = (key: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // Get combined customer list from both APIs
  const customers = flowData?.filters?.customers || sumData?.filters?.customers || [];

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">对账管理</h1>
        <Button onClick={handleExport} disabled={tab === 'flow' ? !flowData?.rows?.length : !sumData?.data?.length} className="bg-[#1E40AF] hover:bg-[#1D4ED8]">
          <Download className="w-4 h-4 mr-2" />
          导出Excel
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'flow'
              ? 'border-[#1E40AF] text-[#1E40AF]'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setTab('flow')}
        >
          <FileText className="w-4 h-4 inline mr-1.5 -mt-0.5" />
          送货流水
        </button>
        <button
          className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'summary'
              ? 'border-[#1E40AF] text-[#1E40AF]'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setTab('summary')}
        >
          <FileSpreadsheet className="w-4 h-4 inline mr-1.5 -mt-0.5" />
          对账汇总
        </button>
      </div>

      {/* ═══════════ FLOW TAB ═══════════ */}
      {tab === 'flow' && (
        <>
          {/* Flow Filters */}
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex flex-wrap items-end gap-4">
                <div className="w-48">
                  <label className="block text-sm text-gray-600 mb-1">客户</label>
                  <Select value={flowCustomerId} onValueChange={v => { setFlowCustomerId(v); setFlowPage(1); }}>
                    <SelectTrigger><SelectValue placeholder="全部客户" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部客户</SelectItem>
                      {customers.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-32">
                  <label className="block text-sm text-gray-600 mb-1">状态</label>
                  <Select value={flowStatus} onValueChange={v => { setFlowStatus(v); setFlowPage(1); }}>
                    <SelectTrigger><SelectValue placeholder="全部状态" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部状态</SelectItem>
                      <SelectItem value="draft">草稿</SelectItem>
                      <SelectItem value="shipped">已出货</SelectItem>
                      <SelectItem value="printed">已列印</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-40">
                  <label className="block text-sm text-gray-600 mb-1">开始日期</label>
                  <Input type="date" value={flowStartDate} onChange={e => { setFlowStartDate(e.target.value); setFlowPage(1); }} />
                </div>
                <div className="w-40">
                  <label className="block text-sm text-gray-600 mb-1">结束日期</label>
                  <Input type="date" value={flowEndDate} onChange={e => { setFlowEndDate(e.target.value); setFlowPage(1); }} />
                </div>
                <div className="w-48">
                  <label className="block text-sm text-gray-600 mb-1">搜索</label>
                  <Input placeholder="单号/客户名" value={flowKeyword} onChange={e => { setFlowKeyword(e.target.value); setFlowPage(1); }} />
                </div>
                <Button onClick={() => fetchFlow()} disabled={flowLoading}>
                  <Search className="w-4 h-4 mr-2" />
                  {flowLoading ? '查询中...' : '查询'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Flow Summary Stats */}
          {flowData?.summary && (
            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-4 pb-4">
                  <div className="text-sm text-gray-600">送货单数</div>
                  <div className="text-2xl font-semibold text-gray-900 font-mono">{flowData.summary.total_notes}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-4">
                  <div className="text-sm text-gray-600">总数量</div>
                  <div className="text-2xl font-semibold text-gray-900 font-mono">{flowData.summary.total_quantity.toLocaleString()}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-4">
                  <div className="text-sm text-gray-600">总金额</div>
                  <div className="text-2xl font-semibold text-[#1E40AF] font-mono">¥{formatAmount(flowData.summary.total_amount)}</div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Flow Table */}
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-gray-500">
                    <th className="py-2.5 px-3 text-left font-medium w-28">送货单号</th>
                    <th className="py-2.5 px-3 text-left font-medium w-24">送货日期</th>
                    <th className="py-2.5 px-3 text-left font-medium">客户名称</th>
                    <th className="py-2.5 px-3 text-left font-medium w-28">客户订单号</th>
                    <th className="py-2.5 px-3 text-left font-medium w-28">物料编号</th>
                    <th className="py-2.5 px-3 text-left font-medium">物料名称</th>
                    <th className="py-2.5 px-3 text-left font-medium w-16">单位</th>
                    <th className="py-2.5 px-3 text-right font-medium w-16">数量</th>
                    <th className="py-2.5 px-3 text-right font-medium w-20">单价</th>
                    <th className="py-2.5 px-3 text-right font-medium w-24">金额</th>
                    <th className="py-2.5 px-3 text-center font-medium w-16">状态</th>
                    <th className="py-2.5 px-3 text-left font-medium w-24">备注</th>
                  </tr>
                </thead>
                <tbody>
                  {flowData?.rows?.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="py-16 text-center text-gray-400">
                        <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
                        <p>暂无送货流水数据</p>
                      </td>
                    </tr>
                  ) : (
                    flowData?.rows?.map((row) => {
                      const st = statusLabel(row.status);
                      return (
                        <tr key={row.item_id} className="border-b border-gray-100 hover:bg-[#F9FAFB]">
                          <td className="py-2 px-3 font-mono text-xs">{row.note_no}</td>
                          <td className="py-2 px-3 text-xs">{formatDate(row.delivery_date)}</td>
                          <td className="py-2 px-3">{row.customer_name}</td>
                          <td className="py-2 px-3 font-mono text-xs">{row.order_no || '-'}</td>
                          <td className="py-2 px-3 font-mono text-xs">{row.product_code}</td>
                          <td className="py-2 px-3">{row.product_name}{row.spec ? <span className="text-gray-400 ml-1">/{row.spec}</span> : ''}</td>
                          <td className="py-2 px-3 text-gray-500 text-center">{row.unit}</td>
                          <td className="py-2 px-3 text-right font-mono">{row.quantity.toLocaleString()}</td>
                          <td className="py-2 px-3 text-right font-mono">{formatAmount(row.unit_price)}</td>
                          <td className="py-2 px-3 text-right font-mono font-semibold text-[#1E40AF]">¥{formatAmount(row.amount)}</td>
                          <td className="py-2 px-3 text-center">
                            <span className={`text-xs px-1.5 py-0.5 rounded ${st.cls}`}>{st.label}</span>
                          </td>
                          <td className="py-2 px-3 text-gray-500 text-xs">{row.item_remark || '-'}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {flowData?.pagination && flowData.pagination.total_pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t">
                <span className="text-xs text-gray-500">
                  共 {flowData.pagination.total} 条，第 {flowData.pagination.page}/{flowData.pagination.total_pages} 页
                </span>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" className="h-7 w-7 p-0"
                    disabled={flowPage <= 1}
                    onClick={() => setFlowPage(p => p - 1)}>
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 w-7 p-0"
                    disabled={flowPage >= flowData.pagination.total_pages}
                    onClick={() => setFlowPage(p => p + 1)}>
                    <ChevronRightIcon className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </>
      )}

      {/* ═══════════ SUMMARY TAB ═══════════ */}
      {tab === 'summary' && (
        <>
          {/* Summary Filters */}
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex flex-wrap items-end gap-4">
                <div className="w-48">
                  <label className="block text-sm text-gray-600 mb-1">客户</label>
                  <Select value={sumCustomerId} onValueChange={setSumCustomerId}>
                    <SelectTrigger><SelectValue placeholder="全部客户" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部客户</SelectItem>
                      {(sumData?.filters?.customers || customers).map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-36">
                  <label className="block text-sm text-gray-600 mb-1">类目</label>
                  <Select value={sumCategory} onValueChange={setSumCategory}>
                    <SelectTrigger><SelectValue placeholder="全部类目" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部类目</SelectItem>
                      {sumData?.filters?.categories?.map(cat => (
                        <SelectItem key={cat.code} value={cat.code}>{cat.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-40">
                  <label className="block text-sm text-gray-600 mb-1">开始日期</label>
                  <Input type="date" value={sumStartDate} onChange={e => setSumStartDate(e.target.value)} />
                </div>
                <div className="w-40">
                  <label className="block text-sm text-gray-600 mb-1">结束日期</label>
                  <Input type="date" value={sumEndDate} onChange={e => setSumEndDate(e.target.value)} />
                </div>
                <Button onClick={fetchSummary} disabled={sumLoading}>
                  <Search className="w-4 h-4 mr-2" />
                  {sumLoading ? '查询中...' : '查询'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Summary Stats */}
          {sumData?.summary && (
            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-4 pb-4">
                  <div className="text-sm text-gray-600">客户数</div>
                  <div className="text-2xl font-semibold text-gray-900 font-mono">{sumData.summary.total_customers}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-4">
                  <div className="text-sm text-gray-600">总数量</div>
                  <div className="text-2xl font-semibold text-gray-900 font-mono">{sumData.summary.total_quantity.toLocaleString()}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-4">
                  <div className="text-sm text-gray-600">总金额</div>
                  <div className="text-2xl font-semibold text-[#1E40AF] font-mono">¥{formatAmount(sumData.summary.total_amount)}</div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Summary Data - No data */}
          {sumData?.data?.length === 0 && (
            <Card>
              <CardContent className="py-16 text-center text-gray-400">
                <FileSpreadsheet className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>暂无已出货的送货单数据</p>
              </CardContent>
            </Card>
          )}

          {/* Summary Data - Grouped by customer */}
          {sumData?.data?.map(customer => {
            const custKey = customer.customer_id || customer.customer_name;
            const custExpanded = expandedCustomers.has(custKey);

            return (
              <Card key={custKey}>
                {/* Customer Header */}
                <div
                  className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 border-b"
                  onClick={() => toggleCustomer(custKey)}
                >
                  <div className="flex items-center gap-2">
                    {custExpanded ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
                    <span className="font-semibold text-gray-900">{customer.customer_name}</span>
                    <span className="text-xs text-gray-400 ml-2">
                      {customer.categories.length}个类目 · {customer.categories.reduce((s, c) => s + c.items.length, 0)}种商品
                    </span>
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <span className="text-gray-600">数量: <span className="font-mono font-semibold">{customer.customer_total_quantity.toLocaleString()}</span></span>
                    <span className="text-gray-600">金额: <span className="font-mono font-semibold text-[#1E40AF]">¥{formatAmount(customer.customer_total_amount)}</span></span>
                  </div>
                </div>

                {custExpanded && customer.categories.map(catGroup => {
                  const catKey = `${custKey}|${catGroup.category}`;
                  const catExpanded = expandedCategories.has(catKey);

                  return (
                    <div key={catKey}>
                      {/* Category Header */}
                      <div
                        className="flex items-center justify-between px-4 py-2 pl-10 cursor-pointer hover:bg-gray-50 bg-gray-50/50 border-b"
                        onClick={() => toggleCategory(catKey)}
                      >
                        <div className="flex items-center gap-2">
                          {catExpanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
                          <span className="text-sm font-medium text-gray-700">类目: {catGroup.category_name || catGroup.category}</span>
                          <span className="text-xs text-gray-400">{catGroup.items.length}种商品</span>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          <span>数量: <span className="font-mono">{catGroup.category_total_quantity.toLocaleString()}</span></span>
                          <span>金额: <span className="font-mono">¥{formatAmount(catGroup.category_total_amount)}</span></span>
                        </div>
                      </div>

                      {catExpanded && (
                        <>
                          {/* Product Summary Table */}
                          <div className="px-4 py-2 pl-14">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b text-gray-500">
                                  <th className="text-left py-2 font-medium w-32">商品编号</th>
                                  <th className="text-left py-2 font-medium">商品名称</th>
                                  <th className="text-left py-2 font-medium w-20">规格</th>
                                  <th className="text-left py-2 font-medium w-12">单位</th>
                                  <th className="text-right py-2 font-medium w-16">送货次数</th>
                                  <th className="text-right py-2 font-medium w-20">合计数量</th>
                                  <th className="text-right py-2 font-medium w-20">单价</th>
                                  <th className="text-right py-2 font-medium w-24">合计金额</th>
                                </tr>
                              </thead>
                              <tbody>
                                {catGroup.items.map(item => (
                                  <tr key={item.product_id} className="border-b border-gray-100 hover:bg-gray-50/50">
                                    <td className="py-2 font-mono text-xs">{item.product_code}</td>
                                    <td className="py-2">{item.product_name}</td>
                                    <td className="py-2 text-gray-500">{item.spec || '-'}</td>
                                    <td className="py-2 text-gray-500">{item.unit}</td>
                                    <td className="py-2 text-right font-mono">{item.delivery_count}</td>
                                    <td className="py-2 text-right font-mono font-semibold">{item.total_quantity.toLocaleString()}</td>
                                    <td className="py-2 text-right font-mono">{formatAmount(item.unit_price)}</td>
                                    <td className="py-2 text-right font-mono font-semibold text-[#1E40AF]">¥{formatAmount(item.total_amount)}</td>
                                  </tr>
                                ))}
                                {/* Category subtotal */}
                                <tr className="bg-gray-50 font-medium">
                                  <td colSpan={4} className="py-2 text-gray-600">类目小计</td>
                                  <td className="py-2 text-right font-mono">{catGroup.items.reduce((s, i) => s + i.delivery_count, 0)}</td>
                                  <td className="py-2 text-right font-mono">{catGroup.category_total_quantity.toLocaleString()}</td>
                                  <td></td>
                                  <td className="py-2 text-right font-mono text-[#1E40AF]">¥{formatAmount(catGroup.category_total_amount)}</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>

                          {/* Delivery Detail Table */}
                          <div className="px-4 py-2 pl-14">
                            <div className="text-xs text-gray-400 mb-2">送货明细</div>
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b text-gray-400">
                                  <th className="text-left py-1.5 font-medium w-28">送货单号</th>
                                  <th className="text-left py-1.5 font-medium w-24">送货日期</th>
                                  <th className="text-left py-1.5 font-medium w-28">商品编号</th>
                                  <th className="text-left py-1.5 font-medium">商品名称</th>
                                  <th className="text-right py-1.5 font-medium w-16">数量</th>
                                  <th className="text-right py-1.5 font-medium w-16">单价</th>
                                  <th className="text-right py-1.5 font-medium w-20">金额</th>
                                </tr>
                              </thead>
                              <tbody>
                                {catGroup.items.flatMap(item =>
                                  item.details.map((d, idx) => (
                                    <tr key={`${item.product_id}-${idx}`} className="border-b border-gray-50">
                                      <td className="py-1 font-mono">{d.note_no}</td>
                                      <td className="py-1">{formatDate(d.delivery_date)}</td>
                                      <td className="py-1 font-mono">{item.product_code}</td>
                                      <td className="py-1">{item.product_name}</td>
                                      <td className="py-1 text-right font-mono">{d.quantity.toLocaleString()}</td>
                                      <td className="py-1 text-right font-mono">{formatAmount(d.unit_price)}</td>
                                      <td className="py-1 text-right font-mono">¥{formatAmount(d.quantity * d.unit_price)}</td>
                                    </tr>
                                  ))
                                )}
                              </tbody>
                            </table>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}

                {/* Customer subtotal */}
                {custExpanded && (
                  <div className="px-4 py-3 pl-10 bg-[#1E40AF]/5 border-t flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-900">客户合计</span>
                    <div className="flex items-center gap-6 text-sm">
                      <span className="text-gray-700">数量: <span className="font-mono font-semibold">{customer.customer_total_quantity.toLocaleString()}</span></span>
                      <span className="text-gray-700">金额: <span className="font-mono font-semibold text-[#1E40AF]">¥{formatAmount(customer.customer_total_amount)}</span></span>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </>
      )}
    </div>
  );
}
