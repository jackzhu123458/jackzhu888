'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
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
  category: string | null;
  price: number;
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
  const [quantity, setQuantity] = useState('');
  const [remark, setRemark] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [searchText, setSearchText] = useState('');

  // 树状展开/收缩状态
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [allExpanded, setAllExpanded] = useState(false);

  // Excel 导入相关状态
  const [importOpen, setImportOpen] = useState(false);
  const [importMode, setImportMode] = useState<'single' | 'multi'>('single');
  const [importParentId, setImportParentId] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 新增BOM表单状态（ERP商品资料风格）
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newSpec, setNewSpec] = useState('');
  const [newSpecDetail, setNewSpecDetail] = useState('');
  const [newUnit, setNewUnit] = useState('个');
  const [newCategory, setNewCategory] = useState('');
  const [newCostPrice, setNewCostPrice] = useState('0');
  const [newSellPrice, setNewSellPrice] = useState('0');
  const [childType, setChildType] = useState('raw_material');
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);

  // 子级物料表单状态
  const [newChildCode, setNewChildCode] = useState('');
  const [newChildName, setNewChildName] = useState('');
  const [newChildSpec, setNewChildSpec] = useState('');
  const [newChildSpecDetail, setNewChildSpecDetail] = useState('');
  const [newChildUnit, setNewChildUnit] = useState('个');
  const [newChildCategory, setNewChildCategory] = useState('');
  const [newChildCostPrice, setNewChildCostPrice] = useState('0');
  const [newChildSellPrice, setNewChildSellPrice] = useState('0');
  const [showChildCategoryDropdown, setShowChildCategoryDropdown] = useState(false);

  // 父级/子级选择状态
  const [selectedParentId, setSelectedParentId] = useState('');
  const [selectedChildId, setSelectedChildId] = useState('');
  const [parentSearchOpen, setParentSearchOpen] = useState(false);
  const [parentSearch, setParentSearch] = useState('');
  const [childSearchOpen, setChildSearchOpen] = useState(false);
  const [childSearch, setChildSearch] = useState('');

  // 从产品数据提取类目列表
  const categories = useMemo(() => {
    const cats = new Set<string>();
    products.forEach(p => { if (p.category) cats.add(p.category); });
    return Array.from(cats).sort();
  }, [products]);

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

  // 首次加载时默认全部展开
  useEffect(() => {
    if (bomList.length > 0 && expandedGroups.size === 0) {
      const allParentIds = new Set(bomList.map(b => b.parent_product_id));
      setExpandedGroups(allParentIds);
      setAllExpanded(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bomList.length]);

  const handleAdd = () => {
    setEditItem(null);
    setNewCode('');
    setNewName('');
    setNewSpecDetail('');
    setNewUnit('个');
    setNewCategory('');
    setNewCostPrice('');
    setNewSellPrice('');
    setNewChildCode('');
    setNewChildName('');
    setNewChildSpecDetail('');
    setNewChildUnit('个');
    setNewChildCategory('');
    setNewChildCostPrice('');
    setNewChildSellPrice('');
    setChildType('raw_material');
    setQuantity('');
    setRemark('');
    setSheetOpen(true);
  };

  const handleEdit = (item: BomItem) => {
    setEditItem(item);
    setSelectedParentId(item.parent_product_id);
    setSelectedChildId(item.child_product_id);
    setQuantity(item.quantity);
    setRemark(item.remark || '');
    setChildType(item.child_product?.type || 'raw_material');
    // 填充归属大类信息
    const parentProd = products.find(p => p.id === item.parent_product_id);
    if (parentProd) {
      setNewCode(parentProd.code || '');
      setNewName(parentProd.name || '');
      setNewSpecDetail(parentProd.spec || '');
      setNewUnit(parentProd.unit || '个');
      setNewCategory(parentProd.category || '');
      setNewCostPrice(parentProd.price?.toString() || '');
      setNewSellPrice(parentProd.price?.toString() || '');
    }
    // 填充物料明细信息
    const childProd = products.find(p => p.id === item.child_product_id);
    if (childProd) {
      setNewChildCode(childProd.code || '');
      setNewChildName(childProd.name || '');
      setNewChildSpecDetail(childProd.spec || '');
      setNewChildUnit(childProd.unit || '个');
      setNewChildCategory(childProd.category || '');
      setNewChildCostPrice(childProd.price?.toString() || '');
      setNewChildSellPrice(childProd.price?.toString() || '');
    }
    setSheetOpen(true);
  };

  // 快速新增产品
  const handleQuickAddProduct = async (isParent: boolean) => {
    const code = isParent ? newCode : newChildCode;
    const name = isParent ? newName : newChildName;
    const type = isParent ? 'finished_product' : childType;
    const spec = isParent ? newSpecDetail : newChildSpecDetail;
    const unit = isParent ? newUnit : newChildUnit;
    const category = isParent ? newCategory : newChildCategory;
    const price = isParent ? (parseFloat(newCostPrice) || 0) : (parseFloat(newChildCostPrice) || 0);
    const res = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, name, type, spec, unit, category, price }),
    });
    if (res.ok) {
      const newProd = await res.json();
      await loadData();
      if (isParent) {
        setSelectedParentId(newProd.id);
      } else {
        setSelectedChildId(newProd.id);
      }
    } else {
      const err = await res.json();
      alert(err.error || '新增产品失败');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      let parentId = selectedParentId;
      let childProductId = selectedChildId;

      // If no parent selected, create new product as 归属大类
      if (!parentId) {
        if (!newCode.trim() || !newName.trim()) {
          alert('请填写归属大类的商品编号和商品名称');
          setSaving(false);
          return;
        }
        const parentRes = await fetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: newCode.trim(),
            name: newName.trim(),
            spec: newSpecDetail.trim() || null,
            unit: newUnit,
            category: newCategory.trim() || null,
            type: 'finished_product',
            price: newSellPrice ? parseFloat(newSellPrice) : 0,
          }),
        });
        if (parentRes.ok) {
          const newProd = await parentRes.json();
          parentId = newProd.id;
          await loadData();
        } else {
          const err = await parentRes.json();
          alert(err.error || '新增归属大类失败');
          setSaving(false);
          return;
        }
      }

      // If no child selected, create new product as child material
      if (!childProductId) {
        if (!newChildCode.trim() || !newChildName.trim()) {
          alert('请填写物料的商品编号和商品名称');
          setSaving(false);
          return;
        }
        const childRes = await fetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: newChildCode.trim(),
            name: newChildName.trim(),
            spec: newChildSpecDetail.trim() || null,
            unit: newChildUnit,
            category: newChildCategory.trim() || null,
            type: childType,
            price: newChildSellPrice ? parseFloat(newChildSellPrice) : 0,
          }),
        });
        if (childRes.ok) {
          const newProd = await childRes.json();
          childProductId = newProd.id;
          await loadData();
        } else {
          const err = await childRes.json();
          alert(err.error || '新增物料失败');
          setSaving(false);
          return;
        }
      }

      const body = {
        parent_product_id: parentId,
        child_product_id: childProductId,
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
    } catch {
      alert('保存失败');
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
      alert('请选择归属大类');
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

  // 搜索过滤
  const filteredGroups = searchText.trim()
    ? Object.fromEntries(
        Object.entries(groupedBom).filter(([, group]) => {
          const q = searchText.toLowerCase();
          // 父产品匹配
          if (group.product.name.toLowerCase().includes(q) || group.product.code.toLowerCase().includes(q)) return true;
          // 子物料匹配
          return group.items.some(item =>
            item.child_product.name.toLowerCase().includes(q) ||
            item.child_product.code.toLowerCase().includes(q)
          );
        })
      )
    : groupedBom;

  // 排序：按父产品编码排序
  const sortedGroupEntries = Object.entries(filteredGroups).sort((a, b) =>
    a[1].product.code.localeCompare(b[1].product.code)
  );

  const finishedProducts = products.filter((p) => p.type === 'finished_product' || p.type === 'semi_finished');

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (allExpanded) {
      setExpandedGroups(new Set());
      setAllExpanded(false);
    } else {
      const allIds = new Set(Object.keys(filteredGroups));
      setExpandedGroups(allIds);
      setAllExpanded(true);
    }
  };

  return (
    <>
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

        {/* 搜索和操作栏 */}
        <div className="flex items-center gap-4 mb-4">
          <div className="relative flex-1 max-w-md">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <Input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="搜索物料编码或名称..."
              className="pl-10"
            />
          </div>
          <Button variant="outline" size="sm" onClick={toggleAll}>
            <svg className={`w-4 h-4 mr-1.5 transition-transform ${allExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            {allExpanded ? '全部收缩' : '全部展开'}
          </Button>
          <span className="text-sm text-gray-500">
            共 {sortedGroupEntries.length} 个 BOM 组，{bomList.length} 条物料
          </span>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-400">加载中...</div>
        ) : sortedGroupEntries.length === 0 ? (
          <div className="text-center py-12 text-gray-400">暂无 BOM 数据</div>
        ) : (
          <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
            {/* 表头 */}
            <div className="grid grid-cols-[36px_1fr_120px_120px_1fr_100px_100px_80px_60px_80px] border-b border-gray-200 bg-gray-50 text-xs font-medium text-gray-500">
              <div className="px-2 py-3"></div>
              <div className="px-4 py-3">物料编码</div>
              <div className="px-4 py-3">物料名称</div>
              <div className="px-4 py-3">规格</div>
              <div className="px-4 py-3">类属</div>
              <div className="px-4 py-3 text-right">用量</div>
              <div className="px-4 py-3 text-right">售价(含税)</div>
              <div className="px-4 py-3">单位</div>
              <div className="px-4 py-3">备注</div>
              <div className="px-4 py-3 text-center">操作</div>
            </div>

            {/* 树状列表 */}
            {sortedGroupEntries.map(([key, group]) => {
              const isExpanded = expandedGroups.has(key);
              return (
                <div key={key} className={isExpanded ? '' : 'border-b border-gray-100'}>
                  {/* 归属大类行（BOM 组） */}
                  <div
                    className="grid grid-cols-[36px_1fr_120px_120px_1fr_100px_100px_80px_60px_80px] items-center bg-gray-50/60 hover:bg-gray-100/60 cursor-pointer border-b border-gray-50 transition-colors"
                    onClick={() => toggleGroup(key)}
                  >
                    <div className="px-2 py-3 flex items-center justify-center">
                      <svg
                        className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`}
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="px-4 py-3 font-mono text-sm font-medium text-gray-900">
                      {group.product.code}
                    </div>
                    <div className="px-4 py-3 text-sm font-semibold text-blue-800">
                      {group.product.name}
                    </div>
                    <div className="px-4 py-3 text-sm text-gray-500">
                      {group.product.spec || '-'}
                    </div>
                    <div className="px-4 py-3 text-xs text-gray-500">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
                        {group.product.category || '-'}
                      </span>
                    </div>
                    <div className="px-4 py-3 text-right text-sm text-gray-500">
                      {group.items.length} 项
                    </div>
                    <div className="px-4 py-3 text-right font-mono text-sm text-gray-900">
                      ¥{Number(group.product.price || 0).toFixed(2)}
                    </div>
                    <div className="px-4 py-3 text-xs text-gray-500">{group.product.unit}</div>
                    <div className="px-4 py-3 text-xs text-gray-400">{group.product.spec ? '' : ''}</div>
                    <div className="px-4 py-3"></div>
                  </div>

                  {/* 子物料行 */}
                  {isExpanded && group.items.map((item, idx) => (
                    <div
                      key={item.id}
                      className={`grid grid-cols-[36px_1fr_120px_120px_1fr_100px_100px_80px_60px_80px] items-center border-b border-gray-50 hover:bg-gray-50/80 transition-colors ${idx % 2 === 1 ? 'bg-gray-50/30' : ''}`}
                    >
                      <div className="px-2 py-2.5 flex items-center justify-center">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-300"></span>
                      </div>
                      <div className="px-4 py-2.5 font-mono text-sm text-gray-700">
                        {item.child_product.code}
                      </div>
                      <div className="px-4 py-2.5 text-sm text-gray-900">
                        {item.child_product.name}
                      </div>
                      <div className="px-4 py-2.5 text-sm text-gray-500">
                        {item.child_product.spec || '-'}
                      </div>
                      <div className="px-4 py-2.5 text-xs text-gray-500">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                          {item.child_product.category || '-'}
                        </span>
                      </div>
                      <div className="px-4 py-2.5 text-right font-mono text-sm text-gray-900">
                        {item.quantity}
                      </div>
                      <div className="px-4 py-2.5 text-right font-mono text-sm text-gray-700">
                        ¥{Number(item.child_product.price || 0).toFixed(2)}
                      </div>
                      <div className="px-4 py-2.5 text-sm text-gray-500">
                        {item.child_product.unit}
                      </div>
                      <div className="px-4 py-2.5 text-xs text-gray-400">
                        {item.remark || '-'}
                      </div>
                      <div className="px-4 py-2.5 text-center">
                        <button onClick={(e) => { e.stopPropagation(); handleEdit(item); }} className="text-blue-600 hover:text-blue-800 text-xs mr-2">编辑</button>
                        <button onClick={(e) => { e.stopPropagation(); setDeleteId(item.id); }} className="text-red-500 hover:text-red-700 text-xs">删除</button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 新增/编辑抽屉 - ERP商品资料维护风格 */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-[560px]">
          <SheetHeader>
            <SheetTitle>{editItem ? '编辑 BOM' : '商品基本资料维护'}</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-4 px-1">
            {/* 顶部：商品编号 + 商品名称 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">商品编号 *</label>
                <Input
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  placeholder="输入商品编号"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">商品名称 *</label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="输入商品名称"
                />
              </div>
            </div>

            {/* 第二行：速记编码 + 商品类别 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">速记编码</label>
                <Input
                  value={newSpec}
                  onChange={(e) => setNewSpec(e.target.value)}
                  placeholder="速记编码"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">商品类别</label>
                <div className="flex gap-1">
                  <Input
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    placeholder="如: 029"
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="px-2 shrink-0"
                    onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
                  >···</Button>
                </div>
                {showCategoryDropdown && (
                  <div className="absolute z-50 mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-auto">
                    {categories.map(c => (
                      <div
                        key={c}
                        className="px-3 py-2 cursor-pointer hover:bg-blue-50 text-sm"
                        onMouseDown={() => { setNewCategory(c); setShowCategoryDropdown(false); }}
                      >{c}</div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 第三行：型号规格 + 单位 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">型号规格</label>
                <Input
                  value={newSpecDetail}
                  onChange={(e) => setNewSpecDetail(e.target.value)}
                  placeholder="型号规格"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">单位 *</label>
                <Select value={newUnit} onValueChange={setNewUnit}>
                  <SelectTrigger><SelectValue placeholder="选择单位" /></SelectTrigger>
                  <SelectContent>
                    {['个', '件', '套', '千克', '公斤', '米', '张', '片', 'PCS', '箱', '包', '根', '条', '只', '副', '台', '批'].map(u => (
                      <SelectItem key={u} value={u}>{u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* === 物料明细分隔线 === */}
            <div className="border-t pt-4 mt-4">
              <h4 className="text-sm font-semibold text-gray-800 mb-3">物料明细</h4>
              <div className="space-y-3">
                {/* 物料编号 + 物料名称 */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1.5 block">物料编号 *</label>
                    <Input
                      value={newChildCode}
                      onChange={(e) => setNewChildCode(e.target.value)}
                      placeholder="输入物料编号"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1.5 block">物料名称 *</label>
                    <Input
                      value={newChildName}
                      onChange={(e) => setNewChildName(e.target.value)}
                      placeholder="输入物料名称"
                    />
                  </div>
                </div>

                {/* 速记编码 + 商品类别 */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1.5 block">速记编码</label>
                    <Input
                      value={newChildSpec}
                      onChange={(e) => setNewChildSpec(e.target.value)}
                      placeholder="速记编码"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1.5 block">商品类别</label>
                    <Input
                      value={newChildCategory}
                      onChange={(e) => setNewChildCategory(e.target.value)}
                      placeholder="如: 029"
                    />
                  </div>
                </div>

                {/* 型号规格 + 单位 */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1.5 block">型号规格</label>
                    <Input
                      value={newChildSpecDetail}
                      onChange={(e) => setNewChildSpecDetail(e.target.value)}
                      placeholder="型号规格"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1.5 block">单位 *</label>
                    <Select value={newChildUnit} onValueChange={setNewChildUnit}>
                      <SelectTrigger><SelectValue placeholder="选择单位" /></SelectTrigger>
                      <SelectContent>
                        {['个', '件', '套', '千克', '公斤', '米', '张', '片', 'PCS', '箱', '包', '根', '条', '只', '副', '台', '批'].map(u => (
                          <SelectItem key={u} value={u}>{u}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* 子级类型 + 用量 */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1.5 block">子级类型</label>
                    <Select value={childType} onValueChange={setChildType}>
                      <SelectTrigger><SelectValue placeholder="选择类型" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="finished_product">成品</SelectItem>
                        <SelectItem value="raw_material">原材料</SelectItem>
                        <SelectItem value="semi_finished">半成品</SelectItem>
                        <SelectItem value="other">其他</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1.5 block">用量 *</label>
                    <Input value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="如: 2" type="number" step="0.0001" />
                  </div>
                </div>

                {/* 成本单价 + 商品售价(含税) */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1.5 block">成本单价</label>
                    <Input
                      value={newChildCostPrice}
                      onChange={(e) => setNewChildCostPrice(e.target.value)}
                      placeholder="0.000"
                      type="number"
                      step="0.001"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1.5 block">商品售价(含税)</label>
                    <Input
                      value={newChildSellPrice}
                      onChange={(e) => setNewChildSellPrice(e.target.value)}
                      placeholder="0.000"
                      type="number"
                      step="0.001"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 备注 */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">备注</label>
              <Input value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="备注" />
            </div>

            {/* 按钮 */}
            <div className="pt-4 flex gap-3">
              <Button onClick={handleSave} disabled={saving || !newCode || !newName || !newUnit || !quantity} className="flex-1 bg-green-600 hover:bg-green-700">
                {saving ? '保存中...' : '确定'}
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
                    <div className="text-xs text-gray-500 mt-1">将所有物料导入到指定归属大类下</div>
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
                  <label className="text-sm font-medium text-gray-700 mb-1.5 block">目标归属大类 *</label>
                  <Select value={importParentId} onValueChange={setImportParentId}>
                    <SelectTrigger><SelectValue placeholder="选择归属大类" /></SelectTrigger>
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
                    ? '商品类别非 0 的行将按类别分组，每组自动提取公共名称创建 BOM 组'
                    : '所有行将作为所选归属大类的子物料导入'}
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
    </>
  );
}
