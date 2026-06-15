import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest) {
  const client = getSupabaseClient();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (id) {
    const { data, error } = await client
      .from('delivery_notes')
      .select('*, delivery_note_items(*, products(id, code, name, spec, unit), customer_order_items(id, order_id, customer_orders(id, order_no))), customer_orders(id, order_no)')
      .eq('id', id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  let query = client
    .from('delivery_notes')
    .select('*, delivery_note_items(count), customer_orders(id, order_no)')
    .order('created_at', { ascending: false });

  const { data, error } = await query.limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const client = getSupabaseClient();
  const body = await request.json();
  const { items, customer_order_id, warehouse_id, note_no: _incomingNoteNo, ...noteFields } = body;

  // 自动生成送货单号: XS + 月份(2位) + 序号(6位)，如 XS06000001
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const prefix = `XS${month}`;

  // 查询当前月份已有的最大编号
  const { data: existingNotes } = await client
    .from('delivery_notes')
    .select('note_no')
    .like('note_no', `${prefix}%`)
    .order('note_no', { ascending: false })
    .limit(1);

  let seq = 1;
  if (existingNotes && existingNotes.length > 0) {
    const lastNo = existingNotes[0].note_no as string;
    const lastSeq = parseInt(lastNo.slice(prefix.length), 10);
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }
  const autoNoteNo = `${prefix}${String(seq).padStart(6, '0')}`;

  const insertData: Record<string, unknown> = { ...noteFields, note_no: autoNoteNo };
  if (customer_order_id) insertData.customer_order_id = customer_order_id;
  // 确保 warehouse_id 被保存
  if (warehouse_id) insertData.warehouse_id = warehouse_id;

  const { data: note, error: nErr } = await client
    .from('delivery_notes')
    .insert(insertData)
    .select()
    .maybeSingle();
  if (nErr) return NextResponse.json({ error: nErr.message }, { status: 500 });
  if (!note) return NextResponse.json({ error: '创建送货单失败' }, { status: 500 });

  if (items && items.length > 0) {
    const itemsWithNoteId = items.map((item: Record<string, unknown>) => ({
      ...item,
      note_id: note.id,
    }));
    const { error: iErr } = await client.from('delivery_note_items').insert(itemsWithNoteId);
    if (iErr) return NextResponse.json({ error: iErr.message }, { status: 500 });
  }

  // 如果关联了客户订单且状态改为 shipped → 出库扣减库存
  const effectiveWarehouseId = warehouse_id || note.warehouse_id;
  if (note.status === 'shipped' && effectiveWarehouseId) {
    await handleShipment(client, note.id, effectiveWarehouseId, items);
  }

  const { data: fullNote, error: fErr } = await client
    .from('delivery_notes')
    .select('*, delivery_note_items(*, products(id, code, name, spec, unit)), customer_orders(id, order_no)')
    .eq('id', note.id)
    .maybeSingle();
  if (fErr) return NextResponse.json({ error: fErr.message }, { status: 500 });

  return NextResponse.json(fullNote, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const client = getSupabaseClient();
  const body = await request.json();
  const { id, items, warehouse_id, ...updates } = body;
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });

  // 获取修改前的状态
  const { data: beforeNote } = await client
    .from('delivery_notes')
    .select('status, warehouse_id, note_no')
    .eq('id', id)
    .maybeSingle();

  // 如果 note_no 为空或不存在，自动生成
  if (!updates.note_no || (typeof updates.note_no === 'string' && updates.note_no.trim() === '')) {
    delete updates.note_no;
    if (!beforeNote?.note_no) {
      const now = new Date();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const prefix = `XS${month}`;
      const { data: existingNotes } = await client
        .from('delivery_notes')
        .select('note_no')
        .like('note_no', `${prefix}%`)
        .order('note_no', { ascending: false })
        .limit(1);
      let seq = 1;
      if (existingNotes && existingNotes.length > 0) {
        const lastNo = existingNotes[0].note_no as string;
        const lastSeq = parseInt(lastNo.slice(prefix.length), 10);
        if (!isNaN(lastSeq)) seq = lastSeq + 1;
      }
      updates.note_no = `${prefix}${String(seq).padStart(6, '0')}`;
    }
  }

  // 确保 warehouse_id 被更新
  if (warehouse_id) updates.warehouse_id = warehouse_id;

  const { error: nErr } = await client.from('delivery_notes').update(updates).eq('id', id);
  if (nErr) return NextResponse.json({ error: nErr.message }, { status: 500 });

  if (items) {
    await client.from('delivery_note_items').delete().eq('note_id', id);
    if (items.length > 0) {
      const itemsWithNoteId = items.map((item: Record<string, unknown>) => ({
        ...item,
        note_id: id,
      }));
      await client.from('delivery_note_items').insert(itemsWithNoteId);
    }
  }

  // 如果状态从 draft → shipped → 出库扣减
  if (beforeNote && beforeNote.status !== 'shipped' && updates.status === 'shipped') {
    const whId = warehouse_id || beforeNote.warehouse_id;
    if (whId) {
      const { data: currentItems } = await client
        .from('delivery_note_items')
        .select('*')
        .eq('note_id', id);
      await handleShipment(client, id, whId, currentItems);
    }
  }

  const { data: fullNote, error: fErr } = await client
    .from('delivery_notes')
    .select('*, delivery_note_items(*, products(id, code, name, spec, unit)), customer_orders(id, order_no)')
    .eq('id', id)
    .maybeSingle();
  if (fErr) return NextResponse.json({ error: fErr.message }, { status: 500 });

  return NextResponse.json(fullNote);
}

export async function DELETE(request: NextRequest) {
  const client = getSupabaseClient();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });

  // 获取送货单详情（状态、仓库、明细），用于回退库存
  const { data: note } = await client
    .from('delivery_notes')
    .select('status, warehouse_id')
    .eq('id', id)
    .maybeSingle();

  // 如果已出库（shipped），需要回退库存和客户订单已交量
  if (note?.status === 'shipped' && note.warehouse_id) {
    const { data: items } = await client
      .from('delivery_note_items')
      .select('*')
      .eq('note_id', id);

    if (items && items.length > 0) {
      await handleShipmentRollback(client, id, note.warehouse_id, items);
    }
  }

  const { error } = await client.from('delivery_notes').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// 安全执行 Supabase 更新：PostgrestFilterBuilder 不是原生 Promise，必须 await 逐条执行
async function safeUpdate(
  client: ReturnType<typeof getSupabaseClient>,
  table: string,
  data: Record<string, unknown>,
  match: Record<string, string>
): Promise<void> {
  const { error } = await client.from(table).update(data).match(match);
  if (error) {
    console.error(`[delivery] 更新 ${table} 失败:`, error.message, { data, match });
  }
}

// 出库回退：恢复库存 + 恢复预扣 + 回退客户订单已交量（删除已出库送货单时调用）
async function handleShipmentRollback(
  client: ReturnType<typeof getSupabaseClient>,
  noteId: string,
  warehouseId: string,
  items: Array<Record<string, unknown>>
) {
  if (items.length === 0) return;

  const productIds = items.map(it => it.product_id as string).filter(Boolean);
  const orderItemIds = items.map(it => it.customer_order_item_id as string).filter(Boolean);

  const invResult = await client
    .from('inventory')
    .select('id, product_id, quantity, reserved_qty')
    .eq('warehouse_id', warehouseId)
    .in('product_id', productIds);

  const orderItemsResult = orderItemIds.length > 0
    ? await client.from('customer_order_items').select('id, delivered_qty, reserved_qty, quantity').in('id', orderItemIds)
    : { data: [] as Array<Record<string, unknown>> | null };

  const invMap = new Map((invResult.data || []).map((inv: Record<string, unknown>) => [inv.product_id as string, inv]));
  const orderItemMap = new Map((orderItemsResult.data || []).map((oi: Record<string, unknown>) => [oi.id as string, oi]));

  // 逐条执行更新，确保每条都真正写入数据库
  for (const item of items) {
    const productId = item.product_id as string;
    const quantity = Number(item.quantity || 0);
    if (!productId || quantity <= 0) continue;

    // 回退库存：加回 quantity 和 reserved_qty
    const inv = invMap.get(productId);
    if (inv) {
      await safeUpdate(client, 'inventory', {
        quantity: Number(inv.quantity) + quantity,
        reserved_qty: Number(inv.reserved_qty || 0) + quantity,
      }, { id: inv.id as string });
    }

    // 回退客户订单：减少已交量，恢复预留量
    const orderItemId = item.customer_order_item_id as string;
    if (orderItemId) {
      const orderItem = orderItemMap.get(orderItemId);
      if (orderItem) {
        await safeUpdate(client, 'customer_order_items', {
          delivered_qty: Math.max(0, Number(orderItem.delivered_qty || 0) - quantity),
          reserved_qty: Number(orderItem.reserved_qty || 0) + quantity,
        }, { id: orderItem.id as string });
      }
    }
  }
}

// 出库处理：扣减库存 + 释放预扣 + 更新客户订单已交量
async function handleShipment(
  client: ReturnType<typeof getSupabaseClient>,
  noteId: string,
  warehouseId: string,
  items: Array<Record<string, unknown>> | null
) {
  if (!items || items.length === 0) {
    const { data } = await client
      .from('delivery_note_items')
      .select('*')
      .eq('note_id', noteId);
    items = data || [];
  }

  if (items.length === 0) return;

  // 批量获取所有涉及的产品库存和订单明细，避免 N+1 循环查询
  const productIds = items.map(it => it.product_id as string).filter(Boolean);
  const orderItemIds = items.map(it => it.customer_order_item_id as string).filter(Boolean);

  const invResult = await client
    .from('inventory')
    .select('id, product_id, quantity, reserved_qty')
    .eq('warehouse_id', warehouseId)
    .in('product_id', productIds);

  const orderItemsResult = orderItemIds.length > 0
    ? await client.from('customer_order_items').select('id, delivered_qty, reserved_qty, quantity').in('id', orderItemIds)
    : { data: [] as Array<Record<string, unknown>> | null };

  // 构建查找 Map
  const invMap = new Map((invResult.data || []).map((inv: Record<string, unknown>) => [inv.product_id as string, inv]));
  const orderItemMap = new Map((orderItemsResult.data || []).map((oi: Record<string, unknown>) => [oi.id as string, oi]));

  // 逐条执行更新，确保每条都真正写入数据库
  for (const item of items) {
    const productId = item.product_id as string;
    const quantity = Number(item.quantity || 0);
    if (!productId || quantity <= 0) continue;

    const inv = invMap.get(productId);
    if (inv) {
      await safeUpdate(client, 'inventory', {
        quantity: Math.max(0, Number(inv.quantity) - quantity),
        reserved_qty: Math.max(0, Number(inv.reserved_qty || 0) - quantity),
      }, { id: inv.id as string });
    }

    const orderItemId = item.customer_order_item_id as string;
    if (orderItemId) {
      const orderItem = orderItemMap.get(orderItemId);
      if (orderItem) {
        await safeUpdate(client, 'customer_order_items', {
          delivered_qty: Number(orderItem.delivered_qty || 0) + quantity,
          reserved_qty: Math.max(0, Number(orderItem.reserved_qty || 0) - quantity),
        }, { id: orderItem.id as string });
      }
    }
  }
}
