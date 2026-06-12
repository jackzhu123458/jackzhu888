import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function POST(req: NextRequest) {
  try {
    const { production_order_id } = await req.json();
    if (!production_order_id) return NextResponse.json({ error: '缺少 production_order_id' }, { status: 400 });

    const supabase = getSupabaseClient();

    // 1. 查询生产订单 + 关联信息（单次查询）
    const { data: prodOrder, error: fetchErr } = await supabase
      .from('production_orders')
      .select('*, customer_orders(id, order_no), production_order_materials(*, products(id, code, name, unit))')
      .eq('id', production_order_id)
      .single();

    if (fetchErr || !prodOrder) return NextResponse.json({ error: '生产订单不存在' }, { status: 404 });
    if (prodOrder.status === 'completed') return NextResponse.json({ error: '订单已完成' }, { status: 400 });

    const updateOps: Array<() => Promise<void>> = [];

    // 2. 更新生产订单状态
    updateOps.push(async () => {
      await supabase.from('production_orders').update({ status: 'completed' }).eq('id', production_order_id);
    });

    // 3. 创建入库单
    const { data: warehouses } = await supabase.from('warehouses').select('id').limit(1);
    const warehouseId = warehouses?.[0]?.id;
    if (!warehouseId) return NextResponse.json({ error: '请先创建仓库' }, { status: 400 });

    const noteNo = `IN-${Date.now().toString(36).toUpperCase()}`;
    const { data: inboundNote } = await supabase
      .from('inbound_notes')
      .insert({ note_no: noteNo, type: 'production', production_order_id, warehouse_id: warehouseId, operator: 'system', status: 'confirmed' })
      .select()
      .single();

    // 4. 成品入库
    if (inboundNote) {
      await supabase.from('inbound_note_items').insert({ note_id: inboundNote.id, product_id: prodOrder.product_id, quantity: prodOrder.quantity });

      // 成品库存 upsert
      const { data: existingInv } = await supabase.from('inventory').select('*').eq('product_id', prodOrder.product_id).eq('warehouse_id', warehouseId).maybeSingle();
      if (existingInv) {
        updateOps.push(async () => {
          await supabase.from('inventory').update({ quantity: Number(existingInv.quantity) + Number(prodOrder.quantity) }).eq('id', existingInv.id);
        });
      } else {
        updateOps.push(async () => {
          await supabase.from('inventory').insert({ product_id: prodOrder.product_id, warehouse_id: warehouseId, quantity: prodOrder.quantity, reserved_qty: 0 });
        });
      }
    }

    // 5. 关联客户订单 → 预扣库存
    if (prodOrder.customer_order_id && inboundNote) {
      const { data: orderItem } = await supabase
        .from('customer_order_items')
        .select('id, quantity, delivered_qty, reserved_qty')
        .eq('id', prodOrder.customer_order_item_id)
        .maybeSingle();

      if (orderItem) {
        // 成品预扣（如果还没预扣过）
        const remainingReserved = Number(orderItem.reserved_qty || 0) - Number(prodOrder.quantity);
        if (remainingReserved < 0) {
          // 需要预扣
          updateOps.push(async () => {
            await supabase.from('customer_order_items').update({ reserved_qty: Number(orderItem.quantity) }).eq('id', orderItem.id);
          });
          // 库存预扣
          const { data: prodInv } = await supabase.from('inventory').select('id, reserved_qty').eq('product_id', prodOrder.product_id).eq('warehouse_id', warehouseId).maybeSingle();
          if (prodInv) {
            const addReserved = Math.min(Number(prodOrder.quantity), Number(orderItem.quantity) - Number(orderItem.reserved_qty || 0));
            updateOps.push(async () => {
              await supabase.from('inventory').update({ reserved_qty: Number(prodInv.reserved_qty || 0) + addReserved }).eq('id', prodInv.id);
            });
          }
        }
      }
    }

    // 6. 扣减原材料库存
    const materials = prodOrder.production_order_materials || [];
    for (const mat of materials) {
      if (!mat.product_id) continue;
      const { data: matInv } = await supabase.from('inventory').select('id, quantity').eq('product_id', mat.product_id).maybeSingle();
      if (matInv) {
        const newQty = Math.max(0, Number(matInv.quantity) - Number(mat.required_qty));
        updateOps.push(async () => {
          await supabase.from('inventory').update({ quantity: newQty }).eq('id', matInv.id);
        });
      }
      // 更新备料状态
      updateOps.push(async () => {
        await supabase.from('production_order_materials').update({ prepared_qty: mat.required_qty }).eq('id', mat.id);
      });
    }

    // 7. 并行执行所有更新
    await Promise.all(updateOps.map(fn => fn()));

    return NextResponse.json({ success: true, message: '生产完成，已自动入库' });
  } catch (err) {
    console.error('完成生产失败:', err);
    return NextResponse.json({ error: '完成生产失败' }, { status: 500 });
  }
}
