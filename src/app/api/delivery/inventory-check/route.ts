import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest) {
  const client = getSupabaseClient();
  const { searchParams } = new URL(request.url);
  const noteId = searchParams.get('note_id');
  if (!noteId) return NextResponse.json({ error: '缺少 note_id' }, { status: 400 });

  // 1. 获取送货单明细
  const { data: items, error: itemsErr } = await client
    .from('delivery_note_items')
    .select('product_id, quantity, products(id, code, name)')
    .eq('note_id', noteId);
  if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 500 });
  if (!items || items.length === 0) return NextResponse.json({ product_stocks: [] });

  // 2. 获取所有仓库
  const { data: warehouses } = await client
    .from('warehouses')
    .select('id, name');

  const warehouseMap = new Map((warehouses || []).map((w: { id: string; name: string }) => [w.id, w.name]));

  // 3. 获取所有涉及产品的库存
  const productIds = items.map((it: { product_id: string }) => it.product_id).filter(Boolean);
  const { data: inventories } = await client
    .from('inventory')
    .select('product_id, warehouse_id, quantity, reserved_qty')
    .in('product_id', productIds);

  // 按 product_id 分组库存
  const invByProduct = new Map<string, Array<{
    warehouse_id: string;
    warehouse_name: string;
    quantity: number;
    reserved_qty: number;
    available: number;
  }>>();

  for (const inv of (inventories || [])) {
    const pid = inv.product_id as string;
    const wid = inv.warehouse_id as string;
    const qty = Number(inv.quantity) || 0;
    const reserved = Number(inv.reserved_qty) || 0;
    // 出货时预留量正是为本单预留的，所以实际可出货量 = 总库存
    const available = qty;

    if (!invByProduct.has(pid)) invByProduct.set(pid, []);
    invByProduct.get(pid)!.push({
      warehouse_id: wid,
      warehouse_name: warehouseMap.get(wid) || wid,
      quantity: qty,
      reserved_qty: reserved,
      available,
    });
  }

  // 4. 组装结果
  const productStocks = items.map((it: { product_id: string; quantity: number; products: unknown }) => {
    const prod = it.products as Record<string, string> | null;
    const stocks = invByProduct.get(it.product_id) || [];

    // 按总库存降序排列
    stocks.sort((a, b) => b.quantity - a.quantity);

    // 自动选择：优先有库存的仓库
    const selectedWh = stocks.find(s => s.quantity > 0)?.warehouse_id || stocks[0]?.warehouse_id || '';

    return {
      product_id: it.product_id,
      product_name: prod?.name || '',
      product_code: prod?.code || '',
      required_qty: Number(it.quantity) || 0,
      stocks,
      selected_warehouse_id: selectedWh,
    };
  });

  return NextResponse.json({ product_stocks: productStocks });
}
