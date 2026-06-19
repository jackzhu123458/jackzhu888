'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
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
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());

  // 当弹窗打开时，同步 groups 数据到 editingGroups
  useEffect(() => {
    if (open) {
      const copied = groups.map(g => ({ ...g, categories: g.categories || '' }));
      setEditingGroups(copied);
      setExpandedGroups(new Set(copied.map((_, i) => i)));
    }
  }, [open, groups]);

  const toggleExpand = (idx: number) => {
    const next = new Set(expandedGroups);
    if (next.has(idx)) {
      next.delete(idx);
    } else {
      next.add(idx);
    }
    setExpandedGroups(next);
  };

  const handleSave = async () => {
    const validGroups = editingGroups.filter(g => g.group_name.trim());
    if (validGroups.length === 0) {
      alert('请至少创建一个分组并输入名称');
      return;
    }
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

  // 计算未分配的类目
  const assignedCategories = new Set<string>();
  editingGroups.forEach(g => {
    parseCategories(g.categories).forEach(c => assignedCategories.add(c));
  });
  const unassignedCategories = availableCategories.filter(c => !assignedCategories.has(c));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>类目分组设置</DialogTitle>
        </DialogHeader>
        <div className="text-xs text-gray-500 mb-3">
          将产品类目编组，开送货单时按组勾选，同组类目开在一张单上。
          <span className="text-[#1E40AF] font-medium"> 点击类目按钮切换分配</span>，
          <span className="text-[#1E40AF]">蓝色=已分配</span>，灰色=未分配。
        </div>
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {editingGroups.map((group, idx) => {
            const groupCats = parseCategories(group.categories);
            const isExpanded = expandedGroups.has(idx);
            // 该组可选的类目：已分配给本组的 + 未分配给任何组的（互斥：一个类目只能属于一个分组）
            const availableForGroup = availableCategories.filter((cat) => {
              if (groupCats.includes(cat)) return true; // 本组已分配的
              return !assignedCategories.has(cat); // 未被任何组分配的
            });

            return (
              <div key={idx} className="border rounded bg-white">
                {/* 组头部 - 组名 + 统计 */}
                <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-t">
                  <button
                    type="button"
                    onClick={() => toggleExpand(idx)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                  <span className="text-xs font-bold text-[#1E40AF] w-8 shrink-0">组{group.group_no}</span>
                  <Input
                    value={group.group_name}
                    onChange={(e) => {
                      const next = [...editingGroups];
                      next[idx] = { ...next[idx], group_name: e.target.value };
                      setEditingGroups(next);
                    }}
                    placeholder="输入分组名称，如：朱静娟收货"
                    className="h-7 text-xs w-44"
                  />
                  <span className="text-[10px] text-gray-400 ml-auto">
                    {groupCats.length > 0 ? `已分配 ${groupCats.length} 个类目` : 
                      <span className="text-amber-600">未分配类目</span>}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-red-500 hover:text-red-700 shrink-0"
                    onClick={() => {
                      setEditingGroups(editingGroups.filter((_, i) => i !== idx));
                      setExpandedGroups(new Set([...expandedGroups].filter(i => i !== idx)));
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {/* 展开的类目列表 */}
                {isExpanded && (
                  <div className="p-2 border-t">
                    {availableForGroup.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {availableForGroup.map((cat) => {
                          const isSelected = groupCats.includes(cat);
                          return (
                            <button
                              key={cat}
                              type="button"
                              onClick={() => {
                                const next = [...editingGroups];
                                const cats = parseCategories(next[idx].categories);
                                const newCats = isSelected 
                                  ? cats.filter((c: string) => c !== cat) 
                                  : [...cats, cat];
                                next[idx] = { ...next[idx], categories: newCats.join(',') };
                                setEditingGroups(next);
                              }}
                              className={`h-7 px-2 rounded text-xs border transition-colors cursor-pointer ${
                                isSelected
                                  ? 'bg-[#1E40AF] text-white border-[#1E40AF] shadow-sm'
                                  : 'bg-white text-gray-600 border-gray-200 hover:border-[#1E40AF] hover:bg-blue-50'
                              }`}
                              title={`类目${cat} - ${isSelected ? '点击移除' : '点击分配到此组'}`}
                            >
                              {getCategoryLabel(cat, products)}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-xs text-gray-400 text-center py-2">所有类目已分配到其他组</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {editingGroups.length === 0 && (
            <div className="text-center py-6 text-sm text-gray-400">
              还没有分组，点击下方"添加分组"开始
            </div>
          )}
        </div>

        {/* 未分配类目提示 */}
        {unassignedCategories.length > 0 && editingGroups.length > 0 && (
          <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded">
            <div className="text-xs text-amber-700 font-medium mb-1">
              未分配类目 ({unassignedCategories.length}个)
            </div>
            <div className="flex flex-wrap gap-1">
              {unassignedCategories.map(cat => (
                <span key={cat} className="h-5 px-1.5 rounded text-[10px] bg-amber-100 text-amber-700 border border-amber-200">
                  {getCategoryLabel(cat, products)}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2 mt-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const maxNo = editingGroups.length > 0 ? Math.max(...editingGroups.map(g => g.group_no)) : 0;
              const newGroup: CategoryGroup = { group_no: maxNo + 1, group_name: '', categories: '' };
              setEditingGroups([...editingGroups, newGroup]);
              setExpandedGroups(new Set([...expandedGroups, editingGroups.length]));
            }}
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> 添加分组
          </Button>
          <div className="ml-auto text-xs text-gray-400 self-center">
            共 {editingGroups.length} 个分组，{assignedCategories.size}/{availableCategories.length} 个类目已分配
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={handleSave}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
