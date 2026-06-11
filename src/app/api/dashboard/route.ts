import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET() {
  const client = getSupabaseClient();

  // 产品统计
  const { count: productCount, error: pErr } = await client
    .from('products')
    .select('*', { count: 'exact', head: true });
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  // BOM 统计
  const { count: bomCount, error: bErr } = await client
    .from('bom')
    .select('*', { count: 'exact', head: true });
  if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 });

  // 客户统计
  const { count: customerCount, error: cErr } = await client
    .from('customers')
    .select('*', { count: 'exact', head: true });
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });

  // 生产订单统计
  const { data: orders, error: oErr } = await client
    .from('production_orders')
    .select('status');
  if (oErr) return NextResponse.json({ error: oErr.message }, { status: 500 });

  // 送货单统计
  const { count: deliveryCount, error: dErr } = await client
    .from('delivery_notes')
    .select('*', { count: 'exact', head: true });
  if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 });

  const orderStats = (orders || []).reduce(
    (acc: Record<string, number>, o: { status: string }) => {
      acc[o.status] = (acc[o.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  // 最近生产订单
  const { data: recentOrders, error: roErr } = await client
    .from('production_orders')
    .select('id, order_no, status, quantity, created_at, products(name), customers(name)')
    .order('created_at', { ascending: false })
    .limit(5);
  if (roErr) return NextResponse.json({ error: roErr.message }, { status: 500 });

  // 最近送货单
  const { data: recentDelivery, error: rdErr } = await client
    .from('delivery_notes')
    .select('id, note_no, customer_name, status, delivery_date, created_at')
    .order('created_at', { ascending: false })
    .limit(5);
  if (rdErr) return NextResponse.json({ error: rdErr.message }, { status: 500 });

  return NextResponse.json({
    productCount: productCount || 0,
    bomCount: bomCount || 0,
    customerCount: customerCount || 0,
    orderStats,
    deliveryCount: deliveryCount || 0,
    recentOrders: recentOrders || [],
    recentDelivery: recentDelivery || [],
  });
}
