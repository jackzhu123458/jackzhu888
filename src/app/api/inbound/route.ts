import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET /api/inbound - 查询入库单列表
export async function GET(request: NextRequest) {
  const supabase = getSupabaseClient();
  const { searchParams } = new URL(request.url);
  const productionOrderId = searchParams.get('production_order_id');
  const id = searchParams.get('id');

  // 单条查询
  if (id) {
    const { data, error } = await supabase
      .from('inbound_notes')
      .select('*, warehouses(id, name, location), inbound_note_items(*, products(id, code, name, spec, unit, location_no))')
      .eq('id', id)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  let query = supabase
    .from('inbound_notes')
    .select('*, warehouses(id, name, location), inbound_note_items(*, products(id, code, name, spec, unit, location_no))')
    .order('created_at', { ascending: false });

  if (productionOrderId) {
    query = query.eq('production_order_id', productionOrderId);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST /api/inbound - 创建入库单
export async function POST(request: NextRequest) {
  const supabase = getSupabaseClient();
  const body = await request.json();

  const { note_no, production_order_id, warehouse_id, items, remark, type, operator } = body;

  if (!warehouse_id || !items?.length) {
    return NextResponse.json({ error: '缺少必要字段' }, { status: 400 });
  }

  // 自动生成入库单号
  const autoNoteNo = note_no || `IN${Date.now().toString(36).toUpperCase()}`;

  // 创建入库单主表
  const { data: note, error: noteError } = await supabase
    .from('inbound_notes')
    .insert({
      note_no: autoNoteNo,
      production_order_id: production_order_id || null,
      warehouse_id,
      type: type || 'other',
      operator: operator || null,
      status: 'confirmed',
      remark: remark || null,
    })
    .select()
    .single();

  if (noteError) return NextResponse.json({ error: noteError.message }, { status: 500 });

  // 创建入库明细
  const inboundItems = items.map((item: { product_id: string; quantity: number; remark?: string }) => ({
    note_id: note.id,
    product_id: item.product_id,
    quantity: item.quantity,
    remark: item.remark || null,
  }));

  const { data: insertedItems, error: itemsError } = await supabase
    .from('inbound_note_items')
    .insert(inboundItems)
    .select('*, products(id, code, name, spec, unit, location_no)');

  if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 });

  // 入库确认 → 更新库存
  for (const item of items) {
    // 查找现有库存记录
    const { data: existing } = await supabase
      .from('inventory')
      .select('id, quantity')
      .eq('product_id', item.product_id)
      .eq('warehouse_id', warehouse_id)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('inventory')
        .update({ quantity: Number(existing.quantity) + Number(item.quantity) })
        .eq('id', existing.id);
    } else {
      await supabase
        .from('inventory')
        .insert({
          product_id: item.product_id,
          warehouse_id,
          quantity: Number(item.quantity),
          reserved_qty: 0,
        });
    }
  }

  return NextResponse.json({ ...note, inbound_note_items: insertedItems }, { status: 201 });
}

// PUT /api/inbound - 更新入库单（仅pending状态可编辑）
export async function PUT(request: NextRequest) {
  const supabase = getSupabaseClient();
  const body = await request.json();
  const { id, warehouse_id, remark, items, operator } = body;

  if (!id) return NextResponse.json({ error: '缺少入库单ID' }, { status: 400 });

  // 检查状态
  const { data: existing } = await supabase.from('inbound_notes').select('status, warehouse_id').eq('id', id).single();
  if (!existing) return NextResponse.json({ error: '入库单不存在' }, { status: 404 });
  if (existing.status === 'completed') return NextResponse.json({ error: '已入库的单据不能修改' }, { status: 400 });

  // 更新主表
  const updates: Record<string, unknown> = {};
  if (warehouse_id) updates.warehouse_id = warehouse_id;
  if (remark !== undefined) updates.remark = remark;
  if (operator !== undefined) updates.operator = operator;

  if (Object.keys(updates).length > 0) {
    const { error: updateError } = await supabase.from('inbound_notes').update(updates).eq('id', id);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // 更新明细（如果提供了items）
  if (items && Array.isArray(items)) {
    // 先删除旧明细
    await supabase.from('inbound_note_items').delete().eq('note_id', id);

    // 插入新明细
    const newItems = items.map((item: { product_id: string; quantity: number; remark?: string }) => ({
      note_id: id,
      product_id: item.product_id,
      quantity: item.quantity,
      remark: item.remark || null,
    }));

    const { error: insertError } = await supabase
      .from('inbound_note_items')
      .insert(newItems);
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // 返回更新后的完整数据
  const { data: updated, error: fetchError } = await supabase
    .from('inbound_notes')
    .select('*, warehouses(id, name, location), inbound_note_items(*, products(id, code, name, spec, unit, location_no))')
    .eq('id', id)
    .single();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });

  return NextResponse.json(updated);
}

// DELETE /api/inbound?id=xxx - 删除入库单（仅pending/confirmed状态可删除）
export async function DELETE(request: NextRequest) {
  const supabase = getSupabaseClient();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });

  // 检查状态
  const { data: note } = await supabase.from('inbound_notes').select('status').eq('id', id).single();
  if (!note) return NextResponse.json({ error: '入库单不存在' }, { status: 404 });
  if (note.status === 'completed') return NextResponse.json({ error: '已入库的单据不能删除' }, { status: 400 });

  // 删除明细
  await supabase.from('inbound_note_items').delete().eq('note_id', id);
  // 删除主表
  const { error } = await supabase.from('inbound_notes').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
