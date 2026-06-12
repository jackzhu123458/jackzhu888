import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export const dynamic = 'force-dynamic';

export async function GET() {
  const client = getSupabaseClient();

  // ── Parallel queries (was 9 sequential, now 3 parallel batches) ──
  const [
    // Batch 1: counts
    productCount,
    customerCount,
    orderPending,
    productionActive,
    // Batch 2: inventory + delivery
    inventoryDist,
    recentDeliveries,
    // Batch 3: top items + activities
    topItems,
    recentInbound,
    recentOutbound,
  ] = await Promise.all([
    // Batch 1
    client.from('products').select('id', { count: 'exact', head: true }),
    client.from('customers').select('id', { count: 'exact', head: true }),
    client.from('customer_orders').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    client.from('production_orders').select('id', { count: 'exact', head: true }).in('status', ['pending', 'in_production']),

    // Batch 2
    client.from('inventory').select('quantity, reserved_qty, warehouses(name)').gt('quantity', 0),
    client.from('delivery_notes').select('id, note_no, customer_name, delivery_date, status').order('delivery_date', { ascending: false }).limit(5),

    // Batch 3
    client.from('inventory').select('product_id, quantity, products(code, name, spec)').order('quantity', { ascending: false }).limit(10),
    client.from('inbound_notes').select('id, note_no, created_at, operator').order('created_at', { ascending: false }).limit(5),
    client.from('delivery_notes').select('id, note_no, delivery_date, customer_name, status').eq('status', 'shipped').order('delivery_date', { ascending: false }).limit(5),
  ]);

  const kpi = {
    productCount: productCount.count ?? 0,
    customerCount: customerCount.count ?? 0,
    pendingOrders: orderPending.count ?? 0,
    activeProduction: productionActive.count ?? 0,
  };

  const inventoryDistribution = (inventoryDist.data ?? []).map((i: Record<string, unknown>) => ({
    warehouse: ((i.warehouses as Record<string, string>)?.name) || '默认仓库',
    quantity: Number(i.quantity) || 0,
    reserved: Number(i.reserved_qty) || 0,
  }));

  const topInventory = (topItems.data ?? []).map((i: Record<string, unknown>) => {
    const p = i.products as Record<string, string>;
    return {
      product_id: i.product_id as string,
      code: p?.code || '',
      name: p?.name || '',
      spec: p?.spec || '',
      quantity: Number(i.quantity) || 0,
    };
  });

  const activities = [
    ...(recentInbound.data ?? []).map((n: Record<string, unknown>) => ({
      type: 'inbound' as const,
      note_no: n.note_no as string,
      date: n.created_at as string,
      detail: `入库 - ${n.operator || ''}`,
    })),
    ...(recentOutbound.data ?? []).map((n: Record<string, unknown>) => ({
      type: 'outbound' as const,
      note_no: n.note_no as string,
      date: n.delivery_date as string,
      detail: `出库 → ${n.customer_name || ''}`,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 10);

  return NextResponse.json({
    kpi,
    inventoryDistribution,
    topInventory,
    recentDeliveries: recentDeliveries.data ?? [],
    activities,
  });
}
