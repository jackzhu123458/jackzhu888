'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AlertTriangle, Plus, Search, FileCheck, Shield, Printer } from 'lucide-react';

/* ── Types ── */
interface Product {
  id: string;
  code: string;
  name: string;
  spec: string | null;
  unit: string;
  category: string | null;
  type: string;
}

interface QualityAlert {
  id: string;
  product_id: string;
  alert_type: string;
  severity: string;
  title: string;
  description: string | null;
  status: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution: string | null;
  created_by: string | null;
  images: string[] | null;
  created_at: string;
  updated_at: string | null;
  products: Product | Product[];
}

interface InspectionReport {
  id: string;
  report_no: string;
  delivery_note_id: string | null;
  product_id: string;
  inspection_date: string;
  result: string;
  inspector: string | null;
  approved_by: string | null;
  batch_no: string | null;
  quantity: string | null;
  sample_quantity: string | null;
  items: string | null;
  conclusion: string | null;
  remark: string | null;
  created_at: string;
  updated_at: string | null;
  products: Product | Product[];
  delivery_notes?: { id: string; note_no: string; customer_name: string; delivery_date: string } | null;
}

/* ── Maps ── */
const alertTypeMap: Record<string, { label: string; color: string }> = {
  defect: { label: '缺陷', color: 'bg-orange-100 text-orange-700 border-orange-200' },
  nonconformity: { label: '不合格', color: 'bg-red-100 text-red-700 border-red-200' },
  complaint: { label: '客户投诉', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  recall: { label: '召回', color: 'bg-red-200 text-red-900 border-red-300' },
};

const severityMap: Record<string, { label: string; color: string; dot: string }> = {
  low: { label: '低', color: 'bg-gray-100 text-gray-700 border-gray-200', dot: 'bg-gray-400' },
  medium: { label: '中', color: 'bg-yellow-100 text-yellow-700 border-yellow-200', dot: 'bg-yellow-400' },
  high: { label: '高', color: 'bg-orange-100 text-orange-700 border-orange-200', dot: 'bg-orange-400' },
  critical: { label: '严重', color: 'bg-red-100 text-red-700 border-red-200', dot: 'bg-red-500 animate-pulse' },
};

const alertStatusMap: Record<string, { label: string; color: string }> = {
  active: { label: '活跃', color: 'bg-red-50 text-red-700 border-red-200' },
  resolved: { label: '已解决', color: 'bg-green-50 text-green-700 border-green-200' },
  closed: { label: '已关闭', color: 'bg-gray-50 text-gray-500 border-gray-200' },
};

const inspectionResultMap: Record<string, { label: string; color: string }> = {
  passed: { label: '合格', color: 'bg-green-100 text-green-700 border-green-200' },
  failed: { label: '不合格', color: 'bg-red-100 text-red-700 border-red-200' },
  conditional: { label: '有条件接收', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
};

function getRel<T>(val: T | T[] | null | undefined): T | null {
  if (!val) return null;
  if (Array.isArray(val)) return val[0] || null;
  return val;
}

/* ── Component ── */
export default function QualityPage() {
  const [tab, setTab] = useState<'alerts' | 'inspection'>('alerts');

  // Quality Alerts state
  const [alerts, setAlerts] = useState<QualityAlert[]>([]);
  const [alertSearch, setAlertSearch] = useState('');
  const [alertStatusFilter, setAlertStatusFilter] = useState<string>('all');
  const [alertDialogOpen, setAlertDialogOpen] = useState(false);
  const [editingAlert, setEditingAlert] = useState<QualityAlert | null>(null);
  const [deleteAlertId, setDeleteAlertId] = useState<string | null>(null);

  // Inspection Reports state
  const [reports, setReports] = useState<InspectionReport[]>([]);
  const [reportSearch, setReportSearch] = useState('');
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [editingReport, setEditingReport] = useState<InspectionReport | null>(null);
  const [deleteReportId, setDeleteReportId] = useState<string | null>(null);
  const [printReport, setPrintReport] = useState<InspectionReport | null>(null);

  // Products for dropdowns
  const [products, setProducts] = useState<Product[]>([]);

  // Alert form
  const [formProductId, setFormProductId] = useState('');
  const [formAlertType, setFormAlertType] = useState('defect');
  const [formSeverity, setFormSeverity] = useState('medium');
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formResolution, setFormResolution] = useState('');
  const [formImages, setFormImages] = useState<string[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Inspection form
  const [inspProductId, setInspProductId] = useState('');
  const [inspDeliveryNoteId, setInspDeliveryNoteId] = useState('');
  const [inspResult, setInspResult] = useState('passed');
  const [inspInspector, setInspInspector] = useState('');
  const [inspApprovedBy, setInspApprovedBy] = useState('');
  const [inspBatchNo, setInspBatchNo] = useState('');
  const [inspQuantity, setInspQuantity] = useState('');
  const [inspSampleQty, setInspSampleQty] = useState('');
  const [inspConclusion, setInspConclusion] = useState('');
  const [inspRemark, setInspRemark] = useState('');
  const [inspSaveError, setInspSaveError] = useState('');
  const [inspItems, setInspItems] = useState<Array<{ name: string; standard: string; result: string; passed: boolean }>>([
    { name: '外观检查', standard: '无毛刺、划伤、变形', result: '', passed: true },
    { name: '尺寸检查', standard: '符合图纸公差要求', result: '', passed: true },
    { name: '性能测试', standard: '满足技术参数', result: '', passed: true },
    { name: '包装检查', standard: '包装完好、标识清晰', result: '', passed: true },
  ]);

  const loadData = useCallback(async () => {
    try {
      const [alertRes, reportRes, prodRes] = await Promise.all([
        fetch('/api/quality/alerts'),
        fetch('/api/quality/inspection'),
        fetch('/api/products'),
      ]);
      if (alertRes.ok) setAlerts(await alertRes.json());
      if (reportRes.ok) setReports(await reportRes.json());
      if (prodRes.ok) {
        const prodData = await prodRes.json();
        setProducts(Array.isArray(prodData) ? prodData : []);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  /* ── Alert Handlers ── */
  const openNewAlert = () => {
    setEditingAlert(null);
    setFormProductId('');
    setFormAlertType('defect');
    setFormSeverity('medium');
    setFormTitle('');
    setFormDescription('');
    setFormResolution('');
    setFormImages([]);
    setSaveError('');
    setProductSearch('');
    setAlertDialogOpen(true);
  };

  const openEditAlert = (alert: QualityAlert) => {
    setEditingAlert(alert);
    setFormProductId(alert.product_id);
    setFormAlertType(alert.alert_type);
    setFormSeverity(alert.severity);
    setFormTitle(alert.title);
    setFormDescription(alert.description || '');
    setFormResolution(alert.resolution || '');
    setFormImages(alert.images || []);
    setSaveError('');
    setProductSearch('');
    setAlertDialogOpen(true);
  };

  const saveAlert = async () => {
    if (!formProductId) {
      setSaveError('请选择产品');
      return;
    }
    if (!formTitle) {
      setSaveError('请填写标题');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      if (editingAlert) {
        // Update
        const body: Record<string, unknown> = {
          id: editingAlert.id,
          severity: formSeverity,
          title: formTitle,
          description: formDescription,
          images: formImages,
        };
        if (formResolution) {
          body.resolution = formResolution;
          body.status = 'resolved';
        }
        const res = await fetch('/api/quality/alerts', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || '保存失败');
        }
      } else {
        const res = await fetch('/api/quality/alerts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            product_id: formProductId,
            alert_type: formAlertType,
            severity: formSeverity,
            title: formTitle,
            description: formDescription,
            images: formImages,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || '保存失败');
        }
      }
      setAlertDialogOpen(false);
      loadData();
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const resolveAlert = async (alert: QualityAlert) => {
    await fetch('/api/quality/alerts', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: alert.id,
        status: 'resolved',
        resolution: formResolution || '已处理',
        resolved_by: 'admin',
      }),
    });
    loadData();
  };

  const closeAlert = async (alert: QualityAlert) => {
    await fetch('/api/quality/alerts', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: alert.id, status: 'closed' }),
    });
    loadData();
  };

  const doDeleteAlert = async () => {
    if (!deleteAlertId) return;
    await fetch(`/api/quality/alerts?id=${deleteAlertId}`, { method: 'DELETE' });
    setDeleteAlertId(null);
    loadData();
  };

  /* ── Inspection Handlers ── */
  const openNewReport = () => {
    setEditingReport(null);
    setInspProductId('');
    setInspDeliveryNoteId('');
    setInspResult('passed');
    setInspInspector('');
    setInspApprovedBy('');
    setInspBatchNo('');
    setInspQuantity('');
    setInspSampleQty('');
    setInspConclusion('');
    setInspRemark('');
    setInspItems([
      { name: '外观检查', standard: '无毛刺、划伤、变形', result: '', passed: true },
      { name: '尺寸检查', standard: '符合图纸公差要求', result: '', passed: true },
      { name: '性能测试', standard: '满足技术参数', result: '', passed: true },
      { name: '包装检查', standard: '包装完好、标识清晰', result: '', passed: true },
    ]);
    setInspSaveError('');
    setProductSearch('');
    setReportDialogOpen(true);
  };

  const openEditReport = (report: InspectionReport) => {
    setEditingReport(report);
    setInspProductId(report.product_id);
    setInspDeliveryNoteId(report.delivery_note_id || '');
    setInspResult(report.result);
    setInspInspector(report.inspector || '');
    setInspApprovedBy(report.approved_by || '');
    setInspBatchNo(report.batch_no || '');
    setInspQuantity(report.quantity || '');
    setInspSampleQty(report.sample_quantity || '');
    setInspConclusion(report.conclusion || '');
    setInspRemark(report.remark || '');
    try {
      const items = typeof report.items === 'string' ? JSON.parse(report.items) : report.items;
      setInspItems(Array.isArray(items) ? items : []);
    } catch {
      setInspItems([]);
    }
    setInspSaveError('');
    setProductSearch('');
    setReportDialogOpen(true);
  };

  const saveReport = async () => {
    if (!inspProductId) {
      setInspSaveError('请选择产品');
      return;
    }
    setInspSaveError('');
    try {
      if (editingReport) {
        const res = await fetch('/api/quality/inspection', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingReport.id,
            result: inspResult,
            inspector: inspInspector,
            approved_by: inspApprovedBy,
            batch_no: inspBatchNo,
            quantity: inspQuantity,
            sample_quantity: inspSampleQty,
            items: inspItems,
            conclusion: inspConclusion,
            remark: inspRemark,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || '保存失败');
        }
      } else {
        const res = await fetch('/api/quality/inspection', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            product_id: inspProductId,
            delivery_note_id: inspDeliveryNoteId || null,
            result: inspResult,
            inspector: inspInspector,
            approved_by: inspApprovedBy,
            batch_no: inspBatchNo,
            quantity: inspQuantity,
            sample_quantity: inspSampleQty,
            items: inspItems,
            conclusion: inspConclusion,
            remark: inspRemark,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || '保存失败');
        }
      }
      setReportDialogOpen(false);
      loadData();
    } catch (e: unknown) {
      setInspSaveError(e instanceof Error ? e.message : '保存失败');
    }
  };

  const doDeleteReport = async () => {
    if (!deleteReportId) return;
    await fetch(`/api/quality/inspection?id=${deleteReportId}`, { method: 'DELETE' });
    setDeleteReportId(null);
    loadData();
  };

  /* ── Filters ── */
  const filteredAlerts = alerts.filter(a => {
    const prod = getRel(a.products);
    const matchSearch = !alertSearch ||
      a.title.toLowerCase().includes(alertSearch.toLowerCase()) ||
      (a.description || '').toLowerCase().includes(alertSearch.toLowerCase()) ||
      (prod?.code || '').toLowerCase().includes(alertSearch.toLowerCase()) ||
      (prod?.name || '').toLowerCase().includes(alertSearch.toLowerCase());
    const matchStatus = alertStatusFilter === 'all' || a.status === alertStatusFilter;
    return matchSearch && matchStatus;
  });

  const filteredReports = reports.filter(r => {
    const prod = getRel(r.products);
    const matchSearch = !reportSearch ||
      r.report_no.toLowerCase().includes(reportSearch.toLowerCase()) ||
      (prod?.code || '').toLowerCase().includes(reportSearch.toLowerCase()) ||
      (prod?.name || '').toLowerCase().includes(reportSearch.toLowerCase()) ||
      (r.inspector || '').toLowerCase().includes(reportSearch.toLowerCase());
    return matchSearch;
  });

  const filteredProducts = products.filter(p =>
    !productSearch ||
    p.code.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.name.toLowerCase().includes(productSearch.toLowerCase())
  ).slice(0, 20);

  const activeAlertCount = alerts.filter(a => a.status === 'active').length;

  return (
    <div className="p-6 space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-gray-900">质量管理</h1>
          {activeAlertCount > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200 animate-pulse">
              {activeAlertCount} 条活跃警示
            </span>
          )}
        </div>
      </div>

      {/* Tab 切换 */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setTab('alerts')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'alerts'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <AlertTriangle className="h-4 w-4 inline mr-1.5" />
          质量警示
          {activeAlertCount > 0 && <span className="ml-1.5 text-xs font-mono">({activeAlertCount})</span>}
        </button>
        <button
          onClick={() => setTab('inspection')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'inspection'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <FileCheck className="h-4 w-4 inline mr-1.5" />
          出厂检验报告
        </button>
      </div>

      {/* ═══ 质量警示 Tab ═══ */}
      {tab === 'alerts' && (
        <div className="space-y-4">
          {/* 工具栏 */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
              <Input
                placeholder="搜索产品、标题..."
                value={alertSearch}
                onChange={e => setAlertSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <Select value={alertStatusFilter} onValueChange={setAlertStatusFilter}>
              <SelectTrigger className="w-[140px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="active">活跃</SelectItem>
                <SelectItem value="resolved">已解决</SelectItem>
                <SelectItem value="closed">已关闭</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={openNewAlert} size="sm" className="h-9">
              <Plus className="h-4 w-4 mr-1" /> 新增警示
            </Button>
          </div>

          {/* 警示列表 */}
          {filteredAlerts.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-400">暂无质量警示</div>
          ) : (
            <div className="space-y-2">
              {filteredAlerts.map(alert => {
                const prod = getRel(alert.products);
                const sev = severityMap[alert.severity] || severityMap.medium;
                const atype = alertTypeMap[alert.alert_type] || alertTypeMap.defect;
                const astatus = alertStatusMap[alert.status] || alertStatusMap.active;
                return (
                  <div key={alert.id} className="bg-white border border-gray-200 rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <div className={`w-2 h-2 rounded-full ${sev.dot}`} />
                          <span className="text-sm font-medium text-gray-900">{alert.title}</span>
                          <Badge variant="outline" className={`text-xs ${atype.color}`}>{atype.label}</Badge>
                          <Badge variant="outline" className={`text-xs ${sev.color}`}>{sev.label}</Badge>
                          <Badge variant="outline" className={`text-xs ${astatus.color}`}>{astatus.label}</Badge>
                        </div>
                        {prod && (
                          <div className="text-xs text-gray-500 mb-1">
                            <span className="font-mono">{prod.code}</span> - {prod.name}
                            {prod.spec && <span className="ml-1 text-gray-400">({prod.spec})</span>}
                          </div>
                        )}
                        {alert.description && (
                          <div className="text-xs text-gray-600 mt-1">{alert.description}</div>
                        )}
                        {alert.images && alert.images.length > 0 && (
                          <div className="flex gap-1.5 mt-1.5">
                            {alert.images.map((url, idx) => (
                              <a key={idx} href={url} target="_blank" rel="noopener noreferrer">
                                <img src={url} alt={`照片${idx + 1}`} className="w-12 h-12 object-cover rounded border hover:opacity-80 transition-opacity" />
                              </a>
                            ))}
                          </div>
                        )}
                        {alert.resolution && (
                          <div className="text-xs text-green-600 mt-1">
                            解决方案: {alert.resolution}
                            {alert.resolved_by && <span className="ml-2 text-gray-400">({alert.resolved_by})</span>}
                          </div>
                        )}
                        <div className="text-xs text-gray-400 mt-1.5">
                          {new Date(alert.created_at).toLocaleString('zh-CN')}
                          {alert.resolved_at && (
                            <span className="ml-3">解决于 {new Date(alert.resolved_at).toLocaleString('zh-CN')}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 ml-3 flex-shrink-0">
                        {alert.status === 'active' && (
                          <>
                            <Button variant="outline" size="sm" className="h-7 text-xs"
                              onClick={() => { setEditingAlert(alert); setFormResolution(''); setAlertDialogOpen(true); }}>
                              处理
                            </Button>
                            <Button variant="outline" size="sm" className="h-7 text-xs text-green-600"
                              onClick={() => resolveAlert(alert)}>
                              解决
                            </Button>
                          </>
                        )}
                        {alert.status === 'resolved' && (
                          <Button variant="outline" size="sm" className="h-7 text-xs"
                            onClick={() => closeAlert(alert)}>
                            关闭
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" className="h-7 text-xs"
                          onClick={() => openEditAlert(alert)}>
                          编辑
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-red-600"
                          onClick={() => setDeleteAlertId(alert.id)}>
                          删除
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══ 出厂检验报告 Tab ═══ */}
      {tab === 'inspection' && (
        <div className="space-y-4">
          {/* 工具栏 */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
              <Input
                placeholder="搜索报告编号、产品..."
                value={reportSearch}
                onChange={e => setReportSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <Button onClick={openNewReport} size="sm" className="h-9">
              <Plus className="h-4 w-4 mr-1" /> 新增检验报告
            </Button>
          </div>

          {/* 报告列表 */}
          {filteredReports.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-400">暂无检验报告</div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">报告编号</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">产品</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">检验日期</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">检验员</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">批次号</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">结论</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReports.map(report => {
                    const prod = getRel(report.products);
                    const rmap = inspectionResultMap[report.result] || inspectionResultMap.passed;
                    return (
                      <tr key={report.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                        <td className="px-4 py-3 font-mono text-xs text-gray-900">{report.report_no}</td>
                        <td className="px-4 py-3">
                          {prod && (
                            <div>
                              <span className="font-mono text-xs text-gray-600">{prod.code}</span>
                              <span className="ml-1 text-xs text-gray-900">{prod.name}</span>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600">
                          {new Date(report.inspection_date).toLocaleDateString('zh-CN')}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600">{report.inspector || '-'}</td>
                        <td className="px-4 py-3 text-xs font-mono text-gray-600">{report.batch_no || '-'}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={`text-xs ${rmap.color}`}>{rmap.label}</Badge>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button variant="ghost" size="sm" className="h-7 text-xs"
                              onClick={() => setPrintReport(report)}>
                              <Printer className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 text-xs"
                              onClick={() => openEditReport(report)}>
                              编辑
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 text-xs text-red-600"
                              onClick={() => setDeleteReportId(report.id)}>
                              删除
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══ 新增/编辑 质量警示 弹窗 ═══ */}
      <Dialog open={alertDialogOpen} onOpenChange={setAlertDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingAlert ? '编辑质量警示' : '新增质量警示'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* 产品选择 */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">产品 *</label>
              <Input
                placeholder="搜索产品编码/名称..."
                value={productSearch}
                onChange={e => { setProductSearch(e.target.value); if (formProductId) setFormProductId(''); }}
                onFocus={() => { if (formProductId) setProductSearch(''); }}
                className="h-9 mb-2"
              />
              {formProductId && (
                <div className="mb-2 text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded">
                  已选: {products.find(p => p.id === formProductId)?.code} - {products.find(p => p.id === formProductId)?.name}
                </div>
              )}
              <div className="max-h-40 overflow-y-auto border border-gray-200 rounded">
                {filteredProducts.map(p => (
                  <button
                    key={p.id}
                    onClick={() => { setFormProductId(p.id); setProductSearch(`${p.code} - ${p.name}`); }}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50 transition-colors ${
                      formProductId === p.id ? 'bg-blue-50 text-blue-700' : ''
                    }`}
                  >
                    <span className="font-mono">{p.code}</span> - {p.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">类型</label>
                <Select value={formAlertType} onValueChange={setFormAlertType}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="defect">缺陷</SelectItem>
                    <SelectItem value="nonconformity">不合格</SelectItem>
                    <SelectItem value="complaint">客户投诉</SelectItem>
                    <SelectItem value="recall">召回</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">严重程度</label>
                <Select value={formSeverity} onValueChange={setFormSeverity}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">低</SelectItem>
                    <SelectItem value="medium">中</SelectItem>
                    <SelectItem value="high">高</SelectItem>
                    <SelectItem value="critical">严重</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">标题 *</label>
              <Input value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="简短描述质量警示" className="h-9" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">详细描述</label>
              <Textarea value={formDescription} onChange={e => setFormDescription(e.target.value)} placeholder="缺陷现象、影响范围、发现过程等" rows={3} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">现场照片</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {formImages.map((url, idx) => (
                  <div key={idx} className="relative w-20 h-20 border rounded overflow-hidden group">
                    <img src={url} alt={`照片${idx + 1}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setFormImages(prev => prev.filter((_, i) => i !== idx))}
                      className="absolute top-0 right-0 bg-red-500 text-white w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                    >×</button>
                  </div>
                ))}
                <label className="w-20 h-20 border-2 border-dashed border-gray-300 rounded flex items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 10 * 1024 * 1024) { alert('图片不能超过10MB'); return; }
                      try {
                        const formData = new FormData();
                        formData.append('file', file);
                        const res = await fetch('/api/quality/upload', { method: 'POST', body: formData });
                        if (!res.ok) throw new Error('上传失败');
                        const data = await res.json();
                        setFormImages(prev => [...prev, data.url]);
                      } catch { alert('图片上传失败'); }
                      e.target.value = '';
                    }}
                  />
                  <span className="text-gray-400 text-2xl">+</span>
                </label>
              </div>
              <p className="text-xs text-gray-400">支持 JPG/PNG，单张不超过10MB</p>
            </div>
            {editingAlert && editingAlert.status === 'active' && (
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">解决方案（填写后自动标记为已解决）</label>
                <Textarea value={formResolution} onChange={e => setFormResolution(e.target.value)} placeholder="解决措施、预防方案等" rows={2} />
              </div>
            )}
            {saveError && <p className="text-sm text-red-600">{saveError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAlertDialogOpen(false)} disabled={saving}>取消</Button>
            <Button onClick={saveAlert} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ 新增/编辑 检验报告 弹窗 ═══ */}
      <Sheet open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
        <SheetContent className="w-[640px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editingReport ? '编辑检验报告' : '新增检验报告'}</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 py-4">
            {/* 产品选择 */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">产品 *</label>
              <Input
                placeholder="搜索产品编码/名称..."
                value={productSearch}
                onChange={e => { setProductSearch(e.target.value); if (inspProductId) setInspProductId(''); }}
                onFocus={() => { if (inspProductId) setProductSearch(''); }}
                className="h-9 mb-2"
              />
              {inspProductId && (
                <div className="mb-2 text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded">
                  已选: {products.find(p => p.id === inspProductId)?.code} - {products.find(p => p.id === inspProductId)?.name}
                </div>
              )}
              <div className="max-h-32 overflow-y-auto border border-gray-200 rounded">
                {filteredProducts.map(p => (
                  <button
                    key={p.id}
                    onClick={() => { setInspProductId(p.id); setProductSearch(`${p.code} - ${p.name}`); }}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50 transition-colors ${
                      inspProductId === p.id ? 'bg-blue-50 text-blue-700' : ''
                    }`}
                  >
                    <span className="font-mono">{p.code}</span> - {p.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">检验结论</label>
                <Select value={inspResult} onValueChange={setInspResult}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="passed">合格</SelectItem>
                    <SelectItem value="failed">不合格</SelectItem>
                    <SelectItem value="conditional">有条件接收</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">批次号</label>
                <Input value={inspBatchNo} onChange={e => setInspBatchNo(e.target.value)} className="h-9" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">检验员</label>
                <Input value={inspInspector} onChange={e => setInspInspector(e.target.value)} className="h-9" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">批准人</label>
                <Input value={inspApprovedBy} onChange={e => setInspApprovedBy(e.target.value)} className="h-9" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">检验数量</label>
                <Input type="number" value={inspQuantity} onChange={e => setInspQuantity(e.target.value)} className="h-9" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">抽样数量</label>
                <Input type="number" value={inspSampleQty} onChange={e => setInspSampleQty(e.target.value)} className="h-9" />
              </div>
            </div>

            {/* 检验项目明细 */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">检验项目明细</label>
                <Button variant="outline" size="sm" className="h-7 text-xs"
                  onClick={() => setInspItems([...inspItems, { name: '', standard: '', result: '', passed: true }])}>
                  + 添加项目
                </Button>
              </div>
              <div className="space-y-2">
                {inspItems.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_1fr_1fr_40px] gap-2 items-center">
                    <Input
                      placeholder="检验项目"
                      value={item.name}
                      onChange={e => {
                        const newItems = [...inspItems];
                        newItems[idx] = { ...newItems[idx], name: e.target.value };
                        setInspItems(newItems);
                      }}
                      className="h-8 text-xs"
                    />
                    <Input
                      placeholder="标准要求"
                      value={item.standard}
                      onChange={e => {
                        const newItems = [...inspItems];
                        newItems[idx] = { ...newItems[idx], standard: e.target.value };
                        setInspItems(newItems);
                      }}
                      className="h-8 text-xs"
                    />
                    <div className="flex items-center gap-1">
                      <Input
                        placeholder="检验结果"
                        value={item.result}
                        onChange={e => {
                          const newItems = [...inspItems];
                          newItems[idx] = { ...newItems[idx], result: e.target.value };
                          setInspItems(newItems);
                        }}
                        className="h-8 text-xs"
                      />
                      <button
                        onClick={() => {
                          const newItems = [...inspItems];
                          newItems[idx] = { ...newItems[idx], passed: !newItems[idx].passed };
                          setInspItems(newItems);
                        }}
                        className={`w-6 h-6 rounded text-xs font-bold flex-shrink-0 ${
                          item.passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {item.passed ? '✓' : '✕'}
                      </button>
                    </div>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-400"
                      onClick={() => setInspItems(inspItems.filter((_, i) => i !== idx))}>
                      ×
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">检验结论</label>
              <Textarea value={inspConclusion} onChange={e => setInspConclusion(e.target.value)} rows={2} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">备注</label>
              <Textarea value={inspRemark} onChange={e => setInspRemark(e.target.value)} rows={2} />
            </div>
            {inspSaveError && <p className="text-sm text-red-600">{inspSaveError}</p>}
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setReportDialogOpen(false)}>取消</Button>
            <Button onClick={saveReport}>保存</Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* ═══ 删除确认 - 警示 ═══ */}
      <AlertDialog open={!!deleteAlertId} onOpenChange={() => setDeleteAlertId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>确定要删除这条质量警示吗？此操作不可撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={doDeleteAlert} className="bg-red-600 hover:bg-red-700">删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ═══ 删除确认 - 检验报告 ═══ */}
      <AlertDialog open={!!deleteReportId} onOpenChange={() => setDeleteReportId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>确定要删除这份检验报告吗？此操作不可撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={doDeleteReport} className="bg-red-600 hover:bg-red-700">删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ═══ 检验报告打印预览 ═══ */}
      <Dialog open={!!printReport} onOpenChange={() => setPrintReport(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>检验报告打印预览</DialogTitle>
          </DialogHeader>
          {printReport && <InspectionReportPrint report={printReport} products={products} />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPrintReport(null)}>关闭</Button>
            <Button onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-1" /> 打印
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── 检验报告打印模板 ── */
function InspectionReportPrint({ report, products }: { report: InspectionReport; products: Product[] }) {
  const prod = getRel(report.products);
  let items: Array<{ name: string; standard: string; result: string; passed: boolean }> = [];
  try {
    items = typeof report.items === 'string' ? JSON.parse(report.items) : (report.items || []);
  } catch { /* ignore */ }

  return (
    <div id="inspection-report-print" className="bg-white p-6 text-sm" style={{ fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif' }}>
      <div className="text-center mb-6">
        <h2 className="text-lg font-bold">出厂检验报告</h2>
        <div className="text-xs text-gray-500 mt-1">报告编号: {report.report_no}</div>
      </div>

      <div className="grid grid-cols-2 gap-x-8 gap-y-2 mb-4 text-xs">
        <div className="flex"><span className="text-gray-500 w-20">产品名称:</span><span className="font-medium">{prod?.name || '-'}</span></div>
        <div className="flex"><span className="text-gray-500 w-20">产品编号:</span><span className="font-mono">{prod?.code || '-'}</span></div>
        <div className="flex"><span className="text-gray-500 w-20">规格型号:</span><span>{prod?.spec || '-'}</span></div>
        <div className="flex"><span className="text-gray-500 w-20">批次号:</span><span className="font-mono">{report.batch_no || '-'}</span></div>
        <div className="flex"><span className="text-gray-500 w-20">检验数量:</span><span className="font-mono">{report.quantity || '-'}</span></div>
        <div className="flex"><span className="text-gray-500 w-20">抽样数量:</span><span className="font-mono">{report.sample_quantity || '-'}</span></div>
        <div className="flex"><span className="text-gray-500 w-20">检验日期:</span><span>{new Date(report.inspection_date).toLocaleDateString('zh-CN')}</span></div>
        <div className="flex"><span className="text-gray-500 w-20">检验员:</span><span>{report.inspector || '-'}</span></div>
      </div>

      {/* 检验项目明细 */}
      {items.length > 0 && (
        <table className="w-full border-collapse text-xs mb-4">
          <thead>
            <tr className="bg-gray-50">
              <th className="border border-gray-300 px-2 py-1.5 text-left">序号</th>
              <th className="border border-gray-300 px-2 py-1.5 text-left">检验项目</th>
              <th className="border border-gray-300 px-2 py-1.5 text-left">标准要求</th>
              <th className="border border-gray-300 px-2 py-1.5 text-left">检验结果</th>
              <th className="border border-gray-300 px-2 py-1.5 text-center">判定</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={idx}>
                <td className="border border-gray-300 px-2 py-1.5">{idx + 1}</td>
                <td className="border border-gray-300 px-2 py-1.5">{item.name}</td>
                <td className="border border-gray-300 px-2 py-1.5">{item.standard}</td>
                <td className="border border-gray-300 px-2 py-1.5">{item.result}</td>
                <td className="border border-gray-300 px-2 py-1.5 text-center">
                  <span className={item.passed ? 'text-green-700 font-bold' : 'text-red-700 font-bold'}>
                    {item.passed ? '合格' : '不合格'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* 结论 */}
      <div className="border border-gray-300 rounded p-3 mb-4 text-xs">
        <div className="font-medium mb-1">检验结论:</div>
        <div className="flex items-center gap-3 mb-2">
          <span className={report.result === 'passed' ? 'text-green-700 font-bold' : 'text-red-700 font-bold'}>
            {report.result === 'passed' ? '✓ 合格' : report.result === 'failed' ? '✕ 不合格' : '△ 有条件接收'}
          </span>
          {report.conclusion && <span className="text-gray-600">{report.conclusion}</span>}
        </div>
      </div>

      {/* 签名 */}
      <div className="grid grid-cols-3 gap-8 text-xs mt-8">
        <div className="border-t border-gray-400 pt-2">
          <span className="text-gray-500">检验员:</span> {report.inspector || ''}
        </div>
        <div className="border-t border-gray-400 pt-2">
          <span className="text-gray-500">批准人:</span> {report.approved_by || ''}
        </div>
        <div className="border-t border-gray-400 pt-2">
          <span className="text-gray-500">日期:</span> {new Date(report.inspection_date).toLocaleDateString('zh-CN')}
        </div>
      </div>

      {report.remark && (
        <div className="mt-4 text-xs text-gray-500">备注: {report.remark}</div>
      )}

      <div className="mt-4 text-right text-xs text-gray-300">
        {products.length > 0 ? '仓库进销存系统' : ''} - 打印时间: {new Date().toLocaleString('zh-CN')}
      </div>
    </div>
  );
}
