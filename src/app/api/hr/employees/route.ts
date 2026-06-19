import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const keyword = searchParams.get('keyword');
    const department = searchParams.get('department');
    const status = searchParams.get('status') || 'active';

    let query = supabase
      .from('dingtalk_employees')
      .select('*', { count: 'exact' })
      .eq('status', status)
      .order('user_name');

    if (keyword) {
      query = query.or(`user_name.ilike.%${keyword}%,user_id.ilike.%${keyword}%,job_number.ilike.%${keyword}%`);
    }
    if (department) {
      query = query.eq('department_name', department);
    }

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // 获取部门列表
    const { data: deptData } = await supabase
      .from('dingtalk_employees')
      .select('department_name')
      .not('department_name', 'is', null);

    const departments = [...new Set(deptData?.map(d => d.department_name).filter(Boolean) || [])];

    return NextResponse.json({
      success: true,
      data: data || [],
      total: count || 0,
      departments,
      source: 'cache',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '获取员工列表失败';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
