import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// POST /api/orders/push-down - 客户订单下推：检查库存/BOM → 生成生产订单或预扣库存
export async function POST(request: NextRequest) {
  const supabase = getSupabaseClient();
  const body = await request.json();

  const { order_id, warehouse_id } = body;
  if (!order_id || !warehouse_id) {
    return NextResponse.json({ error: '缺少订单ID或仓库ID' }, { status: 400 });
  }

  // 1. 获取客户订单及其明细
  const { data: order, error: orderError } = await supabase
    .from('customer_orders')
    .select('*, customer_order_items(*, products(id, code, name, spec, unit, type)), customers(id, name, code)')
    .eq('id', order_id)
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: '订单不存在' }, { status: 404 });
  }

  const result = {
    produced: [] as Array<{ product_id: string; product_name: string; quantity: number; production_order_id: string }>,
    reserved: [] as Array<{ product_id: string; product_name: string; quantity: number }>,
    insufficient: [] as Array<{ product_id: string; product_name: string; required: number; available: number; shortage: number }>,
  };

  for (const item of order.customer_order_items) {
    const product = item.products;
    const requiredQty = Number(item.quantity) - Number(item.delivered_qty);

    if (requiredQty <= 0) continue; // 已交完，跳过

    // 2. 检查是否为成品（有BOM的）还是原材料
    // 只有当产品本身就是BOM父产品（成品）时，才展开BOM生成生产订单
    // 如果产品是BOM子产品（半成品/零件），按独立产品处理，检查自身库存
    let { data: bomRecords } = await supabase
      .from('bom')
      .select('*, child_product:products!bom_child_product_id_products_id_fk(id, code, name, spec, unit, type)')
      .eq('parent_product_id', product.id);

    if (bomRecords && bomRecords.length > 0) {
      // 有BOM的成品 → 先检查成品库存，充足则预扣，不足则生成生产订单
      const { data: inventory } = await supabase
        .from('inventory')
        .select('id, quantity, reserved_qty')
        .eq('product_id', product.id)
        .eq('warehouse_id', warehouse_id)
        .maybeSingle();

      const availableQty = inventory ? Number(inventory.quantity) - Number(inventory.reserved_qty || 0) : 0;

      if (availableQty >= requiredQty) {
        // 库存充足 → 预扣库存
        if (inventory) {
          await supabase
            .from('inventory')
            .update({
              reserved_qty: Number(inventory.reserved_qty || 0) + requiredQty,
            })
            .eq('id', inventory.id);
        }

        // 更新订单明细的预扣状态
        await supabase
          .from('customer_order_items')
          .update({ reserved_qty: Number(item.reserved_qty || 0) + requiredQty })
          .eq('id', item.id);

        result.reserved.push({
          product_id: product.id,
          product_name: product.name,
          quantity: requiredQty,
        });
      } else {
        // 库存不足 → 生成生产订单
        const orderNo = `PO-${Date.now().toString(36).toUpperCase()}`;

        const { data: prodOrder, error: prodError } = await supabase
          .from('production_orders')
          .insert({
            order_no: orderNo,
            product_id: product.id,
            quantity: requiredQty,
            status: 'pending',
            due_date: item.deadline || order.deadline || null,
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

        // 创建生产订单用料明细（从BOM展开）
        const materials = bomRecords.map((bomItem: { child_product_id: string; quantity: number }) => ({
          order_id: prodOrder.id,
          product_id: bomItem.child_product_id,
          required_qty: Number(bomItem.quantity) * requiredQty,
          prepared_qty: 0,
        }));

        await supabase.from('production_order_materials').insert(materials);

        // 如果有部分库存，先预扣可用部分
        if (availableQty > 0 && inventory) {
          await supabase
            .from('inventory')
            .update({
              reserved_qty: Number(inventory.reserved_qty || 0) + availableQty,
            })
            .eq('id', inventory.id);

          await supabase
            .from('customer_order_items')
            .update({ reserved_qty: Number(item.reserved_qty || 0) + availableQty })
            .eq('id', item.id);
        }

        result.produced.push({
          product_id: product.id,
          product_name: product.name,
          quantity: requiredQty,
          production_order_id: prodOrder.id,
        });
      }
    } else {
      // 无BOM的产品（半成品/零件）→ 检查库存，不足则生成生产订单
      const { data: inventory } = await supabase
        .from('inventory')
        .select('id, quantity, reserved_qty')
        .eq('product_id', product.id)
        .eq('warehouse_id', warehouse_id)
        .maybeSingle();

      const availableQty = inventory ? Number(inventory.quantity) - Number(inventory.reserved_qty || 0) : 0;

      if (availableQty >= requiredQty) {
        // 库存充足 → 预扣库存
        if (inventory) {
          await supabase
            .from('inventory')
            .update({
              reserved_qty: Number(inventory.reserved_qty || 0) + requiredQty,
            })
            .eq('id', inventory.id);
        }

        await supabase
          .from('customer_order_items')
          .update({ reserved_qty: Number(item.reserved_qty || 0) + requiredQty })
          .eq('id', item.id);

        result.reserved.push({
          product_id: product.id,
          product_name: product.name,
          quantity: requiredQty,
        });
      } else {
        // 库存不足 → 生成生产订单（无BOM，用料清单为空）
        const orderNo = `PO-${Date.now().toString(36).toUpperCase()}`;

        // 有部分库存时先预扣可用部分
        if (availableQty > 0 && inventory) {
          await supabase
            .from('inventory')
            .update({
              reserved_qty: Number(inventory.reserved_qty || 0) + availableQty,
            })
            .eq('id', inventory.id);
          await supabase
            .from('customer_order_items')
            .update({ reserved_qty: Number(item.reserved_qty || 0) + availableQty })
            .eq('id', item.id);
        }

        const productionQty = requiredQty - availableQty;

        const { data: newOrder } = await supabase
          .from('production_orders')
          .insert({
            order_no: orderNo,
            customer_id: order.customer_id,
            customer_order_id: order.id,
            customer_order_item_id: item.id,
            product_id: product.id,
            quantity: productionQty,
            status: 'pending',
            due_date: item.delivery_date || null,
          })
          .select()
          .single();

        result.produced.push({
          product_id: product.id,
          product_name: product.name,
          quantity: productionQty,
          production_order_id: newOrder?.id,
        });

        if (availableQty > 0) {
          result.reserved.push({
            product_id: product.id,
            product_name: product.name,
            quantity: availableQty,
          });
        }
      }
    }
  }

  // 更新订单状态为"已确认"
  if (result.produced.length > 0 || result.reserved.length > 0) {
    await supabase
      .from('customer_orders')
      .update({ status: 'confirmed' })
      .eq('id', order_id);
  }

  return NextResponse.json(result, { status: 200 });
}
