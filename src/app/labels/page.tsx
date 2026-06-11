'use client';

import { useEffect, useState, useCallback } from 'react';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

interface Product {
  id: string;
  code: string;
  name: string;
  spec: string | null;
  unit: string;
  type: string;
  category: string | null;
}

interface LabelItem {
  product: Product;
  quantity: number;
  batchNo: string;
}

const labelSizes = [
  { value: '40x30', label: '40mm x 30mm', width: 40, height: 30 },
  { value: '50x30', label: '50mm x 30mm', width: 50, height: 30 },
  { value: '60x40', label: '60mm x 40mm', width: 60, height: 40 },
  { value: '80x50', label: '80mm x 50mm', width: 80, height: 50 },
  { value: '100x60', label: '100mm x 60mm', width: 100, height: 60 },
];

export default function LabelsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [labelQty, setLabelQty] = useState('1');
  const [batchNo, setBatchNo] = useState('');
  const [labelSize, setLabelSize] = useState('60x40');
  const [labelItems, setLabelItems] = useState<LabelItem[]>([]);
  const [showPreview, setShowPreview] = useState(false);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/products');
    const data = await res.json();
    if (Array.isArray(data)) setProducts(data);
    setLoading(false);
  }, []);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  const generateBatchNo = () => {
    const now = new Date();
    const y = now.getFullYear().toString().slice(2);
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const seq = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    return `B${y}${m}${d}${seq}`;
  };

  const handleAddLabel = () => {
    const product = products.find((p) => p.id === selectedProductId);
    if (!product) return;
    const qty = parseInt(labelQty) || 1;
    const batch = batchNo || generateBatchNo();
    setLabelItems([...labelItems, { product, quantity: qty, batchNo: batch }]);
    setSelectedProductId('');
    setLabelQty('1');
    setBatchNo('');
  };

  const handleRemoveLabel = (idx: number) => {
    setLabelItems(labelItems.filter((_, i) => i !== idx));
  };

  const handleClearAll = () => {
    setLabelItems([]);
  };

  const handlePrint = () => {
    setShowPreview(true);
  };

  const handlePrintAction = () => {
    window.print();
  };

  const currentSize = labelSizes.find((s) => s.value === labelSize) || labelSizes[2];

  // 生成条形码样式的文本（简化版，用纯文本代替）
  const generateBarcodeText = (code: string) => {
    return code;
  };

  return (
    <AppShell>
      <div className="p-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold text-gray-900">标签打印</h1>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleClearAll} disabled={labelItems.length === 0}>清空</Button>
            <Button onClick={handlePrint} disabled={labelItems.length === 0}>打印预览</Button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* 左侧：标签配置 */}
          <div className="col-span-1">
            <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
              <h2 className="text-sm font-medium text-gray-900">标签设置</h2>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">标签尺寸</label>
                <Select value={labelSize} onValueChange={setLabelSize}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {labelSizes.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">选择产品 *</label>
                <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                  <SelectTrigger><SelectValue placeholder="选择物料" /></SelectTrigger>
                  <SelectContent>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.code} - {p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1.5 block">标签数量</label>
                  <Input value={labelQty} onChange={(e) => setLabelQty(e.target.value)} type="number" min="1" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1.5 block">批号</label>
                  <Input value={batchNo} onChange={(e) => setBatchNo(e.target.value)} placeholder="自动生成" />
                </div>
              </div>

              <Button onClick={handleAddLabel} disabled={!selectedProductId} className="w-full">添加标签</Button>
            </div>
          </div>

          {/* 右侧：标签队列 */}
          <div className="col-span-2">
            <div className="bg-white rounded-lg border border-gray-200">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="text-sm font-medium text-gray-900">标签队列 ({labelItems.length} 项)</h2>
              </div>
              {labelItems.length === 0 ? (
                <div className="px-5 py-12 text-center text-gray-400 text-sm">选择产品添加标签到队列</div>
              ) : (
                <div className="p-5">
                  <div className="grid grid-cols-2 gap-3">
                    {labelItems.map((item, idx) => (
                      <div key={idx} className="border border-gray-200 rounded-lg p-4 flex items-start justify-between hover:border-blue-300 transition-colors">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-sm font-medium text-gray-900">{item.product.code}</span>
                            <Badge variant="outline" className="text-xs">x{item.quantity}</Badge>
                          </div>
                          <div className="text-sm text-gray-700">{item.product.name}</div>
                          {item.product.spec && <div className="text-xs text-gray-500">{item.product.spec}</div>}
                          <div className="text-xs text-gray-400 mt-1 font-mono">批号: {item.batchNo}</div>
                        </div>
                        <button onClick={() => handleRemoveLabel(idx)} className="text-red-400 hover:text-red-600 text-sm ml-2">x</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 打印预览 */}
      <Sheet open={showPreview} onOpenChange={setShowPreview}>
        <SheetContent className="w-[800px]">
          <SheetHeader className="no-print">
            <SheetTitle>标签打印预览</SheetTitle>
          </SheetHeader>
          <div className="mt-4 print:mt-0">
            <Button onClick={handlePrintAction} className="mb-4 no-print">打印</Button>
            
            <div className="bg-white p-4" id="label-print-area">
              <div 
                className="grid gap-2"
                style={{
                  gridTemplateColumns: `repeat(auto-fill, ${currentSize.width + 4}mm)`,
                }}
              >
                {labelItems.map((item, idx) => 
                  Array.from({ length: item.quantity }).map((_, qIdx) => (
                    <div
                      key={`${idx}-${qIdx}`}
                      className="border border-gray-800 flex flex-col justify-between overflow-hidden"
                      style={{
                        width: `${currentSize.width}mm`,
                        height: `${currentSize.height}mm`,
                        padding: '2mm',
                        fontSize: currentSize.width < 50 ? '7px' : currentSize.width < 70 ? '8px' : '9px',
                      }}
                    >
                      <div className="font-bold truncate" style={{ fontSize: '1.1em' }}>{item.product.name}</div>
                      <div className="flex justify-between items-end">
                        <div>
                          <div className="font-mono truncate" style={{ fontSize: '0.9em' }}>{generateBarcodeText(item.product.code)}</div>
                          <div className="text-gray-500 truncate" style={{ fontSize: '0.8em' }}>
                            {item.product.spec || ''} {item.product.spec && '|'} {item.product.unit}
                          </div>
                        </div>
                        <div className="text-right font-mono text-gray-600" style={{ fontSize: '0.8em' }}>
                          {item.batchNo}
                        </div>
                      </div>
                      {/* 简易条形码效果 */}
                      <div className="flex items-end gap-px mt-0.5" style={{ height: '4mm' }}>
                        {item.product.code.split('').map((char, ci) => (
                          <div key={ci} className="bg-black" style={{ 
                            width: ci % 2 === 0 ? '1px' : '2px', 
                            height: `${60 + (char.charCodeAt(0) % 40)}%` 
                          }} />
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </AppShell>
  );
}
