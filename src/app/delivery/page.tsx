'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Product {
  id: string;
  code: string;
  name: string;
  spec: string | null;
  unit: string;
}

interface DeliveryItem {
  id: string;
  product_id: string;
  quantity: string;
  unit_price: string | null;
  remark: string | null;
  products: Product;
}

interface DeliveryNote {
  id: string;
  note_no: string;
  customer_name: string;
  customer_address: string | null;
  customer_contact: string | null;
  customer_phone: string | null;
  delivery_date: string | null;
  status: string;
  remark: string | null;
  created_at: string;
  delivery_note_items: DeliveryItem[];
  item_count?: number;
}

// 每箱数量分配
interface BoxAllocation {
  boxIndex: number;
  quantity: number;
}

// 每个送货明细项的箱数配置
interface ItemBoxConfig {
  itemIndex: number;
  productCode: string;
  productName: string;
  spec: string;
  unit: string;
  totalQuantity: number;
  boxCount: number;
  allocations: BoxAllocation[];
}

export default function DeliveryPage() {
  const [notes, setNotes] = useState<DeliveryNote[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editNote, setEditNote] = useState<DeliveryNote | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [printNote, setPrintNote] = useState<DeliveryNote | null>(null);

  // 标签打印状态
  const [labelNote, setLabelNote] = useState<DeliveryNote | null>(null);
  const [labelDialogOpen, setLabelDialogOpen] = useState(false);
  const [boxConfigs, setBoxConfigs] = useState<ItemBoxConfig[]>([]);
  const [labelPreviewOpen, setLabelPreviewOpen] = useState(false);
  const barcodeRefs = useRef<Map<string, SVGSVGElement>>(new Map());

  // 表单
  const [formCustomer, setFormCustomer] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formContact, setFormContact] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formRemark, setFormRemark] = useState('');
  const [formItems, setFormItems] = useState<Array<{ product_id: string; quantity: string; unit_price: string; remark: string }>>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [noteRes, prodRes] = await Promise.all([
      fetch('/api/delivery'),
      fetch('/api/products'),
    ]);
    const noteData = await noteRes.json();
    const prodData = await prodRes.json();
    if (Array.isArray(noteData)) setNotes(noteData);
    if (Array.isArray(prodData)) setProducts(prodData);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const generateNoteNo = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const seq = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
    return `DN-${y}${m}${d}-${seq}`;
  };

  const handleAdd = () => {
    setEditNote(null);
    setFormCustomer('');
    setFormAddress('');
    setFormContact('');
    setFormPhone('');
    setFormDate('');
    setFormRemark('');
    setFormItems([{ product_id: '', quantity: '', unit_price: '', remark: '' }]);
    setSheetOpen(true);
  };

  const handleEdit = async (note: DeliveryNote) => {
    const res = await fetch(`/api/delivery?id=${note.id}`);
    const full = await res.json();
    setEditNote(full);
    setFormCustomer(full.customer_name);
    setFormAddress(full.customer_address || '');
    setFormContact(full.customer_contact || '');
    setFormPhone(full.customer_phone || '');
    setFormDate(full.delivery_date ? full.delivery_date.slice(0, 10) : '');
    setFormRemark(full.remark || '');
    setFormItems(
      (full.delivery_note_items || []).map((item: DeliveryItem) => ({
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price || '',
        remark: item.remark || '',
      }))
    );
    setSheetOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const body = {
      note_no: editNote ? editNote.note_no : generateNoteNo(),
      customer_name: formCustomer,
      customer_address: formAddress || null,
      customer_contact: formContact || null,
      customer_phone: formPhone || null,
      delivery_date: formDate || null,
      status: editNote ? editNote.status : 'draft',
      remark: formRemark || null,
      items: formItems
        .filter((i) => i.product_id && i.quantity)
        .map((i) => ({
          product_id: i.product_id,
          quantity: i.quantity,
          unit_price: i.unit_price || null,
          remark: i.remark || null,
        })),
      ...(editNote ? { id: editNote.id } : {}),
    };
    const res = await fetch('/api/delivery', {
      method: editNote ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setSheetOpen(false);
      loadData();
    } else {
      const err = await res.json();
      alert(err.error || '保存失败');
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await fetch(`/api/delivery?id=${deleteId}`, { method: 'DELETE' });
    setDeleteId(null);
    loadData();
  };

  const handlePrint = async (note: DeliveryNote) => {
    const res = await fetch(`/api/delivery?id=${note.id}`);
    const full = await res.json();
    setPrintNote(full);
  };

  const handlePrintAction = () => {
    window.print();
  };

  // ===== 标签打印逻辑 =====

  // 均分分配算法：总数分成 n 箱，余数分给前几箱
  const distributeEvenly = (total: number, boxCount: number): BoxAllocation[] => {
    if (boxCount <= 0) return [];
    const base = Math.floor(total / boxCount);
    const remainder = total % boxCount;
    const allocations: BoxAllocation[] = [];
    for (let i = 0; i < boxCount; i++) {
      allocations.push({
        boxIndex: i + 1,
        quantity: base + (i < remainder ? 1 : 0),
      });
    }
    return allocations;
  };

  // 打开标签打印对话框
  const handleLabelPrint = async (note: DeliveryNote) => {
    const res = await fetch(`/api/delivery?id=${note.id}`);
    const full = await res.json();
    setLabelNote(full);

    // 初始化每个明细项的箱数配置，默认1箱装全部
    const configs: ItemBoxConfig[] = (full.delivery_note_items || []).map((item: DeliveryItem, idx: number) => {
      const totalQty = parseInt(item.quantity) || 0;
      return {
        itemIndex: idx,
        productCode: item.products?.code || '',
        productName: item.products?.name || '',
        spec: item.products?.spec || '',
        unit: item.products?.unit || '',
        totalQuantity: totalQty,
        boxCount: 1,
        allocations: [{ boxIndex: 1, quantity: totalQty }],
      };
    });
    setBoxConfigs(configs);
    setLabelDialogOpen(true);
  };

  // 更新某项的箱数，自动均分
  const updateBoxCount = (itemIdx: number, boxCount: number) => {
    setBoxConfigs(prev => prev.map((config, i) => {
      if (i !== itemIdx) return config;
      const bc = Math.max(1, Math.min(boxCount, config.totalQuantity));
      return {
        ...config,
        boxCount: bc,
        allocations: distributeEvenly(config.totalQuantity, bc),
      };
    }));
  };

  // 手动修改某箱数量，自动调整同项其他箱
  const updateBoxQuantity = (itemIdx: number, boxIdx: number, newQty: number) => {
    setBoxConfigs(prev => prev.map((config, i) => {
      if (i !== itemIdx) return config;
      const allocations = [...config.allocations];
      const oldQty = allocations[boxIdx].quantity;
      const diff = newQty - oldQty;
      allocations[boxIdx] = { ...allocations[boxIdx], quantity: newQty };

      // 将差值分摊到其他箱（从最后一箱开始调整）
      let remaining = diff;
      for (let j = allocations.length - 1; j >= 0 && remaining !== 0; j--) {
        if (j === boxIdx) continue;
        if (remaining > 0) {
          // 需要从其他箱扣除
          const canDeduct = Math.min(remaining, allocations[j].quantity - 1);
          allocations[j] = { ...allocations[j], quantity: allocations[j].quantity - canDeduct };
          remaining -= canDeduct;
        } else {
          // 需要加到其他箱
          allocations[j] = { ...allocations[j], quantity: allocations[j].quantity - remaining };
          remaining = 0;
        }
      }
      return { ...config, allocations };
    }));
  };

  // 增减某项的箱数
  const addBox = (itemIdx: number) => {
    const config = boxConfigs[itemIdx];
    if (!config) return;
    const newBoxCount = config.boxCount + 1;
    updateBoxCount(itemIdx, newBoxCount);
  };

  const removeBox = (itemIdx: number) => {
    const config = boxConfigs[itemIdx];
    if (!config || config.boxCount <= 1) return;
    updateBoxCount(itemIdx, config.boxCount - 1);
  };

  // 生成标签预览
  const handleGenerateLabels = () => {
    setLabelPreviewOpen(true);
  };

  // 渲染条形码
  useEffect(() => {
    if (labelPreviewOpen && boxConfigs.length > 0) {
      setTimeout(() => {
        barcodeRefs.current.forEach((svg, key) => {
          try {
            JsBarcode(svg, key, {
              format: 'CODE128',
              width: 1.5,
              height: 40,
              displayValue: true,
              fontSize: 10,
              margin: 4,
            });
          } catch {
            // 条形码生成失败时忽略
          }
        });
      }, 100);
    }
  }, [labelPreviewOpen, boxConfigs]);

  const handleLabelPrintAction = () => {
    window.print();
  };

  const addItemRow = () => {
    setFormItems([...formItems, { product_id: '', quantity: '', unit_price: '', remark: '' }]);
  };

  const removeItemRow = (idx: number) => {
    setFormItems(formItems.filter((_, i) => i !== idx));
  };

  const updateItemRow = (idx: number, field: string, value: string) => {
    const updated = [...formItems];
    updated[idx] = { ...updated[idx], [field]: value };
    setFormItems(updated);
  };

  return (
    <AppShell>
      <div className="p-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold text-gray-900">送货单管理</h1>
          <Button onClick={handleAdd}>新建送货单</Button>
        </div>

        <div className="bg-white rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/50">
                <th className="text-left px-5 py-3 font-medium text-gray-500">单号</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">客户名称</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">联系人</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">送货日期</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">状态</th>
                <th className="text-center px-5 py-3 font-medium text-gray-500">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-5 py-12 text-center text-gray-400">加载中...</td></tr>
              ) : notes.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-12 text-center text-gray-400">暂无数据</td></tr>
              ) : (
                notes.map((note) => (
                  <tr key={note.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-5 py-3 font-mono text-gray-900">{note.note_no}</td>
                    <td className="px-5 py-3 text-gray-900">{note.customer_name}</td>
                    <td className="px-5 py-3 text-gray-600">{note.customer_contact || '-'}</td>
                    <td className="px-5 py-3 text-gray-600">{note.delivery_date ? note.delivery_date.slice(0, 10) : '-'}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded ${note.status === 'shipped' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                        {note.status === 'shipped' ? '已发货' : '草稿'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-center">
                      <button onClick={() => handlePrint(note)} className="text-green-600 hover:text-green-800 text-xs mr-2">打印</button>
                      <button onClick={() => handleLabelPrint(note)} className="text-purple-600 hover:text-purple-800 text-xs mr-2">标签</button>
                      <button onClick={() => handleEdit(note)} className="text-blue-600 hover:text-blue-800 text-xs mr-2">编辑</button>
                      <button onClick={() => setDeleteId(note.id)} className="text-red-500 hover:text-red-700 text-xs">删除</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 新增/编辑抽屉 */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-[560px]">
          <SheetHeader>
            <SheetTitle>{editNote ? '编辑送货单' : '新建送货单'}</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-4 px-1">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">客户名称 *</label>
              <Input value={formCustomer} onChange={(e) => setFormCustomer(e.target.value)} placeholder="客户公司名称" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">联系人</label>
                <Input value={formContact} onChange={(e) => setFormContact(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">联系电话</label>
                <Input value={formPhone} onChange={(e) => setFormPhone(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">送货地址</label>
              <Input value={formAddress} onChange={(e) => setFormAddress(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">送货日期</label>
              <Input value={formDate} onChange={(e) => setFormDate(e.target.value)} type="date" />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">送货明细</label>
                <Button variant="outline" size="sm" onClick={addItemRow}>添加产品</Button>
              </div>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {formItems.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <select
                      value={item.product_id}
                      onChange={(e) => updateItemRow(idx, 'product_id', e.target.value)}
                      className="flex-1 h-9 text-sm border border-gray-200 rounded-md px-2"
                    >
                      <option value="">选择产品</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>{p.code} - {p.name}</option>
                      ))}
                    </select>
                    <Input value={item.quantity} onChange={(e) => updateItemRow(idx, 'quantity', e.target.value)} placeholder="数量" type="number" className="w-20 h-9 text-xs" />
                    <Input value={item.unit_price} onChange={(e) => updateItemRow(idx, 'unit_price', e.target.value)} placeholder="单价" type="number" step="0.01" className="w-20 h-9 text-xs" />
                    <button onClick={() => removeItemRow(idx)} className="text-red-400 hover:text-red-600 text-sm">x</button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">备注</label>
              <Input value={formRemark} onChange={(e) => setFormRemark(e.target.value)} />
            </div>

            <div className="pt-4 flex gap-3">
              <Button onClick={handleSave} disabled={saving || !formCustomer} className="flex-1">
                {saving ? '保存中...' : '保存'}
              </Button>
              <Button variant="outline" onClick={() => setSheetOpen(false)} className="flex-1">取消</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* 送货单打印预览 */}
      <Sheet open={!!printNote} onOpenChange={() => setPrintNote(null)}>
        <SheetContent className="w-[800px] print:w-full">
          {printNote && (
            <>
              <SheetHeader className="no-print">
                <SheetTitle>送货单打印预览</SheetTitle>
              </SheetHeader>
              <div className="mt-4 print:mt-0">
                <Button onClick={handlePrintAction} className="mb-4 no-print">打印</Button>
                
                <div className="bg-white p-8 border border-gray-200 rounded shadow-sm" id="print-area">
                  <div className="text-center mb-6">
                    <h1 className="text-2xl font-bold">送 货 单</h1>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 text-sm mb-6">
                    <div>
                      <div><span className="text-gray-500">单号：</span>{printNote.note_no}</div>
                      <div className="mt-1"><span className="text-gray-500">日期：</span>{printNote.delivery_date ? printNote.delivery_date.slice(0, 10) : new Date().toISOString().slice(0, 10)}</div>
                    </div>
                    <div>
                      <div><span className="text-gray-500">客户：</span>{printNote.customer_name}</div>
                      {printNote.customer_contact && <div className="mt-1"><span className="text-gray-500">联系人：</span>{printNote.customer_contact} {printNote.customer_phone || ''}</div>}
                      {printNote.customer_address && <div className="mt-1"><span className="text-gray-500">地址：</span>{printNote.customer_address}</div>}
                    </div>
                  </div>

                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b-2 border-t-2 border-gray-800">
                        <th className="text-left py-2 px-3 font-medium">序号</th>
                        <th className="text-left py-2 px-3 font-medium">产品编码</th>
                        <th className="text-left py-2 px-3 font-medium">产品名称</th>
                        <th className="text-left py-2 px-3 font-medium">规格</th>
                        <th className="text-right py-2 px-3 font-medium">数量</th>
                        <th className="text-left py-2 px-3 font-medium">单位</th>
                        <th className="text-right py-2 px-3 font-medium">单价</th>
                        <th className="text-right py-2 px-3 font-medium">金额</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(printNote.delivery_note_items || []).map((item, idx) => {
                        const qty = parseFloat(item.quantity) || 0;
                        const price = parseFloat(item.unit_price || '0') || 0;
                        const amount = qty * price;
                        return (
                          <tr key={item.id} className="border-b border-gray-300">
                            <td className="py-2 px-3">{idx + 1}</td>
                            <td className="py-2 px-3 font-mono">{item.products?.code || ''}</td>
                            <td className="py-2 px-3">{item.products?.name || ''}</td>
                            <td className="py-2 px-3">{item.products?.spec || ''}</td>
                            <td className="py-2 px-3 text-right font-mono">{item.quantity}</td>
                            <td className="py-2 px-3">{item.products?.unit || ''}</td>
                            <td className="py-2 px-3 text-right font-mono">{price > 0 ? price.toFixed(2) : ''}</td>
                            <td className="py-2 px-3 text-right font-mono">{amount > 0 ? amount.toFixed(2) : ''}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-gray-800">
                        <td colSpan={7} className="py-2 px-3 text-right font-medium">合计：</td>
                        <td className="py-2 px-3 text-right font-mono font-bold">
                          {(printNote.delivery_note_items || []).reduce((sum, item) => {
                            const qty = parseFloat(item.quantity) || 0;
                            const price = parseFloat(item.unit_price || '0') || 0;
                            return sum + qty * price;
                          }, 0).toFixed(2)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>

                  {printNote.remark && (
                    <div className="mt-4 text-sm">
                      <span className="text-gray-500">备注：</span>{printNote.remark}
                    </div>
                  )}

                  <div className="mt-12 grid grid-cols-3 gap-8 text-sm text-center">
                    <div>
                      <div className="border-b border-gray-400 pb-8 mb-1">制单</div>
                    </div>
                    <div>
                      <div className="border-b border-gray-400 pb-8 mb-1">审核</div>
                    </div>
                    <div>
                      <div className="border-b border-gray-400 pb-8 mb-1">签收</div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ===== 标签打印：箱数分配对话框 ===== */}
      <Dialog open={labelDialogOpen} onOpenChange={setLabelDialogOpen}>
        <DialogContent className="max-w-[720px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>标签打印 - 箱数配置</DialogTitle>
          </DialogHeader>
          <div className="mt-4 space-y-1 text-sm text-gray-500">
            <p>为每个产品配置分箱方案。修改箱数后系统会自动均分，你也可以手动调整每箱数量。</p>
            <p>示例：100个分5箱 → 默认每箱20个，你可以改为4箱x8 + 1箱x68，或任意组合。</p>
          </div>

          <div className="mt-4 space-y-4">
            {boxConfigs.map((config, itemIdx) => (
              <div key={itemIdx} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="font-medium text-gray-900">{config.productName}</span>
                    <span className="ml-2 text-xs text-gray-500 font-mono">{config.productCode}</span>
                    {config.spec && <span className="ml-2 text-xs text-gray-400">({config.spec})</span>}
                  </div>
                  <div className="text-sm text-gray-600">
                    总数：<span className="font-mono font-medium">{config.totalQuantity}</span> {config.unit}
                  </div>
                </div>

                <div className="flex items-center gap-3 mb-3">
                  <span className="text-sm text-gray-600">箱数：</span>
                  <button
                    onClick={() => removeBox(itemIdx)}
                    className="w-7 h-7 rounded border border-gray-300 flex items-center justify-center text-gray-500 hover:bg-gray-100"
                  >-</button>
                  <Input
                    type="number"
                    min={1}
                    max={config.totalQuantity}
                    value={config.boxCount}
                    onChange={(e) => updateBoxCount(itemIdx, parseInt(e.target.value) || 1)}
                    className="w-16 h-7 text-center text-sm font-mono"
                  />
                  <button
                    onClick={() => addBox(itemIdx)}
                    className="w-7 h-7 rounded border border-gray-300 flex items-center justify-center text-gray-500 hover:bg-gray-100"
                  >+</button>
                  <span className="text-xs text-gray-400 ml-2">
                    (共 {config.allocations.length} 箱)
                  </span>
                </div>

                <div className="space-y-1.5">
                  {config.allocations.map((alloc, boxIdx) => (
                    <div key={boxIdx} className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-16 shrink-0">第 {alloc.boxIndex} 箱</span>
                      <Input
                        type="number"
                        min={1}
                        max={config.totalQuantity}
                        value={alloc.quantity}
                        onChange={(e) => updateBoxQuantity(itemIdx, boxIdx, parseInt(e.target.value) || 1)}
                        className="w-20 h-7 text-sm font-mono"
                      />
                      <span className="text-xs text-gray-400">{config.unit}</span>
                    </div>
                  ))}
                </div>

                {/* 分配总量校验 */}
                {(() => {
                  const allocated = config.allocations.reduce((s, a) => s + a.quantity, 0);
                  const diff = allocated - config.totalQuantity;
                  if (diff !== 0) {
                    return (
                      <div className={`mt-2 text-xs ${diff > 0 ? 'text-red-500' : 'text-amber-500'}`}>
                        {diff > 0 ? `多出 ${diff} 个，请减少部分箱数` : `还差 ${-diff} 个，请增加部分箱数`}
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            ))}
          </div>

          <div className="mt-6 flex gap-3">
            <Button
              onClick={handleGenerateLabels}
              disabled={boxConfigs.some(c => c.allocations.reduce((s, a) => s + a.quantity, 0) !== c.totalQuantity)}
              className="flex-1"
            >
              生成标签预览
            </Button>
            <Button variant="outline" onClick={() => setLabelDialogOpen(false)} className="flex-1">取消</Button>
          </div>

          {/* 标签统计 */}
          <div className="mt-3 text-xs text-gray-400 text-right">
            共 {boxConfigs.reduce((s, c) => s + c.allocations.length, 0)} 个标签
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== 标签打印预览 ===== */}
      <Sheet open={labelPreviewOpen} onOpenChange={() => setLabelPreviewOpen(false)}>
        <SheetContent className="w-[800px] print:w-full">
          <SheetHeader className="no-print">
            <SheetTitle>标签打印预览</SheetTitle>
          </SheetHeader>
          <div className="mt-4 print:mt-0">
            <Button onClick={handleLabelPrintAction} className="mb-4 no-print">打印标签</Button>

            <div className="bg-white p-6 border border-gray-200 rounded shadow-sm" id="label-print-area">
              {labelNote && (
                <div className="grid grid-cols-2 gap-3">
                  {boxConfigs.map((config, itemIdx) =>
                    config.allocations.map((alloc, boxIdx) => {
                      const barcodeValue = `${labelNote.note_no}-${config.productCode}-${alloc.boxIndex}`;
                      const refKey = `${itemIdx}-${boxIdx}`;
                      return (
                        <div
                          key={refKey}
                          className="border border-gray-300 rounded p-3 break-inside-avoid"
                          style={{ minHeight: '120px' }}
                        >
                          <div className="flex justify-between items-start mb-1">
                            <div className="text-xs font-bold text-gray-900">{labelNote.customer_name}</div>
                            <div className="text-[10px] text-gray-400">{labelNote.note_no}</div>
                          </div>
                          <div className="flex justify-between items-center mb-1">
                            <div className="text-xs text-gray-700">
                              <span className="font-medium">{config.productName}</span>
                              {config.spec && <span className="text-gray-400 ml-1">({config.spec})</span>}
                            </div>
                            <div className="text-[10px] text-gray-400 font-mono">{config.productCode}</div>
                          </div>
                          <div className="flex items-center justify-center my-1">
                            <svg
                              ref={(el) => {
                                if (el) barcodeRefs.current.set(refKey, el);
                              }}
                            />
                          </div>
                          <div className="flex justify-between items-end">
                            <div className="text-xs text-gray-500">
                              第 <span className="font-mono font-bold text-gray-900">{alloc.boxIndex}</span> / {config.boxCount} 箱
                            </div>
                            <div className="text-sm font-mono font-bold text-gray-900">
                              {alloc.quantity} <span className="text-xs font-normal text-gray-500">{config.unit}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* 删除确认 */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>确认删除该送货单及其明细吗？</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
