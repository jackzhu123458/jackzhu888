import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// POST /api/production/complete - 生产订单完成 → 自动入库
export async function POST(request: NextRequest) {
  const supabase = getSupabaseClient();
  const body = await request.json();

  const { order_id, warehouse_id } = body;
  if (!order_id || !warehouse_id) {
    return NextResponse.json({ error: '缺少生产订单ID或仓库ID' }, { status: 400 });
  }

  // 1. 获取生产订单
  const { data: prodOrder, error: orderError } = await supabase
    .from('production_orders')
    .select('*, products(id, code, name, spec, unit)')
    .eq('id', order_id)
    .single();

  if (orderError || !prodOrder) {
    return NextResponse.json({ error: '生产订单不存在' }, { status: 404 });
  }

  if (prodOrder.status === 'completed') {
    return NextResponse.json({ error: '该订单已完成' }, { status: 400 });
  }

  // 2. 更新生产订单状态为已完成
  const { error: updateError } = await supabase
    .from('production_orders')
    .update({ status: 'completed' })
    .eq('id', order_id);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  // 3. 创建入库单
  const noteNo = `IN-${Date.now().toString(36).toUpperCase()}`;
  const { data: inboundNote, error: noteError } = await supabase
    .from('inbound_notes')
    .insert({
      note_no: noteNo,
      production_order_id: order_id,
      warehouse_id,
      status: 'confirmed',
      remark: `生产订单 ${prodOrder.order_no} 完工入库`,
    })
    .select()
    .single();

  if (noteError) return NextResponse.json({ error: noteError.message }, { status: 500 });

  // 4. 创建入库明细 - 成品入库
  const { data: inboundItem, error: itemError } = await supabase
    .from('inbound_note_items')
    .insert({
      note_id: inboundNote.id,
      product_id: prodOrder.product_id,
      quantity: prodOrder.quantity,
      remark: '成品入库',
    })
    .select()
    .single();

  if (itemError) return NextResponse.json({ error: itemError.message }, { status: 500 });

  // 5. 更新库存 - 成品入库
  const { data: existingInventory } = await supabase
    .from('inventory')
    .select('id, quantity, reserved_qty')
    .eq('product_id', prodOrder.product_id)
    .eq('warehouse_id', warehouse_id)
    .maybeSingle();

  if (existingInventory) {
    await supabase
      .from('inventory')
      .update({
        quantity: Number(existingInventory.quantity) + Number(prodOrder.quantity),
      })
      .eq('id', existingInventory.id);
  } else {
    await supabase
      .from('inventory')
      .insert({
        product_id: prodOrder.product_id,
        warehouse_id,
        quantity: Number(prodOrder.quantity),
        reserved_qty: 0,
      });
  }

  // 6. 如果关联了客户订单，自动预扣刚入库的成品
  if (prodOrder.customer_order_id && prodOrder.customer_order_item_id) {
    // 预扣库存给客户订单
    const { data: inv } = await supabase
      .from('inventory')
      .select('id, quantity, reserved_qty')
      .eq('product_id', prodOrder.product_id)
      .eq('warehouse_id', warehouse_id)
      .single();

    if (inv) {
      const qty = Number(prodOrder.quantity);
      await supabase
        .from('inventory')
        .update({ reserved_qty: Number(inv.reserved_qty || 0) + qty })
        .eq('id', inv.id);

      // 更新客户订单明细的预扣数量
      await supabase
        .from('customer_order_items')
        .update({ reserved_qty: qty })
        .eq('id', prodOrder.customer_order_item_id);
    }
  }

  // 7. 扣减原材料库存（生产消耗）
  const { data: materials } = await supabase
    .from('production_order_materials')
    .select('*, products(id, code, name)')
    .eq('order_id', order_id);

  if (materials) {
    for (const mat of materials) {
      const { data: matInv } = await supabase
        .from('inventory')
        .select('id, quantity')
        .eq('product_id', mat.product_id)
        .eq('warehouse_id', warehouse_id)
        .maybeSingle();

      if (matInv) {
        const newQty = Math.max(0, Number(matInv.quantity) - Number(mat.required_qty));
        await supabase
          .from('inventory')
          .update({ quantity: newQty })
          .eq('id', matInv.id);
      }

      // 更新备料数量为已备
      await supabase
        .from('production_order_materials')
        .update({ prepared_qty: mat.required_qty })
        .eq('id', mat.id);
    }
  }

  return NextResponse.json({
    message: '生产完成，已自动入库',
    inbound_note: { ...inboundNote, inbound_note_items: [inboundItem] },
    product: prodOrder.products,
    quantity: prodOrder.quantity,
  }, { status: 200 });
}
