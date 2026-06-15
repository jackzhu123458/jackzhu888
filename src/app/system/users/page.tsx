'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/components/auth-context';

interface UserRow {
  id: string;
  username: string;
  display_name: string;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  last_login_at: string | null;
  roles: { id: string; code: string; name: string }[];
}

interface Role {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_system: boolean;
}

export default function UsersPage() {
  const { token } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);

  // 表单状态
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formUsername, setFormUsername] = useState('');
  const [formDisplayName, setFormDisplayName] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formActive, setFormActive] = useState(true);
  const [formRoleIds, setFormRoleIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const headers: Record<string, string> = { 'Authorization': `Bearer ${token}` };
      const [usersRes, rolesRes] = await Promise.all([
        fetch('/api/system/users', { headers }),
        fetch('/api/system/roles', { headers }),
      ]);
      const usersData = await usersRes.json();
      const rolesData = await rolesRes.json();
      if (Array.isArray(usersData)) setUsers(usersData);
      if (Array.isArray(rolesData)) setRoles(rolesData);
    } catch (err) {
      console.error('加载数据失败', err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { loadData(); }, [loadData]);

  const openCreate = () => {
    setEditId(null);
    setFormUsername('');
    setFormDisplayName('');
    setFormPassword('');
    setFormPhone('');
    setFormEmail('');
    setFormActive(true);
    setFormRoleIds([]);
    setShowForm(true);
  };

  const openEdit = (u: UserRow) => {
    setEditId(u.id);
    setFormUsername(u.username);
    setFormDisplayName(u.display_name);
    setFormPassword('');
    setFormPhone(u.phone || '');
    setFormEmail(u.email || '');
    setFormActive(u.is_active);
    setFormRoleIds(u.roles.map(r => r.id));
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formUsername.trim() || !formDisplayName.trim()) return;
    if (!editId && !formPassword.trim()) return;

    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        username: formUsername.trim(),
        display_name: formDisplayName.trim(),
        phone: formPhone.trim() || null,
        email: formEmail.trim() || null,
        is_active: formActive,
        role_ids: formRoleIds,
      };
      if (editId) body.id = editId;
      if (formPassword.trim()) body.password = formPassword.trim();

      const url = editId ? `/api/system/users?id=${editId}` : '/api/system/users';
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
    if (!confirm('确定要删除此用户吗？')) return;
    try {
      await fetch(`/api/system/users?id=${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      loadData();
    } catch (err) {
      console.error('删除失败', err);
    }
  };

  const toggleRole = (roleId: string) => {
    setFormRoleIds(prev =>
      prev.includes(roleId) ? prev.filter(id => id !== roleId) : [...prev, roleId]
    );
  };

  if (loading) return <div className="p-6 text-[#6B7280]">加载中...</div>;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-[#111827]">用户管理</h1>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-[#1E40AF] text-white rounded-md text-sm hover:bg-[#1D4ED8] transition-colors"
        >
          新增用户
        </button>
      </div>

      {/* 用户列表 */}
      <div className="bg-white border border-[#E5E7EB] rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#F9FAFB] border-b border-[#E5E7EB]">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-[#6B7280]">用户名</th>
              <th className="text-left px-4 py-3 font-medium text-[#6B7280]">姓名</th>
              <th className="text-left px-4 py-3 font-medium text-[#6B7280]">角色</th>
              <th className="text-left px-4 py-3 font-medium text-[#6B7280]">手机</th>
              <th className="text-left px-4 py-3 font-medium text-[#6B7280]">状态</th>
              <th className="text-left px-4 py-3 font-medium text-[#6B7280]">最后登录</th>
              <th className="text-right px-4 py-3 font-medium text-[#6B7280]">操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="border-b border-[#E5E7EB] hover:bg-[#F9FAFB]">
                <td className="px-4 py-3 font-mono text-[#111827]">{u.username}</td>
                <td className="px-4 py-3 text-[#111827]">{u.display_name}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1 flex-wrap">
                    {u.roles.map(r => (
                      <span key={r.id} className="px-2 py-0.5 bg-[#EFF6FF] text-[#1E40AF] rounded text-xs">
                        {r.name}
                      </span>
                    ))}
                    {u.roles.length === 0 && <span className="text-[#9CA3AF] text-xs">未分配</span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-[#6B7280]">{u.phone || '-'}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs ${
                    u.is_active ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                  }`}>
                    {u.is_active ? '启用' : '禁用'}
                  </span>
                </td>
                <td className="px-4 py-3 text-[#6B7280] text-xs">
                  {u.last_login_at ? new Date(u.last_login_at).toLocaleString('zh-CN') : '-'}
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => openEdit(u)} className="text-[#1E40AF] hover:underline text-xs mr-3">编辑</button>
                  <button onClick={() => handleDelete(u.id)} className="text-[#DC2626] hover:underline text-xs">删除</button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-[#9CA3AF]">暂无用户</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 新增/编辑表单 */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-lg w-[520px] max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-[#E5E7EB] flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[#111827]">{editId ? '编辑用户' : '新增用户'}</h2>
              <button onClick={() => setShowForm(false)} className="text-[#9CA3AF] hover:text-[#111827] text-xl">&times;</button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#374151] mb-1">用户名 *</label>
                <input
                  value={formUsername}
                  onChange={e => setFormUsername(e.target.value)}
                  className="w-full border border-[#D1D5DB] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E40AF]"
                  disabled={!!editId}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#374151] mb-1">姓名 *</label>
                <input
                  value={formDisplayName}
                  onChange={e => setFormDisplayName(e.target.value)}
                  className="w-full border border-[#D1D5DB] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E40AF]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#374151] mb-1">
                  密码 {editId ? '(留空不修改)' : '*'}
                </label>
                <input
                  type="password"
                  value={formPassword}
                  onChange={e => setFormPassword(e.target.value)}
                  className="w-full border border-[#D1D5DB] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E40AF]"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#374151] mb-1">手机号</label>
                  <input
                    value={formPhone}
                    onChange={e => setFormPhone(e.target.value)}
                    className="w-full border border-[#D1D5DB] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E40AF]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#374151] mb-1">邮箱</label>
                  <input
                    value={formEmail}
                    onChange={e => setFormEmail(e.target.value)}
                    className="w-full border border-[#D1D5DB] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E40AF]"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formActive}
                  onChange={e => setFormActive(e.target.checked)}
                  className="rounded border-[#D1D5DB]"
                />
                <label htmlFor="isActive" className="text-sm text-[#374151]">启用</label>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#374151] mb-2">分配角色</label>
                <div className="space-y-2">
                  {roles.map(role => (
                    <label key={role.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formRoleIds.includes(role.id)}
                        onChange={() => toggleRole(role.id)}
                        className="rounded border-[#D1D5DB]"
                      />
                      <span className="text-sm text-[#111827]">{role.name}</span>
                      {role.description && <span className="text-xs text-[#9CA3AF]">({role.description})</span>}
                      {role.is_system && <span className="text-xs text-blue-500">系统</span>}
                    </label>
                  ))}
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
