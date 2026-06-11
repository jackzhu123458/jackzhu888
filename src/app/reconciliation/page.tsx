'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, Search, ChevronDown, ChevronRight, FileSpreadsheet } from 'lucide-react';

interface Customer {
  id: string;
  name: string;
  code: string;
}

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
  filters: {
    customers: Customer[];
    categories: string[];
  };
  data: CustomerGroup[];
  summary: {
    total_customers: number;
    total_quantity: number;
    total_amount: number;
  };
}

export default function ReconciliationPage() {
  const [data, setData] = useState<ReconciliationData | null>(null);
  const [loading, setLoading] = useState(false);
  const [customerId, setCustomerId] = useState<string>('');
  const [category, setCategory] = useState<string>('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (customerId && customerId !== 'all') params.set('customer_id', customerId);
      if (category && category !== 'all') params.set('category', category);
      if (startDate) params.set('start_date', startDate);
      if (endDate) params.set('end_date', endDate);

      const res = await fetch(`/api/reconciliation?${params}`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error('Failed to fetch reconciliation data:', err);
    } finally {
      setLoading(false);
    }
  }, [customerId, category, startDate, endDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleExport = async () => {
    const params = new URLSearchParams();
    if (customerId) params.set('customer_id', customerId);
    if (category) params.set('category', category);
    if (startDate) params.set('start_date', startDate);
    if (endDate) params.set('end_date', endDate);

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

  const toggleCustomer = (key: string) => {
    setExpandedCustomers(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleCategory = (key: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const formatAmount = (n: number) => n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formatDate = (d: string) => d ? new Date(d).toLocaleDateString('zh-CN') : '';

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">对账管理</h1>
        <Button onClick={handleExport} disabled={!data?.data?.length} className="bg-[#1E40AF] hover:bg-[#1D4ED8]">
          <Download className="w-4 h-4 mr-2" />
          导出Excel
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="w-48">
              <label className="block text-sm text-gray-600 mb-1">客户</label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger>
                  <SelectValue placeholder="全部客户" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部客户</SelectItem>
                  {data?.filters?.customers?.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-36">
              <label className="block text-sm text-gray-600 mb-1">类目</label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="全部类目" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部类目</SelectItem>
                  {data?.filters?.categories?.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-40">
              <label className="block text-sm text-gray-600 mb-1">开始日期</label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div className="w-40">
              <label className="block text-sm text-gray-600 mb-1">结束日期</label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
            <Button onClick={fetchData} disabled={loading}>
              <Search className="w-4 h-4 mr-2" />
              {loading ? '查询中...' : '查询'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      {data?.summary && (
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="text-sm text-gray-600">客户数</div>
              <div className="text-2xl font-semibold text-gray-900 font-mono">{data.summary.total_customers}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="text-sm text-gray-600">总数量</div>
              <div className="text-2xl font-semibold text-gray-900 font-mono">{data.summary.total_quantity.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="text-sm text-gray-600">总金额</div>
              <div className="text-2xl font-semibold text-[#1E40AF] font-mono">¥{formatAmount(data.summary.total_amount)}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Data Table */}
      {data?.data?.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center text-gray-400">
            <FileSpreadsheet className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>暂无已发货的送货单数据</p>
          </CardContent>
        </Card>
      )}

      {data?.data?.map(customer => {
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
                      <span className="text-sm font-medium text-gray-700">类目: {catGroup.category}</span>
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
    </div>
  );
}
