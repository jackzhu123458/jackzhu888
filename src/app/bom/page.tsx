'use client';

import { useEffect, useState, useCallback } from 'react';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Product {
  id: string;
  code: string;
  name: string;
  spec: string | null;
  unit: string;
  type: string;
}

interface BomItem {
  id: string;
  parent_product_id: string;
  child_product_id: string;
  quantity: string;
  remark: string | null;
  parent_product: Product;
  child_product: Product;
}

export default function BomPage() {
  const [bomList, setBomList] = useState<BomItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editItem, setEditItem] = useState<BomItem | null>(null);
  const [parentId, setParentId] = useState('');
  const [childId, setChildId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [remark, setRemark] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterParent, setFilterParent] = useState<string>('all');

  const loadData = useCallback(async () => {
    setLoading(true);
    const [bomRes, prodRes] = await Promise.all([
      fetch('/api/bom'),
      fetch('/api/products'),
    ]);
    const bomData = await bomRes.json();
    const prodData = await prodRes.json();
    if (Array.isArray(bomData)) setBomList(bomData);
    if (Array.isArray(prodData)) setProducts(prodData);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAdd = () => {
    setEditItem(null);
    setParentId('');
    setChildId('');
    setQuantity('');
    setRemark('');
    setSheetOpen(true);
  };

  const handleEdit = (item: BomItem) => {
    setEditItem(item);
    setParentId(item.parent_product_id);
    setChildId(item.child_product_id);
    setQuantity(item.quantity);
    setRemark(item.remark || '');
    setSheetOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const body = {
      parent_product_id: parentId,
      child_product_id: childId,
      quantity,
      remark: remark || null,
      ...(editItem ? { id: editItem.id } : {}),
    };
    const res = await fetch('/api/bom', {
      method: editItem ? 'PUT' : 'POST',
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
    await fetch(`/api/bom?id=${deleteId}`, { method: 'DELETE' });
    setDeleteId(null);
    loadData();
  };

  // 按 parent_product 分组
  const groupedBom = bomList.reduce((acc, item) => {
    const key = item.parent_product_id;
    if (!acc[key]) {
      acc[key] = { product: item.parent_product, items: [] };
    }
    acc[key].items.push(item);
    return acc;
  }, {} as Record<string, { product: Product; items: BomItem[] }>);

  const filteredGroups = filterParent === 'all'
    ? groupedBom
    : Object.fromEntries(
        Object.entries(groupedBom).filter(([key]) => key === filterParent)
      );

  const finishedProducts = products.filter((p) => p.type === 'finished_product' || p.type === 'semi_finished');

  return (
    <AppShell>
      <div className="p-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold text-gray-900">BOM 物料清单</h1>
          <Button onClick={handleAdd}>新增 BOM</Button>
        </div>

        <div className="flex items-center gap-4 mb-4">
          <Select value={filterParent} onValueChange={setFilterParent}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="筛选成品..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部成品</SelectItem>
              {finishedProducts.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.code} - {p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-400">加载中...</div>
        ) : Object.keys(filteredGroups).length === 0 ? (
          <div className="text-center py-12 text-gray-400">暂无 BOM 数据</div>
        ) : (
          <div className="space-y-6">
            {Object.entries(filteredGroups).map(([key, group]) => (
              <div key={key} className="bg-white rounded-lg border border-gray-200">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <span className="font-medium text-gray-900">{group.product.name}</span>
                    <span className="text-sm text-gray-500 ml-3 font-mono">{group.product.code}</span>
                    {group.product.spec && (
                      <span className="text-sm text-gray-400 ml-2">{group.product.spec}</span>
                    )}
                  </div>
                  <span className="text-xs text-gray-400">{group.items.length} 项子料</span>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/30">
                      <th className="text-left px-5 py-2.5 font-medium text-gray-500">子料编码</th>
                      <th className="text-left px-5 py-2.5 font-medium text-gray-500">子料名称</th>
                      <th className="text-left px-5 py-2.5 font-medium text-gray-500">规格</th>
                      <th className="text-right px-5 py-2.5 font-medium text-gray-500">用量</th>
                      <th className="text-left px-5 py-2.5 font-medium text-gray-500">单位</th>
                      <th className="text-left px-5 py-2.5 font-medium text-gray-500">备注</th>
                      <th className="text-center px-5 py-2.5 font-medium text-gray-500">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map((item) => (
                      <tr key={item.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                        <td className="px-5 py-2.5 font-mono text-gray-900">{item.child_product.code}</td>
                        <td className="px-5 py-2.5 text-gray-900">{item.child_product.name}</td>
                        <td className="px-5 py-2.5 text-gray-600">{item.child_product.spec || '-'}</td>
                        <td className="px-5 py-2.5 text-right font-mono text-gray-900">{item.quantity}</td>
                        <td className="px-5 py-2.5 text-gray-600">{item.child_product.unit}</td>
                        <td className="px-5 py-2.5 text-gray-500">{item.remark || '-'}</td>
                        <td className="px-5 py-2.5 text-center">
                          <button onClick={() => handleEdit(item)} className="text-blue-600 hover:text-blue-800 text-xs mr-3">编辑</button>
                          <button onClick={() => setDeleteId(item.id)} className="text-red-500 hover:text-red-700 text-xs">删除</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 新增/编辑抽屉 */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-[480px]">
          <SheetHeader>
            <SheetTitle>{editItem ? '编辑 BOM' : '新增 BOM'}</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-4 px-1">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">父级产品（成品） *</label>
              <Select value={parentId} onValueChange={setParentId}>
                <SelectTrigger><SelectValue placeholder="选择成品" /></SelectTrigger>
                <SelectContent>
                  {finishedProducts.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.code} - {p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">子级物料（原材料/半成品） *</label>
              <Select value={childId} onValueChange={setChildId}>
                <SelectTrigger><SelectValue placeholder="选择子料" /></SelectTrigger>
                <SelectContent>
                  {products.filter((p) => p.id !== parentId).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.code} - {p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">用量 *</label>
              <Input value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="如: 2" type="number" step="0.0001" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">备注</label>
              <Input value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="备注" />
            </div>
            <div className="pt-4 flex gap-3">
              <Button onClick={handleSave} disabled={saving || !parentId || !childId || !quantity} className="flex-1">
                {saving ? '保存中...' : '保存'}
              </Button>
              <Button variant="outline" onClick={() => setSheetOpen(false)} className="flex-1">取消</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* 删除确认 */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>确认删除该 BOM 记录吗？</AlertDialogDescription>
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
