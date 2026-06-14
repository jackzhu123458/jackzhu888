import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET /api/inventory/stats?type=heatmap|fifo|trend
export async function GET(request: NextRequest) {
  const supabase = getSupabaseClient();
  const { searchParams } = new URL(request.url);
  const statsType = searchParams.get('type');

  if (statsType === 'heatmap') {
    return await getHeatmapData(supabase);
  } else if (statsType === 'fifo') {
    return await getFifoData(supabase);
  } else if (statsType === 'trend') {
    const days = parseInt(searchParams.get('days') || '30', 10);
    return await getTrendData(supabase, days);
  }

  return NextResponse.json({ error: '无效的统计类型，支持: heatmap, fifo, trend' }, { status: 400 });
}

// 库位热力图数据
async function getHeatmapData(supabase: ReturnType<typeof getSupabaseClient>) {
  // 获取所有仓库
  const { data: warehouses, error: whErr } = await supabase
    .from('warehouses')
    .select('id, name, location, type');
  if (whErr) return NextResponse.json({ error: whErr.message }, { status: 500 });

  // 获取库存数据
  const { data: inventory, error: invErr } = await supabase
    .from('inventory')
    .select('id, product_id, warehouse_id, quantity, reserved_qty, location_no, products(id, code, name, unit)');
  if (invErr) return NextResponse.json({ error: invErr.message }, { status: 500 });

  // 获取入库记录（最近30天）用于计算周转频次
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString();

  const { data: inboundItems } = await supabase
    .from('inbound_note_items')
    .select('product_id, quantity, inbound_notes!inner(created_at, warehouse_id)')
    .gte('inbound_notes.created_at', thirtyDaysAgoStr);

  const { data: deliveryItems } = await supabase
    .from('delivery_note_items')
    .select('product_id, quantity, delivery_notes!inner(created_at, status, warehouse_id)')
    .eq('delivery_notes.status', 'shipped')
    .gte('delivery_notes.created_at', thirtyDaysAgoStr);

  // 计算每个仓库+库位的周转频次
  const turnoverMap = new Map<string, { inbound: number; outbound: number }>();

  for (const item of (inboundItems || [])) {
    const note = item.inbound_notes as unknown as Record<string, unknown>;
    const whId = note?.warehouse_id as string;
    const key = `${whId}:${item.product_id}`;
    const entry = turnoverMap.get(key) || { inbound: 0, outbound: 0 };
    entry.inbound += Number(item.quantity);
    turnoverMap.set(key, entry);
  }

  for (const item of (deliveryItems || [])) {
    const note = item.delivery_notes as unknown as Record<string, unknown>;
    const whId = note?.warehouse_id as string;
    const key = `${whId}:${item.product_id}`;
    const entry = turnoverMap.get(key) || { inbound: 0, outbound: 0 };
    entry.outbound += Number(item.quantity);
    turnoverMap.set(key, entry);
  }

  // 按仓库分组构建热力图数据
  const result = (warehouses || []).map((wh: Record<string, unknown>) => {
    const whId = wh.id as string;
    const whInventory = (inventory || []).filter(
      (inv: Record<string, unknown>) => inv.warehouse_id === whId
    );

    const locations = whInventory.map((inv: Record<string, unknown>) => {
      const product = inv.products as unknown as Record<string, string>;
      const turnoverKey = `${whId}:${inv.product_id}`;
      const turnover = turnoverMap.get(turnoverKey) || { inbound: 0, outbound: 0 };
      const totalTurnover = turnover.inbound + turnover.outbound;

      return {
        inventory_id: inv.id,
        product_id: inv.product_id,
        product_code: product?.code || '',
        product_name: product?.name || '',
        location_no: inv.location_no || '',
        quantity: Number(inv.quantity),
        reserved_qty: Number(inv.reserved_qty),
        turnover: totalTurnover,
        turnover_in: turnover.inbound,
        turnover_out: turnover.outbound,
      };
    });

    // 按库位号排序，无库位号的排后面
    locations.sort((a, b) => {
      if (!a.location_no && !b.location_no) return 0;
      if (!a.location_no) return 1;
      if (!b.location_no) return -1;
      return (a.location_no as string).localeCompare(b.location_no as string, undefined, { numeric: true });
    });

    return {
      warehouse_id: whId,
      warehouse_name: wh.name as string,
      warehouse_type: (wh.type as string) || 'product',
      warehouse_location: wh.location as string | null,
      total_items: locations.length,
      total_quantity: locations.reduce((s, l) => s + l.quantity, 0),
      max_turnover: Math.max(0, ...locations.map((l) => l.turnover)),
      locations,
    };
  });

  return NextResponse.json(result);
}

// FIFO先进先出看板数据
async function getFifoData(supabase: ReturnType<typeof getSupabaseClient>) {
  // 获取所有有库存的物料
  const { data: inventory, error: invErr } = await supabase
    .from('inventory')
    .select('id, product_id, warehouse_id, quantity, reserved_qty, location_no, products(id, code, name, unit), warehouses(id, name, type)')
    .gt('quantity', 0);
  if (invErr) return NextResponse.json({ error: invErr.message }, { status: 500 });

  // 获取每个物料的入库时间线
  const productIds = [...new Set((inventory || []).map((inv: Record<string, unknown>) => inv.product_id as string))];

  // 获取入库记录（按产品分组）
  const { data: inboundItems } = await supabase
    .from('inbound_note_items')
    .select('product_id, quantity, inbound_notes!inner(created_at, note_no, warehouse_id, type)')
    .in('product_id', productIds)
    .order('created_at', { ascending: true });

  // 获取出库记录
  const { data: deliveryItems } = await supabase
    .from('delivery_note_items')
    .select('product_id, quantity, delivery_notes!inner(created_at, note_no, status, warehouse_id)')
    .eq('delivery_notes.status', 'shipped')
    .in('product_id', productIds)
    .order('created_at', { ascending: true });

  // 构建FIFO数据
  const result = (inventory || []).map((inv: Record<string, unknown>) => {
    const product = inv.products as unknown as Record<string, string>;
    const warehouse = inv.warehouses as unknown as Record<string, string>;
    const productId = inv.product_id as string;

    // 入库批次（先进先出排列）
    const inBatches = ((inboundItems || []) as Record<string, unknown>[])
      .filter((item) => item.product_id === productId)
      .map((item) => {
        const note = item.inbound_notes as unknown as Record<string, unknown>;
        return {
          date: (note?.created_at as string) || '',
          note_no: (note?.note_no as string) || '',
          quantity: Number(item.quantity),
          type: (note?.type as string) || '',
        };
      });

    // 出库记录
    const outRecords = ((deliveryItems || []) as Record<string, unknown>[])
      .filter((item) => item.product_id === productId)
      .map((item) => {
        const note = item.delivery_notes as unknown as Record<string, unknown>;
        return {
          date: (note?.created_at as string) || '',
          note_no: (note?.note_no as string) || '',
          quantity: Number(item.quantity),
        };
      });

    // 计算FIFO库存层（每个入库批次还剩多少）
    let remainingOutQty = outRecords.reduce((s, r) => s + r.quantity, 0);
    const layers = inBatches.map((batch) => {
      const allocated = Math.min(batch.quantity, remainingOutQty);
      remainingOutQty -= allocated;
      const remaining = batch.quantity - allocated;

      // 计算库龄天数
      const batchDate = new Date(batch.date);
      const now = new Date();
      const ageDays = Math.floor((now.getTime() - batchDate.getTime()) / (1000 * 60 * 60 * 24));

      return {
        date: batch.date,
        note_no: batch.note_no,
        batch_qty: batch.quantity,
        consumed: allocated,
        remaining,
        age_days: remaining > 0 ? ageDays : 0,
        type: batch.type,
      };
    }).filter((l) => l.remaining > 0);

    const currentQty = Number(inv.quantity);
    const totalAge = layers.reduce((s, l) => s + l.age_days * l.remaining, 0);
    const avgAge = currentQty > 0 ? Math.round(totalAge / currentQty) : 0;
    const maxAge = layers.length > 0 ? Math.max(...layers.map((l) => l.age_days)) : 0;

    return {
      inventory_id: inv.id,
      product_id: productId,
      product_code: product?.code || '',
      product_name: product?.name || '',
      product_unit: product?.unit || '',
      warehouse_id: inv.warehouse_id as string,
      warehouse_name: warehouse?.name || '',
      location_no: inv.location_no || '',
      quantity: currentQty,
      reserved_qty: Number(inv.reserved_qty),
      avg_age_days: avgAge,
      max_age_days: maxAge,
      layers,
      last_in_date: inBatches.length > 0 ? inBatches[inBatches.length - 1].date : null,
      last_out_date: outRecords.length > 0 ? outRecords[outRecords.length - 1].date : null,
    };
  });

  // 按库龄降序排列（最老的排最前，优先关注）
  result.sort((a, b) => b.max_age_days - a.max_age_days);

  return NextResponse.json(result);
}

// 收-发-存动态趋势数据
async function getTrendData(supabase: ReturnType<typeof getSupabaseClient>, days: number) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  // 获取入库记录
  const { data: inboundNotes } = await supabase
    .from('inbound_notes')
    .select('id, created_at, note_no')
    .gte('created_at', startDate.toISOString())
    .order('created_at', { ascending: true });

  const inboundNoteIds = (inboundNotes || []).map((n: Record<string, unknown>) => n.id as string);

  const { data: inboundItems } = await supabase
    .from('inbound_note_items')
    .select('quantity, inbound_notes!inner(created_at)')
    .in('note_id', inboundNoteIds.length > 0 ? inboundNoteIds : ['00000000-0000-0000-0000-000000000000']);

  // 获取出库记录
  const { data: deliveryNotes } = await supabase
    .from('delivery_notes')
    .select('id, created_at, note_no, status')
    .eq('status', 'shipped')
    .gte('created_at', startDate.toISOString())
    .order('created_at', { ascending: true });

  const deliveryNoteIds = (deliveryNotes || []).map((n: Record<string, unknown>) => n.id as string);

  const { data: deliveryItems } = await supabase
    .from('delivery_note_items')
    .select('quantity, delivery_notes!inner(created_at, status)')
    .eq('delivery_notes.status', 'shipped')
    .in('note_id', deliveryNoteIds.length > 0 ? deliveryNoteIds : ['00000000-0000-0000-0000-000000000000']);

  // 获取当前库存总量
  const { data: currentInventory } = await supabase
    .from('inventory')
    .select('quantity');

  const currentTotal = (currentInventory || []).reduce(
    (s: number, inv: Record<string, unknown>) => s + Number(inv.quantity), 0
  );

  // 按日汇总数据
  const dailyMap = new Map<string, { inbound: number; outbound: number }>();

  // 初始化所有日期
  for (let i = 0; i <= days; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    dailyMap.set(key, { inbound: 0, outbound: 0 });
  }

  // 汇总入库
  for (const item of (inboundItems || [])) {
    const note = item.inbound_notes as unknown as Record<string, unknown>;
    const date = ((note?.created_at as string) || '').slice(0, 10);
    const entry = dailyMap.get(date);
    if (entry) {
      entry.inbound += Number(item.quantity);
    }
  }

  // 汇总出库
  for (const item of (deliveryItems || [])) {
    const note = item.delivery_notes as unknown as Record<string, unknown>;
    const date = ((note?.created_at as string) || '').slice(0, 10);
    const entry = dailyMap.get(date);
    if (entry) {
      entry.outbound += Number(item.quantity);
    }
  }

  // 计算累计结存（从当前总量倒推）
  // 今天的结存 = currentTotal，往前推每天减去净变化
  const totalInbound = Array.from(dailyMap.values()).reduce((s, v) => s + v.inbound, 0);
  const totalOutbound = Array.from(dailyMap.values()).reduce((s, v) => s + v.outbound, 0);

  const sortedDays = Array.from(dailyMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  // 从第一天开始，假设初始库存 = currentTotal - (totalInbound - totalOutbound)
  let runningStock = currentTotal - totalInbound + totalOutbound;

  const trend = sortedDays.map(([date, val]) => {
    runningStock += val.inbound - val.outbound;
    return {
      date,
      inbound: Math.round(val.inbound * 100) / 100,
      outbound: Math.round(val.outbound * 100) / 100,
      stock: Math.round(runningStock * 100) / 100,
    };
  });

  return NextResponse.json({
    days,
    current_total: Math.round(currentTotal * 100) / 100,
    total_inbound: Math.round(totalInbound * 100) / 100,
    total_outbound: Math.round(totalOutbound * 100) / 100,
    trend,
  });
}
