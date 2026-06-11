'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

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

interface ImportResult {
  productsCreated: number;
  productsSkipped: number;
  bomCreated: number;
  errors: string[];
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

  // Excel 导入相关状态
  const [importOpen, setImportOpen] = useState(false);
  const [importMode, setImportMode] = useState<'single' | 'multi'>('single');
  const [importParentId, setImportParentId] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleImport = async () => {
    if (!importFile) return;
    if (importMode === 'single' && !importParentId) {
      alert('请选择父级产品（成品）');
      return;
    }
    setImporting(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      formData.append('mode', importMode);
      if (importMode === 'single') {
        formData.append('parentProductId', importParentId);
      }
      const res = await fetch('/api/bom/import', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setImportResult(data);
        loadData();
      } else {
        alert(data.error || '导入失败');
      }
    } catch {
      alert('导入失败，请检查文件格式');
    } finally {
      setImporting(false);
    }
  };

  const openImportDialog = () => {
    setImportFile(null);
    setImportParentId('');
    setImportMode('single');
    setImportResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setImportOpen(true);
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
          <div className="flex gap-3">
            <Button variant="outline" onClick={openImportDialog}>
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              Excel 导入
            </Button>
            <Button onClick={handleAdd}>新增 BOM</Button>
          </div>
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

      {/* Excel 导入对话框 */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Excel 批量导入 BOM</DialogTitle>
            <DialogDescription>
              上传 Excel 文件批量导入产品物料和 BOM 关系。表头需包含：商品类别、商品编号、商品名称、单位、成本单价、商品售价一、商品描述
            </DialogDescription>
          </DialogHeader>

          {!importResult ? (
            <div className="space-y-5 mt-2">
              {/* 导入模式选择 */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">导入模式</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setImportMode('single')}
                    className={`p-3 rounded-lg border-2 text-left transition-colors ${
                      importMode === 'single'
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="font-medium text-sm text-gray-900">单产品导入</div>
                    <div className="text-xs text-gray-500 mt-1">将所有物料导入到指定成品下</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setImportMode('multi')}
                    className={`p-3 rounded-lg border-2 text-left transition-colors ${
                      importMode === 'multi'
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="font-medium text-sm text-gray-900">按类别分组导入</div>
                    <div className="text-xs text-gray-500 mt-1">按商品类别自动分组创建 BOM</div>
                  </button>
                </div>
              </div>

              {/* 单产品模式：选择父产品 */}
              {importMode === 'single' && (
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1.5 block">目标成品 *</label>
                  <Select value={importParentId} onValueChange={setImportParentId}>
                    <SelectTrigger><SelectValue placeholder="选择成品" /></SelectTrigger>
                    <SelectContent>
                      {finishedProducts.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.code} - {p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* 文件上传 */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">选择 Excel 文件 *</label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-400 transition-colors">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                    className="hidden"
                    id="bom-file-input"
                  />
                  <label htmlFor="bom-file-input" className="cursor-pointer">
                    {importFile ? (
                      <div>
                        <svg className="w-8 h-8 mx-auto text-green-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-sm font-medium text-gray-900">{importFile.name}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {(importFile.size / 1024).toFixed(1)} KB - 点击更换文件
                        </p>
                      </div>
                    ) : (
                      <div>
                        <svg className="w-8 h-8 mx-auto text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        <p className="text-sm text-gray-600">点击选择 Excel 文件</p>
                        <p className="text-xs text-gray-400 mt-1">支持 .xlsx / .xls / .csv 格式</p>
                      </div>
                    )}
                  </label>
                </div>
              </div>

              {/* 格式说明 */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-xs font-medium text-amber-800 mb-1">Excel 表头格式要求</p>
                <p className="text-xs text-amber-700">
                  商品类别 | 商品编号 | 商品名称 | 单位 | 成本单价 | 商品售价一 | 商品描述
                </p>
                <p className="text-xs text-amber-600 mt-1">
                  {importMode === 'multi'
                    ? '商品类别非 0 的行将按类别分组，每组自动创建一个父产品及其 BOM'
                    : '所有行将作为所选成品的子物料导入'}
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  onClick={handleImport}
                  disabled={importing || !importFile || (importMode === 'single' && !importParentId)}
                  className="flex-1"
                >
                  {importing ? '导入中...' : '开始导入'}
                </Button>
                <Button variant="outline" onClick={() => setImportOpen(false)} className="flex-1">取消</Button>
              </div>
            </div>
          ) : (
            /* 导入结果 */
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-green-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-green-700">{importResult.productsCreated}</div>
                  <div className="text-xs text-green-600 mt-1">新建产品</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-gray-600">{importResult.productsSkipped}</div>
                  <div className="text-xs text-gray-500 mt-1">已存在跳过</div>
                </div>
                <div className="bg-blue-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-blue-700">{importResult.bomCreated}</div>
                  <div className="text-xs text-blue-600 mt-1">新建 BOM</div>
                </div>
              </div>

              {importResult.errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 max-h-40 overflow-y-auto">
                  <p className="text-xs font-medium text-red-800 mb-1">错误信息</p>
                  {importResult.errors.map((err, i) => (
                    <p key={i} className="text-xs text-red-600">{err}</p>
                  ))}
                </div>
              )}

              <Button onClick={() => setImportOpen(false)} className="w-full">完成</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

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
