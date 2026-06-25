'use client';
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Product {
  id: string;
  code: string;
  name: string;
  spec?: string | null;
  unit?: string | null;
  category?: string | null;
  type?: string | null;
  sourcing_type?: string | null;
  price?: number | null;
  remark?: string | null;
}

interface Props {
  open: boolean;
  product: Product | null;
  onClose: () => void;
  onSaved: () => void;
}

const TYPE_OPTIONS = [
  { value: 'raw_material', label: '原材料' },
  { value: 'semi_finished', label: '半成品' },
  { value: 'finished_product', label: '成品' },
  { value: 'other', label: '其他' },
];

const SOURCING_OPTIONS = [
  { value: 'self_made', label: '自制' },
  { value: 'purchased', label: '外购' },
];

export function ProductEditDialog({ open, product, onClose, onSaved }: Props) {
  const [form, setForm] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && product) {
      setForm({ ...product });
    }
  }, [open, product]);

  if (!form) return null;

  const handleChange = (key: keyof Product, value: string | number | null) => {
    setForm((prev) => prev ? { ...prev, [key]: value } : prev);
  };

  const handleSave = async () => {
    if (!form.code?.trim() || !form.name?.trim()) {
      alert('编码和名称不能为空');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/products', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: form.id,
          code: form.code.trim(),
          name: form.name.trim(),
          spec: form.spec?.trim() || null,
          unit: form.unit || null,
          category: form.category || null,
          type: form.type || 'raw_material',
          sourcing_type: form.sourcing_type || 'self_made',
          price: form.price ?? 0,
          remark: form.remark?.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: '保存失败' }));
        alert(`保存失败: ${err.error || res.status}`);
        return;
      }
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>编辑物料属性</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-3">
          <div className="space-y-1.5">
            <Label htmlFor="edit-code" className="text-xs text-gray-600">编码 *</Label>
            <Input
              id="edit-code"
              value={form.code || ''}
              onChange={(e) => handleChange('code', e.target.value)}
              className="font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-name" className="text-xs text-gray-600">名称 *</Label>
            <Input
              id="edit-name"
              value={form.name || ''}
              onChange={(e) => handleChange('name', e.target.value)}
            />
          </div>
          <div className="space-y-1.5 col-span-2">
            <Label htmlFor="edit-spec" className="text-xs text-gray-600">规格</Label>
            <Input
              id="edit-spec"
              value={form.spec || ''}
              onChange={(e) => handleChange('spec', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-unit" className="text-xs text-gray-600">单位</Label>
            <Input
              id="edit-unit"
              value={form.unit || ''}
              onChange={(e) => handleChange('unit', e.target.value)}
              placeholder="个 / kg / 件"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-category" className="text-xs text-gray-600">类别</Label>
            <Input
              id="edit-category"
              value={form.category || ''}
              onChange={(e) => handleChange('category', e.target.value)}
              placeholder="如：标准件、配件"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-type" className="text-xs text-gray-600">类型</Label>
            <select
              id="edit-type"
              value={form.type || 'raw_material'}
              onChange={(e) => handleChange('type', e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-sourcing" className="text-xs text-gray-600">采购属性</Label>
            <select
              id="edit-sourcing"
              value={form.sourcing_type || 'self_made'}
              onChange={(e) => handleChange('sourcing_type', e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {SOURCING_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-price" className="text-xs text-gray-600">单价</Label>
            <Input
              id="edit-price"
              type="number"
              step="0.01"
              value={form.price ?? 0}
              onChange={(e) => handleChange('price', parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-1.5 col-span-2">
            <Label htmlFor="edit-remark" className="text-xs text-gray-600">备注</Label>
            <Input
              id="edit-remark"
              value={form.remark || ''}
              onChange={(e) => handleChange('remark', e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>取消</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
