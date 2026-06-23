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
import { Plus, Trash2, GripVertical, Save, Star } from 'lucide-react';

interface ProcessStep {
  id?: string;
  step_order: number;
  step_name: string;
  description: string | null;
  estimated_minutes: number | null;
  is_key_step: boolean;
}

interface ProcessFlowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  productName: string;
}

export default function ProcessFlowDialog({ open, onOpenChange, productId, productName }: ProcessFlowDialogProps) {
  const [steps, setSteps] = useState<ProcessStep[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadSteps = useCallback(async () => {
    if (!productId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/process-flows?product_id=${productId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.steps && data.steps.length > 0) {
          setSteps(data.steps);
        } else {
          setSteps([]);
        }
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [productId]);

  useEffect(() => {
    if (open && productId) {
      loadSteps();
      setError('');
    }
  }, [open, productId, loadSteps]);

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
            编辑该产品的生产工艺流程步骤，支持排序和关键工序标记
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

            {/* 说明备注 */}
            {steps.length > 0 && (
              <div className="text-xs text-gray-400 mt-2 space-y-1">
                <p>▲▼ 可调整工序顺序，★ 标记关键工序（高亮显示）</p>
                <p>点击工序名称输入框可编辑备注说明</p>
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
          <Button onClick={handleSave} disabled={saving}>
            <Save className="w-4 h-4 mr-1" />
            {saving ? '保存中...' : '保存'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
