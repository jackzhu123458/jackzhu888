import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!startDate || !endDate) {
      return NextResponse.json(
        { success: false, error: '缺少必要参数: startDate, endDate' },
        { status: 400 }
      );
    }

    // 按日期分组统计
    const { data: records, error } = await supabase
      .from('dingtalk_attendance')
      .select('work_date, time_result, attendance_result, work_duration')
      .gte('work_date', startDate)
      .lte('work_date', endDate)
      .order('work_date');

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // 按日期聚合
    const dailyStats: Record<string, {
      date: string;
      total: number;
      normal: number;
      late: number;
      early: number;
      absent: number;
      avgHours: number;
    }> = {};

    for (const record of records || []) {
      const date = record.work_date;
      if (!dailyStats[date]) {
        dailyStats[date] = {
          date,
          total: 0,
          normal: 0,
          late: 0,
          early: 0,
          absent: 0,
          avgHours: 0,
        };
      }

      const stat = dailyStats[date];
      stat.total++;

      const result = record.time_result || record.attendance_result || 'Normal';
      if (result === 'Normal') stat.normal++;
      else if (result === 'Late') stat.late++;
      else if (result === 'Early') stat.early++;
      else if (result === 'LateAndEarly') { stat.late++; stat.early++; }
      else if (result === 'NotSigned' || result === 'Absent') stat.absent++;
    }

    // 计算每日平均工时
    for (const date of Object.keys(dailyStats)) {
      const dayRecords = (records || []).filter(r => r.work_date === date && r.work_duration > 0);
      if (dayRecords.length > 0) {
        const totalHours = dayRecords.reduce((sum, r) => sum + (r.work_duration || 0), 0);
        dailyStats[date].avgHours = Math.round((totalHours / dayRecords.length) * 10) / 10;
      }
    }

    return NextResponse.json({
      success: true,
      data: Object.values(dailyStats).sort((a, b) => a.date.localeCompare(b.date)),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '获取趋势数据失败';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
