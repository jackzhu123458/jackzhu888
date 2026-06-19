import { NextRequest, NextResponse } from 'next/server';
import { syncEmployees, syncAttendance, getApiUsage } from '@/lib/dingtalk';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, startDate, endDate } = body;

    if (type === 'employees') {
      const count = await syncEmployees();
      return NextResponse.json({
        success: true,
        message: `同步完成，共同步 ${count} 条员工数据`,
        synced: count,
      });
    }

    if (type === 'attendance') {
      if (!startDate || !endDate) {
        return NextResponse.json(
          { success: false, error: '请提供 startDate 和 endDate' },
          { status: 400 }
        );
      }
      const count = await syncAttendance(startDate, endDate);
      return NextResponse.json({
        success: true,
        message: `考勤数据同步完成，共同步 ${count} 条记录`,
        synced: count,
      });
    }

    if (type === 'usage') {
      const usage = await getApiUsage();
      return NextResponse.json({ success: true, data: usage });
    }

    return NextResponse.json(
      { success: false, error: '未知的同步类型' },
      { status: 400 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '同步失败';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
