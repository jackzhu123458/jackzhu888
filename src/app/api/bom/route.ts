import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest) {
  const client = getSupabaseClient();
  const { searchParams } = new URL(request.url);
  const parentProductId = searchParams.get('parent_product_id');

  let query = client
    .from('bom')
    .select('*, parent_product:products!bom_parent_product_id_products_id_fk(id, code, name, spec, unit, type, price), child_product:products!bom_child_product_id_products_id_fk(id, code, name, spec, unit, type, price)')
    .order('created_at', { ascending: false })
    .limit(500);

  if (parentProductId) {
    query = query.eq('parent_product_id', parentProductId);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 如果有 parentProductId 参数，返回简化的子物料列表
  if (parentProductId && Array.isArray(data)) {
    const children = data.map(bom => ({
      child_product_id: (bom.child_product as Record<string, unknown>)?.id || bom.child_product_id,
      quantity: bom.quantity,
      child_code: (bom.child_product as Record<string, unknown>)?.code || '',
      child_name: (bom.child_product as Record<string, unknown>)?.name || '',
      child_unit: (bom.child_product as Record<string, unknown>)?.unit || '',
      child_type: (bom.child_product as Record<string, unknown>)?.type || null,
      child_category: (bom.child_product as Record<string, unknown>)?.category || null,
    }));
    return NextResponse.json(children);
  }

  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const client = getSupabaseClient();
  const body = await request.json();
  const { data, error } = await client.from('bom').insert(body).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data?.[0], { status: 201 });
}

export async function PUT(request: NextRequest) {
  const client = getSupabaseClient();
  const body = await request.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });
  const { data, error } = await client.from('bom').update(updates).eq('id', id).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data?.[0]);
}

export async function DELETE(request: NextRequest) {
  const client = getSupabaseClient();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });
  const { error } = await client.from('bom').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
