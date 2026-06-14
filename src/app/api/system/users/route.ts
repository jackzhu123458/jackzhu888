import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getAuthUser, checkPermission } from '@/lib/auth';

// 获取用户列表
export async function GET(request: Request) {
  const permError = await checkPermission(request, 'system:users');
  if (permError) return permError;

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('users')
    .select('id, username, display_name, phone, email, is_active, last_login_at, created_at')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 获取每个用户的角色
  const users = await Promise.all((data || []).map(async (u: Record<string, unknown>) => {
    const { data: userRoles } = await supabase
      .from('user_roles')
      .select('roles(id, code, name)')
      .eq('user_id', u.id);
    return { ...u, roles: (userRoles || []).map((ur: Record<string, unknown>) => ur.roles) };
  }));

  return NextResponse.json(users);
}

// 创建用户
export async function POST(request: Request) {
  const permError = await checkPermission(request, 'system:users');
  if (permError) return permError;

  const body = await request.json();
  const { username, password, display_name, phone, email, role_ids, is_active } = body;

  if (!username || !password || !display_name) {
    return NextResponse.json({ error: '用户名、密码和显示名称不能为空' }, { status: 400 });
  }

  const supabase = getSupabaseClient();

  // 检查用户名是否重复
  const { data: existing } = await supabase.from('users').select('id').eq('username', username).single();
  if (existing) {
    return NextResponse.json({ error: '用户名已存在' }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const { data: user, error } = await supabase
    .from('users')
    .insert({ username, password_hash: passwordHash, display_name, phone, email, is_active: is_active !== false })
    .select('id, username, display_name, phone, email, is_active, created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 分配角色
  if (role_ids && role_ids.length > 0) {
    const inserts = role_ids.map((rid: string) => ({ user_id: user.id, role_id: rid }));
    await supabase.from('user_roles').insert(inserts);
  }

  return NextResponse.json({ success: true, user });
}

// 更新用户
export async function PUT(request: Request) {
  const permError = await checkPermission(request, 'system:users');
  if (permError) return permError;

  const body = await request.json();
  const { id, display_name, phone, email, is_active, password, role_ids } = body;

  if (!id) return NextResponse.json({ error: '缺少用户ID' }, { status: 400 });

  const supabase = getSupabaseClient();
  const updateData: Record<string, unknown> = { display_name, phone, email, is_active, updated_at: new Date().toISOString() };

  if (password) {
    updateData.password_hash = await bcrypt.hash(password, 10);
  }

  const { error } = await supabase.from('users').update(updateData).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 更新角色
  if (role_ids !== undefined) {
    await supabase.from('user_roles').delete().eq('user_id', id);
    if (role_ids.length > 0) {
      const inserts = role_ids.map((rid: string) => ({ user_id: id, role_id: rid }));
      await supabase.from('user_roles').insert(inserts);
    }
  }

  return NextResponse.json({ success: true });
}

// 删除用户
export async function DELETE(request: Request) {
  const permError = await checkPermission(request, 'system:users');
  if (permError) return permError;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: '缺少用户ID' }, { status: 400 });

  const authUser = getAuthUser(request);
  if (authUser?.userId === id) {
    return NextResponse.json({ error: '不能删除自己' }, { status: 400 });
  }

  const supabase = getSupabaseClient();
  await supabase.from('user_roles').delete().eq('user_id', id);
  const { error } = await supabase.from('users').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
