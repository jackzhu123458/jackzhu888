import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET: 获取所有工序模板
export async function GET() {
  try {
    const { data, error } = await getSupabaseClient()
      .from('process_step_templates')
      .select('*')
      .order('step_name');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST: 新增工序模板
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { step_name } = body;
    if (!step_name || !step_name.trim()) {
      return NextResponse.json({ error: '工序名称不能为空' }, { status: 400 });
    }
    const { data, error } = await getSupabaseClient()
      .from('process_step_templates')
      .insert({ step_name: step_name.trim() })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: '该工序名称已存在' }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE: 删除工序模板
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: '缺少id参数' }, { status: 400 });
    }
    const { error } = await getSupabaseClient()
      .from('process_step_templates')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
