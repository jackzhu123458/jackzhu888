'use client';

import { useRef, useState } from 'react';
import { translateUnit } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Plus, Minus, Printer } from 'lucide-react';
import JsBarcode from 'jsbarcode';
import type { DeliveryItem } from './types';
import { autoDistribute } from './types';

interface LabelPrintDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: DeliveryItem[];
  editMode: boolean;
  noteNo: string;
  customerName: string;
  onSave: (updatedItems: DeliveryItem[]) => void;
}

export default function LabelPrintDialog({
  open,
  onOpenChange,
  items,
  editMode,
  noteNo,
  customerName,
  onSave,
}: LabelPrintDialogProps) {
  const [labelBoxes, setLabelBoxes] = useState<number[][]>([]);
  const [labelPreview, setLabelPreview] = useState(false);
  const labelPrintRef = useRef<HTMLDivElement>(null);

  // 初始化箱数分配
  const initBoxes = () => {
    if (!items || items.length === 0) return [];
    return items.map(item => {
      const qty = Number(item.quantity) || 0;
      const perBoxQty = Number(item.per_box_qty) || 0;
      const perBox = perBoxQty > 0 ? perBoxQty : (qty > 0 ? qty : 1);
      const boxCount = qty > 0 ? Math.ceil(qty / perBox) : 0;
      const boxes: number[] = [];
      let remaining = qty;
      for (let i = 0; i < boxCount; i++) {
        const boxQty = Math.min(perBox, remaining);
        if (boxQty > 0) boxes.push(boxQty);
        remaining -= boxQty;
      }
      // 防御：如果算出来为空但数量>0，兜底1箱
      if (boxes.length === 0 && qty > 0) {
        boxes.push(qty);
      }
      return boxes;
    });
  };

  const handleOpen = (val: boolean) => {
    if (val) {
      setLabelBoxes(initBoxes());
      setLabelPreview(false);
    }
    onOpenChange(val);
  };

  const updateBoxQty = (itemIdx: number, boxIdx: number, value: number) => {
    setLabelBoxes(prev => {
      const next = prev.map(arr => [...arr]);
      if (next[itemIdx]) {
        next[itemIdx] = [...next[itemIdx]];
        next[itemIdx][boxIdx] = value;
      }
      return next;
    });
  };

  const setBoxCount = (itemIdx: number, count: number) => {
    setLabelBoxes(prev => {
      const next = prev.map(arr => [...arr]);
      if (next[itemIdx]) {
        next[itemIdx] = autoDistribute(items[itemIdx]?.quantity || 0, count);
      }
      return next;
    });
  };

  const addBox = (itemIdx: number) => {
    setLabelBoxes(prev => {
      const next = prev.map(arr => [...arr]);
      if (next[itemIdx]) {
        next[itemIdx] = autoDistribute(items[itemIdx]?.quantity || 0, next[itemIdx].length + 1);
      }
      return next;
    });
  };

  const removeBox = (itemIdx: number, boxIdx: number) => {
    setLabelBoxes(prev => {
      const next = prev.map(arr => [...arr]);
      if (next[itemIdx] && next[itemIdx].length > 1) {
        next[itemIdx] = autoDistribute(items[itemIdx]?.quantity || 0, next[itemIdx].length - 1);
      }
      return next;
    });
  };

  const redistributeBoxes = (itemIdx: number) => {
    setLabelBoxes(prev => {
      const next = prev.map(arr => [...arr]);
      if (next[itemIdx]) {
        next[itemIdx] = autoDistribute(items[itemIdx]?.quantity || 0, next[itemIdx].length);
      }
      return next;
    });
  };

  const saveLabelSettings = () => {
    const updated = [...items];
    labelBoxes.forEach((boxes, idx) => {
      const totalBoxQty = boxes.reduce((a, b) => a + b, 0);
      if (updated[idx] && totalBoxQty === updated[idx].quantity) {
        updated[idx] = { ...updated[idx], per_box_qty: boxes.length === 1 ? totalBoxQty : boxes[0] };
      }
    });
    onSave(updated);
    onOpenChange(false);
  };

  const allLabelsValid = items.every((item, idx) => {
    const total = (labelBoxes[idx] || []).reduce((a, b) => a + b, 0);
    return total === item.quantity;
  });

  const generateLabels = () => {
    setLabelPreview(true);
    setTimeout(() => {
      const container = labelPrintRef.current;
      if (!container) return;

      container.innerHTML = '';
      let globalBoxIdx = 0;
      items.forEach((item, itemIdx) => {
        const boxes = labelBoxes[itemIdx] || [];
        const validBoxes = boxes.filter(q => q > 0);
        boxes.forEach((boxQty, i) => {
          if (boxQty <= 0) return;
          globalBoxIdx++;
          const label = document.createElement('div');
          label.className = 'label-card';
          label.innerHTML = `
            <div class="label-customer">${customerName || ''}</div>
            <div class="label-divider"></div>
            <div class="label-product">${item.product?.name || ''}</div>
            <div class="label-spec">${item.product?.spec || '-'}</div>
            <div class="label-row">
              <span>编码: ${item.product?.code || ''}</span>
            </div>
            <div class="label-row">
              <span>第 ${i + 1}/${validBoxes.length} 箱</span>
              <span>${boxQty} ${translateUnit(item.product?.unit || '个')}</span>
            </div>
            <svg class="label-barcode" id="barcode-${globalBoxIdx}"></svg>
            <div class="label-note">${noteNo || ''}</div>
          `;
          container.appendChild(label);

          try {
            JsBarcode(`#barcode-${globalBoxIdx}`, `${item.product?.code || 'N/A'}-${i + 1}`, {
              format: 'CODE128',
              width: 1.5,
              height: 35,
              displayValue: false,
              margin: 2,
            });
          } catch { /* ignore barcode errors */ }
        });
      });
    }, 100);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{editMode ? '标签设置' : '标签打印'}</DialogTitle>
        </DialogHeader>

        {!labelPreview ? (
          <div className="space-y-4 overflow-auto flex-1 pr-1">
            {items.map((item, itemIdx) => {
              const boxes = labelBoxes[itemIdx] || [];
              const boxTotal = boxes.reduce((a, b) => a + b, 0);
              const diff = boxTotal - item.quantity;
              return (
                <div key={itemIdx} className="border rounded-lg">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-semibold text-[#111827]">{item.product?.name || `物料${itemIdx + 1}`}</span>
                      <span className="text-xs text-gray-400 font-mono">{item.product?.code || ''}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-gray-500">总数量:</span>
                      <span className="font-mono font-semibold text-[#111827]">{item.quantity}</span>
                      <span className="text-gray-400">{translateUnit(item.product?.unit || '个')}</span>
                      {diff === 0 ? (
                        <span className="text-green-600 ml-2">✓ 匹配</span>
                      ) : diff > 0 ? (
                        <span className="text-red-600 ml-2">多出 {diff}</span>
                      ) : (
                        <span className="text-red-600 ml-2">不足 {Math.abs(diff)}</span>
                      )}
                    </div>
                  </div>
                  <div className="px-3 py-2">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b">
                          <th className="py-1.5 px-2 text-left text-gray-500 font-normal">箱号</th>
                          <th className="py-1.5 px-2 text-left text-gray-500 font-normal">每箱数量</th>
                          <th className="py-1.5 px-2 w-12 text-gray-500 font-normal"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {boxes.map((qty, bi) => (
                          <tr key={bi} className="border-b last:border-0">
                            <td className="py-1.5 px-2 font-mono text-gray-600">第 {bi + 1} 箱</td>
                            <td className="py-1.5 px-2">
                              <Input type="number" className="h-7 w-24 text-xs" value={qty} min={0} onChange={(e) => updateBoxQty(itemIdx, bi, Number(e.target.value))} />
                            </td>
                            <td className="py-1.5 px-2 text-center">
                              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => removeBox(itemIdx, bi)} disabled={boxes.length <= 1}>
                                <Minus className="h-3 w-3" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs text-gray-500">箱数</span>
                      <Input type="number" min={1} max={999} className="h-7 w-16 text-xs text-center" value={boxes.length || 1} onChange={(e) => { const n = parseInt(e.target.value); if (!isNaN(n) && n >= 1) setBoxCount(itemIdx, n); }} />
                      <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => addBox(itemIdx)}>
                        <Plus className="h-3 w-3" /> 增加一箱
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => redistributeBoxes(itemIdx)}>
                        自动均分
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="flex items-center justify-between px-1 text-xs">
              <span className="text-gray-500">共 {items.length} 种物料，{labelBoxes.reduce((s, b) => s + b.length, 0)} 箱</span>
              {allLabelsValid ? (
                <span className="text-green-600 font-semibold">所有物料分配匹配</span>
              ) : (
                <span className="text-red-600 font-semibold">部分物料分配不匹配</span>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
              {editMode ? (
                <Button className="bg-[#1E40AF] hover:bg-[#1D4ED8]" onClick={saveLabelSettings} disabled={!allLabelsValid}>
                  保存设置
                </Button>
              ) : (
                <Button className="bg-[#1E40AF] hover:bg-[#1D4ED8]" onClick={generateLabels} disabled={!allLabelsValid}>
                  生成标签预览
                </Button>
              )}
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3 flex-1 overflow-auto">
            <div ref={labelPrintRef} className="grid grid-cols-2 gap-3" />
            <DialogFooter className="shrink-0">
              <Button variant="outline" onClick={() => setLabelPreview(false)}>返回修改</Button>
              <Button className="bg-[#1E40AF] hover:bg-[#1D4ED8] gap-1" onClick={() => window.print()}>
                <Printer className="h-4 w-4" /> 打印全部标签
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
