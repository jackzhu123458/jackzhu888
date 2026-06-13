'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { translateUnit } from '@/lib/utils';

interface Product {
  id: string;
  code: string;
  name: string;
  spec: string | null;
  unit: string;
}

interface Warehouse {
  id: string;
  name: string;
  location: string | null;
}

interface InboundNoteItem {
  id: string;
  product_id: string;
  quantity: string;
  products: Product;
}

interface InboundNote {
  id: string;
  note_no: string;
  type: string;
  production_order_id: string | null;
  warehouse_id: string;
  operator: string | null;
  status: string;
  remark: string | null;
  created_at: string;
  warehouses: Warehouse;
  inbound_note_items: InboundNoteItem[];
}

export default function InboundPage() {
  const [notes, setNotes] = useState<InboundNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // 新建表单
  const [formWarehouse, setFormWarehouse] = useState('');
  const [formRemark, setFormRemark] = useState('');
  const [formItems, setFormItems] = useState<Array<{ product_id: string; quantity: string }>>([
    { product_id: '', quantity: '' },
  ]);

  const loadNotes = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/inbound');
    const data = await res.json();
    if (Array.isArray(data)) setNotes(data);
    setLoading(false);
  }, []);

  const loadMeta = useCallback(async () => {
    const [wRes, pRes] = await Promise.all([fetch('/api/warehouses'), fetch('/api/products')]);
    const wData = await wRes.json();
    const pData = await pRes.json();
    if (Array.isArray(wData)) setWarehouses(wData);
    if (Array.isArray(pData)) setProducts(pData);
  }, []);

  useEffect(() => {
    loadNotes();
    loadMeta();
  }, [loadNotes, loadMeta]);

  const statusLabel: Record<string, string> = {
    pending: '待入库',
    confirmed: '已入库',
    completed: '已入库',
  };
  const statusColor: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-800',
    confirmed: 'bg-green-100 text-green-800',
    completed: 'bg-green-100 text-green-800',
  };
  const typeLabel: Record<string, string> = {
    production: '生产入库',
    other: '其他入库',
  };

  const handleAddItem = () => {
    setFormItems([...formItems, { product_id: '', quantity: '' }]);
  };

  const handleRemoveItem = (index: number) => {
    setFormItems(formItems.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: 'product_id' | 'quantity', value: string) => {
    const updated = [...formItems];
    updated[index] = { ...updated[index], [field]: value };
    setFormItems(updated);
  };

  const handleCreate = async () => {
    if (!formWarehouse) return alert('请选择仓库');
    const validItems = formItems.filter((item) => item.product_id && parseFloat(item.quantity) > 0);
    if (validItems.length === 0) return alert('请至少添加一条入库明细');

    const res = await fetch('/api/inbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        warehouse_id: formWarehouse,
        type: 'other',
        remark: formRemark,
        items: validItems.map((item) => ({
          product_id: item.product_id,
          quantity: parseFloat(item.quantity),
        })),
      }),
    });
    if (res.ok) {
      setShowCreate(false);
      resetForm();
      loadNotes();
    } else {
      const err = await res.json();
      alert(err.error || '创建失败');
    }
  };

  const resetForm = () => {
    setFormWarehouse('');
    setFormRemark('');
    setFormItems([{ product_id: '', quantity: '' }]);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const res = await fetch(`/api/inbound?id=${deleteId}`, { method: 'DELETE' });
    if (res.ok) {
      loadNotes();
    } else {
      const err = await res.json();
      alert(err.error || '删除失败');
    }
    setDeleteId(null);
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900">入库单</h1>
        <Button onClick={() => setShowCreate(true)} className="bg-[#1E40AF] hover:bg-[#1D4ED8]">
          新增入库单
        </Button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50/50">
              <th className="text-left px-4 py-3 font-medium text-gray-500 w-36">入库单号</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 w-24">类型</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 w-24">仓库</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 w-36">入库时间</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 w-28">物料编码</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">物料描述</th>
              <th className="text-center px-4 py-3 font-medium text-gray-500 w-16">单位</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500 w-20">数量</th>
              <th className="text-center px-4 py-3 font-medium text-gray-500 w-20">状态</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 w-28">备注</th>
              <th className="text-center px-4 py-3 font-medium text-gray-500 w-20">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} className="px-4 py-12 text-center text-gray-400">加载中...</td></tr>
            ) : notes.length === 0 ? (
              <tr><td colSpan={10} className="px-4 py-12 text-center text-gray-400">暂无入库单</td></tr>
            ) : (
              notes.map((note) => {
                const items = note.inbound_note_items || [];
                return items.map((item, idx) => (
                  <tr
                    key={`${note.id}-${item.id}`}
                    className={`border-b border-gray-50 hover:bg-gray-50/50 ${idx > 0 ? '' : ''} ${idx > 0 ? 'border-t-0' : ''}`}
                  >
                    {/* 入库单号 - 仅第一行显示 */}
                    <td className={`px-4 py-3 font-mono text-gray-900 ${idx > 0 ? 'text-transparent' : ''}`}>
                      {note.note_no}
                    </td>
                    {/* 类型 */}
                    <td className={`px-4 py-3 text-gray-700 ${idx > 0 ? 'text-transparent' : ''}`}>
                      {typeLabel[note.type] || note.type}
                    </td>
                    {/* 仓库 */}
                    <td className={`px-4 py-3 text-gray-700 ${idx > 0 ? 'text-transparent' : ''}`}>
                      {note.warehouses?.name || '-'}
                    </td>
                    {/* 入库时间 */}
                    <td className={`px-4 py-3 text-gray-700 text-xs ${idx > 0 ? 'text-transparent' : ''}`}>
                      {note.created_at ? new Date(note.created_at).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}
                    </td>
                    {/* 物料编码 */}
                    <td className="px-4 py-3 font-mono text-gray-900 text-xs">
                      {String((item.products as unknown as Record<string, unknown>)?.code ?? '-')}
                    </td>
                    {/* 物料描述 */}
                    <td className="px-4 py-3 text-gray-700">
                      {String((item.products as unknown as Record<string, unknown>)?.name ?? '-')}
                    </td>
                    {/* 单位 */}
                    <td className="px-4 py-3 text-center text-gray-500">
                      {translateUnit(String((item.products as unknown as Record<string, unknown>)?.unit ?? '-'))}
                    </td>
                    {/* 数量 */}
                    <td className="px-4 py-3 text-right font-mono text-gray-900">
                      {Number(item.quantity).toLocaleString()}
                    </td>
                    {/* 状态 - 仅第一行显示 */}
                    <td className={`px-4 py-3 text-center ${idx > 0 ? 'invisible' : ''}`}>
                      <Badge className={statusColor[note.status] || 'bg-gray-100 text-gray-800'}>
                        {statusLabel[note.status] || note.status}
                      </Badge>
                    </td>
                    {/* 备注 - 仅第一行显示 */}
                    <td className={`px-4 py-3 text-gray-500 text-xs max-w-[120px] truncate ${idx > 0 ? 'text-transparent' : ''}`}>
                      {note.remark || '-'}
                    </td>
                    {/* 操作 - 仅第一行显示 */}
                    <td className={`px-4 py-3 text-center ${idx > 0 ? 'invisible' : ''}`}>
                      {note.status === 'pending' && (
                        <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={() => setDeleteId(note.id)}>
                          删除
                        </Button>
                      )}
                    </td>
                  </tr>
                ));
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 新增入库单抽屉 */}
      <Sheet open={showCreate} onOpenChange={setShowCreate}>
        <SheetContent className="w-[520px] sm:max-w-[520px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>新增入库单</SheetTitle>
          </SheetHeader>
          <div className="py-6 space-y-5">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">入库仓库</label>
              <Select value={formWarehouse} onValueChange={setFormWarehouse}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="选择仓库" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">备注</label>
              <Input value={formRemark} onChange={(e) => setFormRemark(e.target.value)} placeholder="可选" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">入库明细</label>
                <Button variant="outline" size="sm" onClick={handleAddItem}>添加行</Button>
              </div>
              <div className="space-y-3">
                {formItems.map((item, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Select value={item.product_id} onValueChange={(v) => handleItemChange(index, 'product_id', v)}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="选择物料" />
                      </SelectTrigger>
                      <SelectContent>
                        {products.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.code} - {p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      className="w-28"
                      placeholder="数量"
                      value={item.quantity}
                      onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                    />
                    {formItems.length > 1 && (
                      <Button variant="ghost" size="sm" className="text-red-500" onClick={() => handleRemoveItem(index)}>
                        删
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>取消</Button>
            <Button onClick={handleCreate} className="bg-[#1E40AF] hover:bg-[#1D4ED8]">确认入库</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* 删除确认 */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>确定要删除该入库单吗？此操作不可撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
