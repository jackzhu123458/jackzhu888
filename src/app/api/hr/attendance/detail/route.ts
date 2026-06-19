import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const department = searchParams.get('department');
    const status = searchParams.get('status');
    const keyword = searchParams.get('keyword');

    if (!startDate || !endDate) {
      return NextResponse.json(
        { success: false, error: '缺少必要参数: startDate, endDate' },
        { status: 400 }
      );
    }

    let query = supabase
      .from('dingtalk_attendance')
      .select(`
        id, user_id, user_name, work_date, clock_in, clock_out,
        work_duration, attendance_result, time_result, location_result
      `)
      .gte('work_date', startDate)
      .lte('work_date', endDate)
      .order('work_date', { ascending: false });

    // 按部门筛选
    if (department) {
      const { data: deptEmployees } = await supabase
        .from('dingtalk_employees')
        .select('user_id')
        .eq('department_name', department);
      if (deptEmployees && deptEmployees.length > 0) {
        query = query.in('user_id', deptEmployees.map(e => e.user_id));
      }
    }

    // 按姓名搜索
    if (keyword) {
      query = query.ilike('user_name', `%${keyword}%`);
    }

    // 按状态筛选
    if (status && status !== 'all') {
      const statusMap: Record<string, string[]> = {
        normal: ['Normal'],
        late: ['Late', 'LateAndEarly'],
        early: ['Early', 'LateAndEarly'],
        absent: ['NotSigned', 'Absent'],
      };
      if (statusMap[status]) {
        query = query.in('time_result', statusMap[status]);
      }
    }

    const { data: records, error, count } = await query;

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // 为每条记录附加部门信息
    const userIds = [...new Set(records?.map(r => r.user_id) || [])];
    let deptMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: employees } = await supabase
        .from('dingtalk_employees')
        .select('user_id, department_name')
        .in('user_id', userIds);
      for (const emp of employees || []) {
        deptMap[emp.user_id] = emp.department_name || '';
      }
    }

    const enrichedRecords = (records || []).map(r => ({
      ...r,
      department: deptMap[r.user_id] || '',
    }));

    // 获取最新同步时间
    const { data: latestSync } = await supabase
      .from('dingtalk_attendance')
      .select('synced_at')
      .order('synced_at', { ascending: false })
      .limit(1)
      .single();

    return NextResponse.json({
      success: true,
      data: enrichedRecords,
      total: count || enrichedRecords.length,
      dateRange: { startDate, endDate },
      lastSync: latestSync?.synced_at || null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '获取考勤明细失败';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
