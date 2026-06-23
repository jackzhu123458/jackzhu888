'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Plus, Trash2, Save, Star, Settings2, X } from 'lucide-react';

interface ProcessStep {
  id?: string;
  step_order: number;
  step_name: string;
  description: string | null;
  estimated_minutes: number | null;
  is_key_step: boolean;
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

/* ---------- 工序名称模糊搜索输入框 ---------- */
function StepNameInput({
  value,
  onChange,
  templates,
}: {
  value: string;
  onChange: (val: string) => void;
  templates: string[];
}) {
  const [focused, setFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 模糊过滤
  const filtered = value.trim()
    ? templates.filter(n => n.toLowerCase().includes(value.trim().toLowerCase()))
    : templates;

  // 输入的文本是否精确匹配某个已有选项
  const exactMatch = templates.some(n => n === value.trim());

  // 点击外部关闭下拉
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setFocused(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={containerRef} className="relative flex-1 min-w-0">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        placeholder="输入或选择工序名称"
        className="h-8 text-sm"
      />
      {focused && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-[200px] overflow-y-auto">
          {filtered.length === 0 && !value.trim() && (
            <div className="px-3 py-2 text-xs text-gray-400">输入关键字搜索工序</div>
          )}
          {filtered.length === 0 && value.trim() && (
            <button
              className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 text-blue-600 flex items-center gap-1"
              onMouseDown={(e) => {
                e.preventDefault();
                setFocused(false);
              }}
            >
              <Plus className="w-3 h-3" /> 新增工序 &ldquo;{value.trim()}&rdquo;
            </button>
          )}
          {filtered.map(name => (
            <button
              key={name}
              className={`w-full text-left px-3 py-1.5 text-sm hover:bg-blue-50 ${
                name === value ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(name);
                setFocused(false);
              }}
            >
              {name}
            </button>
          ))}
          {/* 如果输入不精确匹配且过滤结果不为空，追加"新增"选项 */}
          {value.trim() && !exactMatch && filtered.length > 0 && (
            <button
              className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 text-blue-600 border-t border-gray-100 flex items-center gap-1"
              onMouseDown={(e) => {
                e.preventDefault();
                setFocused(false);
              }}
            >
              <Plus className="w-3 h-3" /> 新增工序 &ldquo;{value.trim()}&rdquo;
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- 工序模板管理面板 ---------- */
function TemplateManager({
  templates,
  onRefresh,
}: {
  templates: StepTemplate[];
  onRefresh: () => void;
}) {
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setAdding(true);
    try {
      const res = await fetch('/api/process-step-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step_name: newName.trim() }),
      });
      if (res.ok) {
        setNewName('');
        onRefresh();
      } else {
        const err = await res.json();
        alert(err.error || '添加失败');
      }
    } catch {
      alert('网络错误');
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/process-step-templates?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        onRefresh();
      } else {
        const err = await res.json();
        alert(err.error || '删除失败');
      }
    } catch {
      alert('网络错误');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
      <div className="text-xs font-medium text-gray-500 mb-2">管理可选工序名称（增删后即时生效）</div>
      {/* 新增输入 */}
      <div className="flex gap-2 mb-3">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="输入新工序名称"
          className="h-7 text-xs flex-1"
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
        />
        <Button
          size="sm"
          variant="outline"
          onClick={handleAdd}
          disabled={adding || !newName.trim()}
          className="h-7 text-xs px-2"
        >
          <Plus className="w-3 h-3 mr-1" />
          {adding ? '...' : '添加'}
        </Button>
      </div>
      {/* 模板列表 - 标签式展示，可删除 */}
      <div className="flex flex-wrap gap-1.5 max-h-[120px] overflow-y-auto">
        {templates.map(t => (
          <span
            key={t.id}
            className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-gray-200 rounded text-xs text-gray-700 group"
          >
            {t.step_name}
            <button
              onClick={() => handleDelete(t.id)}
              disabled={deletingId === t.id}
              className="text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
              title="删除此工序"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        {templates.length === 0 && (
          <span className="text-xs text-gray-400">暂无工序模板</span>
        )}
      </div>
    </div>
  );
}

/* ---------- 主弹窗组件 ---------- */
export default function ProcessFlowDialog({ open, onOpenChange, productId, productName }: ProcessFlowDialogProps) {
  const [steps, setSteps] = useState<ProcessStep[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [templates, setTemplates] = useState<StepTemplate[]>([]);
  const [showTemplateManager, setShowTemplateManager] = useState(false);

  // 合并模板工序名 + 数据库已使用的工序名，去重排序
  const allStepNames = Array.from(
    new Set([
      ...templates.map(t => t.step_name),
    ])
  ).sort((a, b) => a.localeCompare(b, 'zh-CN'));

  const loadTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/process-step-templates');
      if (res.ok) {
        const data = await res.json();
        setTemplates(Array.isArray(data) ? data : []);
      }
    } catch { /* ignore */ }
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

  const addStep = () => {
    setSteps(prev => [
      ...prev,
      {
        step_order: prev.length + 1,
        step_name: '',
        description: null,
        estimated_minutes: null,
        is_key_step: false,
      },
    ]);
  };

  const removeStep = (index: number) => {
    setSteps(prev => prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, step_order: i + 1 })));
  };

  const updateStep = (index: number, field: keyof ProcessStep, value: string | number | boolean | null) => {
    setSteps(prev => prev.map((s, i) => i === index ? { ...s, [field]: value } : s));
  };

  const moveStep = (from: number, to: number) => {
    if (to < 0 || to >= steps.length) return;
    const newSteps = [...steps];
    const [moved] = newSteps.splice(from, 1);
    newSteps.splice(to, 0, moved);
    setSteps(newSteps.map((s, i) => ({ ...s, step_order: i + 1 })));
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
          })),
        }),
      });

      if (res.ok) {
        // 保存成功后，将新输入的工序名称也同步到模板库
        const newNames = steps
          .map(s => s.step_name.trim())
          .filter(name => !templates.some(t => t.step_name === name));
        await Promise.all(
          newNames.map(name =>
            fetch('/api/process-step-templates', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ step_name: name }),
            }).catch(() => {})
          )
        );
        onOpenChange(false);
      } else {
        const err = await res.json();
        setError(err.error || '保存失败');
      }
    } catch {
      setError('网络错误，请重试');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>工艺流程 - {productName}</DialogTitle>
          <DialogDescription>
            编辑该产品的生产工艺流程步骤，输入关键字搜索或直接输入新增工序
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="text-center py-8 text-gray-400">加载中...</div>
        ) : (
          <div className="space-y-3">
            {steps.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <p>暂无工艺流程</p>
                <p className="text-xs mt-1">点击下方"添加工序"开始编辑</p>
              </div>
            ) : (
              steps.map((step, idx) => (
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
                    >
                      ▲
                    </button>
                    <span className="text-sm font-bold text-gray-500 w-5 text-center">{idx + 1}</span>
                    <button
                      onClick={() => moveStep(idx, idx + 1)}
                      className="text-gray-300 hover:text-gray-600 disabled:opacity-30"
                      disabled={idx === steps.length - 1}
                      title="下移"
                    >
                      ▼
                    </button>
                  </div>

                  {/* 工序名称 - 模糊搜索+可新增 */}
                  <StepNameInput
                    value={step.step_name}
                    onChange={(val) => updateStep(idx, 'step_name', val)}
                    templates={allStepNames}
                  />

                  {/* 预估工时 */}
                  <div className="w-24">
                    <Input
                      type="number"
                      value={step.estimated_minutes ?? ''}
                      onChange={(e) => updateStep(idx, 'estimated_minutes', e.target.value ? Number(e.target.value) : null)}
                      placeholder="工时(分)"
                      className="h-8 text-sm text-center"
                    />
                  </div>

                  {/* 关键工序标记 */}
                  <button
                    onClick={() => updateStep(idx, 'is_key_step', !step.is_key_step)}
                    className={`p-1.5 rounded transition-colors ${
                      step.is_key_step ? 'text-amber-500 hover:text-amber-600' : 'text-gray-300 hover:text-amber-400'
                    }`}
                    title={step.is_key_step ? '取消关键工序' : '标记为关键工序'}
                  >
                    <Star className="w-4 h-4" fill={step.is_key_step ? 'currentColor' : 'none'} />
                  </button>

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

            {/* 添加按钮 */}
            <button
              onClick={addStep}
              className="w-full py-2.5 border-2 border-dashed border-gray-200 rounded-lg text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors text-sm flex items-center justify-center gap-1"
            >
              <Plus className="w-4 h-4" />
              添加工序
            </button>

            {/* 管理工序模板折叠面板 */}
            <div className="pt-2">
              <button
                onClick={() => setShowTemplateManager(!showTemplateManager)}
                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-blue-600 transition-colors"
              >
                <Settings2 className="w-3.5 h-3.5" />
                {showTemplateManager ? '收起工序模板管理' : '管理可选工序名称'}
              </button>
              {showTemplateManager && (
                <div className="mt-2">
                  <TemplateManager
                    templates={templates}
                    onRefresh={loadTemplates}
                  />
                </div>
              )}
            </div>

            {/* 说明备注 */}
            {steps.length > 0 && (
              <div className="text-xs text-gray-400 mt-2 space-y-1">
                <p>▲▼ 可调整工序顺序，★ 标记关键工序（高亮显示）</p>
                <p>输入关键字可搜索已有工序，也可直接输入新增工序名称</p>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="text-sm text-red-500 mt-2">{error}</div>
        )}

        {/* 底部操作 */}
        <div className="flex justify-end gap-2 mt-4 pt-3 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={saving} className="bg-blue-800 hover:bg-blue-900">
            <Save className="w-4 h-4 mr-1" />
            {saving ? '保存中...' : '保存'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
