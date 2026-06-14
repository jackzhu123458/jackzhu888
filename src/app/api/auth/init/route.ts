import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 初始化默认管理员账号（仅在无用户时执行）
export async function POST() {
  try {
    const supabase = getSupabaseClient();
    const { data: existing } = await supabase.from('users').select('id').limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json({ error: '系统已初始化，不可重复执行' }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash('admin123', 10);
    const { data: user, error } = await supabase
      .from('users')
      .insert({ username: 'admin', password_hash: passwordHash, display_name: '系统管理员' })
      .select('id')
      .single();

    if (error || !user) {
      return NextResponse.json({ error: '创建管理员失败' }, { status: 500 });
    }

    // 分配admin角色
    const { data: adminRole } = await supabase.from('roles').select('id').eq('code', 'admin').single();
    if (adminRole) {
      await supabase.from('user_roles').insert({ user_id: user.id, role_id: adminRole.id });
    }

    return NextResponse.json({ success: true, message: '初始化成功，默认管理员: admin / admin123' });
  } catch (err) {
    console.error('Init error:', err);
    return NextResponse.json({ error: '初始化失败' }, { status: 500 });
  }
}
