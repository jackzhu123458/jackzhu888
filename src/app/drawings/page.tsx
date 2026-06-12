'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import { Upload, FileText, Eye, Printer, Trash2, Search, Image as ImageIcon, File } from 'lucide-react';

interface DrawingWithProduct {
  id: string;
  product_id: string;
  file_key: string;
  file_name: string;
  file_type: string;
  file_size: number;
  remark: string | null;
  created_at: string;
  url?: string | null;
  products?: {
    id: string;
    code: string;
    name: string;
    spec: string | null;
  };
}

export default function DrawingsPage() {
  const [drawings, setDrawings] = useState<DrawingWithProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [uploadingDrawing, setUploadingDrawing] = useState(false);
  const [uploadProductId, setUploadProductId] = useState<string | null>(null);
  const [uploadProductName, setUploadProductName] = useState('');

  // 预览
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewName, setPreviewName] = useState('');

  // 删除确认
  const [deleteTarget, setDeleteTarget] = useState<DrawingWithProduct | null>(null);

  // 产品列表（用于上传选择）
  const [products, setProducts] = useState<Array<{ id: string; code: string; name: string; spec: string | null }>>([]);
  const [productSearch, setProductSearch] = useState('');
  const [showUploadDialog, setShowUploadDialog] = useState(false);

  const loadDrawings = useCallback(async (searchKeyword?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchKeyword) params.set('keyword', searchKeyword);
      const res = await fetch(`/api/drawings?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setDrawings(data);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  const loadProducts = useCallback(async () => {
    try {
      const res = await fetch('/api/products');
      if (res.ok) {
        const data = await res.json();
        setProducts(data.filter((p: { code: string }) => !p.code.startsWith('BOM-')));
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadDrawings();
    loadProducts();
  }, [loadDrawings, loadProducts]);

  const handleSearch = () => {
    setKeyword(searchInput);
    loadDrawings(searchInput);
  };

  const handleUploadFile = async (file: File) => {
    if (!uploadProductId) return;
    setUploadingDrawing(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('product_id', uploadProductId);
      formData.append('file_name', file.name);
      const res = await fetch('/api/drawings', { method: 'POST', body: formData });
      if (res.ok) {
        await loadDrawings(keyword);
        setShowUploadDialog(false);
      } else {
        const err = await res.json();
        alert(err.error || '上传失败');
      }
    } catch { alert('上传失败'); }
    finally { setUploadingDrawing(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/drawings?id=${deleteTarget.id}&file_key=${encodeURIComponent(deleteTarget.file_key)}`, { method: 'DELETE' });
      if (res.ok) {
        await loadDrawings(keyword);
      } else {
        const err = await res.json();
        alert(err.error || '删除失败');
      }
    } catch { alert('删除失败'); }
    setDeleteTarget(null);
  };

  const handlePreview = async (fileKey: string, fileName: string) => {
    try {
      const res = await fetch(`/api/drawings?file_key=${encodeURIComponent(fileKey)}`);
      if (res.ok) {
        const { url } = await res.json();
        setPreviewUrl(url);
        setPreviewName(fileName);
      }
    } catch { alert('获取预览地址失败'); }
  };

  const handlePrint = async (fileKey: string, fileName: string) => {
    try {
      const res = await fetch(`/api/drawings?file_key=${encodeURIComponent(fileKey)}`);
      if (res.ok) {
        const { url } = await res.json();
        const printWindow = window.open(url, '_blank');
        if (printWindow) {
          printWindow.onload = () => { printWindow.print(); };
        }
      }
    } catch { alert('打印失败'); }
  };

  const formatFileSize = (size: number) => {
    if (size < 1024) return `${size}B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)}KB`;
    return `${(size / (1024 * 1024)).toFixed(1)}MB`;
  };

  const getFileIcon = (fileType: string, fileName: string) => {
    if (fileType.startsWith('image/') || /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(fileName)) {
      return <ImageIcon className="w-5 h-5 text-blue-500" />;
    }
    if (fileType === 'application/pdf' || /\.pdf$/i.test(fileName)) {
      return <FileText className="w-5 h-5 text-red-500" />;
    }
    return <File className="w-5 h-5 text-gray-500" />;
  };

  const filteredProducts = products.filter(p =>
    !productSearch ||
    p.code.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    (p.spec && p.spec.toLowerCase().includes(productSearch.toLowerCase()))
  );

  return (
    <div className="h-full flex flex-col bg-[#F8F9FA]">
      {/* 顶部标题栏 */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shrink-0">
        <h1 className="text-xl font-semibold text-gray-900">图纸管理</h1>
        <Button
          className="bg-[#1E40AF] hover:bg-[#1D4ED8]"
          onClick={() => { setShowUploadDialog(true); setProductSearch(''); }}
        >
          <Upload className="w-4 h-4 mr-1" /> 上传图纸
        </Button>
      </div>

      {/* 搜索栏 */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <Input
            placeholder="搜索产品编码、名称或型号..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
            className="h-9 text-sm"
          />
          <Button variant="outline" size="sm" className="h-9" onClick={handleSearch}>
            <Search className="w-4 h-4" />
          </Button>
          {keyword && (
            <Button variant="ghost" size="sm" className="h-9 text-xs text-gray-500" onClick={() => { setKeyword(''); setSearchInput(''); loadDrawings(); }}>
              清除搜索
            </Button>
          )}
        </div>
        <span className="text-xs text-gray-500">
          共 {drawings.length} 份图纸
          {keyword && ` · 搜索: "${keyword}"`}
        </span>
      </div>

      {/* 图纸列表 */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="text-center py-12 text-gray-400">加载中...</div>
        ) : drawings.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            {keyword ? '未找到匹配的图纸' : '暂无图纸，点击右上角上传'}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {drawings.map((d) => (
              <div key={d.id} className="bg-white rounded border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all">
                {/* 缩略图/文件图标区 */}
                <div
                  className="h-32 flex items-center justify-center bg-gray-50 border-b border-gray-100 cursor-pointer"
                  onClick={() => handlePreview(d.file_key, d.file_name)}
                >
                  {d.file_type?.startsWith('image/') ? (
                    d.url ? (
                      <img src={d.url} alt={d.file_name} className="max-w-full max-h-full object-contain p-2" />
                    ) : (
                      <ImageIcon className="w-12 h-12 text-gray-300" />
                    )
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      {getFileIcon(d.file_type || '', d.file_name)}
                      <span className="text-xs text-gray-400">{d.file_name.split('.').pop()?.toUpperCase()}</span>
                    </div>
                  )}
                </div>

                {/* 信息区 */}
                <div className="p-3">
                  <div className="text-sm font-medium text-gray-900 truncate" title={d.file_name}>
                    {d.file_name}
                  </div>
                  <div className="text-xs text-gray-500 mt-1 truncate">
                    {d.products ? `${d.products.code} - ${d.products.name}` : '未知产品'}
                  </div>
                  {d.products?.spec && (
                    <div className="text-xs text-gray-400 truncate">{d.products.spec}</div>
                  )}
                  <div className="text-xs text-gray-400 mt-1">
                    {formatFileSize(d.file_size)} · {new Date(d.created_at).toLocaleDateString()}
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex items-center gap-1 mt-2 pt-2 border-t border-gray-100">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => handlePreview(d.file_key, d.file_name)}
                    >
                      <Eye className="w-3.5 h-3.5 mr-1" /> 预览
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => handlePrint(d.file_key, d.file_name)}
                    >
                      <Printer className="w-3.5 h-3.5 mr-1" /> 打印
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-red-500 hover:text-red-700 ml-auto"
                      onClick={() => setDeleteTarget(d)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 上传图纸对话框 */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="max-w-[600px]">
          <DialogHeader>
            <DialogTitle>上传图纸</DialogTitle>
            <DialogDescription>选择产品并上传对应的图纸文件</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* 产品选择 */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">选择产品</label>
              <Input
                placeholder="搜索产品编码或名称..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="h-9 text-sm mb-2"
              />
              <div className="max-h-[200px] overflow-y-auto border border-gray-200 rounded">
                {filteredProducts.slice(0, 50).map((p) => (
                  <div
                    key={p.id}
                    className={`px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 border-b border-gray-100 last:border-0 ${uploadProductId === p.id ? 'bg-blue-50 text-blue-700 font-medium' : ''}`}
                    onClick={() => { setUploadProductId(p.id); setUploadProductName(p.name); }}
                  >
                    <span className="font-mono text-gray-600 mr-2">{p.code}</span>
                    <span>{p.name}</span>
                    {p.spec && <span className="text-gray-400 ml-2">{p.spec}</span>}
                  </div>
                ))}
                {filteredProducts.length > 50 && (
                  <div className="px-3 py-2 text-xs text-gray-400 text-center">
                    还有 {filteredProducts.length - 50} 个产品，请输入关键词缩小范围
                  </div>
                )}
              </div>
              {uploadProductId && (
                <div className="text-xs text-gray-500 mt-1">
                  已选择: <span className="text-blue-600 font-medium">{uploadProductName}</span>
                </div>
              )}
            </div>

            {/* 文件上传 */}
            {uploadProductId && (
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">选择图纸文件</label>
                <label className="cursor-pointer inline-flex items-center gap-1 px-4 py-2 bg-[#1E40AF] text-white rounded text-sm hover:bg-[#1D4ED8]">
                  <Upload className="w-4 h-4" />
                  选择文件
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.dwg,.dxf,.step,.stp"
                    multiple
                    className="hidden"
                    onChange={async (e) => {
                      const files = e.target.files;
                      if (!files) return;
                      for (const file of Array.from(files)) {
                        await handleUploadFile(file);
                      }
                      e.target.value = '';
                    }}
                  />
                </label>
                {uploadingDrawing && <span className="text-sm text-gray-500 ml-3">上传中...</span>}
                <p className="text-xs text-gray-400 mt-2">
                  支持 PDF、图片（PNG/JPG）、CAD 文件（DWG/DXF）、STEP 等
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 图纸预览弹窗 */}
      <Dialog open={!!previewUrl} onOpenChange={(open) => { if (!open) { setPreviewUrl(''); setPreviewName(''); } }}>
        <DialogContent className="sm:max-w-none max-w-[1200px] w-[95vw]">
          <DialogHeader>
            <DialogTitle>{previewName}</DialogTitle>
            <DialogDescription>图纸预览</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center">
            {previewUrl && (
              previewUrl.toLowerCase().endsWith('.pdf') || previewUrl.toLowerCase().includes('.pdf') ? (
                <iframe src={previewUrl} className="w-full h-[70vh] border rounded" title={previewName} />
              ) : (
                <img src={previewUrl} alt={previewName} className="max-w-full max-h-[70vh] object-contain" />
              )
            )}
            <div className="flex gap-2 mt-4 no-print">
              <Button onClick={() => window.print()} variant="outline">
                <Printer className="w-4 h-4 mr-1" /> 打印
              </Button>
              <Button onClick={() => { setPreviewUrl(''); setPreviewName(''); }} variant="outline">
                关闭
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确认删除图纸「{deleteTarget?.file_name}」吗？此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
