import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// Build category name mapping from products table
async function getCategoryNameMap(supabase: ReturnType<typeof getSupabaseClient>): Promise<Record<string, string>> {
  const { data: products } = await supabase
    .from('products')
    .select('category, name')
    .not('category', 'is', null)
    .not('category', 'eq', '');

  const map: Record<string, string> = {};
  for (const p of (products || [])) {
    const cat = p.category as string;
    if (!map[cat] && (p.name as string)?.includes('/')) {
      // Extract prefix before '/' as category name (e.g. "连接板/L18005" → "连接板")
      map[cat] = (p.name as string).split('/')[0];
    }
  }
  // Manual overrides for known categories
  const overrides: Record<string, string> = {
    '0': '安装板',
    '五金': '五金',
    '成品': '成品',
  };
  for (const [k, v] of Object.entries(overrides)) {
    if (!map[k]) map[k] = v;
  }
  return map;
}

export async function GET(request: NextRequest) {
  const supabase = getSupabaseClient();
  const { searchParams } = new URL(request.url);

  const customerId = searchParams.get('customer_id');
  const category = searchParams.get('category');
  const startDate = searchParams.get('start_date');
  const endDate = searchParams.get('end_date');

  // Fetch delivered delivery notes with items
  let query = supabase
    .from('delivery_notes')
    .select(`
      id, note_no, customer_id, customer_name, delivery_date, status,
      delivery_note_items(
        id, product_id, quantity, unit_price,
        products(id, code, name, spec, unit, category, price)
      )
    `)
    .in('status', ['shipped', 'delivered']);

  if (customerId) {
    query = query.eq('customer_id', customerId);
  }
  if (startDate) {
    query = query.gte('delivery_date', startDate);
  }
  if (endDate) {
    query = query.lte('delivery_date', endDate);
  }

  const { data: notes, error } = await query.order('delivery_date', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Aggregate by customer + category + product
  type AggKey = string;
  const aggregation = new Map<AggKey, {
    customer_id: string | null;
    customer_name: string;
    category: string;
    product_id: string;
    product_code: string;
    product_name: string;
    spec: string | null;
    unit: string;
    unit_price: number;
    total_quantity: number;
    total_amount: number;
    delivery_count: number;
    details: { note_no: string; delivery_date: string; quantity: number; unit_price: number }[];
  }>();

  for (const note of (notes || [])) {
    for (const item of (note.delivery_note_items || [])) {
      // Supabase returns products as array for foreign key relation
      const productArr = item.products as unknown as Array<Record<string, unknown>>;
      const product = Array.isArray(productArr) ? productArr[0] : productArr as Record<string, unknown> | null;
      if (!product) continue;

      const pCategory = product.category as string | null;
      const pId = product.id as string;
      const pCode = product.code as string | null;
      const pName = product.name as string | null;
      const pSpec = product.spec as string | null;
      const pUnit = product.unit as string | null;

      // Filter by category if specified
      if (category && pCategory !== category) continue;

      const key = `${note.customer_id || 'none'}|${pCategory || '未分类'}|${pId}`;
      const existing = aggregation.get(key);

      const qty = Number(item.quantity) || 0;
      const price = Number(item.unit_price) || 0;
      const amount = qty * price;

      if (existing) {
        existing.total_quantity += qty;
        existing.total_amount += amount;
        existing.delivery_count += 1;
        existing.details.push({
          note_no: note.note_no,
          delivery_date: note.delivery_date,
          quantity: qty,
          unit_price: price,
        });
      } else {
        aggregation.set(key, {
          customer_id: note.customer_id,
          customer_name: note.customer_name || '未知客户',
          category: pCategory || '未分类',
          product_id: pId,
          product_code: pCode || '',
          product_name: pName || '',
          spec: pSpec || '',
          unit: pUnit || '',
          unit_price: price,
          total_quantity: qty,
          total_amount: amount,
          delivery_count: 1,
          details: [{
            note_no: note.note_no,
            delivery_date: note.delivery_date,
            quantity: qty,
            unit_price: price,
          }],
        });
      }
    }
  }

  // Group by customer, then by category
  const result: {
    customer_id: string | null;
    customer_name: string;
    categories: {
      category: string;
      items: (typeof aggregation extends Map<string, infer V> ? V : never)[];
      category_total_quantity: number;
      category_total_amount: number;
    }[];
    customer_total_quantity: number;
    customer_total_amount: number;
  }[] = [];

  const customerMap = new Map<string, {
    customer_id: string | null;
    customer_name: string;
    categories: Map<string, {
      category: string;
      items: (typeof aggregation extends Map<string, infer V> ? V : never)[];
      category_total_quantity: number;
      category_total_amount: number;
    }>;
    customer_total_quantity: number;
    customer_total_amount: number;
  }>();

  for (const [, agg] of aggregation) {
    const custKey = agg.customer_id || 'none';
    let customer = customerMap.get(custKey);
    if (!customer) {
      customer = {
        customer_id: agg.customer_id,
        customer_name: agg.customer_name,
        categories: new Map(),
        customer_total_quantity: 0,
        customer_total_amount: 0,
      };
      customerMap.set(custKey, customer);
    }

    let catGroup = customer.categories.get(agg.category);
    if (!catGroup) {
      catGroup = {
        category: agg.category,
        items: [],
        category_total_quantity: 0,
        category_total_amount: 0,
      };
      customer.categories.set(agg.category, catGroup);
    }

    catGroup.items.push(agg);
    catGroup.category_total_quantity += agg.total_quantity;
    catGroup.category_total_amount += agg.total_amount;
    customer.customer_total_quantity += agg.total_quantity;
    customer.customer_total_amount += agg.total_amount;
  }

  for (const [, cust] of customerMap) {
    result.push({
      customer_id: cust.customer_id,
      customer_name: cust.customer_name,
      categories: Array.from(cust.categories.values()),
      customer_total_quantity: cust.customer_total_quantity,
      customer_total_amount: cust.customer_total_amount,
    });
  }

  // Also return available categories and customers for filters
  const { data: allCustomers } = await supabase
    .from('customers')
    .select('id, name, code')
    .order('name');

  const { data: allCategories } = await supabase
    .from('products')
    .select('category')
    .not('category', 'is', null);

  const uniqueCategories = [...new Set((allCategories || []).map((p: { category: string }) => p.category))].sort();

  // Get category name mapping
  const categoryNameMap = await getCategoryNameMap(supabase);

  // Enrich categories with names
  for (const cust of result) {
    for (const cat of cust.categories) {
      (cat as Record<string, unknown>).category_name = categoryNameMap[cat.category] || cat.category;
    }
  }

  return NextResponse.json({
    filters: {
      customers: allCustomers || [],
      categories: uniqueCategories.map(c => ({ code: c, name: categoryNameMap[c] || c })),
    },
    data: result,
    summary: {
      total_customers: result.length,
      total_quantity: result.reduce((s, c) => s + c.customer_total_quantity, 0),
      total_amount: result.reduce((s, c) => s + c.customer_total_amount, 0),
    },
  });
}
