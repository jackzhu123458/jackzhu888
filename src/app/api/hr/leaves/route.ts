import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    let query = supabase
      .from('leave_requests')
      .select(`
        id, employee_id, leave_type, start_date, end_date, days,
        reason, status, approved_by, approved_at, reject_reason,
        created_at, updated_at,
        dingtalk_employees:user_id(user_name, department_name)
      `)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: data || [],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '获取请假记录失败';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const body = await request.json();
    const { employee_id, leave_type, start_date, end_date, days, reason } = body;

    if (!employee_id || !leave_type || !start_date || !end_date || !days) {
      return NextResponse.json(
        { success: false, error: '请填写完整的请假信息' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('leave_requests')
      .insert({
        employee_id,
        leave_type,
        start_date,
        end_date,
        days,
        reason: reason || null,
        status: 'pending',
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '创建请假记录失败';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const body = await request.json();
    const { id, status, approved_by, reject_reason } = body;

    if (!id || !status) {
      return NextResponse.json(
        { success: false, error: '缺少必要参数' },
        { status: 400 }
      );
    }

    const updates: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (status === 'approved') {
      updates.approved_by = approved_by || null;
      updates.approved_at = new Date().toISOString();
    }
    if (status === 'rejected') {
      updates.reject_reason = reject_reason || null;
      updates.approved_by = approved_by || null;
      updates.approved_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('leave_requests')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '更新请假记录失败';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
