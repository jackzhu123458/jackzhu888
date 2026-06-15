import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET - 获取所有类目分组
export async function GET() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('delivery_category_groups')
    .select('*')
    .order('group_no', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

// POST - 创建或更新类目分组
export async function POST(request: NextRequest) {
  const supabase = getSupabaseClient();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (Array.isArray(body)) {
    // 批量替换：先删除所有，再插入
    const { error: deleteError } = await supabase
      .from('delivery_category_groups')
      .delete()
      .neq('id', 0);

    if (deleteError) {
      return NextResponse.json({ error: '删除失败: ' + deleteError.message }, { status: 500 });
    }

    if (body.length > 0) {
      const rows = body.map((g: Record<string, unknown>) => ({
        group_no: Number(g.group_no),
        group_name: String(g.group_name || ''),
        categories: String(g.categories || ''),
      }));

      const { data, error } = await supabase
        .from('delivery_category_groups')
        .insert(rows)
        .select();

      if (error) {
        return NextResponse.json({ error: '插入失败: ' + error.message }, { status: 500 });
      }
      return NextResponse.json(data);
    }
    return NextResponse.json([]);
  }

  // 单条创建
  const b = body as Record<string, unknown>;
  const { group_no, group_name, categories } = b;
  const { data, error } = await supabase
    .from('delivery_category_groups')
    .insert({ group_no: Number(group_no), group_name: String(group_name || ''), categories: String(categories || '') })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

// DELETE - 删除类目分组
export async function DELETE(request: NextRequest) {
  const supabase = getSupabaseClient();
  const { id } = await request.json();

  const { error } = await supabase
    .from('delivery_category_groups')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
