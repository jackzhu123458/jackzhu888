import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest) {
  const client = getSupabaseClient();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (id) {
    const { data, error } = await client
      .from('delivery_notes')
      .select('*, delivery_note_items(*, products(id, code, name, spec, unit)), customer_orders(id, order_no)')
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
  const { items, customer_order_id, warehouse_id, ...noteFields } = body;

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
  if (note.status === 'shipped' && warehouse_id) {
    await handleShipment(client, note.id, warehouse_id, items);
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
    .select('status, warehouse_id')
    .eq('id', id)
    .maybeSingle();

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
  const { error } = await client.from('delivery_notes').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
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

  const [invResult, orderItemsResult] = await Promise.all([
    client.from('inventory').select('id, product_id, quantity, reserved_qty').eq('warehouse_id', warehouseId).in('product_id', productIds),
    orderItemIds.length > 0
      ? client.from('customer_order_items').select('id, delivered_qty, reserved_qty, quantity').in('id', orderItemIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> | null })
  ]);

  // 构建查找 Map
  const invMap = new Map((invResult.data || []).map((inv: Record<string, unknown>) => [inv.product_id as string, inv]));
  const orderItemMap = new Map((orderItemsResult.data || []).map((oi: Record<string, unknown>) => [oi.id as string, oi]));

  // 批量更新库存和订单明细
  const invUpdates: Array<{ id: string; quantity: number; reserved_qty: number }> = [];
  const orderUpdates: Array<{ id: string; delivered_qty: number; reserved_qty: number }> = [];

  for (const item of items) {
    const productId = item.product_id as string;
    const quantity = Number(item.quantity || 0);
    if (!productId || quantity <= 0) continue;

    const inv = invMap.get(productId);
    if (inv) {
      invUpdates.push({
        id: inv.id as string,
        quantity: Math.max(0, Number(inv.quantity) - quantity),
        reserved_qty: Math.max(0, Number(inv.reserved_qty || 0) - quantity),
      });
    }

    const orderItemId = item.customer_order_item_id as string;
    if (orderItemId) {
      const orderItem = orderItemMap.get(orderItemId);
      if (orderItem) {
        orderUpdates.push({
          id: orderItem.id as string,
          delivered_qty: Number(orderItem.delivered_qty || 0) + quantity,
          reserved_qty: Math.max(0, Number(orderItem.reserved_qty || 0) - quantity),
        });
      }
    }
  }

  // 并行执行所有更新
  await Promise.all([
    ...invUpdates.map(u => client.from('inventory').update({ quantity: u.quantity, reserved_qty: u.reserved_qty }).eq('id', u.id)),
    ...orderUpdates.map(u => client.from('customer_order_items').update({ delivered_qty: u.delivered_qty, reserved_qty: u.reserved_qty }).eq('id', u.id)),
  ]);
}
