import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const department = searchParams.get('department');

    if (!startDate || !endDate) {
      return NextResponse.json(
        { success: false, error: '缺少必要参数: startDate, endDate' },
        { status: 400 }
      );
    }

    let query = supabase
      .from('dingtalk_attendance')
      .select(`
        user_id, user_name, work_date, clock_in, clock_out,
        work_duration, attendance_result, time_result
      `)
      .gte('work_date', startDate)
      .lte('work_date', endDate)
      .order('work_date', { ascending: false });

    // 部门筛选
    if (department) {
      const { data: deptEmployees } = await supabase
        .from('dingtalk_employees')
        .select('user_id')
        .eq('department_name', department);
      if (deptEmployees && deptEmployees.length > 0) {
        query = query.in('user_id', deptEmployees.map(e => e.user_id));
      }
    }

    const { data: records, error } = await query;

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // 构造 CSV
    const header = '姓名,部门,日期,上班打卡,下班打卡,工作时长(h),状态\n';
    const rows = (records || []).map(r => {
      const statusMap: Record<string, string> = {
        Normal: '正常',
        Late: '迟到',
        Early: '早退',
        LateAndEarly: '迟到+早退',
        NotSigned: '缺卡',
        Absent: '旷工',
      };
      const status = statusMap[r.time_result || r.attendance_result || 'Normal'] || r.attendance_result;
      const clockIn = r.clock_in ? new Date(r.clock_in).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '-';
      const clockOut = r.clock_out ? new Date(r.clock_out).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '-';
      const hours = r.work_duration ? String(r.work_duration) : '-';
      const date = r.work_date || '';
      return `${r.user_name},,${date},${clockIn},${clockOut},${hours},${status}`;
    });

    const csv = '\uFEFF' + header + rows.join('\n');

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="attendance_${startDate}_${endDate}.csv"`,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '导出失败';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
