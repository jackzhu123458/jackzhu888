'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/components/auth-context';

interface Role {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_system: boolean;
  permissions: { id: string; code: string; name: string; module: string }[];
  user_count: number;
}

interface Permission {
  id: string;
  code: string;
  name: string;
  module: string;
  type: string;
}

export default function RolesPage() {
  const { token } = useAuth();
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);

  // 表单
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formCode, setFormCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formPermIds, setFormPermIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const headers: Record<string, string> = { 'Authorization': `Bearer ${token}` };
      const [rolesRes, permsRes] = await Promise.all([
        fetch('/api/system/roles', { headers }),
        fetch('/api/system/permissions', { headers }),
      ]);
      const rolesData = await rolesRes.json();
      const permsData = await permsRes.json();
      if (Array.isArray(rolesData)) setRoles(rolesData);
      if (Array.isArray(permsData)) setPermissions(permsData);
    } catch (err) {
      console.error('加载失败', err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { loadData(); }, [loadData]);

  // 按模块分组权限
  const groupedPermissions = permissions.reduce<Record<string, Permission[]>>((acc, p) => {
    if (!acc[p.module]) acc[p.module] = [];
    acc[p.module].push(p);
    return acc;
  }, {});

  const moduleLabels: Record<string, string> = {
    dashboard: '仪表盘', products: '产品管理', bom: 'BOM管理',
    customers: '客户管理', orders: '客户订单', production: '生产订单',
    inbound: '入库管理', delivery: '送货管理', inventory: '库存管理',
    warehouses: '仓库管理', backup: '备份恢复', system: '系统管理',
  };

  const openCreate = () => {
    setEditId(null);
    setFormCode('');
    setFormName('');
    setFormDesc('');
    setFormPermIds([]);
    setShowForm(true);
  };

  const openEdit = (r: Role) => {
    setEditId(r.id);
    setFormCode(r.code);
    setFormName(r.name);
    setFormDesc(r.description || '');
    setFormPermIds(r.permissions.map(p => p.id));
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formCode.trim() || !formName.trim()) return;
    setSaving(true);
    try {
      const body = {
        code: formCode.trim(),
        name: formName.trim(),
        description: formDesc.trim() || null,
        permission_ids: formPermIds,
      };
      const url = editId ? `/api/system/roles?id=${editId}` : '/api/system/roles';
      const method = editId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) {
        alert(data.error);
      } else {
        setShowForm(false);
        loadData();
      }
    } catch (err) {
      console.error('保存失败', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除此角色吗？')) return;
    try {
      const res = await fetch(`/api/system/roles?id=${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.error) {
        alert(data.error);
      } else {
        loadData();
      }
    } catch (err) {
      console.error('删除失败', err);
    }
  };

  const togglePerm = (pid: string) => {
    setFormPermIds(prev => prev.includes(pid) ? prev.filter(id => id !== pid) : [...prev, pid]);
  };

  const toggleModule = (module: string) => {
    const modulePermIds = (groupedPermissions[module] || []).map(p => p.id);
    const allSelected = modulePermIds.every(id => formPermIds.includes(id));
    if (allSelected) {
      setFormPermIds(prev => prev.filter(id => !modulePermIds.includes(id)));
    } else {
      setFormPermIds(prev => [...new Set([...prev, ...modulePermIds])]);
    }
  };

  if (loading) return <div className="p-6 text-[#6B7280]">加载中...</div>;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-[#111827]">角色管理</h1>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-[#1E40AF] text-white rounded-md text-sm hover:bg-[#1D4ED8] transition-colors"
        >
          新增角色
        </button>
      </div>

      {/* 角色卡片列表 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {roles.map(r => (
          <div key={r.id} className="bg-white border border-[#E5E7EB] rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <span className="text-base font-medium text-[#111827]">{r.name}</span>
                {r.is_system && <span className="ml-2 text-xs text-blue-500">系统内置</span>}
              </div>
              <span className="text-xs text-[#9CA3AF] font-mono">{r.code}</span>
            </div>
            {r.description && <p className="text-sm text-[#6B7280] mb-3">{r.description}</p>}
            <div className="flex items-center gap-3 text-sm mb-3">
              <span className="text-[#6B7280]">用户数: <strong className="text-[#111827]">{r.user_count}</strong></span>
              <span className="text-[#6B7280]">权限数: <strong className="text-[#111827]">{r.permissions.length}</strong></span>
            </div>
            <div className="flex gap-1 flex-wrap mb-3">
              {r.permissions.slice(0, 6).map(p => (
                <span key={p.id} className="px-1.5 py-0.5 bg-[#EFF6FF] text-[#1E40AF] rounded text-xs">{p.name}</span>
              ))}
              {r.permissions.length > 6 && (
                <span className="px-1.5 py-0.5 bg-[#F3F4F6] text-[#6B7280] rounded text-xs">+{r.permissions.length - 6}</span>
              )}
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => openEdit(r)} className="text-xs text-[#1E40AF] hover:underline">编辑权限</button>
              {!r.is_system && (
                <button onClick={() => handleDelete(r.id)} className="text-xs text-[#DC2626] hover:underline">删除</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 编辑角色权限表单 */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-lg w-[640px] max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-[#E5E7EB] flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[#111827]">{editId ? '编辑角色' : '新增角色'}</h2>
              <button onClick={() => setShowForm(false)} className="text-[#9CA3AF] hover:text-[#111827] text-xl">&times;</button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#374151] mb-1">角色编码 *</label>
                  <input
                    value={formCode}
                    onChange={e => setFormCode(e.target.value)}
                    className="w-full border border-[#D1D5DB] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E40AF]"
                    disabled={!!editId}
                    placeholder="如: operator"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#374151] mb-1">角色名称 *</label>
                  <input
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    className="w-full border border-[#D1D5DB] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E40AF]"
                    placeholder="如: 操作员"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#374151] mb-1">描述</label>
                <input
                  value={formDesc}
                  onChange={e => setFormDesc(e.target.value)}
                  className="w-full border border-[#D1D5DB] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E40AF]"
                  placeholder="角色描述"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-[#374151]">权限分配</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setFormPermIds(permissions.map(p => p.id))}
                      className="text-xs text-[#1E40AF] hover:underline"
                    >
                      全选
                    </button>
                    <button
                      onClick={() => setFormPermIds([])}
                      className="text-xs text-[#6B7280] hover:underline"
                    >
                      清空
                    </button>
                  </div>
                </div>
                <div className="border border-[#E5E7EB] rounded-lg divide-y divide-[#E5E7EB]">
                  {Object.entries(groupedPermissions).map(([module, perms]) => {
                    const modulePermIds = perms.map(p => p.id);
                    const allSelected = modulePermIds.every(id => formPermIds.includes(id));
                    return (
                      <div key={module} className="px-4 py-3">
                        <label className="flex items-center gap-2 cursor-pointer mb-2">
                          <input
                            type="checkbox"
                            checked={allSelected}
                            onChange={() => toggleModule(module)}
                            className="rounded border-[#D1D5DB]"
                          />
                          <span className="text-sm font-medium text-[#111827]">
                            {moduleLabels[module] || module}
                          </span>
                        </label>
                        <div className="ml-6 flex gap-2 flex-wrap">
                          {perms.map(p => (
                            <label key={p.id} className="flex items-center gap-1 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={formPermIds.includes(p.id)}
                                onChange={() => togglePerm(p.id)}
                                className="rounded border-[#D1D5DB]"
                              />
                              <span className={`text-xs ${p.type === 'menu' ? 'font-medium text-[#111827]' : 'text-[#6B7280]'}`}>
                                {p.name}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-[#E5E7EB] flex gap-3 justify-end">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 border border-[#D1D5DB] rounded-md text-sm text-[#374151] hover:bg-[#F9FAFB]"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-[#1E40AF] text-white rounded-md text-sm hover:bg-[#1D4ED8] disabled:opacity-50"
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
