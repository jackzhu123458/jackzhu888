import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export const dynamic = 'force-dynamic';

export async function GET() {
  const client = getSupabaseClient();

  // ── All queries in parallel ──
  const [
    inventoryRows,
    productCount,
    customerCount,
    bomCount,
    orderStats,
    productionStats,
    inventoryByWarehouse,
    topProducts,
    recentInbound,
    recentOutbound,
    recentProduction,
    recentCustomerOrders,
    inProgressProduction,
    pendingProduction,
    ganttData,
    qualityAlertsData,
  ] = await Promise.all([
    // total inventory (sum quantity + reserved_qty)
    client.from('inventory').select('quantity, reserved_qty'),

    // product count
    client.from('products').select('id', { count: 'exact', head: true }),

    // customer count
    client.from('customers').select('id', { count: 'exact', head: true }),

    // bom count
    client.from('bom').select('id', { count: 'exact', head: true }),

    // customer order stats by status
    client.from('customer_orders').select('status'),

    // production order stats by status
    client.from('production_orders').select('status'),

    // inventory by warehouse
    client.from('inventory').select('warehouse_id, quantity, reserved_qty, warehouses(id, name)'),

    // top products by quantity
    client.from('inventory').select('product_id, quantity, products(id, code, name)').order('quantity', { ascending: false }).limit(10),

    // recent inbound activities
    client.from('inbound_notes').select('id, note_no, created_at, operator, status').order('created_at', { ascending: false }).limit(5),

    // recent outbound activities
    client.from('delivery_notes').select('id, note_no, delivery_date, customer_name, status').eq('status', 'shipped').order('delivery_date', { ascending: false }).limit(5),

    // recent production orders
    client.from('production_orders').select('id, order_no, status, quantity, created_at, products(id, code, name), customers(id, name)').order('created_at', { ascending: false }).limit(5),

    // recent customer orders
    client.from('customer_orders').select('id, order_no, status, created_at, customers(id, name)').order('created_at', { ascending: false }).limit(5),

    // in-progress production orders (for dashboard focus)
    client.from('production_orders').select('id, order_no, status, quantity, due_date, created_at, products(id, code, name), customers(id, name)').eq('status', 'in_progress').order('due_date', { ascending: true }),

    // pending production orders
    client.from('production_orders').select('id, order_no, status, quantity, due_date, created_at, products(id, code, name), customers(id, name)').eq('status', 'pending').order('due_date', { ascending: true }),

    // gantt: all active production orders with dates
    client.from('production_orders').select('id, order_no, status, quantity, due_date, created_at, products(id, code, name), customers(id, name)').in('status', ['pending', 'in_progress']).order('due_date', { ascending: true }),

    // quality alerts (active only)
    client.from('quality_alerts').select('id, title, severity, alert_type, status, product_id, description, created_at, products(id, code, name)').eq('status', 'active').order('created_at', { ascending: false }).limit(20),
  ]);

  // ── Compute aggregate values ──
  let totalInventory = 0;
  let totalReserved = 0;
  for (const row of (inventoryRows.data ?? [])) {
    totalInventory += Number(row.quantity) || 0;
    totalReserved += Number(row.reserved_qty) || 0;
  }
  const totalAvailable = totalInventory - totalReserved;

  // customer order stats
  const customerOrderStats: Record<string, number> = {};
  for (const row of (orderStats.data ?? [])) {
    const s = row.status || 'pending';
    customerOrderStats[s] = (customerOrderStats[s] || 0) + 1;
  }

  // production stats
  const productionStatsMap: Record<string, number> = {};
  for (const row of (productionStats.data ?? [])) {
    const s = row.status || 'pending';
    productionStatsMap[s] = (productionStatsMap[s] || 0) + 1;
  }

  // inventory by warehouse
  const whMap = new Map<string, { warehouse_name: string; quantity: number; reserved: number; item_count: number }>();
  for (const row of (inventoryByWarehouse.data ?? [])) {
    const whId = row.warehouse_id as string;
    const wh = row.warehouses as unknown;
    const whName = (wh && typeof wh === 'object' && !Array.isArray(wh)) ? String((wh as Record<string, unknown>).name || '默认仓库') : '默认仓库';
    const existing = whMap.get(whId);
    if (existing) {
      existing.quantity += Number(row.quantity) || 0;
      existing.reserved += Number(row.reserved_qty) || 0;
      existing.item_count += 1;
    } else {
      whMap.set(whId, {
        warehouse_name: whName,
        quantity: Number(row.quantity) || 0,
        reserved: Number(row.reserved_qty) || 0,
        item_count: 1,
      });
    }
  }
  const inventoryByWarehouseArr = Array.from(whMap.entries()).map(([id, v]) => ({
    warehouse_id: id,
    warehouse_name: v.warehouse_name,
    quantity: v.quantity,
    reserved: v.reserved,
    available: v.quantity - v.reserved,
    item_count: v.item_count,
  }));

  // top products
  const topProductsArr = (topProducts.data ?? []).map((row: Record<string, unknown>) => {
    const p = row.products as Record<string, unknown> | Record<string, unknown>[] | null;
    const prod = Array.isArray(p) ? p[0] : p;
    return {
      id: row.product_id as string,
      code: (prod as Record<string, string>)?.code || '',
      name: (prod as Record<string, string>)?.name || '',
      total_quantity: Number(row.quantity) || 0,
    };
  });

  // recent activities
  const activities = [
    ...(recentInbound.data ?? []).map((n: Record<string, unknown>) => ({
      id: n.id as string,
      type: 'inbound',
      note_no: n.note_no as string,
      detail: `入库 - ${n.operator || ''}`,
      time: n.created_at as string,
      status: n.status as string,
    })),
    ...(recentOutbound.data ?? []).map((n: Record<string, unknown>) => ({
      id: n.id as string,
      type: 'outbound',
      note_no: n.note_no as string,
      detail: `出库 → ${n.customer_name || ''}`,
      time: n.delivery_date as string,
      status: n.status as string,
    })),
  ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 10);

  // recent production
  const recentProdArr = (recentProduction.data ?? []).map((po: Record<string, unknown>) => ({
    id: po.id as string,
    order_no: po.order_no as string,
    status: po.status as string,
    quantity: Number(po.quantity) || 0,
    created_at: po.created_at as string,
    products: po.products,
    customers: po.customers,
  }));

  // recent customer orders
  const recentCOArr = (recentCustomerOrders.data ?? []).map((co: Record<string, unknown>) => ({
    id: co.id as string,
    order_no: co.order_no as string,
    status: co.status as string,
    created_at: co.created_at as string,
    customers: co.customers,
  }));

  // in-progress production orders
  const inProgressArr = (inProgressProduction.data ?? []).map((po: Record<string, unknown>) => ({
    id: po.id as string,
    order_no: po.order_no as string,
    status: po.status as string,
    quantity: Number(po.quantity) || 0,
    due_date: po.due_date as string | null,
    created_at: po.created_at as string,
    products: po.products,
    customers: po.customers,
  }));

  // pending production orders
  const pendingArr = (pendingProduction.data ?? []).map((po: Record<string, unknown>) => ({
    id: po.id as string,
    order_no: po.order_no as string,
    status: po.status as string,
    quantity: Number(po.quantity) || 0,
    due_date: po.due_date as string | null,
    created_at: po.created_at as string,
    products: po.products,
    customers: po.customers,
  }));

  // gantt data: active production orders grouped by customer
  const ganttOrders = (ganttData.data ?? []).map((po: Record<string, unknown>) => {
    const prod = po.products as Record<string, unknown> | Record<string, unknown>[] | null;
    const prodObj = Array.isArray(prod) ? prod[0] : prod;
    const cust = po.customers as Record<string, unknown> | Record<string, unknown>[] | null;
    const custObj = Array.isArray(cust) ? cust[0] : cust;
    return {
      id: po.id as string,
      order_no: po.order_no as string,
      status: po.status as string,
      quantity: Number(po.quantity) || 0,
      due_date: po.due_date as string | null,
      created_at: po.created_at as string,
      product_code: String(prodObj?.code || ''),
      product_name: String(prodObj?.name || ''),
      customer_id: String(custObj?.id || ''),
      customer_name: String(custObj?.name || '未分配'),
    };
  });

  return NextResponse.json({
    totalInventory,
    totalReserved,
    totalAvailable,
    productCount: productCount.count ?? 0,
    customerCount: customerCount.count ?? 0,
    bomCount: bomCount.count ?? 0,
    customerOrderStats,
    productionStats: productionStatsMap,
    inventoryByWarehouse: inventoryByWarehouseArr,
    topProducts: topProductsArr,
    recentActivities: activities,
    recentProduction: recentProdArr,
    recentCustomerOrders: recentCOArr,
    inProgressProduction: inProgressArr,
    pendingProduction: pendingArr,
    ganttOrders,
    qualityAlerts: ((qualityAlertsData as { data: Record<string, unknown>[] } | null)?.data ?? []).map((a) => {
      const p = a.products as Record<string, unknown> | Record<string, unknown>[] | null;
      const prod = Array.isArray(p) ? p[0] : p;
      return {
        id: a.id as string,
        title: a.title as string,
        severity: a.severity as string,
        alert_type: a.alert_type as string,
        status: a.status as string,
        product_id: a.product_id as string,
        description: a.description as string | null,
        created_at: a.created_at as string,
        products: prod ? { code: String(prod.code || ''), name: String(prod.name || '') } : { code: '', name: '' },
      };
    }),
  });
}
