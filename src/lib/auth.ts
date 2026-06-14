import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'xscs-default-secret-change-in-production';

export interface AuthUser {
  userId: string;
  username: string;
  roles: string[];
}

/**
 * 从请求中解析用户信息
 */
export function getAuthUser(request: Request): AuthUser | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  try {
    return jwt.verify(authHeader.substring(7), JWT_SECRET) as AuthUser;
  } catch {
    return null;
  }
}

/**
 * 获取用户的所有权限码
 */
export async function getUserPermissions(userId: string): Promise<string[]> {
  const { getSupabaseClient } = await import('@/storage/database/supabase-client');
  const supabase = getSupabaseClient();

  const { data: userRoles } = await supabase
    .from('user_roles')
    .select('roles(id)')
    .eq('user_id', userId);

  const roleIds = (userRoles || []).map((ur: Record<string, unknown>) => {
    const role = ur.roles as Record<string, unknown>;
    return role.id;
  });

  if (roleIds.length === 0) return [];

  const { data: rolePerms } = await supabase
    .from('role_permissions')
    .select('permissions(code)')
    .in('role_id', roleIds);

  return [...new Set((rolePerms || []).map((rp: Record<string, unknown>) => {
    const perm = rp.permissions as Record<string, unknown>;
    return perm.code as string;
  }))];
}

/**
 * 检查用户是否有指定权限
 */
export async function hasPermission(userId: string, permissionCode: string): Promise<boolean> {
  const permissions = await getUserPermissions(userId);
  return permissions.includes(permissionCode);
}

/**
 * 验证请求权限，返回错误响应或null
 */
export async function checkPermission(
  request: Request,
  permissionCode: string
): Promise<Response | null> {
  const authUser = getAuthUser(request);
  if (!authUser) {
    return new Response(JSON.stringify({ error: '未登录' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const permitted = await hasPermission(authUser.userId, permissionCode);
  if (!permitted) {
    return new Response(JSON.stringify({ error: '无操作权限' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return null; // 有权限
}
