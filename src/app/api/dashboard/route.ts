import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET() {
  const client = getSupabaseClient();

  // 1. 库存总览指标
  const { data: inventoryData, error: invErr } = await client
    .from('inventory')
    .select('quantity, reserved_qty, product_id, warehouse_id');
  if (invErr) return NextResponse.json({ error: invErr.message }, { status: 500 });

  const totalQuantity = (inventoryData || []).reduce((sum: number, i: { quantity: number }) => sum + Number(i.quantity || 0), 0);
  const totalReserved = (inventoryData || []).reduce((sum: number, i: { reserved_qty: number }) => sum + Number(i.reserved_qty || 0), 0);
  const totalAvailable = totalQuantity - totalReserved;

  // 2. 客户订单统计
  const { data: orderStatusData, error: coErr } = await client
    .from('customer_orders')
    .select('status');
  if (coErr) return NextResponse.json({ error: coErr.message }, { status: 500 });

  const customerOrderStats = (orderStatusData || []).reduce(
    (acc: Record<string, number>, o: { status: string }) => {
      acc[o.status] = (acc[o.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  // 3. 生产订单统计
  const { data: productionData, error: prErr } = await client
    .from('production_orders')
    .select('status');
  if (prErr) return NextResponse.json({ error: prErr.message }, { status: 500 });

  const productionStats = (productionData || []).reduce(
    (acc: Record<string, number>, o: { status: string }) => {
      acc[o.status] = (acc[o.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  // 4. 库存分布（按仓库）
  const { data: warehousesData, error: whErr } = await client
    .from('warehouses')
    .select('id, name, location');
  if (whErr) return NextResponse.json({ error: whErr.message }, { status: 500 });

  const warehouseMap: Record<string, { name: string; location: string | null }> = {};
  for (const wh of warehousesData || []) {
    warehouseMap[wh.id] = { name: wh.name, location: wh.location };
  }

  const warehouseInventory: Record<string, { quantity: number; reserved: number; itemCount: number }> = {};
  for (const item of inventoryData || []) {
    const wid = item.warehouse_id as string;
    if (!warehouseInventory[wid]) {
      warehouseInventory[wid] = { quantity: 0, reserved: 0, itemCount: 0 };
    }
    warehouseInventory[wid].quantity += Number(item.quantity || 0);
    warehouseInventory[wid].reserved += Number(item.reserved_qty || 0);
    warehouseInventory[wid].itemCount += 1;
  }

  const inventoryByWarehouse = Object.entries(warehouseInventory).map(([wid, data]) => ({
    warehouse_id: wid,
    warehouse_name: warehouseMap[wid]?.name || '未知仓库',
    warehouse_location: warehouseMap[wid]?.location || '',
    quantity: data.quantity,
    reserved: data.reserved,
    available: data.quantity - data.reserved,
    item_count: data.itemCount,
  }));

  // 5. 物料库存TOP10
  const productQtyMap: Record<string, number> = {};
  for (const item of inventoryData || []) {
    const pid = item.product_id as string;
    productQtyMap[pid] = (productQtyMap[pid] || 0) + Number(item.quantity || 0);
  }

  const topProductIds = Object.entries(productQtyMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([pid]) => pid);

  let topProducts: Array<{ id: string; code: string; name: string; total_quantity: number }> = [];
  if (topProductIds.length > 0) {
    const { data: productDetails } = await client
      .from('products')
      .select('id, code, name')
      .in('id', topProductIds);
    
    topProducts = topProductIds.map(pid => {
      const p = (productDetails || []).find((pd: { id: string }) => pd.id === pid);
      return {
        id: pid,
        code: p?.code || '',
        name: p?.name || '',
        total_quantity: productQtyMap[pid] || 0,
      };
    });
  }

  // 6. 最近库存动态（入库 + 出库）
  const { data: recentInbound, error: riErr } = await client
    .from('inbound_notes')
    .select('id, note_no, status, created_at, type')
    .order('created_at', { ascending: false })
    .limit(5);

  const { data: recentDelivery, error: rdErr } = await client
    .from('delivery_notes')
    .select('id, note_no, status, created_at, customer_name')
    .order('created_at', { ascending: false })
    .limit(5);

  // 合并动态
  const activities: Array<{ id: string; type: string; note_no: string; detail: string; time: string; status: string }> = [];
  for (const ib of recentInbound || []) {
    activities.push({
      id: ib.id,
      type: 'inbound',
      note_no: ib.note_no,
      detail: `入库单${ib.note_no} ${ib.status === 'confirmed' ? '已确认入库' : '待确认'}`,
      time: ib.created_at,
      status: ib.status,
    });
  }
  for (const dn of recentDelivery || []) {
    activities.push({
      id: dn.id,
      type: 'outbound',
      note_no: dn.note_no,
      detail: `出库单${dn.note_no} → ${dn.customer_name || ''} ${dn.status === 'shipped' ? '已出货' : '待出货'}`,
      time: dn.created_at,
      status: dn.status,
    });
  }
  activities.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

  // 7. 最近生产订单
  const { data: recentProduction, error: rpErr } = await client
    .from('production_orders')
    .select('id, order_no, status, quantity, created_at, products(name, code), customers(name)')
    .order('created_at', { ascending: false })
    .limit(5);

  // 8. 最近客户订单
  const { data: recentCustomerOrders, error: rcoErr } = await client
    .from('customer_orders')
    .select('id, order_no, status, created_at, customers(name)')
    .order('created_at', { ascending: false })
    .limit(5);

  // 9. 基础计数
  const { count: productCount } = await client.from('products').select('*', { count: 'exact', head: true });
  const { count: customerCount } = await client.from('customers').select('*', { count: 'exact', head: true });
  const { count: bomCount } = await client.from('bom').select('*', { count: 'exact', head: true });

  return NextResponse.json({
    // 核心指标
    totalInventory: totalQuantity,
    totalReserved,
    totalAvailable,
    productCount: productCount || 0,
    customerCount: customerCount || 0,
    bomCount: bomCount || 0,
    // 订单统计
    customerOrderStats,
    productionStats,
    // 库存分布
    inventoryByWarehouse,
    // TOP10
    topProducts,
    // 动态
    recentActivities: activities.slice(0, 10),
    // 最近订单
    recentProduction: recentProduction || [],
    recentCustomerOrders: recentCustomerOrders || [],
  });
}
