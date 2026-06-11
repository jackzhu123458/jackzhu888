import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET /api/inbound - 查询入库单列表
export async function GET(request: NextRequest) {
  const supabase = getSupabaseClient();
  const { searchParams } = new URL(request.url);
  const productionOrderId = searchParams.get('production_order_id');

  let query = supabase
    .from('inbound_notes')
    .select('*, warehouses(id, name, location), inbound_note_items(*, products(id, code, name, spec, unit))')
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
    .select('*, products(id, code, name, spec, unit))');

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

// DELETE /api/inbound?id=xxx - 删除入库单（仅待入库状态）
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
