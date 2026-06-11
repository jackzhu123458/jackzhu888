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
  category: string | null;
  type: string;
  price: string | null;
  remark: string | null;
  is_active: boolean;
  created_at: string;
}

const typeMap: Record<string, string> = {
  raw_material: '原材料',
  semi_finished: '半成品',
  finished_product: '成品',
};

const defaultProduct = {
  code: '',
  name: '',
  spec: '',
  unit: '个',
  category: '',
  type: 'raw_material',
  price: '',
  remark: '',
};

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState(defaultProduct);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (keyword) params.set('keyword', keyword);
    if (filterType !== 'all') params.set('type', filterType);
    const res = await fetch(`/api/products?${params}`);
    const data = await res.json();
    if (Array.isArray(data)) setProducts(data);
    setLoading(false);
  }, [keyword, filterType]);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  const handleAdd = () => {
    setEditingProduct(null);
    setForm(defaultProduct);
    setSheetOpen(true);
  };

  const handleEdit = (p: Product) => {
    setEditingProduct(p);
    setForm({
      code: p.code,
      name: p.name,
      spec: p.spec || '',
      unit: p.unit,
      category: p.category || '',
      type: p.type,
      price: p.price || '',
      remark: p.remark || '',
    });
    setSheetOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const body = {
      ...form,
      spec: form.spec || null,
      category: form.category || null,
      price: form.price || null,
      remark: form.remark || null,
      ...(editingProduct ? { id: editingProduct.id } : {}),
    };
    const res = await fetch('/api/products', {
      method: editingProduct ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setSheetOpen(false);
      loadProducts();
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await fetch(`/api/products?id=${deleteId}`, { method: 'DELETE' });
    setDeleteId(null);
    loadProducts();
  };

  const filteredProducts = products;

  return (
    <AppShell>
      <div className="p-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold text-gray-900">物料管理</h1>
          <Button onClick={handleAdd}>新增物料</Button>
        </div>

        <div className="flex items-center gap-4 mb-4">
          <Input
            placeholder="搜索编码或名称..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="w-64"
          />
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部类型</SelectItem>
              <SelectItem value="raw_material">原材料</SelectItem>
              <SelectItem value="semi_finished">半成品</SelectItem>
              <SelectItem value="finished_product">成品</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="bg-white rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/50">
                <th className="text-left px-5 py-3 font-medium text-gray-500">编码</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">名称</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">规格</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">类型</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">单位</th>
                <th className="text-right px-5 py-3 font-medium text-gray-500">单价</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">分类</th>
                <th className="text-center px-5 py-3 font-medium text-gray-500">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-5 py-12 text-center text-gray-400">加载中...</td></tr>
              ) : filteredProducts.length === 0 ? (
                <tr><td colSpan={8} className="px-5 py-12 text-center text-gray-400">暂无数据</td></tr>
              ) : (
                filteredProducts.map((p) => (
                  <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-5 py-3 font-mono text-gray-900">{p.code}</td>
                    <td className="px-5 py-3 text-gray-900">{p.name}</td>
                    <td className="px-5 py-3 text-gray-600">{p.spec || '-'}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        p.type === 'finished_product' ? 'bg-blue-100 text-blue-700' :
                        p.type === 'semi_finished' ? 'bg-purple-100 text-purple-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {typeMap[p.type] || p.type}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-600">{p.unit}</td>
                    <td className="px-5 py-3 text-right font-mono text-gray-600">{p.price || '-'}</td>
                    <td className="px-5 py-3 text-gray-600">{p.category || '-'}</td>
                    <td className="px-5 py-3 text-center">
                      <button onClick={() => handleEdit(p)} className="text-blue-600 hover:text-blue-800 text-xs mr-3">编辑</button>
                      <button onClick={() => setDeleteId(p.id)} className="text-red-500 hover:text-red-700 text-xs">删除</button>
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
        <SheetContent className="w-[480px]">
          <SheetHeader>
            <SheetTitle>{editingProduct ? '编辑物料' : '新增物料'}</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-4 px-1">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">物料编码 *</label>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="如: RM-001" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">物料名称 *</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="如: 304不锈钢板" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">规格型号</label>
                <Input value={form.spec} onChange={(e) => setForm({ ...form, spec: e.target.value })} placeholder="如: 2mm" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">单位 *</label>
                <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="如: 个" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">物料类型 *</label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="raw_material">原材料</SelectItem>
                    <SelectItem value="semi_finished">半成品</SelectItem>
                    <SelectItem value="finished_product">成品</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">分类</label>
                <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="如: 五金" />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">单价</label>
              <Input value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="0.00" type="number" step="0.01" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">备注</label>
              <Input value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} placeholder="备注信息" />
            </div>
            <div className="pt-4 flex gap-3">
              <Button onClick={handleSave} disabled={saving || !form.code || !form.name} className="flex-1">
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
            <AlertDialogDescription>此操作不可撤销，确认删除该物料吗？</AlertDialogDescription>
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
