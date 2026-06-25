import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient, isLocalMode } from '@/storage/database/supabase-client';

/**
 * 在 PostgREST 本地模式下，直接用 fetch 调用 PostgREST API。
 * Supabase JS client 在 PostgREST 代理模式下可能有兼容性问题
 * （schema cache 未刷新、header 被剥离等），直接 fetch 更可靠。
 */
async function postgrestFetch(path: string, options?: RequestInit): Promise<Response> {
  const postgrestUrl = process.env.POSTGREST_URL;
  if (!postgrestUrl) throw new Error('POSTGREST_URL not set');
  return fetch(`${postgrestUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
  });
}

// GET: 获取所有工序模板
export async function GET() {
  try {
    if (isLocalMode()) {
      // 本地 PostgREST 模式：直接调用，避免 Supabase client 代理兼容性问题
      const res = await postgrestFetch('/process_step_templates?order=step_name.asc');
      if (!res.ok) {
        const text = await res.text();
        console.error('[process-step-templates GET] PostgREST error:', res.status, text);
        return NextResponse.json({ error: `数据库查询失败 (HTTP ${res.status}): ${text}` }, { status: 500 });
      }
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      console.log(`[process-step-templates GET] PostgREST 返回 ${list.length} 条记录`);
      return NextResponse.json(list);
    }

    // 云端 Supabase 模式
    const client = getSupabaseClient();
    const { data, error } = await client
      .from('process_step_templates')
      .select('*')
      .order('step_name');

    if (error) {
      console.error('[process-step-templates GET] Supabase error:', JSON.stringify(error));
      return NextResponse.json({ error: error.message, code: error.code, details: error.details }, { status: 500 });
    }

    const list = Array.isArray(data) ? data : [];
    console.log(`[process-step-templates GET] 返回 ${list.length} 条记录`);
    return NextResponse.json(list);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[process-step-templates GET] Exception:', msg);
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

    if (isLocalMode()) {
      // 本地 PostgREST 模式：直接调用
      const res = await postgrestFetch('/process_step_templates', {
        method: 'POST',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify({ step_name: step_name.trim() }),
      });

      if (res.status === 409 || res.status === 400) {
        // 重复键冲突
        console.log(`[process-step-templates POST] 工序"${step_name}"已存在 (HTTP ${res.status})`);
        return NextResponse.json({ error: '该工序名称已存在', exists: true }, { status: 409 });
      }

      if (!res.ok) {
        const text = await res.text();
        console.error('[process-step-templates POST] PostgREST error:', res.status, text);
        return NextResponse.json({ error: `添加失败 (HTTP ${res.status}): ${text}` }, { status: 500 });
      }

      const data = await res.json();
      console.log('[process-step-templates POST] PostgREST 新增成功:', JSON.stringify(data));
      return NextResponse.json(Array.isArray(data) ? data[0] : data, { status: 201 });
    }

    // 云端 Supabase 模式
    const client = getSupabaseClient();
    const { data, error } = await client
      .from('process_step_templates')
      .insert({ step_name: step_name.trim() })
      .select()
      .single();

    if (error) {
      console.error('[process-step-templates POST] Supabase error:', JSON.stringify(error));
      if (error.code === '23505') {
        return NextResponse.json({ error: '该工序名称已存在', exists: true }, { status: 409 });
      }
      return NextResponse.json({ error: error.message, code: error.code, details: error.details }, { status: 500 });
    }
    console.log('[process-step-templates POST] 新增成功:', JSON.stringify(data));
    return NextResponse.json(data, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[process-step-templates POST] Exception:', msg);
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

    if (isLocalMode()) {
      // 本地 PostgREST 模式：直接调用
      const res = await postgrestFetch(`/process_step_templates?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const text = await res.text();
        console.error('[process-step-templates DELETE] PostgREST error:', res.status, text);
        return NextResponse.json({ error: `删除失败 (HTTP ${res.status}): ${text}` }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }

    // 云端 Supabase 模式
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
