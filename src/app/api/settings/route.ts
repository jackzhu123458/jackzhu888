import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET /api/settings - 获取所有设置
export async function GET(request: Request) {
  try {
    const client = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    let query = client.from('system_settings').select('key, value, updated_at');
    if (key) {
      query = query.eq('key', key);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 转为 key-value 对象格式方便前端使用
    const settings: Record<string, any> = {};
    for (const row of data || []) {
      settings[row.key] = row.value;
    }

    return NextResponse.json(key ? (settings[key] || null) : settings);
  } catch (err) {
    console.error('Settings GET error:', err);
    return NextResponse.json({ error: '获取设置失败' }, { status: 500 });
  }
}

// PUT /api/settings - 更新设置（支持单条和批量）
export async function PUT(request: Request) {
  try {
    const client = getSupabaseClient();
    const body = await request.json();

    // 批量更新模式：{ company_info: {...}, api_config: {...} }
    const updates: Array<{ key: string; value: any }> = [];

    if (body.key && body.value !== undefined) {
      // 单条更新：{ key: "company_info", value: {...} }
      updates.push({ key: body.key, value: body.value });
    } else {
      // 批量更新：{ company_info: {...}, api_config: {...} }
      for (const [key, value] of Object.entries(body)) {
        if (typeof value === 'object' && value !== null) {
          updates.push({ key, value });
        }
      }
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: '没有需要更新的设置' }, { status: 400 });
    }

    const results = [];
    for (const update of updates) {
      const { data, error } = await client
        .from('system_settings')
        .upsert(
          { key: update.key, value: update.value, updated_at: new Date().toISOString() },
          { onConflict: 'key' }
        )
        .select()
        .single();

      if (error) {
        console.error(`Settings PUT error for key ${update.key}:`, error);
        return NextResponse.json({ error: `更新 ${update.key} 失败: ${error.message}` }, { status: 500 });
      }
      results.push(data);
    }

    return NextResponse.json({ success: true, updated: results.length });
  } catch (err) {
    console.error('Settings PUT error:', err);
    return NextResponse.json({ error: '更新设置失败' }, { status: 500 });
  }
}
