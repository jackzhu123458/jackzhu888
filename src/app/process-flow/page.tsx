'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Star, Edit, Search, GripVertical, ChevronDown, ChevronRight } from 'lucide-react';

/* ---------- 类型 ---------- */
interface ProcessStep {
  id?: string;
  product_id: string;
  step_order: number;
  step_name: string;
  description: string | null;
  estimated_minutes: number | null;
  is_key_step: boolean;
}

interface Product {
  id: string;
  code: string;
  name: string;
  spec: string | null;
  unit: string;
  type: string;
}

interface GroupedFlow {
  product: Product;
  steps: ProcessStep[];
}

export default function ProcessFlowPage() {
  const [flows, setFlows] = useState<GroupedFlow[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');

  // 新增/编辑弹窗
  const [editOpen, setEditOpen] = useState(false);
  const [editProductId, setEditProductId] = useState('');
  const [editProductName, setEditProductName] = useState('');
  const [editSteps, setEditSteps] = useState<Array<{ step_name: string; description: string; estimated_minutes: string; is_key_step: boolean }>>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // 删除
  const [deleteProductId, setDeleteProductId] = useState<string | null>(null);

  // 新增工艺弹窗（选择产品）
  const [addOpen, setAddOpen] = useState(false);
  const [addSearch, setAddSearch] = useState('');

  // 展开状态
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  /* ---------- fetch ---------- */
  const fetchFlows = useCallback(async () => {
    try {
      const res = await fetch('/api/process-flows');
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) {
        // 按 product_id 分组
        const map = new Map<string, ProcessStep[]>();
        data.forEach((s: ProcessStep) => {
          if (!map.has(s.product_id)) map.set(s.product_id, []);
          map.get(s.product_id)!.push(s);
        });

        // 获取产品信息
        const prodRes = await fetch('/api/products');
        const prodData = await prodRes.json();
        const prodList: Product[] = Array.isArray(prodData) ? prodData : prodData.products || [];
        setProducts(prodList);

        const prodMap = new Map(prodList.map((p: Product) => [p.id, p]));

        const grouped: GroupedFlow[] = [];
        map.forEach((steps, productId) => {
          const product = prodMap.get(productId);
          if (product) {
            grouped.push({ product, steps: steps.sort((a, b) => a.step_order - b.step_order) });
          }
        });

        // 按产品编码排序
        grouped.sort((a, b) => a.product.code.localeCompare(b.product.code));
        setFlows(grouped);
        // 默认全部展开
        setExpandedIds(new Set(grouped.map(g => g.product.id)));
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchFlows(); }, [fetchFlows]);

  /* ---------- 搜索过滤 ---------- */
  const filteredFlows = flows.filter(g => {
    if (!searchText.trim()) return true;
    const q = searchText.trim().toLowerCase();
    return (
      g.product.code.toLowerCase().includes(q) ||
      g.product.name.toLowerCase().includes(q) ||
      g.steps.some(s => s.step_name.toLowerCase().includes(q))
    );
  });

  /* ---------- 展开切换 ---------- */
  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  /* ---------- 已有工艺的产品ID集合 ---------- */
  const existingProductIds = new Set(flows.map(f => f.product.id));

  /* ---------- 可添加工艺的产品（还没有工艺的） ---------- */
  const availableProducts = products.filter(p =>
    !existingProductIds.has(p.id) &&
    (p.type === 'finished_product' || p.type === 'semi_finished' || p.type === 'raw_material')
  );
  const filteredAvailable = availableProducts.filter(p => {
    if (!addSearch.trim()) return true;
    const q = addSearch.trim().toLowerCase();
    return p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q);
  });

  /* ---------- 新增工艺 ---------- */
  const handleAdd = (product: Product) => {
    setEditProductId(product.id);
    setEditProductName(product.name);
    setEditSteps([{ step_name: '', description: '', estimated_minutes: '', is_key_step: false }]);
    setSaveError('');
    setAddOpen(false);
    setAddSearch('');
    setEditOpen(true);
  };

  /* ---------- 编辑工艺 ---------- */
  const handleEdit = (flow: GroupedFlow) => {
    setEditProductId(flow.product.id);
    setEditProductName(flow.product.name);
    setEditSteps(flow.steps.map(s => ({
      step_name: s.step_name,
      description: s.description || '',
      estimated_minutes: s.estimated_minutes != null ? String(s.estimated_minutes) : '',
      is_key_step: s.is_key_step,
    })));
    setSaveError('');
    setEditOpen(true);
  };

  /* ---------- 保存 ---------- */
  const handleSave = async () => {
    const validSteps = editSteps.filter(s => s.step_name.trim());
    if (validSteps.length === 0) {
      setSaveError('请至少添加一个工序步骤');
      return;
    }

    setSaving(true);
    setSaveError('');
    try {
      const res = await fetch('/api/process-flows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: editProductId,
          steps: validSteps.map(s => ({
            step_name: s.step_name.trim(),
            description: s.description.trim() || null,
            estimated_minutes: s.estimated_minutes ? Number(s.estimated_minutes) : null,
            is_key_step: s.is_key_step,
          })),
        }),
      });

      if (res.ok) {
        setEditOpen(false);
        fetchFlows();
      } else {
        const err = await res.json();
        setSaveError(err.error || '保存失败');
      }
    } catch {
      setSaveError('网络错误，请重试');
    } finally {
      setSaving(false);
    }
  };

  /* ---------- 删除 ---------- */
  const handleDelete = async () => {
    if (!deleteProductId) return;
    try {
      const res = await fetch(`/api/process-flows?product_id=${deleteProductId}`, { method: 'DELETE' });
      if (res.ok) {
        setDeleteProductId(null);
        fetchFlows();
      }
    } catch { /* ignore */ }
  };

  /* ---------- 工序编辑操作 ---------- */
  const addStep = () => {
    setEditSteps(prev => [...prev, { step_name: '', description: '', estimated_minutes: '', is_key_step: false }]);
  };

  const removeStep = (index: number) => {
    setEditSteps(prev => prev.filter((_, i) => i !== index));
  };

  const updateStep = (index: number, field: string, value: string | boolean) => {
    setEditSteps(prev => prev.map((s, i) => i === index ? { ...s, [field]: value } : s));
  };

  const moveStep = (from: number, to: number) => {
    if (to < 0 || to >= editSteps.length) return;
    const arr = [...editSteps];
    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);
    setEditSteps(arr);
  };

  /* ---------- 渲染 ---------- */
  return (
    <div className="p-6 space-y-4">
      {/* 顶部栏 */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">工艺流程管理</h1>
        <Button onClick={() => { setAddSearch(''); setAddOpen(true); }} className="bg-blue-800 hover:bg-blue-900">
          <Plus className="w-4 h-4 mr-1" /> 新增工艺
        </Button>
      </div>

      {/* 搜索栏 */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          placeholder="搜索产品编码、名称或工序名称"
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          className="pl-9 h-9"
        />
      </div>

      {/* 列表 */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">加载中...</div>
      ) : filteredFlows.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-lg">暂无工艺流程</p>
          <p className="text-sm mt-1">点击"新增工艺"为产品创建工艺流程</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredFlows.map(flow => {
            const isExpanded = expandedIds.has(flow.product.id);
            return (
              <div key={flow.product.id} className="border border-gray-200 rounded-lg bg-white overflow-hidden">
                {/* 产品头 */}
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50"
                  onClick={() => toggleExpand(flow.product.id)}
                >
                  {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                  <span className="font-mono text-sm text-gray-500">{flow.product.code}</span>
                  <span className="text-sm font-medium text-gray-900">{flow.product.name}</span>
                  {flow.product.spec && <span className="text-xs text-gray-400">{flow.product.spec}</span>}
                  <Badge variant="outline" className="text-xs">
                    {flow.steps.length} 道工序
                  </Badge>
                  {flow.steps.some(s => s.is_key_step) && (
                    <Badge className="text-xs bg-amber-100 text-amber-700 border-amber-200">
                      含关键工序
                    </Badge>
                  )}
                  <div className="flex-1" />
                  <span className="text-xs text-gray-400 mr-2">
                    总工时：{flow.steps.reduce((sum, s) => sum + (s.estimated_minutes || 0), 0)} 分钟
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); handleEdit(flow); }}
                    className="h-7 text-xs"
                  >
                    <Edit className="w-3 h-3 mr-1" /> 编辑
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); setDeleteProductId(flow.product.id); }}
                    className="h-7 text-xs text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>

                {/* 工序步骤 */}
                {isExpanded && (
                  <div className="border-t border-gray-100">
                    <div className="px-6 py-2 bg-gray-50/50">
                      <div className="flex items-center gap-2 text-xs text-gray-500 font-medium py-1">
                        <span className="w-10 text-center">序号</span>
                        <span className="flex-1">工序名称</span>
                        <span className="w-20 text-center">工时(分)</span>
                        <span className="w-16 text-center">关键</span>
                        <span className="w-48">说明</span>
                      </div>
                    </div>
                    {flow.steps.map((step, idx) => (
                      <div
                        key={step.id || idx}
                        className={`flex items-center gap-2 px-6 py-2.5 text-sm border-t border-gray-50 ${
                          step.is_key_step ? 'bg-amber-50/50' : ''
                        }`}
                      >
                        <span className="w-10 text-center font-bold text-gray-400">{step.step_order}</span>
                        <div className="flex-1 flex items-center gap-2">
                          {step.is_key_step && <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />}
                          <span className="text-gray-800">{step.step_name}</span>
                        </div>
                        <span className="w-20 text-center font-mono text-gray-600">
                          {step.estimated_minutes != null ? `${step.estimated_minutes}'` : '-'}
                        </span>
                        <span className="w-16 text-center">
                          {step.is_key_step ? (
                            <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-200 px-1.5 py-0">关键</Badge>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </span>
                        <span className="w-48 text-gray-500 text-xs truncate">{step.description || '-'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 新增工艺 - 选择产品弹窗 */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>选择产品</DialogTitle>
            <DialogDescription>为以下产品新增工艺流程（仅显示尚未配置工艺的产品）</DialogDescription>
          </DialogHeader>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="搜索产品编码或名称"
              value={addSearch}
              onChange={e => setAddSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <div className="max-h-[400px] overflow-y-auto space-y-1 mt-2">
            {filteredAvailable.length === 0 ? (
              <div className="text-center py-6 text-gray-400 text-sm">
                {availableProducts.length === 0 ? '所有产品都已有工艺流程' : '没有匹配的产品'}
              </div>
            ) : (
              filteredAvailable.map(p => (
                <button
                  key={p.id}
                  onClick={() => handleAdd(p)}
                  className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-blue-50 flex items-center gap-3 group"
                >
                  <span className="font-mono text-sm text-gray-500 w-24 truncate">{p.code}</span>
                  <span className="text-sm text-gray-800 flex-1 truncate">{p.name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                    {p.type === 'finished_product' ? '成品' : p.type === 'semi_finished' ? '半成品' : '原材料'}
                  </span>
                  <Plus className="w-4 h-4 text-gray-300 group-hover:text-blue-600" />
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 编辑工艺弹窗 */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>工艺流程 - {editProductName}</DialogTitle>
            <DialogDescription>
              编辑该产品的生产工艺流程步骤，支持排序和关键工序标记
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {editSteps.length === 0 ? (
              <div className="text-center py-6 text-gray-400">
                <p>暂无工序步骤</p>
                <p className="text-xs mt-1">点击下方"添加工序"开始编辑</p>
              </div>
            ) : (
              editSteps.map((step, idx) => (
                <div
                  key={idx}
                  className={`flex items-center gap-2 p-3 rounded-lg border ${
                    step.is_key_step ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white'
                  }`}
                >
                  {/* 序号 + 排序 */}
                  <div className="flex flex-col items-center gap-0.5">
                    <button
                      onClick={() => moveStep(idx, idx - 1)}
                      className="text-gray-300 hover:text-gray-600 disabled:opacity-30"
                      disabled={idx === 0}
                      title="上移"
                    >▲</button>
                    <span className="text-sm font-bold text-gray-500 w-5 text-center">{idx + 1}</span>
                    <button
                      onClick={() => moveStep(idx, idx + 1)}
                      className="text-gray-300 hover:text-gray-600 disabled:opacity-30"
                      disabled={idx === editSteps.length - 1}
                      title="下移"
                    >▼</button>
                  </div>

                  {/* 工序名称 */}
                  <div className="flex-1 min-w-0">
                    <Input
                      value={step.step_name}
                      onChange={(e) => updateStep(idx, 'step_name', e.target.value)}
                      placeholder="工序名称，如：落料、冲孔、折弯"
                      className="h-8 text-sm"
                    />
                  </div>

                  {/* 预估工时 */}
                  <div className="w-24">
                    <Input
                      type="number"
                      value={step.estimated_minutes}
                      onChange={(e) => updateStep(idx, 'estimated_minutes', e.target.value)}
                      placeholder="工时(分)"
                      className="h-8 text-sm text-center"
                    />
                  </div>

                  {/* 关键工序 */}
                  <button
                    onClick={() => updateStep(idx, 'is_key_step', !step.is_key_step)}
                    className={`p-1.5 rounded transition-colors ${
                      step.is_key_step ? 'text-amber-500' : 'text-gray-300 hover:text-amber-400'
                    }`}
                    title={step.is_key_step ? '取消关键工序' : '标记为关键工序'}
                  >
                    <Star className={`w-4 h-4 ${step.is_key_step ? 'fill-amber-500' : ''}`} />
                  </button>

                  {/* 说明 */}
                  <div className="w-32">
                    <Input
                      value={step.description}
                      onChange={(e) => updateStep(idx, 'description', e.target.value)}
                      placeholder="说明"
                      className="h-8 text-sm"
                    />
                  </div>

                  {/* 删除 */}
                  <button
                    onClick={() => removeStep(idx)}
                    className="p-1.5 text-gray-300 hover:text-red-500 transition-colors"
                    title="删除工序"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>

          {saveError && <p className="text-sm text-red-600 mt-2">{saveError}</p>}

          <div className="flex items-center justify-between mt-4">
            <Button variant="outline" size="sm" onClick={addStep}>
              <Plus className="w-4 h-4 mr-1" /> 添加工序
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditOpen(false)}>取消</Button>
              <Button onClick={handleSave} disabled={saving} className="bg-blue-800 hover:bg-blue-900">
                {saving ? '保存中...' : '保存'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <AlertDialog open={!!deleteProductId} onOpenChange={() => setDeleteProductId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确认删除该产品的全部工艺流程吗？此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">确认删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
