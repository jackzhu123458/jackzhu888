'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
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
  cost_price: number;
  remark: string | null;
  is_active: boolean;
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
  const [products, setProducts] = useState<Product[]>([]);
  const [bomList, setBomList] = useState<BomItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // 左侧类目树状态
  const [selectedCategory, setSelectedCategory] = useState<string>('0'); // '0' = 所有商品
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['0']));

  // 搜索状态
  const [searchField, setSearchField] = useState<string>('all');
  const [searchKeyword, setSearchKeyword] = useState('');

  // 选中行状态
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  // 新增/编辑商品抽屉
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newSpec, setNewSpec] = useState('');
  const [newSpecDetail, setNewSpecDetail] = useState('');
  const [newUnit, setNewUnit] = useState('个');
  const [newCategory, setNewCategory] = useState('');
  const [newCostPrice, setNewCostPrice] = useState('0');
  const [newSellPrice, setNewSellPrice] = useState('0');
  const [newRemark, setNewRemark] = useState('');
  const [newType, setNewType] = useState('finished_product');
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
  const [childType, setChildType] = useState('raw_material');
  const [quantity, setQuantity] = useState('');
  const [remark, setRemark] = useState('');
  const [showChildCategoryDropdown, setShowChildCategoryDropdown] = useState(false);

  // 删除确认
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteType, setDeleteType] = useState<'product' | 'category'>('product');

  // 类别编辑对话框
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [categoryDialogMode, setCategoryDialogMode] = useState<'add' | 'edit'>('add');
  const [categoryDialogValue, setCategoryDialogValue] = useState('');

  // Excel 导入
  const [importOpen, setImportOpen] = useState(false);
  const [importMode, setImportMode] = useState<'single' | 'multi'>('single');
  const [importParentId, setImportParentId] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 从同类产品名称中提取公共中文描述
  // 策略：提取每个名称中的中文关键词（2字及以上），取频率最高的作为类目标签
  const extractCommonLabel = (names: string[]): string => {
    if (names.length === 0) return '';
    if (names.length === 1) {
      const match = names[0].match(/^[\u4e00-\u9fff]+/);
      return match ? match[0] : '';
    }

    // 统计每个中文关键词出现的频率
    const freq = new Map<string, number>();
    for (const name of names) {
      // 提取名称中所有连续中文片段（2字及以上）
      const matches = name.match(/[\u4e00-\u9fff]{2,}/g);
      if (matches) {
        // 取最长的中文片段优先，同时记录其子串
        for (const m of matches) {
          // 只记录2字及以上的片段
          if (m.length >= 2) {
            freq.set(m, (freq.get(m) || 0) + 1);
          }
        }
      }
    }

    if (freq.size === 0) return '';

    // 按频率降序、长度降序排序，取频率最高的
    const sorted = Array.from(freq.entries()).sort((a, b) => {
      // 优先按频率降序
      if (b[1] !== a[1]) return b[1] - a[1];
      // 频率相同时按长度降序（更长的更具体）
      return b[0].length - a[0].length;
    });

    // 选取频率最高的关键词
    // 但要避免选择过于宽泛的词（如"规格"），优先选择出现在名称开头的高频词
    const topFreq = sorted[0][1];
    const candidates = sorted.filter(([, f]) => f === topFreq || f >= topFreq * 0.5);
    
    // 在候选词中，优先选择出现在名称开头的词
    for (const name of names) {
      const prefix = name.match(/^[\u4e00-\u9fff]{2,}/);
      if (prefix) {
        // 检查候选词中是否包含此前缀，或此前缀包含某个候选词
        const matched = candidates.find(([word]) => 
          prefix[0].includes(word) || word.includes(prefix[0])
        );
        if (matched) return matched[0];
      }
    }

    // 没有前缀匹配，返回频率最高的
    return sorted[0][0];
  };

  // 从产品数据提取类目列表（含中文描述名称），排除BOM占位产品
  const categories = useMemo(() => {
    const catMap = new Map<string, { count: number; names: string[] }>();
    products
      .filter(p => !p.code.startsWith('BOM-'))
      .forEach(p => {
        if (p.category) {
          const existing = catMap.get(p.category);
          if (existing) {
            existing.count++;
            existing.names.push(p.name);
          } else {
            catMap.set(p.category, { count: 1, names: [p.name] });
          }
        }
      });
    return Array.from(catMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
      .map(([cat, { count, names }]) => ({
        name: cat,
        count,
        label: extractCommonLabel(names),
      }));
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

  // 根据选中类目和搜索条件过滤产品
  const filteredProducts = useMemo(() => {
    // 排除BOM占位产品（code以BOM-开头的是BOM导入时自动创建的虚拟产品）
    let result = products.filter(p => !p.code.startsWith('BOM-'));

    // 按类目筛选
    if (selectedCategory !== '0') {
      result = result.filter(p => p.category === selectedCategory);
    }

    // 按搜索条件筛选
    if (searchKeyword.trim()) {
      const q = searchKeyword.toLowerCase().trim();
      result = result.filter(p => {
        switch (searchField) {
          case 'code': return p.code.toLowerCase().includes(q);
          case 'name': return p.name.toLowerCase().includes(q);
          case 'category': return (p.category || '').toLowerCase().includes(q);
          case 'all':
          default:
            return p.code.toLowerCase().includes(q) ||
              p.name.toLowerCase().includes(q) ||
              (p.spec || '').toLowerCase().includes(q) ||
              (p.category || '').toLowerCase().includes(q);
        }
      });
    }

    return result.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  }, [products, selectedCategory, searchField, searchKeyword]);

  // 类目树节点点击
  const handleCategoryClick = (category: string) => {
    setSelectedCategory(category);
    setSelectedProductId(null);
  };

  const toggleCategoryExpand = (cat: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  // 打开新增商品抽屉
  const handleAddProduct = () => {
    setEditProduct(null);
    setNewCode('');
    setNewName('');
    setNewSpec('');
    setNewSpecDetail('');
    setNewUnit('个');
    setNewCategory(selectedCategory !== '0' ? selectedCategory : '');
    setNewCostPrice('');
    setNewSellPrice('');
    setNewRemark('');
    setNewType('finished_product');
    setNewChildCode('');
    setNewChildName('');
    setNewChildSpec('');
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

  // 打开编辑商品抽屉
  const handleEditProduct = (product: Product) => {
    setEditProduct(product);
    setNewCode(product.code || '');
    setNewName(product.name || '');
    setNewSpecDetail(product.spec || '');
    setNewUnit(product.unit || '个');
    setNewCategory(product.category || '');
    setNewCostPrice(product.cost_price?.toString() || '0');
    setNewSellPrice(product.price?.toString() || '0');
    setNewRemark(product.remark || '');
    setNewType(product.type || 'finished_product');
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

  // 保存商品
  const handleSaveProduct = async () => {
    setSaving(true);
    try {
      if (editProduct) {
        // 编辑已有商品
        const res = await fetch('/api/products', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editProduct.id,
            code: newCode.trim(),
            name: newName.trim(),
            spec: newSpecDetail.trim() || null,
            unit: newUnit,
            category: newCategory.trim() || null,
            type: newType,
            price: newSellPrice ? parseFloat(newSellPrice) : 0,
            cost_price: newCostPrice ? parseFloat(newCostPrice) : 0,
            remark: newRemark.trim() || null,
          }),
        });
        if (res.ok) {
          setSheetOpen(false);
          loadData();
        } else {
          const err = await res.json();
          alert(err.error || '修改失败');
        }
      } else {
        // 新增商品
        if (!newCode.trim() || !newName.trim()) {
          alert('请填写商品编号和商品名称');
          setSaving(false);
          return;
        }

        let parentId: string | null = null;

        // 先创建归属大类产品
        const parentRes = await fetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: newCode.trim(),
            name: newName.trim(),
            spec: newSpecDetail.trim() || null,
            unit: newUnit,
            category: newCategory.trim() || null,
            type: newType,
            price: newSellPrice ? parseFloat(newSellPrice) : 0,
            cost_price: newCostPrice ? parseFloat(newCostPrice) : 0,
            remark: newRemark.trim() || null,
          }),
        });
        if (parentRes.ok) {
          const newProd = await parentRes.json();
          parentId = newProd.id;
        } else {
          const err = await parentRes.json();
          alert(err.error || '新增商品失败');
          setSaving(false);
          return;
        }

        // 如果有子物料信息，创建子产品和BOM记录
        if (newChildCode.trim() && newChildName.trim() && quantity) {
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
              cost_price: newChildCostPrice ? parseFloat(newChildCostPrice) : 0,
            }),
          });
          if (childRes.ok) {
            const childProd = await childRes.json();
            await fetch('/api/bom', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                parent_product_id: parentId,
                child_product_id: childProd.id,
                quantity,
                remark: remark || null,
              }),
            });
          }
        }

        setSheetOpen(false);
        loadData();
      }
    } catch {
      alert('保存失败');
    }
    setSaving(false);
  };

  // 删除商品
  const handleDeleteProduct = async () => {
    if (!deleteId || deleteType !== 'product') return;
    try {
      const res = await fetch(`/api/products?id=${deleteId}`, { method: 'DELETE' });
      if (res.ok) {
        loadData();
      } else {
        const err = await res.json();
        alert(err.error || '删除失败');
      }
    } catch {
      alert('删除失败');
    }
    setDeleteId(null);
  };

  // 删除类目（将类目下所有商品的category清空）
  const handleDeleteCategory = async () => {
    if (!deleteId || deleteType !== 'category') return;
    const categoryToDelete = deleteId;
    const affectedProducts = products.filter(p => p.category === categoryToDelete);
    for (const p of affectedProducts) {
      await fetch('/api/products', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: p.id, category: null }),
      });
    }
    if (selectedCategory === categoryToDelete) {
      setSelectedCategory('0');
    }
    setDeleteId(null);
    loadData();
  };

  // 类别新增/编辑对话框
  const handleCategoryAdd = () => {
    setCategoryDialogMode('add');
    setCategoryDialogValue('');
    setCategoryDialogOpen(true);
  };

  const handleCategoryEdit = () => {
    if (selectedCategory === '0') {
      alert('请先选择一个类目');
      return;
    }
    setCategoryDialogMode('edit');
    setCategoryDialogValue(selectedCategory);
    setCategoryDialogOpen(true);
  };

  const handleCategoryDialogSave = async () => {
    const newName = categoryDialogValue.trim();
    if (!newName) {
      alert('请输入类目名称');
      return;
    }

    if (categoryDialogMode === 'add') {
      // 新增类目：创建一个空产品占位即可，类目由产品带出
      // 直接切换到该类目视图
      setSelectedCategory(newName);
      setCategoryDialogOpen(false);
    } else {
      // 编辑类目：更新该类目下所有产品的category
      if (newName === selectedCategory) {
        setCategoryDialogOpen(false);
        return;
      }
      const affectedProducts = products.filter(p => p.category === selectedCategory);
      for (const p of affectedProducts) {
        await fetch('/api/products', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: p.id, category: newName }),
        });
      }
      setSelectedCategory(newName);
      setCategoryDialogOpen(false);
      loadData();
    }
  };

  // Excel 导入
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

  // 获取产品关联的BOM子物料数量
  const getBomChildCount = (productId: string) => {
    return bomList.filter(b => b.parent_product_id === productId).length;
  };

  const finishedProducts = products.filter((p) => p.type === 'finished_product' || p.type === 'semi_finished');

  return (
    <>
      <div className="h-[calc(100vh-0px)] flex flex-col bg-[#F8F9FA]">
        {/* 顶部工具栏 */}
        <div className="bg-[#E8EBF0] border-b border-gray-300 px-2 py-1 flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="sm" className="h-7 text-xs px-2.5 bg-[#F0F1F3] hover:bg-[#D8DAE0] border border-gray-300 rounded-sm" onClick={handleCategoryAdd}>
            新增类别
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs px-2.5 bg-[#F0F1F3] hover:bg-[#D8DAE0] border border-gray-300 rounded-sm" onClick={handleCategoryEdit}>
            修改类别
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs px-2.5 bg-[#F0F1F3] hover:bg-[#D8DAE0] border border-gray-300 rounded-sm" onClick={() => {
            if (selectedCategory === '0') { alert('请先选择一个类目'); return; }
            setDeleteType('category');
            setDeleteId(selectedCategory);
          }}>
            删除类别
          </Button>
          <div className="w-px h-5 bg-gray-400 mx-1" />
          <Button variant="ghost" size="sm" className="h-7 text-xs px-2.5 bg-[#F0F1F3] hover:bg-[#D8DAE0] border border-gray-300 rounded-sm" onClick={handleAddProduct}>
            新增
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs px-2.5 bg-[#F0F1F3] hover:bg-[#D8DAE0] border border-gray-300 rounded-sm" onClick={() => {
            const prod = products.find(p => p.id === selectedProductId);
            if (prod) handleEditProduct(prod);
            else alert('请先选择一个商品');
          }}>
            修改
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs px-2.5 bg-[#F0F1F3] hover:bg-[#D8DAE0] border border-gray-300 rounded-sm" onClick={() => {
            if (!selectedProductId) { alert('请先选择一个商品'); return; }
            setDeleteType('product');
            setDeleteId(selectedProductId);
          }}>
            删除
          </Button>
          <div className="w-px h-5 bg-gray-400 mx-1" />
          <Button variant="ghost" size="sm" className="h-7 text-xs px-2.5 bg-[#F0F1F3] hover:bg-[#D8DAE0] border border-gray-300 rounded-sm" onClick={openImportDialog}>
            导入
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs px-2.5 bg-[#F0F1F3] hover:bg-[#D8DAE0] border border-gray-300 rounded-sm">
            导出
          </Button>
        </div>

        {/* 查询筛选栏 */}
        <div className="bg-[#F0F2F5] border-b border-gray-300 px-3 py-1.5 flex items-center gap-2 shrink-0">
          <span className="text-xs text-gray-600">查询条件</span>
          <Select value={searchField} onValueChange={setSearchField}>
            <SelectTrigger className="h-7 w-[120px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部字段</SelectItem>
              <SelectItem value="code">商品编号</SelectItem>
              <SelectItem value="name">商品名称</SelectItem>
              <SelectItem value="category">商品类别</SelectItem>
            </SelectContent>
          </Select>
          <Input
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            placeholder="输入关键字..."
            className="h-7 w-[200px] text-xs"
            onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
          />
          <Button variant="ghost" size="sm" className="h-7 text-xs px-3 bg-[#F0F1F3] hover:bg-[#D8DAE0] border border-gray-300 rounded-sm" onClick={() => {}}>
            查询
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs px-3 bg-[#F0F1F3] hover:bg-[#D8DAE0] border border-gray-300 rounded-sm" onClick={() => setSearchKeyword('')}>
            清空
          </Button>
        </div>

        {/* 主体区域：左树 + 右表 */}
        <div className="flex flex-1 overflow-hidden">
          {/* 左侧类目树 */}
          <div className="w-[220px] shrink-0 border-r border-gray-300 bg-white flex flex-col">
            <div className="px-3 py-2 bg-[#E8EBF0] border-b border-gray-300">
              <span className="text-xs font-semibold text-gray-700">商品类别</span>
            </div>
            <div className="flex-1 overflow-y-auto">
              {/* 所有商品根节点 */}
              <div
                className={`flex items-center gap-1.5 px-2 py-1.5 cursor-pointer text-sm border-b border-gray-100 ${
                  selectedCategory === '0' ? 'bg-[#1E40AF] text-white' : 'hover:bg-blue-50 text-gray-800'
                }`}
                onClick={() => handleCategoryClick('0')}
              >
                <svg
                  className={`w-3.5 h-3.5 shrink-0 transition-transform ${expandedCategories.has('0') ? 'rotate-90' : ''}`}
                  fill="currentColor" viewBox="0 0 20 20"
                  onClick={(e) => { e.stopPropagation(); toggleCategoryExpand('0'); }}
                >
                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
                <span className="font-mono text-xs mr-1">0</span>
                <span className="text-sm">所有商品</span>
                <span className={`ml-auto text-xs ${selectedCategory === '0' ? 'text-blue-200' : 'text-gray-400'}`}>
                  ({products.filter(p => !p.code.startsWith('BOM-')).length})
                </span>
              </div>

              {/* 子类目列表 */}
              {expandedCategories.has('0') && categories.map((cat) => (
                <div
                  key={cat.name}
                  className={`flex items-center gap-1.5 px-2 pl-7 py-1.5 cursor-pointer text-sm border-b border-gray-50 ${
                    selectedCategory === cat.name ? 'bg-[#1E40AF] text-white' : 'hover:bg-blue-50 text-gray-700'
                  }`}
                  onClick={() => handleCategoryClick(cat.name)}
                >
                  <span className="font-mono text-xs mr-1">{cat.name}</span>
                  <span className="text-xs text-gray-400 mr-0.5">-</span>
                  <span className="text-sm truncate flex-1">
                    {cat.label || cat.name}
                  </span>
                  <span className={`ml-auto text-xs shrink-0 ${selectedCategory === cat.name ? 'text-blue-200' : 'text-gray-400'}`}>
                    ({cat.count})
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* 右侧数据表格 */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* 表头 */}
            <div className="grid grid-cols-[50px_100px_120px_1fr_60px_100px_100px_1fr] bg-[#E8EBF0] border-b border-gray-300 shrink-0">
              <div className="px-2 py-2 text-xs font-semibold text-gray-700 text-center border-r border-gray-300">序号</div>
              <div className="px-2 py-2 text-xs font-semibold text-gray-700 border-r border-gray-300">商品类别</div>
              <div className="px-2 py-2 text-xs font-semibold text-gray-700 border-r border-gray-300">商品编号</div>
              <div className="px-2 py-2 text-xs font-semibold text-gray-700 border-r border-gray-300">商品名称</div>
              <div className="px-2 py-2 text-xs font-semibold text-gray-700 text-center border-r border-gray-300">单位</div>
              <div className="px-2 py-2 text-xs font-semibold text-gray-700 text-right border-r border-gray-300">成本单价</div>
              <div className="px-2 py-2 text-xs font-semibold text-gray-700 text-right border-r border-gray-300">商品售价一</div>
              <div className="px-2 py-2 text-xs font-semibold text-gray-700">商品描述</div>
            </div>

            {/* 表体 */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="text-center py-12 text-gray-400 text-sm">加载中...</div>
              ) : filteredProducts.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm">暂无商品数据</div>
              ) : (
                filteredProducts.map((product, idx) => {
                  const isSelected = selectedProductId === product.id;
                  const bomCount = getBomChildCount(product.id);
                  return (
                    <div
                      key={product.id}
                      className={`grid grid-cols-[50px_100px_120px_1fr_60px_100px_100px_1fr] items-center border-b border-gray-200 cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-[#1E40AF]/10 border-l-2 border-l-[#1E40AF]'
                          : idx % 2 === 0
                            ? 'bg-white hover:bg-blue-50/50'
                            : 'bg-[#F9FAFB] hover:bg-blue-50/50'
                      }`}
                      onClick={() => setSelectedProductId(product.id)}
                      onDoubleClick={() => handleEditProduct(product)}
                    >
                      <div className="px-2 py-2.5 text-xs text-gray-500 text-center font-mono border-r border-gray-100">
                        {idx + 1}
                      </div>
                      <div className="px-2 py-2.5 text-xs text-gray-600 font-mono border-r border-gray-100 truncate">
                        {product.category || '-'}
                      </div>
                      <div className="px-2 py-2.5 text-xs text-gray-900 font-mono border-r border-gray-100 truncate">
                        {product.code}
                      </div>
                      <div className="px-2 py-2.5 text-sm text-gray-900 border-r border-gray-100 truncate">
                        {product.name}
                        {bomCount > 0 && (
                          <span className="ml-1.5 inline-flex items-center px-1.5 py-0 rounded text-[10px] bg-blue-100 text-blue-700 font-medium">
                            BOM({bomCount})
                          </span>
                        )}
                      </div>
                      <div className="px-2 py-2.5 text-xs text-gray-600 text-center border-r border-gray-100">
                        {product.unit}
                      </div>
                      <div className="px-2 py-2.5 text-xs text-gray-900 text-right font-mono border-r border-gray-100">
                        {Number(product.cost_price || 0).toFixed(2)}
                      </div>
                      <div className="px-2 py-2.5 text-xs text-gray-900 text-right font-mono border-r border-gray-100">
                        {Number(product.price || 0).toFixed(2)}
                      </div>
                      <div className="px-2 py-2.5 text-xs text-gray-500 truncate">
                        {product.spec || product.remark || '-'}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* 底部状态栏 */}
            <div className="bg-[#E8EBF0] border-t border-gray-300 px-3 py-1 flex items-center justify-between shrink-0">
              <span className="text-xs text-gray-600">
                共 <span className="font-semibold text-gray-800">{filteredProducts.length}</span> 条记录
                {selectedCategory !== '0' && <span className="ml-2">类目: {selectedCategory}</span>}
              </span>
              <span className="text-xs text-gray-500">
                双击行编辑 | 单击选中
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 新增/编辑商品抽屉 - ERP商品资料维护风格 */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-[560px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editProduct ? '修改商品资料' : '商品基本资料维护'}</SheetTitle>
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
                  disabled={!!editProduct}
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
                <div className="flex gap-1 relative">
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
                  {showCategoryDropdown && (
                    <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-auto">
                      {categories.map(c => (
                        <div
                          key={c.name}
                          className="px-3 py-2 cursor-pointer hover:bg-blue-50 text-sm"
                          onMouseDown={() => { setNewCategory(c.name); setShowCategoryDropdown(false); }}
                        >{c.name}</div>
                      ))}
                    </div>
                  )}
                </div>
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

            {/* 成本单价 + 商品售价(含税) */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">成本单价</label>
                <Input
                  value={newCostPrice}
                  onChange={(e) => setNewCostPrice(e.target.value)}
                  placeholder="0.00"
                  type="number"
                  step="0.01"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">商品售价(含税)</label>
                <Input
                  value={newSellPrice}
                  onChange={(e) => setNewSellPrice(e.target.value)}
                  placeholder="0.00"
                  type="number"
                  step="0.01"
                />
              </div>
            </div>

            {/* 商品描述 */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">商品描述</label>
              <Input
                value={newRemark}
                onChange={(e) => setNewRemark(e.target.value)}
                placeholder="商品描述/备注"
              />
            </div>

            {/* === 物料明细分隔线（仅新增时显示） === */}
            {!editProduct && (
              <div className="border-t pt-4 mt-4">
                <h4 className="text-sm font-semibold text-gray-800 mb-3">物料明细（可选）</h4>
                <div className="space-y-3">
                  {/* 物料编号 + 物料名称 */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1.5 block">物料编号</label>
                      <Input
                        value={newChildCode}
                        onChange={(e) => setNewChildCode(e.target.value)}
                        placeholder="输入物料编号"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1.5 block">物料名称</label>
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
                      <div className="flex gap-1 relative">
                        <Input
                          value={newChildCategory}
                          onChange={(e) => setNewChildCategory(e.target.value)}
                          placeholder="如: 029"
                          className="flex-1"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          className="px-2 shrink-0"
                          onClick={() => setShowChildCategoryDropdown(!showChildCategoryDropdown)}
                        >···</Button>
                        {showChildCategoryDropdown && (
                          <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-auto">
                            {categories.map(c => (
                              <div
                                key={c.name}
                                className="px-3 py-2 cursor-pointer hover:bg-blue-50 text-sm"
                                onMouseDown={() => { setNewChildCategory(c.name); setShowChildCategoryDropdown(false); }}
                              >{c.name}</div>
                            ))}
                          </div>
                        )}
                      </div>
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
                      <label className="text-sm font-medium text-gray-700 mb-1.5 block">单位</label>
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
                      <label className="text-sm font-medium text-gray-700 mb-1.5 block">用量</label>
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
            )}

            {/* 备注 */}
            {!editProduct && (
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">备注</label>
                <Input value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="备注" />
              </div>
            )}

            {/* 按钮 */}
            <div className="pt-4 flex gap-3">
              <Button
                onClick={handleSaveProduct}
                disabled={saving || !newCode || !newName || !newUnit}
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
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

      {/* 类别新增/编辑对话框 */}
      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{categoryDialogMode === 'add' ? '新增类别' : '修改类别'}</DialogTitle>
            <DialogDescription>
              {categoryDialogMode === 'add'
                ? '输入新类别编号/名称，新增后可在该类别下添加商品'
                : '修改类别名称后，该类别下所有商品的类别将同步更新'}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            <label className="text-sm font-medium text-gray-700 mb-1.5 block">类别编号/名称</label>
            <Input
              value={categoryDialogValue}
              onChange={(e) => setCategoryDialogValue(e.target.value)}
              placeholder="如: 003-新类别"
              onKeyDown={(e) => { if (e.key === 'Enter') handleCategoryDialogSave(); }}
            />
          </div>
          <div className="flex gap-3 mt-4">
            <Button onClick={handleCategoryDialogSave} className="flex-1 bg-green-600 hover:bg-green-700">
              确定
            </Button>
            <Button variant="outline" onClick={() => setCategoryDialogOpen(false)} className="flex-1">取消</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteType === 'category'
                ? `确认删除类别「${deleteId}」吗？该类别下所有商品的类别将被清空。`
                : '确认删除该商品吗？关联的 BOM 记录也将被删除。'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteType === 'category' ? handleDeleteCategory : handleDeleteProduct}
              className="bg-red-600 hover:bg-red-700"
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
