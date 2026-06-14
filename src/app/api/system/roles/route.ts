import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { checkPermission } from '@/lib/auth';

// 获取角色列表
export async function GET(request: Request) {
  const permError = await checkPermission(request, 'system:roles');
  if (permError) return permError;

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('roles')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 获取每个角色的权限
  const roles = await Promise.all((data || []).map(async (r: Record<string, unknown>) => {
    const { data: rolePerms } = await supabase
      .from('role_permissions')
      .select('permissions(id, code, name, module, type)')
      .eq('role_id', r.id);
    return { ...r, permissions: (rolePerms || []).map((rp: Record<string, unknown>) => rp.permissions) };
  }));

  return NextResponse.json(roles);
}

// 创建角色
export async function POST(request: Request) {
  const permError = await checkPermission(request, 'system:roles');
  if (permError) return permError;

  const body = await request.json();
  const { code, name, description, permission_ids } = body;

  if (!code || !name) {
    return NextResponse.json({ error: '角色编码和名称不能为空' }, { status: 400 });
  }

  const supabase = getSupabaseClient();
  const { data: role, error } = await supabase
    .from('roles')
    .insert({ code, name, description })
    .select('id, code, name, description')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 分配权限
  if (permission_ids && permission_ids.length > 0) {
    const inserts = permission_ids.map((pid: string) => ({ role_id: role.id, permission_id: pid }));
    await supabase.from('role_permissions').insert(inserts);
  }

  return NextResponse.json({ success: true, role });
}

// 更新角色
export async function PUT(request: Request) {
  const permError = await checkPermission(request, 'system:roles');
  if (permError) return permError;

  const body = await request.json();
  const { id, name, description, permission_ids } = body;

  if (!id) return NextResponse.json({ error: '缺少角色ID' }, { status: 400 });

  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('roles')
    .update({ name, description, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 更新权限
  if (permission_ids !== undefined) {
    await supabase.from('role_permissions').delete().eq('role_id', id);
    if (permission_ids.length > 0) {
      const inserts = permission_ids.map((pid: string) => ({ role_id: id, permission_id: pid }));
      await supabase.from('role_permissions').insert(inserts);
    }
  }

  return NextResponse.json({ success: true });
}

// 删除角色
export async function DELETE(request: Request) {
  const permError = await checkPermission(request, 'system:roles');
  if (permError) return permError;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: '缺少角色ID' }, { status: 400 });

  const supabase = getSupabaseClient();

  // 检查是否系统角色
  const { data: role } = await supabase.from('roles').select('is_system').eq('id', id).single();
  if (role?.is_system) {
    return NextResponse.json({ error: '系统内置角色不可删除' }, { status: 400 });
  }

  await supabase.from('role_permissions').delete().eq('role_id', id);
  await supabase.from('user_roles').delete().eq('role_id', id);
  const { error } = await supabase.from('roles').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
