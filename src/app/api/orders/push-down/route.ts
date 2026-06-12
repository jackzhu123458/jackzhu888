import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

interface BomRow { parent_product_id: string; child_product_id: string; quantity: number }
interface InvRow { id: string; product_id: string; warehouse_id: string; quantity: number; reserved_qty: number }

export async function POST(req: NextRequest) {
  try {
    const { order_id } = await req.json();
    if (!order_id) return NextResponse.json({ error: '缺少 order_id' }, { status: 400 });

    const supabase = getSupabaseClient();

    // 1. 并行查询订单详情+BOM+库存
    const [orderRes, bomRes, invRes] = await Promise.all([
      supabase.from('customer_orders').select('*, customer_order_items(*, products(id, code, name, spec, unit, type, category))').eq('id', order_id).single(),
      supabase.from('bom').select('parent_product_id, child_product_id, quantity'),
      supabase.from('inventory').select('id, product_id, warehouse_id, quantity, reserved_qty'),
    ]);

    const order = orderRes.data;
    if (!order) return NextResponse.json({ error: '订单不存在' }, { status: 404 });

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
      return NextResponse.json({ message: '无待处理物料', reserved: [], produced: [], shortage: [] });
    }

    const result = {
      reserved: [] as Array<{ product_id: string; product_name: string; quantity: number }>,
      produced: [] as Array<{ product_id: string; product_name: string; quantity: number; production_order_id: string }>,
      shortage: [] as Array<{ product_id: string; product_name: string; required: number; available: number }>,
    };

    // 2. 收集所有写操作（async 函数）
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
          updateOps.push(async () => { await supabase.from('inventory').update({ reserved_qty: newReserved }).eq('id', invId); });
        }
        const itemId = item.id;
        const newItemReserved = Number(item.reserved_qty || 0) + requiredQty;
        updateOps.push(async () => { await supabase.from('customer_order_items').update({ reserved_qty: newItemReserved }).eq('id', itemId); });
        result.reserved.push({ product_id: product.id, product_name: product.name, quantity: requiredQty });
      } else {
        // 库存不足 → 生成生产订单
        const orderNo = `PO-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
        const productionQty = hasBOM ? requiredQty : (requiredQty - availableQty);

        const { data: prodOrder, error: prodError } = await supabase
          .from('production_orders')
          .insert({
            order_no: orderNo,
            product_id: product.id,
            quantity: productionQty,
            status: 'pending',
            due_date: item.deadline || item.delivery_date || order.deadline || null,
            customer_id: order.customer_id,
            customer_order_id: order_id,
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
          updateOps.push(async () => { await supabase.from('inventory').update({ reserved_qty: newReserved }).eq('id', invId); });
          const itemId = item.id;
          const newItemReserved = Number(item.reserved_qty || 0) + availableQty;
          updateOps.push(async () => { await supabase.from('customer_order_items').update({ reserved_qty: newItemReserved }).eq('id', itemId); });
          result.reserved.push({ product_id: product.id, product_name: product.name, quantity: availableQty });
        }

        result.produced.push({ product_id: product.id, product_name: product.name, quantity: productionQty, production_order_id: prodOrder.id });
      }
    }

    // 3. 并行执行所有写操作
    const batchPromises = updateOps.map(fn => fn());
    if (insertMaterials.length > 0) {
      batchPromises.push((async () => { await supabase.from('production_order_materials').insert(insertMaterials); })());
    }
    if (result.produced.length > 0 || result.reserved.length > 0) {
      batchPromises.push((async () => { await supabase.from('customer_orders').update({ status: 'confirmed' }).eq('id', order_id); })());
    }
    await Promise.all(batchPromises);

    return NextResponse.json(result);
  } catch (err) {
    console.error('下推失败:', err);
    return NextResponse.json({ error: '下推失败' }, { status: 500 });
  }
}
