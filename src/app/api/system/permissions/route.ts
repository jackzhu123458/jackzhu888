import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { checkPermission } from '@/lib/auth';

// 获取权限列表（按模块分组）
export async function GET(request: Request) {
  const permError = await checkPermission(request, 'system:roles');
  if (permError) return permError;

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('permissions')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data || []);
}
