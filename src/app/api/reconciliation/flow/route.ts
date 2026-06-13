import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export const dynamic = 'force-dynamic';

// GET /api/reconciliation/flow - 送货单流水记录（扁平化，每行一条送货明细）
export async function GET(request: NextRequest) {
  const supabase = getSupabaseClient();
  const { searchParams } = new URL(request.url);

  const customerId = searchParams.get('customer_id');
  const startDate = searchParams.get('start_date');
  const endDate = searchParams.get('end_date');
  const keyword = searchParams.get('keyword');
  const status = searchParams.get('status');
  const page = Math.max(1, Number(searchParams.get('page') || '1'));
  const pageSize = Math.min(200, Math.max(1, Number(searchParams.get('page_size') || '50')));

  // Build base query for delivery notes
  let noteQuery = supabase
    .from('delivery_notes')
    .select(`
      id, note_no, customer_id, customer_name, delivery_date, status, remark, created_at,
      customer_order_id,
      delivery_note_items(
        id, product_id, quantity, unit_price, per_box_qty, remark,
        customer_order_item_id,
        products(id, code, name, spec, unit, category)
      ),
      customer_orders(id, order_no)
    `)
    .order('delivery_date', { ascending: false });

  if (customerId) noteQuery = noteQuery.eq('customer_id', customerId);
  if (startDate) noteQuery = noteQuery.gte('delivery_date', startDate);
  if (endDate) noteQuery = noteQuery.lte('delivery_date', endDate);
  if (status) noteQuery = noteQuery.eq('status', status);
  if (keyword) noteQuery = noteQuery.or(`note_no.ilike.%${keyword}%,customer_name.ilike.%${keyword}%`);

  const { data: notes, error } = await noteQuery.limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Flatten to one row per delivery_note_item
  const rows: Array<{
    note_id: string;
    note_no: string;
    delivery_date: string;
    customer_id: string | null;
    customer_name: string;
    order_no: string;
    status: string;
    item_id: string;
    product_id: string;
    product_code: string;
    product_name: string;
    spec: string | null;
    unit: string;
    category: string;
    quantity: number;
    unit_price: number;
    amount: number;
    per_box_qty: number;
    item_remark: string;
  }> = [];

  for (const note of (notes || [])) {
    const orderNo = ((note.customer_orders as unknown) as Record<string, string> | null)?.order_no || '';
    for (const item of (note.delivery_note_items || [])) {
      // Handle Supabase products format (array or object)
      const rawProd = item.products as unknown;
      let product: Record<string, unknown> | null = null;
      if (rawProd) {
        if (Array.isArray(rawProd)) product = rawProd[0] || null;
        else if (typeof rawProd === 'object') product = rawProd as Record<string, unknown>;
      }

      rows.push({
        note_id: note.id,
        note_no: note.note_no || '',
        delivery_date: note.delivery_date || '',
        customer_id: note.customer_id,
        customer_name: note.customer_name || '',
        order_no: orderNo,
        status: note.status,
        item_id: item.id,
        product_id: item.product_id,
        product_code: (product?.code as string) || '',
        product_name: (product?.name as string) || '',
        spec: (product?.spec as string) || null,
        unit: (product?.unit as string) || '',
        category: (product?.category as string) || '未分类',
        quantity: Number(item.quantity) || 0,
        unit_price: Number(item.unit_price) || 0,
        amount: (Number(item.quantity) || 0) * (Number(item.unit_price) || 0),
        per_box_qty: Number(item.per_box_qty) || 0,
        item_remark: item.remark || '',
      });
    }
  }

  // Compute summary
  const totalQuantity = rows.reduce((s, r) => s + r.quantity, 0);
  const totalAmount = rows.reduce((s, r) => s + r.amount, 0);

  // Pagination
  const total = rows.length;
  const totalPages = Math.ceil(total / pageSize);
  const pagedRows = rows.slice((page - 1) * pageSize, page * pageSize);

  // Fetch filter options
  const [custRes] = await Promise.all([
    supabase.from('customers').select('id, name, code').order('name'),
  ]);

  return NextResponse.json({
    filters: {
      customers: custRes.data || [],
    },
    rows: pagedRows,
    pagination: {
      page,
      page_size: pageSize,
      total,
      total_pages: totalPages,
    },
    summary: {
      total_notes: new Set(rows.map(r => r.note_id)).size,
      total_quantity: totalQuantity,
      total_amount: totalAmount,
    },
  });
}
