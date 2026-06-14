import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getSupabaseClient } from '@/storage/database/supabase-client';

const JWT_SECRET = process.env.JWT_SECRET || 'xscs-default-secret-change-in-production';

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();
    if (!username || !password) {
      return NextResponse.json({ error: '用户名和密码不能为空' }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    const { data: user, error } = await supabase
      .from('users')
      .select('id, username, password_hash, display_name, phone, email, is_active')
      .eq('username', username)
      .single();

    if (error || !user) {
      return NextResponse.json({ error: '用户名或密码错误' }, { status: 401 });
    }

    if (!user.is_active) {
      return NextResponse.json({ error: '该账号已被禁用' }, { status: 403 });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return NextResponse.json({ error: '用户名或密码错误' }, { status: 401 });
    }

    // 获取用户角色和权限
    const { data: userRoles } = await supabase
      .from('user_roles')
      .select('roles(id, code, name)')
      .eq('user_id', user.id);

    const roleIds = (userRoles || []).map((ur: Record<string, unknown>) => {
      const role = ur.roles as Record<string, unknown>;
      return role.id;
    });

    let permissions: string[] = [];
    if (roleIds.length > 0) {
      const { data: rolePerms } = await supabase
        .from('role_permissions')
        .select('permissions(code)')
        .in('role_id', roleIds);
      permissions = [...new Set((rolePerms || []).map((rp: Record<string, unknown>) => {
        const perm = rp.permissions as Record<string, unknown>;
        return perm.code as string;
      }))];
    }

    const roles = (userRoles || []).map((ur: Record<string, unknown>) => {
      const role = ur.roles as Record<string, unknown>;
      return { id: role.id, code: role.code, name: role.name };
    });

    // 更新最后登录时间
    await supabase.from('users').update({ last_login_at: new Date().toISOString() }).eq('id', user.id);

    const token = jwt.sign(
      { userId: user.id, username: user.username, roles: roles.map((r: Record<string, unknown>) => r.code) },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return NextResponse.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        phone: user.phone,
        email: user.email,
      },
      roles,
      permissions,
    });
  } catch (err) {
    console.error('Login error:', err);
    return NextResponse.json({ error: '登录失败，请稍后重试' }, { status: 500 });
  }
}
