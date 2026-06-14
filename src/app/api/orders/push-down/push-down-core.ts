import { getSupabaseClient } from '@/storage/database/supabase-client';

interface BomRow { parent_product_id: string; child_product_id: string; quantity: number }
interface InvRow { id: string; product_id: string; warehouse_id: string; quantity: number; reserved_qty: number }

export interface PushDownResult {
  reserved: Array<{ product_id: string; product_name: string; quantity: number }>;
  produced: Array<{ product_id: string; product_name: string; quantity: number; production_order_id: string }>;
  shortage: Array<{ product_id: string; product_name: string; required: number; available: number }>;
}

/**
 * 订单自动下推：检查BOM/库存，生成生产订单或预扣库存
 * @param orderId 客户订单ID
 * @param supabase Supabase客户端（可选，不传则自动创建）
 */
export async function pushDownOrder(orderId: string, supabase?: ReturnType<typeof getSupabaseClient>): Promise<PushDownResult> {
  const db = supabase || getSupabaseClient();

  // 1. 并行查询订单详情+BOM+库存
  const [orderRes, bomRes, invRes] = await Promise.all([
    db.from('customer_orders').select('*, customer_order_items(*, products(id, code, name, spec, unit, type, category))').eq('id', orderId).single(),
    db.from('bom').select('parent_product_id, child_product_id, quantity'),
    db.from('inventory').select('id, product_id, warehouse_id, quantity, reserved_qty'),
  ]);

  const order = orderRes.data;
  if (!order) throw new Error('订单不存在');

  const bomMap = new Map<string, BomRow[]>();
  if (bomRes.data) {
    for (const b of bomRes.data as BomRow[]) {
      const list = bomMap.get(b.parent_product_id) || [];
      list.push(b);
      bomMap.set(b.parent_product_id, list);
    }
  }

  const invMap = new Map<string, InvRow>();
  if (invRes.data) {
    for (const inv of invRes.data as InvRow[]) {
      invMap.set(inv.product_id, inv);
    }
  }

  const pendingItems = (order.customer_order_items || []).filter(
    (item: { delivered_qty: number | null; quantity: number }) => Number(item.quantity) - Number(item.delivered_qty || 0) > 0,
  );

  if (pendingItems.length === 0) {
    return { reserved: [], produced: [], shortage: [] };
  }

  const result: PushDownResult = {
    reserved: [],
    produced: [],
    shortage: [],
  };

  // 2. 收集所有写操作
  const updateOps: Array<() => Promise<void>> = [];
  const insertMaterials: Array<{ order_id: string; product_id: string; required_qty: number; prepared_qty: number }> = [];

  for (const item of pendingItems) {
    const product = item.products;
    const requiredQty = Number(item.quantity) - Number(item.delivered_qty);
    const bomRecords = bomMap.get(product.id);
    const inventory = invMap.get(product.id);
    const availableQty = inventory ? Number(inventory.quantity) - Number(inventory.reserved_qty || 0) : 0;
    const hasBOM = bomRecords && bomRecords.length > 0;

    if (hasBOM && availableQty >= requiredQty) {
      // 有BOM + 库存充足 → 预扣
      if (inventory) {
        const invId = inventory.id;
        const newReserved = Number(inventory.reserved_qty || 0) + requiredQty;
        updateOps.push(async () => { await db.from('inventory').update({ reserved_qty: newReserved }).eq('id', invId); });
      }
      const itemId = item.id;
      const newItemReserved = Number(item.reserved_qty || 0) + requiredQty;
      updateOps.push(async () => { await db.from('customer_order_items').update({ reserved_qty: newItemReserved }).eq('id', itemId); });
      result.reserved.push({ product_id: product.id, product_name: product.name, quantity: requiredQty });
    } else {
      // 库存不足 → 生成生产订单
      const orderNo = `PO-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
      const productionQty = hasBOM ? requiredQty : (requiredQty - availableQty);

      const { data: prodOrder, error: prodError } = await db
        .from('production_orders')
        .insert({
          order_no: orderNo,
          product_id: product.id,
          quantity: productionQty,
          status: 'pending',
          due_date: item.deadline || item.delivery_date || order.deadline || null,
          customer_id: order.customer_id,
          customer_order_id: orderId,
          customer_order_item_id: item.id,
        })
        .select()
        .single();

      if (prodError) {
        console.error('创建生产订单失败:', prodError.message);
        continue;
      }

      if (hasBOM) {
        for (const bomItem of bomRecords!) {
          insertMaterials.push({
            order_id: prodOrder.id,
            product_id: bomItem.child_product_id,
            required_qty: Number(bomItem.quantity) * requiredQty,
            prepared_qty: 0,
          });
        }
      }

      if (availableQty > 0 && inventory) {
        const invId = inventory.id;
        const newReserved = Number(inventory.reserved_qty || 0) + availableQty;
        updateOps.push(async () => { await db.from('inventory').update({ reserved_qty: newReserved }).eq('id', invId); });
        const itemId = item.id;
        const newItemReserved = Number(item.reserved_qty || 0) + availableQty;
        updateOps.push(async () => { await db.from('customer_order_items').update({ reserved_qty: newItemReserved }).eq('id', itemId); });
        result.reserved.push({ product_id: product.id, product_name: product.name, quantity: availableQty });
      }

      result.produced.push({ product_id: product.id, product_name: product.name, quantity: productionQty, production_order_id: prodOrder.id });
    }
  }

  // 3. 并行执行所有写操作
  const batchPromises = updateOps.map(fn => fn());
  if (insertMaterials.length > 0) {
    batchPromises.push((async () => { await db.from('production_order_materials').insert(insertMaterials); })());
  }
  if (result.produced.length > 0 || result.reserved.length > 0) {
    batchPromises.push((async () => { await db.from('customer_orders').update({ status: 'confirmed' }).eq('id', orderId); })());
  }
  await Promise.all(batchPromises);

  return result;
}
