'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Plus, Trash2 } from 'lucide-react';
import type { CategoryGroup, Product } from './types';
import { getCategoryLabel, parseCategories } from './types';

interface CategoryGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: CategoryGroup[];
  availableCategories: string[];
  products: Product[];
  onSave: (groups: CategoryGroup[]) => void;
}

export default function CategoryGroupDialog({
  open,
  onOpenChange,
  groups,
  availableCategories,
  products,
  onSave,
}: CategoryGroupDialogProps) {
  const [editingGroups, setEditingGroups] = useState<CategoryGroup[]>([]);

  const handleOpen = (val: boolean) => {
    if (val) {
      setEditingGroups(groups.map(g => ({ ...g })));
    }
    onOpenChange(val);
  };

  const handleSave = async () => {
    const validGroups = editingGroups.filter(g => g.group_name.trim());
    const renumbered = validGroups.map((g, i) => ({
      group_no: i + 1,
      group_name: g.group_name,
      categories: g.categories,
    }));
    const res = await fetch('/api/delivery/category-groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groups: renumbered }),
    });
    if (res.ok) {
      const data = await res.json();
      onSave(data);
      onOpenChange(false);
    } else {
      let errMsg = res.statusText;
      try { const t = await res.text(); errMsg = t; } catch { /* ignore */ }
      console.error('保存分组失败:', res.status, errMsg);
      alert('保存失败: ' + errMsg);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>类目分组设置</DialogTitle>
        </DialogHeader>
        <div className="text-xs text-gray-500 mb-3">将产品类目编组，开送货单时按组勾选，同组类目开在一张单上</div>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {editingGroups.map((group, idx) => (
            <div key={idx} className="flex items-center gap-2 p-2 border rounded bg-white">
              <span className="text-xs font-medium text-gray-500 w-8 shrink-0">组{group.group_no}</span>
              <Input
                value={group.group_name}
                onChange={(e) => {
                  const next = [...editingGroups];
                  next[idx] = { ...next[idx], group_name: e.target.value };
                  setEditingGroups(next);
                }}
                placeholder="分组名称，如：支架/卡箍"
                className="h-8 text-xs w-36"
              />
              <div className="flex-1 flex flex-wrap gap-1">
                {availableCategories
                  .filter((cat) => {
                    if (parseCategories(group.categories).includes(cat)) return true;
                    return !editingGroups.some((g, gi) => gi !== idx && parseCategories(g.categories).includes(cat));
                  })
                  .map((cat) => {
                    const isSelected = parseCategories(group.categories).includes(cat);
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => {
                          const next = [...editingGroups];
                          const cats = parseCategories(next[idx].categories);
                          const newCats = isSelected ? cats.filter((c: string) => c !== cat) : [...cats, cat];
                          next[idx] = { ...next[idx], categories: newCats.join(',') };
                          setEditingGroups(next);
                        }}
                        className={`h-6 px-1.5 rounded text-[10px] border transition-colors ${
                          isSelected
                            ? 'bg-[#1E40AF] text-white border-[#1E40AF]'
                            : 'bg-white text-gray-500 border-gray-200 hover:border-[#1E40AF]'
                        }`}
                        title={`类目${cat}`}
                      >
                        {getCategoryLabel(cat, products)}
                      </button>
                    );
                  })}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-red-500 hover:text-red-700 shrink-0"
                onClick={() => setEditingGroups(editingGroups.filter((_, i) => i !== idx))}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const maxNo = editingGroups.length > 0 ? Math.max(...editingGroups.map(g => g.group_no)) : 0;
              setEditingGroups([...editingGroups, { group_no: maxNo + 1, group_name: '', categories: '' }]);
            }}
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> 添加分组
          </Button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={handleSave}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
