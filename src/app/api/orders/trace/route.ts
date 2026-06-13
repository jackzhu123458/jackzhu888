import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET /api/orders/trace?order_id=xxx - 追溯客户订单的全流程
export async function GET(request: NextRequest) {
  const client = getSupabaseClient();
  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get('order_id');

  if (!orderId) {
    return NextResponse.json({ error: '缺少 order_id' }, { status: 400 });
  }

  // 1. 获取客户订单详情
  const { data: order, error: orderErr } = await client
    .from('customer_orders')
    .select('*, customers(id, name, code, contact, phone), customer_order_items(*, products(id, code, name, spec, unit), customer_order_schedules(*))')
    .eq('id', orderId)
    .maybeSingle();

  if (orderErr || !order) {
    return NextResponse.json({ error: orderErr?.message || '订单不存在' }, { status: 404 });
  }

  // 2. 获取关联的生产订单
  const { data: productionOrders } = await client
    .from('production_orders')
    .select('id, order_no, product_id, quantity, status, due_date, completed_at, products(id, code, name, unit)')
    .eq('customer_order_id', orderId)
    .order('created_at', { ascending: true });

  // 3. 获取关联的送货单
  const { data: deliveryNotes } = await client
    .from('delivery_notes')
    .select('id, note_no, delivery_date, status, delivery_note_items(id, product_id, quantity, products(id, code, name, unit))')
    .eq('customer_order_id', orderId)
    .order('created_at', { ascending: true });

  return NextResponse.json({
    order,
    production_orders: productionOrders || [],
    delivery_notes: deliveryNotes || [],
  });
}
