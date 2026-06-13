import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET /api/inventory/transactions?product_id=xxx
// 查询指定物料的进出记录
export async function GET(request: NextRequest) {
  const supabase = getSupabaseClient();
  const { searchParams } = new URL(request.url);
  const productId = searchParams.get('product_id');

  if (!productId) {
    return NextResponse.json({ error: '缺少 product_id 参数' }, { status: 400 });
  }

  const transactions: Array<{
    id: string;
    date: string;
    type: 'inbound' | 'outbound';
    note_no: string;
    quantity: number;
    warehouse: string;
    remark: string | null;
    related_order: string | null;
  }> = [];

  // 查询入库记录
  const { data: inboundItems, error: inErr } = await supabase
    .from('inbound_note_items')
    .select('id, quantity, remark, inbound_notes(id, note_no, type, status, created_at, remark, warehouses(name), production_orders(order_no))')
    .eq('product_id', productId)
    .order('created_at', { ascending: false });

  if (inErr) return NextResponse.json({ error: inErr.message }, { status: 500 });

  for (const item of (inboundItems || [])) {
    const note = item.inbound_notes as unknown as Record<string, unknown>;
    const warehouse = note?.warehouses as unknown as Record<string, string>;
    const prodOrder = note?.production_orders as unknown as Record<string, string> | null;
    transactions.push({
      id: item.id,
      date: (note?.created_at as string) || '',
      type: 'inbound',
      note_no: (note?.note_no as string) || '',
      quantity: Number(item.quantity),
      warehouse: warehouse?.name || '-',
      remark: item.remark || (note?.remark as string) || null,
      related_order: prodOrder?.order_no || null,
    });
  }

  // 查询出库记录（只统计已出库 shipped 状态的送货单明细）
  const { data: deliveryItems, error: delErr } = await supabase
    .from('delivery_note_items')
    .select('id, quantity, remark, delivery_notes!inner(id, note_no, status, delivery_date, customer_name, warehouses(name), customer_orders(order_no))')
    .eq('product_id', productId)
    .eq('delivery_notes.status', 'shipped')
    .order('created_at', { ascending: false });

  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  for (const item of (deliveryItems || [])) {
    const note = item.delivery_notes as unknown as Record<string, unknown>;
    const warehouse = note?.warehouses as unknown as Record<string, string>;
    const custOrder = note?.customer_orders as unknown as Record<string, string> | null;
    transactions.push({
      id: item.id,
      date: (note?.delivery_date as string) || (note?.created_at as string) || '',
      type: 'outbound',
      note_no: (note?.note_no as string) || '',
      quantity: Number(item.quantity),
      warehouse: warehouse?.name || '-',
      remark: item.remark || null,
      related_order: custOrder?.order_no || (note?.customer_name as string) || null,
    });
  }

  // 按日期降序排列
  transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return NextResponse.json(transactions);
}
