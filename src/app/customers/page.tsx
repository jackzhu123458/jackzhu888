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

interface Customer {
  id: string;
  name: string;
  code: string | null;
  contact: string | null;
  phone: string | null;
  address: string | null;
  remark: string | null;
  is_active: boolean;
  created_at: string;
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // 表单
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formContact, setFormContact] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formRemark, setFormRemark] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/customers');
    const data = await res.json();
    if (Array.isArray(data)) setCustomers(data);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAdd = () => {
    setEditCustomer(null);
    setFormName('');
    setFormCode('');
    setFormContact('');
    setFormPhone('');
    setFormAddress('');
    setFormRemark('');
    setSheetOpen(true);
  };

  const handleEdit = (c: Customer) => {
    setEditCustomer(c);
    setFormName(c.name);
    setFormCode(c.code || '');
    setFormContact(c.contact || '');
    setFormPhone(c.phone || '');
    setFormAddress(c.address || '');
    setFormRemark(c.remark || '');
    setSheetOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const body = {
      name: formName,
      code: formCode || null,
      contact: formContact || null,
      phone: formPhone || null,
      address: formAddress || null,
      remark: formRemark || null,
      ...(editCustomer ? { id: editCustomer.id } : {}),
    };
    const res = await fetch('/api/customers', {
      method: editCustomer ? 'PUT' : 'POST',
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
    await fetch(`/api/customers?id=${deleteId}`, { method: 'DELETE' });
    setDeleteId(null);
    loadData();
  };

  const filtered = customers.filter((c) =>
    !search || c.name.includes(search) || (c.code && c.code.includes(search)) || (c.contact && c.contact.includes(search))
  );

  return (
    <AppShell>
      <div className="p-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold text-gray-900">客户管理</h1>
          <Button onClick={handleAdd}>新建客户</Button>
        </div>

        <div className="mb-4">
          <Input
            placeholder="搜索客户名称、编号、联系人..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
        </div>

        <div className="bg-white rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/50">
                <th className="text-left px-5 py-3 font-medium text-gray-500">客户编号</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">客户名称</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">联系人</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">电话</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">地址</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">备注</th>
                <th className="text-center px-5 py-3 font-medium text-gray-500">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-5 py-12 text-center text-gray-400">加载中...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-12 text-center text-gray-400">暂无数据</td></tr>
              ) : (
                filtered.map((c) => (
                  <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-5 py-3 font-mono text-gray-700">{c.code || '-'}</td>
                    <td className="px-5 py-3 text-gray-900 font-medium">{c.name}</td>
                    <td className="px-5 py-3 text-gray-600">{c.contact || '-'}</td>
                    <td className="px-5 py-3 text-gray-600 font-mono">{c.phone || '-'}</td>
                    <td className="px-5 py-3 text-gray-600 max-w-[200px] truncate">{c.address || '-'}</td>
                    <td className="px-5 py-3 text-gray-600 max-w-[120px] truncate">{c.remark || '-'}</td>
                    <td className="px-5 py-3 text-center">
                      <button onClick={() => handleEdit(c)} className="text-blue-600 hover:text-blue-800 text-xs mr-3">编辑</button>
                      <button onClick={() => setDeleteId(c.id)} className="text-red-500 hover:text-red-700 text-xs">删除</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-3 text-xs text-gray-400">共 {filtered.length} 条记录</div>
      </div>

      {/* 新增/编辑 */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-[480px]">
          <SheetHeader>
            <SheetTitle>{editCustomer ? '编辑客户' : '新建客户'}</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-4 px-1">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">客户名称 *</label>
                <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="请输入客户名称" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">客户编号</label>
                <Input value={formCode} onChange={(e) => setFormCode(e.target.value)} placeholder="如 C-001" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">联系人</label>
                <Input value={formContact} onChange={(e) => setFormContact(e.target.value)} placeholder="联系人姓名" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">电话</label>
                <Input value={formPhone} onChange={(e) => setFormPhone(e.target.value)} placeholder="联系电话" />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">地址</label>
              <Input value={formAddress} onChange={(e) => setFormAddress(e.target.value)} placeholder="客户地址" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">备注</label>
              <Input value={formRemark} onChange={(e) => setFormRemark(e.target.value)} placeholder="备注信息" />
            </div>
            <div className="pt-4 flex gap-3">
              <Button onClick={handleSave} disabled={saving || !formName} className="flex-1">
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
            <AlertDialogDescription>确认删除该客户吗？关联的生产订单不会被删除。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>确认删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
