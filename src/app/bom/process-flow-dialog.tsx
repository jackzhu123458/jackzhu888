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
} from '@/components/ui/dialog';
import { Plus, Trash2, Save, Star, X, GitBranch, ChevronDown, ChevronRight, Settings } from 'lucide-react';

interface ProcessStep {
  id?: string;
  step_order: number;
  step_name: string;
  description: string | null;
  estimated_minutes: number | null;
  is_key_step: boolean;
  branch: string | null;
}

interface StepTemplate {
  id: string;
  step_name: string;
}

interface ProcessFlowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  productName: string;
}

/* ---------- 可视化流程预览 ---------- */
function FlowPreview({ steps }: { steps: ProcessStep[] }) {
  if (steps.length === 0) return null;

  const groups: Map<number, ProcessStep[]> = new Map();
  steps.forEach(s => {
    const key = s.step_order;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  });

  const sortedOrders = Array.from(groups.keys()).sort((a, b) => a - b);

  return (
    <div className="border border-gray-200 rounded-lg p-3 bg-white mb-3">
      <div className="text-xs font-medium text-gray-500 mb-2">流程预览</div>
      <div className="flex flex-col items-center gap-1 overflow-x-auto">
        {sortedOrders.map((order, oi) => {
          const groupSteps = groups.get(order)!;
          const isParallel = groupSteps.length > 1;
          const mainStep = groupSteps.find(s => !s.branch);
          const branchSteps = groupSteps.filter(s => s.branch);

          return (
            <div key={order} className="flex flex-col items-center">
              {oi > 0 && <div className="w-px h-3 bg-gray-300" />}
              {isParallel ? (
                <div className="flex items-start gap-2">
                  <div className="flex flex-col items-center">
                    <div className="w-px h-2 bg-gray-300" />
                    <div className="text-[10px] text-gray-400 font-medium">并行</div>
                    <div className="w-px h-2 bg-gray-300" />
                  </div>
                  <div className="flex gap-2 items-start">
                    {mainStep && <StepBadge step={mainStep} />}
                    {branchSteps.map((bs, bi) => (
                      <div key={bi} className="flex items-start gap-1">
                        <span className="text-[10px] text-gray-400 mt-1 font-medium">{bs.branch}</span>
                        <StepBadge step={bs} />
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="w-px h-2 bg-gray-300" />
                    <div className="text-[10px] text-gray-400 font-medium">合并</div>
                    <div className="w-px h-2 bg-gray-300" />
                  </div>
                </div>
              ) : (
                <StepBadge step={groupSteps[0]} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StepBadge({ step }: { step: ProcessStep }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap ${
      step.is_key_step
        ? 'bg-amber-100 text-amber-800 border border-amber-300'
        : 'bg-gray-100 text-gray-700 border border-gray-200'
    }`}>
      {step.step_name}
      {step.is_key_step && <span className="ml-0.5 text-amber-500">★</span>}
      {step.estimated_minutes && <span className="ml-1 text-gray-400 text-[10px]">{step.estimated_minutes}min</span>}
    </span>
  );
}

/* ---------- 主弹窗组件 ---------- */
export default function ProcessFlowDialog({ open, onOpenChange, productId, productName }: ProcessFlowDialogProps) {
  const [steps, setSteps] = useState<ProcessStep[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [templateNames, setTemplateNames] = useState<string[]>([]);
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [showPreview, setShowPreview] = useState(true);

  // 模板管理面板状态
  const [newTemplateName, setNewTemplateName] = useState('');
  const [addingTemplate, setAddingTemplate] = useState(false);
  const [templateItems, setTemplateItems] = useState<StepTemplate[]>([]);
  const [templateError, setTemplateError] = useState('');

  const loadTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/process-step-templates');
      if (res.ok) {
        const data: StepTemplate[] = Array.isArray(await res.json()) ? await res.json() : [];
        setTemplateItems(data);
        setTemplateNames(data.map((t: StepTemplate) => t.step_name).sort((a: string, b: string) => a.localeCompare(b, 'zh-CN')));
      } else {
        console.error('加载工序模板失败:', res.status);
        setTemplateNames([]);
        setTemplateItems([]);
      }
    } catch (e) {
      console.error('加载工序模板网络错误:', e);
      setTemplateNames([]);
      setTemplateItems([]);
    }
  }, []);

  const loadSteps = useCallback(async () => {
    if (!productId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/process-flows?product_id=${productId}`);
      if (res.ok) {
        const data = await res.json();
        setSteps(data.steps && data.steps.length > 0 ? data.steps : []);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [productId]);

  useEffect(() => {
    if (open && productId) {
      loadSteps();
      loadTemplates();
      setError('');
    }
  }, [open, productId, loadSteps, loadTemplates]);

  // 添加工序模板
  const handleAddTemplate = async () => {
    const name = newTemplateName.trim();
    if (!name) return;
    setAddingTemplate(true);
    setTemplateError('');
    try {
      const res = await fetch('/api/process-step-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step_name: name }),
      });
      if (res.ok || res.status === 409) {
        setNewTemplateName('');
        await loadTemplates();
        if (res.status === 409) {
          setTemplateError(`工序"${name}"已存在，已添加到可选列表`);
        } else {
          setTemplateError(`工序"${name}"添加成功`);
        }
        setTimeout(() => setTemplateError(''), 3000);
      } else {
        let errMsg = `添加失败 (HTTP ${res.status})`;
        try {
          const errData = await res.json();
          errMsg = errData.error || errData.message || errMsg;
        } catch { /* parse error, use default */ }
        setTemplateError(errMsg);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setTemplateError('网络错误: ' + msg);
    } finally {
      setAddingTemplate(false);
    }
  };

  // 删除工序模板
  const handleDeleteTemplate = async (id: string) => {
    try {
      const res = await fetch(`/api/process-step-templates?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        await loadTemplates();
      } else {
        console.error('删除工序模板失败:', res.status);
      }
    } catch (e) {
      console.error('删除工序模板网络错误:', e);
    }
  };

  /* ---- 步骤操作 ---- */

  const nextStepOrder = () => {
    const maxOrder = steps.reduce((max, s) => Math.max(max, s.step_order), 0);
    return maxOrder + 1;
  };

  const addStep = () => {
    setSteps(prev => [
      ...prev,
      {
        step_order: nextStepOrder(),
        step_name: '',
        description: null,
        estimated_minutes: null,
        is_key_step: false,
        branch: null,
      },
    ]);
  };

  const addBranch = (stepOrder: number) => {
    const existingBranches = steps
      .filter(s => s.step_order === stepOrder)
      .map(s => s.branch || '');
    const branchLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let newBranch = '';
    for (const ch of branchLetters) {
      if (!existingBranches.includes(ch)) {
        newBranch = ch;
        break;
      }
    }
    if (!newBranch) return;

    setSteps(prev => [
      ...prev,
      {
        step_order: stepOrder,
        step_name: '',
        description: null,
        estimated_minutes: null,
        is_key_step: false,
        branch: newBranch,
      },
    ]);
  };

  const removeStep = (index: number) => {
    const step = steps[index];
    const newSteps = steps.filter((_, i) => i !== index);
    const remainingInOrder = newSteps.filter(s => s.step_order === step.step_order);
    if (remainingInOrder.length === 0) {
      const reordered = newSteps.map(s => {
        if (s.step_order > step.step_order) {
          return { ...s, step_order: s.step_order - 1 };
        }
        return s;
      });
      setSteps(reordered);
    } else {
      setSteps(newSteps);
    }
  };

  const updateStep = (index: number, field: keyof ProcessStep, value: string | number | boolean | null) => {
    setSteps(prev => prev.map((s, i) => i === index ? { ...s, [field]: value } : s));
  };

  const moveStepOrder = (fromOrder: number, toOrder: number) => {
    if (toOrder < 1) return;
    const maxOrder = steps.reduce((max, s) => Math.max(max, s.step_order), 0);
    if (toOrder > maxOrder) return;
    if (fromOrder === toOrder) return;

    setSteps(prev => prev.map(s => {
      if (s.step_order === fromOrder) return { ...s, step_order: toOrder };
      if (fromOrder < toOrder && s.step_order > fromOrder && s.step_order <= toOrder) {
        return { ...s, step_order: s.step_order - 1 };
      }
      if (fromOrder > toOrder && s.step_order >= toOrder && s.step_order < fromOrder) {
        return { ...s, step_order: s.step_order + 1 };
      }
      return s;
    }));
  };

  const handleSave = async () => {
    if (steps.length === 0) {
      setError('请至少添加一个工序步骤');
      return;
    }
    const hasEmpty = steps.some(s => !s.step_name.trim());
    if (hasEmpty) {
      setError('工序名称不能为空');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/process-flows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: productId,
          steps: steps.map(s => ({
            step_name: s.step_name.trim(),
            description: s.description?.trim() || null,
            estimated_minutes: s.estimated_minutes || null,
            is_key_step: s.is_key_step,
            branch: s.branch || null,
          })),
        }),
      });

      if (res.ok) {
        // 保存成功后同步新工序名到模板库（静默，不影响用户）
        const newNames = steps
          .map(s => s.step_name.trim())
          .filter((name, idx, arr) => name && arr.indexOf(name) === idx);
        Promise.all(
          newNames.map(name =>
            fetch('/api/process-step-templates', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ step_name: name }),
            }).catch(() => {})
          )
        ).then(() => loadTemplates());
        onOpenChange(false);
      } else {
        const err = await res.json().catch(() => ({ error: '保存失败' }));
        setError(err.error || '保存失败');
      }
    } catch {
      setError('网络错误，请重试');
    } finally {
      setSaving(false);
    }
  };

  /* ---- 按 step_order 分组渲染 ---- */
  const stepGroups: Map<number, ProcessStep[]> = new Map();
  steps.forEach(s => {
    if (!stepGroups.has(s.step_order)) stepGroups.set(s.step_order, []);
    stepGroups.get(s.step_order)!.push(s);
  });
  const sortedOrders = Array.from(stepGroups.keys()).sort((a, b) => a - b);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>工艺流程 - {productName}</DialogTitle>
          <DialogDescription>
            编辑该产品的生产工艺流程，支持并行分支（如A/B同时进行后合并）
          </DialogDescription>
        </DialogHeader>

        {/* 流程预览 */}
        {steps.length > 0 && (
          <div>
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 mb-1"
            >
              {showPreview ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              流程预览
            </button>
            {showPreview && <FlowPreview steps={steps} />}
          </div>
        )}

        {loading ? (
          <div className="text-center py-8 text-gray-400">加载中...</div>
        ) : (
          <div className="space-y-2">
            {steps.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <p>暂无工艺流程</p>
                <p className="text-xs mt-1">点击下方&quot;添加工序&quot;开始编辑</p>
              </div>
            ) : (
              sortedOrders.map((order) => {
                const group = stepGroups.get(order)!;
                const isParallel = group.length > 1;
                const mainStep = group.find(s => !s.branch);
                const branchSteps = group.filter(s => s.branch).sort((a, b) => (a.branch || '').localeCompare(b.branch || ''));

                return (
                  <div key={order} className="border border-gray-200 rounded-lg overflow-hidden">
                    {/* 步骤头部 */}
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border-b border-gray-200">
                      <span className="text-sm font-bold text-gray-500">第 {order} 步</span>
                      <div className="flex items-center gap-1 ml-auto">
                        <button
                          onClick={() => moveStepOrder(order, order - 1)}
                          className="text-gray-300 hover:text-gray-600 disabled:opacity-30 text-xs"
                          disabled={order <= 1}
                          title="上移"
                        >▲</button>
                        <button
                          onClick={() => moveStepOrder(order, order + 1)}
                          className="text-gray-300 hover:text-gray-600 disabled:opacity-30 text-xs"
                          disabled={order === sortedOrders.length}
                          title="下移"
                        >▼</button>
                        <span className="text-gray-200 mx-1">|</span>
                        <button
                          onClick={() => addBranch(order)}
                          className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700"
                          title="添加并行分支"
                        >
                          <GitBranch className="w-3.5 h-3.5" />
                          并行
                        </button>
                      </div>
                    </div>

                    {/* 主步骤 */}
                    {mainStep && (() => {
                      const idx = steps.indexOf(mainStep);
                      return (
                        <div className={`flex items-center gap-2 px-3 py-2 ${
                          mainStep.is_key_step ? 'bg-amber-50' : ''
                        }`}>
                          <div className="relative flex-1 min-w-0">
                            <Input
                              value={mainStep.step_name}
                              onChange={(e) => updateStep(idx, 'step_name', e.target.value)}
                              placeholder="输入或选择工序名称"
                              className="h-8 text-sm w-full"
                              list={`step-templates-${idx}`}
                            />
                            <datalist id={`step-templates-${idx}`}>
                              {templateNames.map(name => (
                                <option key={name} value={name} />
                              ))}
                            </datalist>
                          </div>
                          <div className="w-24">
                            <Input
                              type="number"
                              value={mainStep.estimated_minutes ?? ''}
                              onChange={(e) => updateStep(idx, 'estimated_minutes', e.target.value ? Number(e.target.value) : null)}
                              placeholder="工时(分)"
                              className="h-8 text-sm text-center"
                            />
                          </div>
                          <button
                            onClick={() => updateStep(idx, 'is_key_step', !mainStep!.is_key_step)}
                            className={`p-1.5 rounded transition-colors ${
                              mainStep.is_key_step ? 'text-amber-500 hover:text-amber-600' : 'text-gray-300 hover:text-amber-400'
                            }`}
                            title={mainStep.is_key_step ? '取消关键工序' : '标记为关键工序'}
                          >
                            <Star className="w-4 h-4" fill={mainStep.is_key_step ? 'currentColor' : 'none'} />
                          </button>
                          <button
                            onClick={() => removeStep(idx)}
                            className="p-1.5 text-gray-300 hover:text-red-500 transition-colors"
                            title="删除工序"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })()}

                    {/* 并行分支 */}
                    {branchSteps.map((bs, bIdx) => {
                      const idx = steps.indexOf(bs);
                      return (
                        <div
                          key={bs.branch}
                          className={`flex items-center gap-2 px-3 py-2 border-t border-dashed border-gray-200 ${
                            bs.is_key_step ? 'bg-amber-50' : 'bg-blue-50/30'
                          }`}
                        >
                          <span className="text-xs font-bold text-indigo-500 bg-indigo-100 px-1.5 py-0.5 rounded w-6 text-center shrink-0">
                            {bs.branch}
                          </span>
                          <div className="relative flex-1 min-w-0">
                            <Input
                              value={bs.step_name}
                              onChange={(e) => updateStep(idx, 'step_name', e.target.value)}
                              placeholder="输入或选择工序名称"
                              className="h-8 text-sm w-full"
                              list={`step-templates-branch-${idx}-${bIdx}`}
                            />
                            <datalist id={`step-templates-branch-${idx}-${bIdx}`}>
                              {templateNames.map(name => (
                                <option key={name} value={name} />
                              ))}
                            </datalist>
                          </div>
                          <div className="w-24">
                            <Input
                              type="number"
                              value={bs.estimated_minutes ?? ''}
                              onChange={(e) => updateStep(idx, 'estimated_minutes', e.target.value ? Number(e.target.value) : null)}
                              placeholder="工时(分)"
                              className="h-8 text-sm text-center"
                            />
                          </div>
                          <button
                            onClick={() => updateStep(idx, 'is_key_step', !bs.is_key_step)}
                            className={`p-1.5 rounded transition-colors ${
                              bs.is_key_step ? 'text-amber-500 hover:text-amber-600' : 'text-gray-300 hover:text-amber-400'
                            }`}
                            title={bs.is_key_step ? '取消关键工序' : '标记为关键工序'}
                          >
                            <Star className="w-4 h-4" fill={bs.is_key_step ? 'currentColor' : 'none'} />
                          </button>
                          <button
                            onClick={() => removeStep(idx)}
                            className="p-1.5 text-gray-300 hover:text-red-500 transition-colors"
                            title="删除此分支"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                );
              })
            )}

            {/* 添加工序按钮 */}
            <Button
              variant="outline"
              onClick={addStep}
              className="w-full border-dashed"
            >
              <Plus className="w-4 h-4 mr-1" />
              添加工序
            </Button>
          </div>
        )}

        {/* 管理可选工序名称 */}
        <div className="mt-3">
          <button
            onClick={() => setShowTemplateManager(!showTemplateManager)}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600"
          >
            <Settings className="w-3.5 h-3.5" />
            {showTemplateManager ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            管理可选工序名称
          </button>
          {showTemplateManager && (
            <div className="border border-gray-200 rounded-lg p-3 bg-gray-50 mt-2">
              <div className="text-xs font-medium text-gray-500 mb-1">增删可选工序名称（即时生效）</div>
              <div className="text-xs text-gray-400 mb-2">已加载 {templateItems.length} 个模板</div>
              {templateError && (
                <div className={`text-xs mb-2 ${templateError.includes('成功') ? 'text-green-600' : templateError.includes('已存在') ? 'text-amber-600' : 'text-red-500'}`}>{templateError}</div>
              )}
              <div className="flex gap-2 mb-3">
                <Input
                  value={newTemplateName}
                  onChange={(e) => {
                    setNewTemplateName(e.target.value);
                    setTemplateError('');
                  }}
                  placeholder="输入新工序名称"
                  className="h-7 text-xs flex-1"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddTemplate(); }}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleAddTemplate}
                  disabled={addingTemplate || !newTemplateName.trim()}
                  className="h-7 text-xs px-2"
                >
                  <Plus className="w-3 h-3 mr-1" />
                  {addingTemplate ? '...' : '添加'}
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-[120px] overflow-y-auto">
                {templateItems.map(t => (
                  <span
                    key={t.id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-gray-200 rounded text-xs text-gray-700 group"
                  >
                    {t.step_name}
                    <button
                      onClick={() => handleDeleteTemplate(t.id)}
                      className="text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                      title="删除此工序"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                {templateItems.length === 0 && (
                  <span className="text-xs text-gray-400">暂无工序模板，请先添加</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded">{error}</div>
        )}

        {/* 底部按钮 */}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="w-4 h-4 mr-1" />
            {saving ? '保存中...' : '保存'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
