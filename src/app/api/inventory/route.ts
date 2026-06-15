import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest) {
  const client = getSupabaseClient();
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');

  // 统计类接口
  if (type === 'heatmap' || type === 'fifo' || type === 'trend') {
    return handleStats(client, type, searchParams);
  }

  // 查询所有产品，左连接库存数据
  // 未有库存记录的产品也显示，数量默认为0
  const { data: products, error: prodError } = await client
    .from('products')
    .select('id, code, name, spec, unit, category, type, price, location_no')
    .eq('is_active', true)
    .order('code', { ascending: true })
    .limit(1000);

  if (prodError) return NextResponse.json({ error: prodError.message }, { status: 500 });

  // 查询所有库存记录
  const { data: inventory, error: invError } = await client
    .from('inventory')
    .select('id, product_id, warehouse_id, quantity, reserved_qty, location_no, products(id), warehouses(id, name)')
    .limit(2000);

  if (invError) return NextResponse.json({ error: invError.message }, { status: 500 });

  // 查询所有仓库
  const { data: warehouses, error: whError } = await client
    .from('warehouses')
    .select('id, name, type')
    .eq('is_active', true);

  if (whError) return NextResponse.json({ error: whError.message }, { status: 500 });

  // 构建库存映射：product_id -> inventory records
  const inventoryMap = new Map<string, typeof inventory>();
  if (inventory) {
    for (const inv of inventory) {
      const pid = inv.product_id as string;
      if (!inventoryMap.has(pid)) {
        inventoryMap.set(pid, []);
      }
      inventoryMap.get(pid)!.push(inv);
    }
  }

  // 合并数据：所有产品都有记录，没库存的数量为0
  const result = (products || []).map(product => {
    const invRecords = inventoryMap.get(product.id) || [];
    const totalQty = invRecords.reduce((sum, inv) => sum + ((inv.quantity as number) || 0), 0);
    const totalReserved = invRecords.reduce((sum, inv) => sum + ((inv.reserved_qty as number) || 0), 0);
    const primaryLocationNo = invRecords.find(inv => inv.location_no)?.location_no || product.location_no || '';

    return {
      product_id: product.id,
      product_code: product.code,
      product_name: product.name,
      product_spec: product.spec,
      product_unit: product.unit,
      product_category: product.category,
      product_type: product.type,
      product_price: product.price,
      product_location_no: primaryLocationNo,
      total_quantity: totalQty,
      total_reserved: totalReserved,
      total_available: totalQty - totalReserved,
      inventory_records: invRecords.map(inv => ({
        id: inv.id,
        warehouse_id: inv.warehouse_id,
        warehouse_name: ((inv.warehouses as unknown as Record<string, unknown>) ?? {})?.name as string || '',
        warehouse_type: warehouses?.find(w => w.id === inv.warehouse_id)?.type || '',
        quantity: (inv.quantity as number) || 0,
        reserved_qty: (inv.reserved_qty as number) || 0,
        available: ((inv.quantity as number) || 0) - ((inv.reserved_qty as number) || 0),
        location_no: inv.location_no || '',
      })),
    };
  });

  return NextResponse.json({ items: result, warehouses: warehouses || [] });
}

async function handleStats(client: ReturnType<typeof getSupabaseClient>, type: string, searchParams: URLSearchParams) {
  if (type === 'heatmap') {
    const { data, error } = await client
      .from('inventory')
      .select('warehouse_id, location_no, quantity, reserved_qty, products(id, code, name), warehouses(id, name)')
      .limit(2000);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const grouped: Record<string, { warehouse_id: string; warehouse_name: string; location_no: string; items: unknown[]; total_qty: number; total_reserved: number }> = {};
    for (const inv of data || []) {
      const key = `${inv.warehouse_id}_${inv.location_no || 'none'}`;
      if (!grouped[key]) {
        const wh = (inv.warehouses as unknown as Record<string, unknown>) ?? {};
        grouped[key] = { warehouse_id: inv.warehouse_id as string, warehouse_name: (wh?.name as string) || '', location_no: (inv.location_no as string) || '未分配', items: [], total_qty: 0, total_reserved: 0 };
      }
      grouped[key].items.push(inv);
      grouped[key].total_qty += (inv.quantity as number) || 0;
      grouped[key].total_reserved += (inv.reserved_qty as number) || 0;
    }
    return NextResponse.json(Object.values(grouped));
  }

  if (type === 'fifo') {
    const { data: invData, error: invError } = await client
      .from('inventory')
      .select('id, product_id, warehouse_id, quantity, reserved_qty, created_at, products(id, code, name, unit, type), warehouses(id, name)')
      .gt('quantity', 0)
      .limit(500);
    if (invError) return NextResponse.json({ error: invError.message }, { status: 500 });

    const { data: inboundData, error: ibError } = await client
      .from('inbound_note_items')
      .select('id, product_id, quantity, created_at, inbound_notes(id, note_no, created_at)')
      .limit(500);
    if (ibError) return NextResponse.json({ error: ibError.message }, { status: 500 });

    const productMap: Record<string, { product_id: string; product_code: string; product_name: string; product_unit: string; product_type: string; total_qty: number; total_reserved: number; batches: unknown[] }> = {};
    for (const inv of invData || []) {
      const pid = inv.product_id as string;
      if (!productMap[pid]) {
        const p = (inv.products as unknown as Record<string, unknown>) ?? {};
        productMap[pid] = { product_id: pid, product_code: (p?.code as string) || '', product_name: (p?.name as string) || '', product_unit: (p?.unit as string) || '', product_type: (p?.type as string) || '', total_qty: 0, total_reserved: 0, batches: [] };
      }
      productMap[pid].total_qty += (inv.quantity as number) || 0;
      productMap[pid].total_reserved += (inv.reserved_qty as number) || 0;
      const wh = (inv.warehouses as unknown as Record<string, unknown>) ?? {};
      productMap[pid].batches.push({ inventory_id: inv.id, warehouse_name: (wh?.name as string) || '', quantity: inv.quantity, reserved_qty: inv.reserved_qty, inbound_date: inv.created_at, age_days: Math.floor((Date.now() - new Date(inv.created_at as string).getTime()) / 86400000) });
    }

    return NextResponse.json(Object.values(productMap));
  }

  if (type === 'trend') {
    const days = parseInt(searchParams.get('days') || '30');
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString().split('T')[0];

    const { data: inboundData, error: ibError } = await client
      .from('inbound_notes')
      .select('id, created_at')
      .gte('created_at', startDateStr)
      .limit(500);
    if (ibError) return NextResponse.json({ error: ibError.message }, { status: 500 });

    const { data: deliveryData, error: dlError } = await client
      .from('delivery_notes')
      .select('id, created_at')
      .gte('created_at', startDateStr)
      .limit(500);
    if (dlError) return NextResponse.json({ error: dlError.message }, { status: 500 });

    const trendMap: Record<string, { date: string; inbound: number; outbound: number }> = {};
    for (const ib of inboundData || []) {
      const d = (ib.created_at as string).substring(0, 10);
      if (!trendMap[d]) trendMap[d] = { date: d, inbound: 0, outbound: 0 };
      trendMap[d].inbound++;
    }
    for (const dl of deliveryData || []) {
      const d = (dl.created_at as string).substring(0, 10);
      if (!trendMap[d]) trendMap[d] = { date: d, inbound: 0, outbound: 0 };
      trendMap[d].outbound++;
    }

    const sorted = Object.values(trendMap).sort((a, b) => a.date.localeCompare(b.date));
    let runningBalance = 0;
    const { data: totalInv } = await client.from('inventory').select('quantity').limit(500);
    runningBalance = (totalInv || []).reduce((sum, inv) => sum + ((inv.quantity as number) || 0), 0);

    const result = [];
    for (let i = sorted.length - 1; i >= 0; i--) {
      result.unshift({ ...sorted[i], balance: runningBalance });
      runningBalance -= sorted[i].inbound - sorted[i].outbound;
    }
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: 'Unknown stats type' }, { status: 400 });
}

export async function POST(request: NextRequest) {
  const client = getSupabaseClient();
  const body = await request.json();
  const { product_id, warehouse_id, quantity = 0, reserved_qty = 0, location_no = '' } = body;
  if (!product_id || !warehouse_id) return NextResponse.json({ error: '缺少 product_id 或 warehouse_id' }, { status: 400 });

  // 检查是否已存在记录
  const { data: existing } = await client
    .from('inventory')
    .select('id, quantity, reserved_qty')
    .eq('product_id', product_id)
    .eq('warehouse_id', warehouse_id)
    .limit(1);

  if (existing && existing.length > 0) {
    // 已有记录，更新数量
    const newQty = (existing[0].quantity as number) + (quantity as number);
    const newReserved = (existing[0].reserved_qty as number) + (reserved_qty as number);
    const { data, error } = await client
      .from('inventory')
      .update({ quantity: newQty, reserved_qty: newReserved })
      .eq('id', existing[0].id)
      .select();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data?.[0]);
  }

  // 创建新记录
  const { data, error } = await client
    .from('inventory')
    .insert({ product_id, warehouse_id, quantity, reserved_qty, location_no })
    .select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data?.[0]);
}

export async function PUT(request: NextRequest) {
  const client = getSupabaseClient();
  const body = await request.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });
  const { data, error } = await client.from('inventory').update(updates).eq('id', id).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) return NextResponse.json({ error: '库存记录不存在' }, { status: 404 });
  return NextResponse.json(data[0]);
}
