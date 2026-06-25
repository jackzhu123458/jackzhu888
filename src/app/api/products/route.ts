import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest) {
  const client = getSupabaseClient();
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');
  const keyword = searchParams.get('keyword');

  let query = client.from('products').select('*').order('created_at', { ascending: false });

  if (type) query = query.eq('type', type);
  if (keyword) query = query.or(`code.ilike.%${keyword}%,name.ilike.%${keyword}%`);

  const { data, error } = await query.limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const client = getSupabaseClient();
  const body = await request.json();

  // 容错：NAS 老库可能没有 sourcing_type / cost_price / location_no 等新增字段
  const optionalCols = ['sourcing_type', 'cost_price', 'location_no'];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let payload: Record<string, any> = { ...body };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let result: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let lastError: any = null;

  for (let attempt = 0; attempt < optionalCols.length + 1; attempt++) {
    const { data, error } = await client.from('products').insert(payload).select();
    if (!error) {
      result = data?.[0];
      lastError = null;
      break;
    }
    lastError = error;
    const msg = error.message || '';
    const matched = optionalCols.find((c) => msg.includes(`'${c}'`));
    if (matched && matched in payload) {
      const rest = { ...payload };
      delete rest[matched];
      payload = rest;
      continue;
    }
    break;
  }

  if (lastError) return NextResponse.json({ error: lastError.message }, { status: 500 });
  return NextResponse.json(result, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const client = getSupabaseClient();
  const body = await request.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });

  // 容错：NAS 老库可能没有 sourcing_type / cost_price / location_no 等新增字段
  // 当 PostgREST 报 PGRST204（列不存在）时，自动剔除该字段重试
  const optionalCols = ['sourcing_type', 'cost_price', 'location_no'];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let payload: Record<string, any> = { ...updates };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let result: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let lastError: any = null;

  for (let attempt = 0; attempt < optionalCols.length + 1; attempt++) {
    const { data, error } = await client
      .from('products')
      .update(payload)
      .eq('id', id)
      .select();

    if (!error) {
      result = data?.[0];
      lastError = null;
      break;
    }

    lastError = error;
    // 列不存在错误，尝试剔除该列后重试
    const msg = error.message || '';
    const matched = optionalCols.find((c) => msg.includes(`'${c}'`));
    if (matched && matched in payload) {
      const rest = { ...payload };
      delete rest[matched];
      payload = rest;
      continue;
    }
    break;
  }

  if (lastError) {
    return NextResponse.json({ error: lastError.message }, { status: 500 });
  }
  return NextResponse.json(result);
}

export async function DELETE(request: NextRequest) {
  const client = getSupabaseClient();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });

  // 检查外键引用关系
  const references: string[] = [];

  const checks = [
    { table: 'bom', column: 'parent_product_id', label: 'BOM(作为父产品)' },
    { table: 'bom', column: 'child_product_id', label: 'BOM(作为子物料)' },
    { table: 'delivery_note_items', column: 'product_id', label: '送货单明细' },
    { table: 'inbound_note_items', column: 'product_id', label: '入库单明细' },
    { table: 'customer_order_items', column: 'product_id', label: '客户订单明细' },
    { table: 'production_order_materials', column: 'product_id', label: '生产订单用料' },
    { table: 'inventory', column: 'product_id', label: '库存记录' },
    { table: 'production_orders', column: 'product_id', label: '生产订单' },
  ];

  for (const check of checks) {
    const { count, error: checkError } = await client
      .from(check.table)
      .select('*', { count: 'exact', head: true })
      .eq(check.column, id);
    if (checkError) continue; // 表可能不存在，跳过
    if (count && count > 0) {
      references.push(`${check.label}(${count}条)`);
    }
  }

  if (references.length > 0) {
    return NextResponse.json(
      { error: `无法删除：该商品被以下记录引用 - ${references.join('、')}。请先删除相关引用后再操作。` },
      { status: 409 }
    );
  }

  const { error } = await client.from('products').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
