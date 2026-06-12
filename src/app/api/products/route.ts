import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest) {
  const client = getSupabaseClient();
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');
  const keyword = searchParams.get('keyword');

  let query = client.from('products').select('*').order('created_at', { ascending: false });

  if (type) query = query.eq('type', type);
  if (keyword) query = query.or(`code.ilike.%${keyword}%,name.ilike.%${keyword}%`);

  const { data, error } = await query.limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const client = getSupabaseClient();
  const body = await request.json();
  const { data, error } = await client.from('products').insert(body).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data?.[0], { status: 201 });
}

export async function PUT(request: NextRequest) {
  const client = getSupabaseClient();
  const body = await request.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });
  const { data, error } = await client.from('products').update(updates).eq('id', id).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data?.[0]);
}

export async function DELETE(request: NextRequest) {
  const client = getSupabaseClient();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });

  // 检查外键引用关系
  const references: string[] = [];

  const checks = [
    { table: 'bom', column: 'parent_product_id', label: 'BOM(作为父产品)' },
    { table: 'bom', column: 'child_product_id', label: 'BOM(作为子物料)' },
    { table: 'delivery_note_items', column: 'product_id', label: '送货单明细' },
    { table: 'inbound_note_items', column: 'product_id', label: '入库单明细' },
    { table: 'customer_order_items', column: 'product_id', label: '客户订单明细' },
    { table: 'production_order_materials', column: 'product_id', label: '生产订单用料' },
    { table: 'inventory', column: 'product_id', label: '库存记录' },
    { table: 'production_orders', column: 'product_id', label: '生产订单' },
  ];

  for (const check of checks) {
    const { count, error: checkError } = await client
      .from(check.table)
      .select('*', { count: 'exact', head: true })
      .eq(check.column, id);
    if (checkError) continue; // 表可能不存在，跳过
    if (count && count > 0) {
      references.push(`${check.label}(${count}条)`);
    }
  }

  if (references.length > 0) {
    return NextResponse.json(
      { error: `无法删除：该商品被以下记录引用 - ${references.join('、')}。请先删除相关引用后再操作。` },
      { status: 409 }
    );
  }

  const { error } = await client.from('products').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
