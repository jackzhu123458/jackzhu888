import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import * as XLSX from 'xlsx';

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export async function GET(request: NextRequest) {
  const supabase = getSupabaseClient();
  const { searchParams } = new URL(request.url);

  const customerId = searchParams.get('customer_id');
  const category = searchParams.get('category');
  const startDate = searchParams.get('start_date');
  const endDate = searchParams.get('end_date');

  // Fetch delivered delivery notes with items + order info
  let query = supabase
    .from('delivery_notes')
    .select(`
      id, note_no, customer_id, customer_name, delivery_date, status,
      delivery_note_items(
        id, product_id, quantity, unit_price, remark, customer_order_item_id,
        products(id, code, name, spec, unit, category, price),
        customer_order_items(id, order_id, customer_orders(id, order_no))
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

  // Build category name map
  const categoryMap = new Map<string, string>();
  {
    const { data: prods } = await supabase.from('products').select('category, name').not('category', 'is', null).neq('category', '');
    if (prods) {
      for (const p of prods) {
        const cat = p.category as string;
        if (!categoryMap.has(cat) && (p.name as string).includes('/')) {
          categoryMap.set(cat, (p.name as string).split('/')[0]);
        }
      }
    }
  }

  type FlatRow = {
    单号: string;
    单据日期: string;
    订单号码: string;
    商品编号: string;
    商品名称: string;
    单位: string;
    数量: number;
    不含税单价: number;
    单价: number;
    金额: number;
    不含税金额: number;
    类目: string;
    类目名称: string;
    明细备注: string;
  };

  const allRows: FlatRow[] = [];

  for (const note of (notes || [])) {
    for (const item of (note.delivery_note_items || [])) {
      const productArr = item.products as unknown as Array<Record<string, unknown>>;
      const product = Array.isArray(productArr) ? productArr[0] : productArr as Record<string, unknown> | null;
      if (!product) continue;

      const pCategory = product.category as string || '未分类';
      if (category && pCategory !== category) continue;

      const qty = Number(item.quantity) || 0;
      const price = Number(item.unit_price) || 0;
      const amount = qty * price;
      const priceExTax = price > 0 ? round4(price / 1.13) : 0;
      const amountExTax = round4(amount / 1.13);

      // Get order no
      let orderNo = '';
      const coiArr = item.customer_order_items as unknown as Array<Record<string, unknown>> | Record<string, unknown> | null;
      if (coiArr) {
        const coi = Array.isArray(coiArr) ? coiArr[0] : coiArr;
        const co = coi?.customer_orders as unknown as Array<Record<string, unknown>> | Record<string, unknown> | null;
        if (co) {
          const coObj = Array.isArray(co) ? co[0] : co;
          orderNo = (coObj?.order_no as string) || '';
        }
      }

      allRows.push({
        单号: note.note_no || '',
        单据日期: note.delivery_date ? new Date(note.delivery_date).toLocaleDateString('zh-CN') : '',
        订单号码: orderNo,
        商品编号: (product.code as string) || '',
        商品名称: (product.name as string) || '',
        单位: (product.unit as string) || '',
        数量: qty,
        不含税单价: priceExTax,
        单价: price,
        金额: amount,
        不含税金额: amountExTax,
        类目: pCategory,
        类目名称: categoryMap.get(pCategory) || pCategory,
        明细备注: (item.remark as string) || '',
      });
    }
  }

  // Sort by category → product code → date
  allRows.sort((a, b) => {
    if (a.类目 !== b.类目) return a.类目.localeCompare(b.类目);
    if (a.商品编号 !== b.商品编号) return a.商品编号.localeCompare(b.商品编号);
    return a.单据日期.localeCompare(b.单据日期);
  });

  const wb = XLSX.utils.book_new();

  // ====== Sheet 1: 数据透视表（按类目分类汇总）======
  const pivotRows: Record<string, unknown>[] = [];

  // Group by category
  const categoryGroups = new Map<string, FlatRow[]>();
  for (const row of allRows) {
    let group = categoryGroups.get(row.类目);
    if (!group) {
      group = [];
      categoryGroups.set(row.类目, group);
    }
    group.push(row);
  }

  let grandTotalQty = 0;
  let grandTotalAmount = 0;
  let grandTotalAmountExTax = 0;

  for (const [cat, rows] of categoryGroups) {
    const catName = rows[0]?.类目名称 || cat;
    let catTotalQty = 0;
    let catTotalAmount = 0;
    let catTotalAmountExTax = 0;

    // Category header row
    pivotRows.push({
      单号: `类目: ${catName}`,
      单据日期: '',
      订单号码: '',
      商品编号: '',
      商品名称: '',
      单位: '',
      数量: '',
      不含税单价: '',
      单价: '',
      金额: '',
      不含税金额: '',
      明细备注: '',
    });

    // Group by product within category
    const productGroups = new Map<string, FlatRow[]>();
    for (const row of rows) {
      let pg = productGroups.get(row.商品编号);
      if (!pg) {
        pg = [];
        productGroups.set(row.商品编号, pg);
      }
      pg.push(row);
    }

    for (const [, prodRows] of productGroups) {
      let prodTotalQty = 0;
      let prodTotalAmount = 0;
      let prodTotalAmountExTax = 0;

      for (const row of prodRows) {
        prodTotalQty += row.数量;
        prodTotalAmount += row.金额;
        prodTotalAmountExTax += row.不含税金额;

        pivotRows.push({
          单号: row.单号,
          单据日期: row.单据日期,
          订单号码: row.订单号码,
          商品编号: row.商品编号,
          商品名称: row.商品名称,
          单位: row.单位,
          数量: row.数量,
          不含税单价: row.不含税单价,
          单价: row.单价,
          金额: row.金额,
          不含税金额: row.不含税金额,
          明细备注: row.明细备注,
        });
      }

      // Product subtotal row
      pivotRows.push({
        单号: '',
        单据日期: '',
        订单号码: '',
        商品编号: '',
        商品名称: `小计（${prodRows[0].商品名称}）`,
        单位: '',
        数量: prodTotalQty,
        不含税单价: '',
        单价: '',
        金额: prodTotalAmount,
        不含税金额: round4(prodTotalAmountExTax),
        明细备注: '',
      });

      catTotalQty += prodTotalQty;
      catTotalAmount += prodTotalAmount;
      catTotalAmountExTax += prodTotalAmountExTax;
    }

    // Category subtotal row
    pivotRows.push({
      单号: `类目合计: ${catName}`,
      单据日期: '',
      订单号码: '',
      商品编号: '',
      商品名称: '',
      单位: '',
      数量: catTotalQty,
      不含税单价: '',
      单价: '',
      金额: catTotalAmount,
      不含税金额: round4(catTotalAmountExTax),
      明细备注: '',
    });

    // Empty separator row
    pivotRows.push({
      单号: '', 单据日期: '', 订单号码: '', 商品编号: '', 商品名称: '',
      单位: '', 数量: '', 不含税单价: '', 单价: '', 金额: '', 不含税金额: '', 明细备注: '',
    });

    grandTotalQty += catTotalQty;
    grandTotalAmount += catTotalAmount;
    grandTotalAmountExTax += catTotalAmountExTax;
  }

  // Grand total row
  pivotRows.push({
    单号: '总计',
    单据日期: '',
    订单号码: '',
    商品编号: '',
    商品名称: '',
    单位: '',
    数量: grandTotalQty,
    不含税单价: '',
    单价: '',
    金额: grandTotalAmount,
    不含税金额: round4(grandTotalAmountExTax),
    明细备注: '',
  });

  const pivotWs = XLSX.utils.json_to_sheet(pivotRows);
  pivotWs['!cols'] = [
    { wch: 16 }, // 单号
    { wch: 12 }, // 单据日期
    { wch: 12 }, // 订单号码
    { wch: 18 }, // 商品编号
    { wch: 22 }, // 商品名称
    { wch: 6 },  // 单位
    { wch: 10 }, // 数量
    { wch: 14 }, // 不含税单价
    { wch: 10 }, // 单价
    { wch: 14 }, // 金额
    { wch: 14 }, // 不含税金额
    { wch: 14 }, // 明细备注
  ];

  // Merge cells for category headers and subtotals
  const merges: XLSX.Range[] = [];
  let rowIdx = 0;
  for (const [cat, rows] of categoryGroups) {
    // Category header row
    merges.push({ s: { r: rowIdx, c: 0 }, e: { r: rowIdx, c: 11 } });
    rowIdx++;

    // Count detail + subtotal rows for this category
    const productGroups = new Map<string, FlatRow[]>();
    for (const row of rows) {
      let pg = productGroups.get(row.商品编号);
      if (!pg) { pg = []; productGroups.set(row.商品编号, pg); }
      pg.push(row);
    }

    for (const [, prodRows] of productGroups) {
      rowIdx += prodRows.length; // detail rows
      rowIdx++; // product subtotal row
    }

    // Category subtotal row
    merges.push({ s: { r: rowIdx, c: 0 }, e: { r: rowIdx, c: 11 } });
    rowIdx++;

    // Empty separator row
    rowIdx++;
  }

  // Grand total row
  merges.push({ s: { r: rowIdx, c: 0 }, e: { r: rowIdx, c: 11 } });

  pivotWs['!merges'] = merges;

  // Bold styling for header/subtotal rows - using cell styles
  // xlsx community edition has limited style support, we mark them via cell objects
  let styleRowIdx = 0;
  for (const [cat] of categoryGroups) {
    // Category header - make bold
    for (let c = 0; c < 12; c++) {
      const cell = pivotWs[XLSX.utils.encode_cell({ r: styleRowIdx, c })];
      if (cell) {
        cell.s = { font: { bold: true, sz: 11 } };
      }
    }
    styleRowIdx++;

    const productGroups = new Map<string, FlatRow[]>();
    const catRows = categoryGroups.get(cat) || [];
    for (const row of catRows) {
      let pg = productGroups.get(row.商品编号);
      if (!pg) { pg = []; productGroups.set(row.商品编号, pg); }
      pg.push(row);
    }

    for (const [, prodRows] of productGroups) {
      styleRowIdx += prodRows.length;
      // Product subtotal - make bold
      for (let c = 0; c < 12; c++) {
        const cell = pivotWs[XLSX.utils.encode_cell({ r: styleRowIdx, c })];
        if (cell) {
          cell.s = { font: { bold: true } };
        }
      }
      styleRowIdx++;
    }

    // Category subtotal - make bold
    for (let c = 0; c < 12; c++) {
      const cell = pivotWs[XLSX.utils.encode_cell({ r: styleRowIdx, c })];
      if (cell) {
        cell.s = { font: { bold: true, sz: 11 } };
      }
    }
    styleRowIdx++;

    // Empty separator
    styleRowIdx++;
  }

  // Grand total - make bold
  for (let c = 0; c < 12; c++) {
    const cell = pivotWs[XLSX.utils.encode_cell({ r: styleRowIdx, c })];
    if (cell) {
      cell.s = { font: { bold: true, sz: 12 } };
    }
  }

  XLSX.utils.book_append_sheet(wb, pivotWs, '对账汇总');

  // ====== Sheet 2: 送货明细（原始流水）======
  const detailRows = allRows.map(row => ({
    单号: row.单号,
    单据日期: row.单据日期,
    订单号码: row.订单号码,
    商品编号: row.商品编号,
    商品名称: row.商品名称,
    单位: row.单位,
    数量: row.数量,
    不含税单价: row.不含税单价,
    单价: row.单价,
    金额: row.金额,
    不含税金额: row.不含税金额,
    明细备注: row.明细备注,
  }));

  const detailWs = XLSX.utils.json_to_sheet(detailRows);
  detailWs['!cols'] = [
    { wch: 16 }, // 单号
    { wch: 12 }, // 单据日期
    { wch: 12 }, // 订单号码
    { wch: 18 }, // 商品编号
    { wch: 22 }, // 商品名称
    { wch: 6 },  // 单位
    { wch: 10 }, // 数量
    { wch: 14 }, // 不含税单价
    { wch: 10 }, // 单价
    { wch: 14 }, // 金额
    { wch: 14 }, // 不含税金额
    { wch: 14 }, // 明细备注
  ];
  XLSX.utils.book_append_sheet(wb, detailWs, '送货明细');

  // Generate buffer
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  // Build filename
  const dateRange = startDate && endDate
    ? `${startDate}_${endDate}`
    : new Date().toISOString().split('T')[0];
  const custPart = customerId ? `_${notes?.[0]?.customer_name || customerId}` : '_全部客户';
  const filename = `对账单${custPart}_${dateRange}.xlsx`;

  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
