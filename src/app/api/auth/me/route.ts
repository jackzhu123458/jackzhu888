import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { getSupabaseClient } from '@/storage/database/supabase-client';

const JWT_SECRET = process.env.JWT_SECRET || 'xscs-default-secret-change-in-production';

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    let decoded: { userId: string; username: string };
    try {
      decoded = jwt.verify(token, JWT_SECRET) as { userId: string; username: string };
    } catch {
      return NextResponse.json({ error: 'Token已过期' }, { status: 401 });
    }

    const supabase = getSupabaseClient();
    const { data: user, error } = await supabase
      .from('users')
      .select('id, username, display_name, phone, email, is_active')
      .eq('id', decoded.userId)
      .single();

    if (error || !user || !user.is_active) {
      return NextResponse.json({ error: '用户不存在或已禁用' }, { status: 401 });
    }

    // 获取角色和权限
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

    return NextResponse.json({
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
    console.error('Get current user error:', err);
    return NextResponse.json({ error: '获取用户信息失败' }, { status: 500 });
  }
}
