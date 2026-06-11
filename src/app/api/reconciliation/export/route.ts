import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import * as XLSX from 'xlsx';

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
        id, product_id, quantity, unit_price, customer_order_item_id,
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

  // Build workbook
  const wb = XLSX.utils.book_new();

  // Aggregate by customer
  type ItemRow = {
    送货单号: string;
    送货日期: string;
    商品编号: string;
    商品名称: string;
    规格: string;
    类目: string;
    单位: string;
    数量: number;
    单价: number;
    金额: number;
  };

  const customerData = new Map<string, { name: string; items: ItemRow[] }>();

  for (const note of (notes || [])) {
    for (const item of (note.delivery_note_items || [])) {
      // Supabase returns products as array for foreign key relation
      const productArr = item.products as unknown as Array<Record<string, unknown>>;
      const product = Array.isArray(productArr) ? productArr[0] : productArr as Record<string, unknown> | null;
      if (!product) continue;

      const pCategory = product.category as string | null;
      const pCode = product.code as string | null;
      const pName = product.name as string | null;
      const pSpec = product.spec as string | null;
      const pUnit = product.unit as string | null;

      if (category && pCategory !== category) continue;

      const custKey = note.customer_name || '未知客户';
      let custData = customerData.get(custKey);
      if (!custData) {
        custData = { name: custKey, items: [] };
        customerData.set(custKey, custData);
      }

      const qty = Number(item.quantity) || 0;
      const price = Number(item.unit_price) || 0;

      custData.items.push({
        送货单号: note.note_no,
        送货日期: note.delivery_date ? new Date(note.delivery_date).toLocaleDateString('zh-CN') : '',
        商品编号: pCode || '',
        商品名称: pName || '',
        规格: pSpec || '',
        类目: pCategory || '未分类',
        单位: pUnit || '',
        数量: qty,
        单价: price,
        金额: qty * price,
      });
    }
  }

  // Sheet 1: Summary by customer + category
  const summaryRows: {
    客户名称: string;
    类目: string;
    商品编号: string;
    商品名称: string;
    规格: string;
    单位: string;
    送货次数: number;
    合计数量: number;
    单价: number;
    合计金额: number;
  }[] = [];

  for (const [, cust] of customerData) {
    // Group items by category + product
    const productMap = new Map<string, {
      category: string;
      code: string;
      name: string;
      spec: string;
      unit: string;
      unitPrice: number;
      totalQty: number;
      count: number;
    }>();

    for (const item of cust.items) {
      const key = `${item.类目}|${item.商品编号}`;
      const existing = productMap.get(key);
      if (existing) {
        existing.totalQty += item.数量;
        existing.count += 1;
      } else {
        productMap.set(key, {
          category: item.类目,
          code: item.商品编号,
          name: item.商品名称,
          spec: item.规格,
          unit: item.单位,
          unitPrice: item.单价,
          totalQty: item.数量,
          count: 1,
        });
      }
    }

    for (const [, prod] of productMap) {
      summaryRows.push({
        客户名称: cust.name,
        类目: prod.category,
        商品编号: prod.code,
        商品名称: prod.name,
        规格: prod.spec,
        单位: prod.unit,
        送货次数: prod.count,
        合计数量: prod.totalQty,
        单价: prod.unitPrice,
        合计金额: prod.totalQty * prod.unitPrice,
      });
    }
  }

  const summaryWs = XLSX.utils.json_to_sheet(summaryRows);

  // Set column widths
  summaryWs['!cols'] = [
    { wch: 24 }, // 客户名称
    { wch: 10 }, // 类目
    { wch: 16 }, // 商品编号
    { wch: 20 }, // 商品名称
    { wch: 14 }, // 规格
    { wch: 6 },  // 单位
    { wch: 10 }, // 送货次数
    { wch: 10 }, // 合计数量
    { wch: 10 }, // 单价
    { wch: 14 }, // 合计金额
  ];

  XLSX.utils.book_append_sheet(wb, summaryWs, '对账汇总');

  // Sheet 2-N: Per-customer detail sheets
  for (const [, cust] of customerData) {
    // Sort by category then product code
    cust.items.sort((a, b) => {
      if (a.类目 !== b.类目) return a.类目.localeCompare(b.类目);
      return a.商品编号.localeCompare(b.商品编号);
    });

    const detailWs = XLSX.utils.json_to_sheet(cust.items);
    detailWs['!cols'] = [
      { wch: 16 }, // 送货单号
      { wch: 12 }, // 送货日期
      { wch: 16 }, // 商品编号
      { wch: 20 }, // 商品名称
      { wch: 14 }, // 规格
      { wch: 10 }, // 类目
      { wch: 6 },  // 单位
      { wch: 10 }, // 数量
      { wch: 10 }, // 单价
      { wch: 14 }, // 金额
    ];

    // Sheet name max 31 chars, no special chars
    const sheetName = cust.name.substring(0, 31).replace(/[\\/*?[\]:]/g, '_');
    XLSX.utils.book_append_sheet(wb, detailWs, sheetName);
  }

  // Generate buffer
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  // Build filename
  const dateRange = startDate && endDate
    ? `${startDate}_${endDate}`
    : new Date().toISOString().split('T')[0];
  const custPart = customerId ? `_${customerData.values().next().value?.name || customerId}` : '_全部客户';
  const filename = `对账单${custPart}_${dateRange}.xlsx`;

  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
