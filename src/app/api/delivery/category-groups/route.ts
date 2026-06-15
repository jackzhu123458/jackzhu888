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
      console.error('[category-groups GET] Supabase error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data || []);
  } catch (e) {
    console.error('[category-groups GET] Exception:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log('[category-groups POST] Received body:', JSON.stringify(body));

    if (!Array.isArray(body)) {
      return NextResponse.json({ error: 'Expected array' }, { status: 400 });
    }

    const groups = body.map((g: Record<string, unknown>) => ({
      group_no: Number(g.group_no),
      group_name: String(g.group_name || ''),
      categories: String(g.categories || ''),
    }));

    console.log('[category-groups POST] Parsed groups:', JSON.stringify(groups));

    const supabase = getSupabaseClient();

    // Delete all existing
    const { data: existing } = await supabase
      .from('delivery_category_groups')
      .select('id');

    const existingIds = (existing || []).map((r: Record<string, unknown>) => r.id);

    console.log('[category-groups POST] Existing IDs to delete:', existingIds);

    if (existingIds.length > 0) {
      const { error: delError } = await supabase
        .from('delivery_category_groups')
        .delete()
        .in('id', existingIds);
      if (delError) {
        console.error('[category-groups POST] Delete error:', delError);
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
        console.error('[category-groups POST] Insert error:', insError);
        return NextResponse.json({ error: '插入失败: ' + insError.message }, { status: 500 });
      }
      console.log('[category-groups POST] Inserted:', data?.length, 'rows');
      return NextResponse.json(data);
    }

    return NextResponse.json([]);
  } catch (e) {
    console.error('[category-groups POST] Exception:', e);
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
      console.error('[category-groups DELETE] Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[category-groups DELETE] Exception:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
