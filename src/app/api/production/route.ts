import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

const ORDER_SELECT = '*, products(id, code, name, spec, unit), customers(id, name, code), production_order_materials(*, products(id, code, name, spec, unit))';

export async function GET(request: NextRequest) {
  const client = getSupabaseClient();
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const customerId = searchParams.get('customer_id');

  let query = client
    .from('production_orders')
    .select(ORDER_SELECT)
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);
  if (customerId) query = query.eq('customer_id', customerId);

  const { data, error } = await query.limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const client = getSupabaseClient();
  const body = await request.json();
  const { materials, ...orderFields } = body;

  // 创建订单
  const { data: order, error: oErr } = await client
    .from('production_orders')
    .insert(orderFields)
    .select()
    .maybeSingle();
  if (oErr) return NextResponse.json({ error: oErr.message }, { status: 500 });
  if (!order) return NextResponse.json({ error: '创建订单失败' }, { status: 500 });

  // 创建用料明细
  if (materials && materials.length > 0) {
    const materialsWithOrderId = materials.map((m: Record<string, unknown>) => ({
      ...m,
      order_id: order.id,
    }));
    const { error: mErr } = await client.from('production_order_materials').insert(materialsWithOrderId);
    if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });
  }

  // 返回完整订单
  const { data: fullOrder, error: fErr } = await client
    .from('production_orders')
    .select(ORDER_SELECT)
    .eq('id', order.id)
    .maybeSingle();
  if (fErr) return NextResponse.json({ error: fErr.message }, { status: 500 });

  return NextResponse.json(fullOrder, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const client = getSupabaseClient();
  const body = await request.json();
  const { id, materials, ...updates } = body;
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });

  const { data: order, error: oErr } = await client
    .from('production_orders')
    .update(updates)
    .eq('id', id)
    .select()
    .maybeSingle();
  if (oErr) return NextResponse.json({ error: oErr.message }, { status: 500 });

  // 更新用料明细
  if (materials) {
    await client.from('production_order_materials').delete().eq('order_id', id);
    if (materials.length > 0) {
      const materialsWithOrderId = materials.map((m: Record<string, unknown>) => ({
        ...m,
        order_id: id,
      }));
      await client.from('production_order_materials').insert(materialsWithOrderId);
    }
  }

  const { data: fullOrder, error: fErr } = await client
    .from('production_orders')
    .select(ORDER_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (fErr) return NextResponse.json({ error: fErr.message }, { status: 500 });

  return NextResponse.json(fullOrder);
}

export async function DELETE(request: NextRequest) {
  const client = getSupabaseClient();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });
  // 用料明细 cascade 删除
  const { error } = await client.from('production_orders').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
