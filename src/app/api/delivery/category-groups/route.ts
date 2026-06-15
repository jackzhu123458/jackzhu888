import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET() {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('delivery_category_groups')
      .select('*')
      .order('group_no');
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data || []);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Support both { groups: [...] } and [...] formats
    const rawGroups = Array.isArray(body) ? body : (body.groups || []);

    const groups = rawGroups.map((g: Record<string, unknown>, i: number) => ({
      group_no: Number(g.group_no) || (i + 1),
      group_name: String(g.group_name || ''),
      categories: String(g.categories || ''),
    })).filter((g: { group_name: string }) => g.group_name);

    const supabase = getSupabaseClient();

    // Delete all existing
    const { data: existing } = await supabase
      .from('delivery_category_groups')
      .select('id');

    const existingIds = (existing || []).map((r: Record<string, unknown>) => r.id);

    if (existingIds.length > 0) {
      const { error: delError } = await supabase
        .from('delivery_category_groups')
        .delete()
        .in('id', existingIds);
      if (delError) {
        return NextResponse.json({ error: '删除失败: ' + delError.message }, { status: 500 });
      }
    }

    // Insert new
    if (groups.length > 0) {
      const { data, error: insError } = await supabase
        .from('delivery_category_groups')
        .insert(groups)
        .select();
      if (insError) {
        return NextResponse.json({ error: '插入失败: ' + insError.message }, { status: 500 });
      }
      return NextResponse.json(data);
    }

    return NextResponse.json([]);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('delivery_category_groups')
      .delete()
      .eq('id', Number(id));
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
