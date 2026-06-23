'use client';

import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ChevronRight, ChevronDown, FileImage, Download, ZoomIn, ZoomOut, X, Check, Workflow, Image as ImageIcon } from 'lucide-react';

interface ProcessStep {
  id?: string;
  step_order: number;
  step_name: string;
  description: string | null;
  estimated_minutes: number | null;
  is_key_step: boolean;
}

interface Drawing {
  id: string;
  product_id: string;
  file_key: string;
  file_name: string;
  file_type: string;
  file_size: number;
  description: string | null;
  created_at: string;
}

import { Order } from './page';

interface ProductionDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: Order | null;
  processFlows: Record<string, ProcessStep[]>;
  onAdvanceStep: (orderId: string) => void;
  onResetStep: (orderId: string) => void;
}

const statusLabel: Record<string, string> = {
  pending: '待生产',
  in_production: '生产中',
  completed: '已完成',
  cancelled: '已取消',
};

const statusColor: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  in_production: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
};

export default function ProductionDetailDialog({
  open,
  onOpenChange,
  order,
  processFlows,
  onAdvanceStep,
  onResetStep,
}: ProductionDetailDialogProps) {
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [selectedDrawing, setSelectedDrawing] = useState<Drawing | null>(null);
  const [drawingUrl, setDrawingUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [loadingDrawings, setLoadingDrawings] = useState(false);
  const [materialsDrawings, setMaterialsDrawings] = useState<Record<string, Drawing[]>>({});
  const [drawingUrlsCache, setDrawingUrlsCache] = useState<Record<string, string>>({});

  const product = order?.products;
  const steps = product ? (processFlows[product.id] || []) : [];
  const currentStep = order?.current_step ?? 0;

  // 加载产品图纸
  const loadDrawings = useCallback(async (productId: string) => {
    setLoadingDrawings(true);
    try {
      const res = await fetch(`/api/drawings?product_id=${productId}`);
      if (res.ok) {
        const data = await res.json();
        setDrawings(data);
        if (data.length > 0) {
          setSelectedDrawing(data[0]);
        }
      }
    } catch (e) {
      console.error('加载图纸失败:', e);
    } finally {
      setLoadingDrawings(false);
    }
  }, []);

  // 加载子物料图纸
  const loadMaterialDrawings = useCallback(async (materials: NonNullable<Order['production_order_materials']>) => {
    const result: Record<string, Drawing[]> = {};
    for (const mat of materials) {
      if (mat.products) {
        try {
          const res = await fetch(`/api/drawings?product_id=${mat.products.id}`);
          if (res.ok) {
            const data = await res.json();
            if (data.length > 0) {
              result[mat.products.id] = data;
            }
          }
        } catch {
          // skip
        }
      }
    }
    setMaterialsDrawings(result);
  }, []);

  // 批量加载图纸缩略图 URL
  const loadAllDrawingUrls = useCallback(async (drawingList: Drawing[], matDrawings: Record<string, Drawing[]>) => {
    const allDrawings = [...drawingList];
    Object.values(matDrawings).forEach(d => allDrawings.push(...d));
    const cache: Record<string, string> = {};
    await Promise.all(allDrawings.map(async (d) => {
      try {
        const res = await fetch(`/api/drawings?file_key=${encodeURIComponent(d.file_key)}`);
        if (res.ok) {
          const data = await res.json();
          cache[d.file_key] = data.url;
        }
      } catch { /* skip */ }
    }));
    setDrawingUrlsCache(prev => ({ ...prev, ...cache }));
  }, []);

  // 加载图纸 URL
  const loadDrawingUrl = useCallback(async (fileKey: string) => {
    // 优先使用缓存
    if (drawingUrlsCache[fileKey]) {
      setDrawingUrl(drawingUrlsCache[fileKey]);
      return;
    }
    try {
      const res = await fetch(`/api/drawings?file_key=${encodeURIComponent(fileKey)}`);
      if (res.ok) {
        const data = await res.json();
        setDrawingUrl(data.url);
        setDrawingUrlsCache(prev => ({ ...prev, [fileKey]: data.url }));
      }
    } catch (e) {
      console.error('加载图纸URL失败:', e);
    }
  }, [drawingUrlsCache]);

  // 当订单变化时加载数据
  const [prevOpen, setPrevOpen] = useState(false);
  useEffect(() => {
    if (open && !prevOpen && order?.product_id) {
      setDrawings([]);
      setSelectedDrawing(null);
      setDrawingUrl(null);
      setZoom(1);
      setMaterialsDrawings({});
      setDrawingUrlsCache({});
      loadDrawings(order.product_id);
      if (order.production_order_materials && order.production_order_materials.length > 0) {
        loadMaterialDrawings(order.production_order_materials);
      }
    }
    setPrevOpen(open);
  }, [open, order?.product_id, prevOpen, loadDrawings, loadMaterialDrawings]);

  // 图纸和物料图纸加载完后，批量加载缩略图 URL
  useEffect(() => {
    if (drawings.length > 0 || Object.keys(materialsDrawings).length > 0) {
      loadAllDrawingUrls(drawings, materialsDrawings);
    }
  }, [drawings, materialsDrawings, loadAllDrawingUrls]);

  // 选中图纸时加载 URL
  useEffect(() => {
    if (selectedDrawing) {
      loadDrawingUrl(selectedDrawing.file_key);
    } else {
      setDrawingUrl(null);
    }
  }, [selectedDrawing, loadDrawingUrl]);

  // 下载图纸
  const handleDownload = async (drawing: Drawing) => {
    try {
      const res = await fetch(`/api/drawings?file_key=${encodeURIComponent(drawing.file_key)}`);
      if (res.ok) {
        const data = await res.json();
        const fileRes = await fetch(data.url);
        const blob = await fileRes.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = drawing.file_name;
        link.click();
        window.URL.revokeObjectURL(blobUrl);
      }
    } catch {
      // ignore
    }
  };

  if (!order || !product) return null;

  const totalSteps = steps.length;
  const completedSteps = Math.min(currentStep, totalSteps);
  const progressPercent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[100vw] w-[100vw] h-[100vh] p-0 gap-0 flex flex-col rounded-none border-0">
        <DialogTitle className="sr-only">生产工单详情 - {order.order_no}</DialogTitle>
        {/* 顶部标题栏 */}
        <div className="flex items-center justify-between px-6 py-3 border-b bg-gray-50 flex-shrink-0">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold text-gray-900">生产工单详情</h2>
            <span className="font-mono text-sm text-gray-500">{order.order_no}</span>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColor[order.status] || 'bg-gray-100 text-gray-600'}`}>
              {statusLabel[order.status] || order.status}
            </span>
          </div>
          <div className="flex items-center gap-3 text-sm text-gray-500">
            <span>客户：{order.customers?.name || '-'}</span>
            <span>数量：{order.quantity} {product.unit || ''}</span>
            {order.due_date && <span>交期：{order.due_date}</span>}
          </div>
        </div>

        {/* 主体区域：左工艺流程 + 右图纸 */}
        <div className="flex flex-1 min-h-0">
          {/* 左侧：工艺流程 */}
          <div className="w-[340px] flex-shrink-0 border-r bg-white flex flex-col">
            <div className="px-4 py-3 border-b bg-gray-50/50">
              <div className="flex items-center gap-2">
                <Workflow className="w-4 h-4 text-blue-600" />
                <span className="font-medium text-sm text-gray-900">工艺流程</span>
              </div>
              <div className="mt-1 text-xs text-gray-500">
                {product.code} - {product.name}
              </div>
              {totalSteps > 0 && (
                <div className="mt-2">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-gray-500">进度 {completedSteps}/{totalSteps}</span>
                    <span className="font-medium text-blue-600">{progressPercent}%</span>
                  </div>
                  <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all duration-500"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 工艺步骤列表 */}
            <div className="flex-1 overflow-y-auto px-4 py-2">
              {totalSteps === 0 ? (
                <div className="text-center text-gray-400 text-sm py-8">
                  暂无工艺流程<br />
                  <span className="text-xs">请在BOM管理中添加工艺流程</span>
                </div>
              ) : (
                <div className="space-y-0">
                  {steps.map((step, idx) => {
                    const isCompleted = currentStep > step.step_order;
                    const isCurrent = currentStep === step.step_order;
                    const isPending = currentStep < step.step_order;
                    const isFirstPending = currentStep === 0 && idx === 0;

                    return (
                      <div key={step.id || idx} className="flex items-start gap-3 relative">
                        {/* 步骤指示器 */}
                        <div className="flex flex-col items-center flex-shrink-0">
                          <div
                            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all
                              ${isCompleted ? 'bg-green-500 border-green-500 text-white' : ''}
                              ${isCurrent ? 'bg-blue-500 border-blue-500 text-white ring-4 ring-blue-100' : ''}
                              ${isPending && !isFirstPending ? 'bg-white border-gray-300 text-gray-400' : ''}
                              ${isFirstPending ? 'bg-amber-400 border-amber-400 text-white' : ''}
                            `}
                          >
                            {isCompleted ? <Check className="w-3.5 h-3.5" /> : step.step_order}
                          </div>
                          {idx < steps.length - 1 && (
                            <div className={`w-0.5 h-6 ${isCompleted ? 'bg-green-400' : 'bg-gray-200'}`} />
                          )}
                        </div>

                        {/* 步骤内容 */}
                        <div className={`flex-1 pb-3 min-w-0 ${isPending && !isFirstPending ? 'opacity-50' : ''}`}>
                          <div className="flex items-center gap-1.5">
                            <span className={`text-sm font-medium ${isCompleted ? 'text-green-700 line-through' : ''} ${isCurrent ? 'text-blue-700' : ''} ${isFirstPending ? 'text-amber-700' : ''}`}>
                              {step.step_name}
                            </span>
                            {step.is_key_step && (
                              <span className="px-1 py-0.5 text-[10px] bg-orange-100 text-orange-700 rounded font-medium">关键</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {step.estimated_minutes && (
                              <span className="text-xs text-gray-400">{step.estimated_minutes}min</span>
                            )}
                            {isCompleted && <span className="text-xs text-green-500">已完成</span>}
                            {isCurrent && <span className="text-xs text-blue-500">当前工序</span>}
                            {isFirstPending && <span className="text-xs text-amber-500">待开始</span>}
                          </div>
                          {step.description && (
                            <p className="text-xs text-gray-400 mt-0.5 truncate">{step.description}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 底部操作按钮 */}
            <div className="px-4 py-3 border-t bg-gray-50/50 space-y-2">
              {totalSteps > 0 && (
                <>
                  {currentStep < totalSteps ? (
                    <Button
                      className="w-full"
                      size="sm"
                      onClick={() => order && onAdvanceStep(order.id)}
                    >
                      <ChevronRight className="w-4 h-4 mr-1" />
                      推进到下一步：{steps[currentStep]?.step_name || '完成'}
                    </Button>
                  ) : (
                    <Button className="w-full" size="sm" variant="outline" disabled>
                      <Check className="w-4 h-4 mr-1" />
                      全部工序已完成
                    </Button>
                  )}
                  {currentStep > 0 && (
                    <Button
                      className="w-full"
                      size="sm"
                      variant="ghost"
                      onClick={() => order && onResetStep(order.id)}
                    >
                      重置工艺进度
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* 右侧：图纸区 */}
          <div className="flex-1 flex flex-col min-w-0 bg-gray-100">
            {/* 图纸工具栏 */}
            <div className="flex items-center justify-between px-4 py-2 border-b bg-white flex-shrink-0">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">
                  产品图纸
                  {drawings.length > 0 && <span className="text-gray-400 font-normal ml-1">({drawings.length}张)</span>}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom(z => Math.min(z + 0.25, 3))}>
                  <ZoomIn className="w-3.5 h-3.5" />
                </Button>
                <span className="text-xs text-gray-500 w-12 text-center">{Math.round(zoom * 100)}%</span>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom(z => Math.max(z - 0.25, 0.25))}>
                  <ZoomOut className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom(1)}>
                  <span className="text-xs">1:1</span>
                </Button>
                {selectedDrawing && (
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDownload(selectedDrawing)}>
                    <Download className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            </div>

            {/* 图纸内容区 */}
            <div className="flex-1 flex min-h-0">
              {/* 图纸列表侧栏 */}
              {drawings.length > 0 && (
                <div className="w-[200px] flex-shrink-0 border-r bg-white overflow-y-auto">
                  <div className="p-2 space-y-2">
                    {drawings.map((d) => {
                      const thumbUrl = drawingUrlsCache[d.file_key];
                      return (
                        <div
                          key={d.id}
                          className={`p-1.5 rounded border cursor-pointer text-xs transition-colors ${
                            selectedDrawing?.id === d.id
                              ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-200'
                              : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                          }`}
                          onClick={() => { setSelectedDrawing(d); setZoom(1); }}
                        >
                          {/* 缩略图预览 */}
                          <div className="w-full aspect-[4/3] bg-gray-50 rounded mb-1.5 overflow-hidden flex items-center justify-center">
                            {thumbUrl ? (
                              <img
                                src={thumbUrl}
                                alt={d.file_name}
                                className="w-full h-full object-contain"
                              />
                            ) : (
                              <FileImage className="w-6 h-6 text-gray-300" />
                            )}
                          </div>
                          <div className="text-center text-gray-600 truncate" title={d.file_name}>
                            {d.file_name}
                          </div>
                          {d.description && (
                            <div className="text-center text-gray-400 truncate mt-0.5" title={d.description}>
                              {d.description}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 图纸预览区 */}
              <div className="flex-1 overflow-auto flex items-center justify-center p-4">
                {loadingDrawings ? (
                  <div className="text-gray-400 text-sm">加载图纸中...</div>
                ) : drawings.length === 0 ? (
                  <div className="text-center text-gray-400">
                    <FileImage className="w-12 h-12 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">暂无产品图纸</p>
                    <p className="text-xs mt-1">请在BOM管理中上传图纸</p>
                  </div>
                ) : drawingUrl ? (
                  <img
                    src={drawingUrl}
                    alt={selectedDrawing?.file_name || '图纸'}
                    className="max-w-none transition-transform"
                    style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
                  />
                ) : (
                  <div className="text-gray-400 text-sm">加载中...</div>
                )}
              </div>
            </div>

            {/* 子物料图纸快捷栏 */}
            {order.production_order_materials && order.production_order_materials.length > 0 && (
              <div className="border-t bg-white px-4 py-2 flex-shrink-0">
                <div className="text-xs text-gray-500 mb-1.5">子物料图纸</div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {order.production_order_materials.map((mat) => {
                    const matDrawings = mat.products ? materialsDrawings[mat.products.id] : undefined;
                    const hasDrawings = matDrawings && matDrawings.length > 0;
                    return (
                      <div
                        key={mat.id}
                        className={`flex-shrink-0 px-3 py-1.5 rounded border text-xs cursor-pointer transition-colors ${
                          hasDrawings
                            ? 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                            : 'border-gray-200 bg-gray-50 text-gray-400 cursor-default'
                        }`}
                        onClick={() => {
                          if (hasDrawings && matDrawings) {
                            setDrawings(matDrawings);
                            setSelectedDrawing(matDrawings[0]);
                          }
                        }}
                      >
                        {mat.products?.name || '未知物料'}
                        {hasDrawings && <span className="ml-1 text-blue-400">({matDrawings.length})</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
