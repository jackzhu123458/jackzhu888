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

    // 获取日期范围内的考勤记录
    let query = supabase
      .from('dingtalk_attendance')
      .select('user_id, user_name, work_date, clock_in, clock_out, work_duration, attendance_result, time_result')
      .gte('work_date', startDate)
      .lte('work_date', endDate);

    if (department) {
      // 先查该部门的员工ID
      const { data: deptEmployees } = await supabase
        .from('dingtalk_employees')
        .select('user_id')
        .eq('department_name', department);

      if (deptEmployees && deptEmployees.length > 0) {
        query = query.in('user_id', deptEmployees.map(e => e.user_id));
      } else {
        return NextResponse.json({
          success: true,
          data: {
            totalEmployees: 0,
            normalCount: 0,
            lateCount: 0,
            absentCount: 0,
            earlyLeaveCount: 0,
            avgWorkHours: 0,
          },
        });
      }
    }

    const { data: records, error } = await query;

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // 计算统计
    const uniqueUsers = new Set(records?.map(r => r.user_id) || []);
    const totalEmployees = uniqueUsers.size;

    let normalCount = 0;
    let lateCount = 0;
    let earlyLeaveCount = 0;
    let absentCount = 0;
    let totalWorkHours = 0;
    let workDaysCount = 0;

    for (const record of records || []) {
      const result = record.time_result || record.attendance_result || 'Normal';

      if (result === 'Normal') {
        normalCount++;
      } else if (result === 'Late') {
        lateCount++;
      } else if (result === 'Early') {
        earlyLeaveCount++;
      } else if (result === 'NotSigned' || result === 'Absent') {
        absentCount++;
      } else if (result === 'LateAndEarly') {
        lateCount++;
        earlyLeaveCount++;
      }

      if (record.work_duration && record.work_duration > 0) {
        totalWorkHours += record.work_duration;
        workDaysCount++;
      }
    }

    const avgWorkHours = workDaysCount > 0
      ? Math.round((totalWorkHours / workDaysCount) * 10) / 10
      : 0;

    return NextResponse.json({
      success: true,
      data: {
        totalEmployees,
        normalCount,
        lateCount,
        absentCount,
        earlyLeaveCount,
        avgWorkHours,
        totalRecords: records?.length || 0,
      },
      dateRange: { startDate, endDate },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '获取统计失败';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
