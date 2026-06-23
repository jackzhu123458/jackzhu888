'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Star, ExternalLink } from 'lucide-react';
import Link from 'next/link';

interface ProcessStep {
  id?: string;
  step_order: number;
  step_name: string;
  description: string | null;
  estimated_minutes: number | null;
  is_key_step: boolean;
}

interface ProcessFlowViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  productName: string;
}

export default function ProcessFlowViewDialog({ open, onOpenChange, productId, productName }: ProcessFlowViewDialogProps) {
  const [steps, setSteps] = useState<ProcessStep[]>([]);
  const [loading, setLoading] = useState(false);

  const loadSteps = useCallback(async () => {
    if (!productId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/process-flows?product_id=${productId}`);
      if (res.ok) {
        const data = await res.json();
        setSteps(data.steps || []);
      } else {
        setSteps([]);
      }
    } catch {
      setSteps([]);
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    if (open && productId) {
      loadSteps();
    }
  }, [open, productId, loadSteps]);

  const totalMinutes = steps.reduce((sum, s) => sum + (s.estimated_minutes || 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            工艺流程 - {productName}
            {steps.length > 0 && (
              <Badge variant="outline" className="text-xs font-normal">{steps.length} 道工序</Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {steps.length > 0
              ? `总工时：${totalMinutes} 分钟`
              : '该产品尚未配置工艺流程，请前往工艺流程管理页面添加'}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="text-center py-8 text-gray-400">加载中...</div>
        ) : steps.length === 0 ? (
          <div className="text-center py-8 space-y-3">
            <p className="text-gray-400">暂无工艺流程</p>
            <Link href="/process-flow" onClick={() => onOpenChange(false)}>
              <Button variant="outline" size="sm">
                <ExternalLink className="w-3 h-3 mr-1" /> 前往工艺流程管理
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-0">
            {/* 流程图展示 */}
            <div className="flex items-center gap-0 overflow-x-auto pb-2">
              {steps.map((step, idx) => (
                <div key={step.id || idx} className="flex items-center flex-shrink-0">
                  <div
                    className={`flex flex-col items-center px-3 py-2 rounded-lg border min-w-[80px] ${
                      step.is_key_step
                        ? 'border-amber-300 bg-amber-50'
                        : 'border-gray-200 bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-1">
                      {step.is_key_step && <Star className="w-3 h-3 text-amber-500 fill-amber-500" />}
                      <span className="text-xs font-medium text-gray-800">{step.step_name}</span>
                    </div>
                    {step.estimated_minutes != null && (
                      <span className="text-[10px] text-gray-400 mt-0.5">{step.estimated_minutes}'</span>
                    )}
                  </div>
                  {idx < steps.length - 1 && (
                    <div className="mx-1 text-gray-300 flex-shrink-0">→</div>
                  )}
                </div>
              ))}
            </div>

            {/* 详细列表 */}
            <div className="mt-3 border-t pt-3 space-y-1">
              {steps.map((step, idx) => (
                <div
                  key={step.id || idx}
                  className={`flex items-center gap-3 px-3 py-2 rounded text-sm ${
                    step.is_key_step ? 'bg-amber-50/50' : ''
                  }`}
                >
                  <span className="w-6 text-center font-bold text-gray-400">{step.step_order}</span>
                  <div className="flex items-center gap-1.5 flex-1">
                    {step.is_key_step && <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />}
                    <span className="text-gray-800">{step.step_name}</span>
                  </div>
                  <span className="text-xs text-gray-400 font-mono w-16 text-right">
                    {step.estimated_minutes != null ? `${step.estimated_minutes} 分` : '-'}
                  </span>
                  <span className="text-xs text-gray-400 w-32 truncate">{step.description || ''}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          <Link href="/process-flow" onClick={() => onOpenChange(false)}>
            <Button variant="outline" size="sm">
              <ExternalLink className="w-3 h-3 mr-1" /> 工艺流程管理
            </Button>
          </Link>
          <Button variant="outline" onClick={() => onOpenChange(false)}>关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
